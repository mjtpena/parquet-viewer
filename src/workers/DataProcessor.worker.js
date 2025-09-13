// Data Processing Web Worker
// Handles heavy data processing tasks off the main thread

let currentData = null;
let formatHandlers = new Map();

// Worker event handlers
self.addEventListener('message', async (event) => {
  const { action, data, options = {}, taskId } = event.data;
  
  try {
    let result;
    
    switch (action) {
      case 'parseFile':
        result = await parseFile(data, options);
        break;
      case 'filterData':
        result = await filterData(data, options);
        break;
      case 'sortData':
        result = await sortData(data, options);
        break;
      case 'aggregateData':
        result = await aggregateData(data, options);
        break;
      case 'calculateStats':
        result = await calculateStatistics(data, options);
        break;
      case 'exportData':
        result = await exportData(data, options);
        break;
      case 'searchData':
        result = await searchData(data, options);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    self.postMessage({
      taskId,
      action,
      status: 'success',
      result
    });
    
  } catch (error) {
    self.postMessage({
      taskId,
      action,
      status: 'error',
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
});

// File parsing functions
async function parseFile(buffer, options) {
  const { format, chunkSize = 1000 } = options;
  
  // Dynamic import of format handler
  const handlerModule = await importFormatHandler(format);
  if (!handlerModule) {
    throw new Error(`Format handler not found for: ${format}`);
  }
  
  const Handler = handlerModule[`${format.charAt(0).toUpperCase() + format.slice(1)}Format`];
  const handler = new Handler();
  
  // Create a mock file object from buffer
  const file = new File([buffer], `data.${format}`, { 
    type: 'application/octet-stream' 
  });
  
  // Read metadata first
  const metadata = await handler.readMetadata(file);
  
  // Read data in chunks
  const allData = [];
  let chunkCount = 0;
  
  if (handler.streamData) {
    for await (const chunk of handler.streamData(file, { chunkSize })) {
      allData.push(...chunk);
      chunkCount++;
      
      // Report progress every 10 chunks
      if (chunkCount % 10 === 0) {
        self.postMessage({
          action: 'parseFile',
          status: 'progress',
          progress: {
            chunksProcessed: chunkCount,
            rowsLoaded: allData.length,
            estimatedProgress: Math.min(90, chunkCount * 2) // Rough estimate
          }
        });
      }
    }
  } else {
    // Fallback to direct read
    const data = await handler.readData(file);
    allData.push(...data);
  }
  
  currentData = allData;
  
  return {
    metadata,
    schema: handler.schema,
    data: allData.slice(0, Math.min(1000, allData.length)), // Return first 1000 rows
    totalRows: allData.length,
    format
  };
}

// Data processing functions
async function filterData(data, options) {
  const { filters, returnCount = false } = options;
  
  if (!filters || filters.length === 0) {
    return returnCount ? data.length : data;
  }
  
  const filteredData = data.filter(row => {
    return filters.every(filter => applyFilter(row[filter.column], filter));
  });
  
  return returnCount ? filteredData.length : filteredData;
}

function applyFilter(value, filter) {
  if (value === null || value === undefined) {
    return filter.includeNull !== false;
  }

  switch (filter.type) {
    case 'equals':
      return value === filter.value;
    case 'not_equals':
      return value !== filter.value;
    case 'contains':
      return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'greater_than':
      return Number(value) > Number(filter.value);
    case 'less_than':
      return Number(value) < Number(filter.value);
    case 'between':
      const numValue = Number(value);
      return numValue >= Number(filter.min) && numValue <= Number(filter.max);
    case 'in':
      return filter.values.includes(value);
    case 'regex':
      try {
        const regex = new RegExp(filter.pattern, filter.flags || 'i');
        return regex.test(String(value));
      } catch (error) {
        return true;
      }
    default:
      return true;
  }
}

async function sortData(data, options) {
  const { column, direction = 'asc' } = options;
  
  const sortedData = [...data].sort((a, b) => {
    const valueA = a[column];
    const valueB = b[column];
    
    // Handle null values
    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return direction === 'asc' ? -1 : 1;
    if (valueB == null) return direction === 'asc' ? 1 : -1;
    
    const comparison = compareValues(valueA, valueB);
    return direction === 'asc' ? comparison : -comparison;
  });
  
  return sortedData;
}

function compareValues(a, b) {
  // Try numeric comparison
  const numA = Number(a);
  const numB = Number(b);
  
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  
  // Try date comparison
  const dateA = new Date(a);
  const dateB = new Date(b);
  
  if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
    return dateA.getTime() - dateB.getTime();
  }
  
  // String comparison
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

async function aggregateData(data, options) {
  const { groupBy, aggregations } = options;
  
  if (!groupBy || !aggregations) {
    throw new Error('groupBy and aggregations are required for aggregation');
  }
  
  const groups = new Map();
  
  // Group data
  for (const row of data) {
    const groupKey = groupBy.map(col => row[col]).join('|');
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey).push(row);
  }
  
  // Calculate aggregations
  const results = [];
  
  for (const [groupKey, groupData] of groups) {
    const result = {};
    
    // Add group keys
    const groupValues = groupKey.split('|');
    groupBy.forEach((col, index) => {
      result[col] = groupValues[index];
    });
    
    // Calculate aggregations
    for (const agg of aggregations) {
      const values = groupData
        .map(row => row[agg.column])
        .filter(v => v !== null && v !== undefined && !isNaN(v))
        .map(Number);
      
      switch (agg.function) {
        case 'count':
          result[`${agg.column}_count`] = groupData.length;
          break;
        case 'sum':
          result[`${agg.column}_sum`] = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          result[`${agg.column}_avg`] = values.length > 0 
            ? values.reduce((a, b) => a + b, 0) / values.length 
            : 0;
          break;
        case 'min':
          result[`${agg.column}_min`] = values.length > 0 ? Math.min(...values) : null;
          break;
        case 'max':
          result[`${agg.column}_max`] = values.length > 0 ? Math.max(...values) : null;
          break;
      }
    }
    
    results.push(result);
  }
  
  return results;
}

async function calculateStatistics(data, options) {
  const { columns } = options;
  const stats = {};
  
  const columnsToAnalyze = columns || getColumnNames(data);
  
  for (const column of columnsToAnalyze) {
    stats[column] = calculateColumnStatistics(data, column);
  }
  
  return stats;
}

function calculateColumnStatistics(data, column) {
  const values = data
    .map(row => row[column])
    .filter(v => v !== null && v !== undefined);
  
  const nullCount = data.length - values.length;
  
  if (values.length === 0) {
    return {
      count: 0,
      nullCount,
      nullPercentage: 100,
      type: 'null'
    };
  }
  
  const stats = {
    count: values.length,
    nullCount,
    nullPercentage: (nullCount / data.length) * 100,
    uniqueValues: new Set(values).size
  };
  
  // Detect type
  const sampleValue = values[0];
  stats.type = detectType(sampleValue);
  
  // Type-specific stats
  if (stats.type === 'number') {
    const numbers = values.map(Number).filter(n => !isNaN(n));
    if (numbers.length > 0) {
      stats.min = Math.min(...numbers);
      stats.max = Math.max(...numbers);
      stats.mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      stats.median = calculateMedian(numbers);
    }
  } else if (stats.type === 'string') {
    const strings = values.map(String);
    stats.minLength = Math.min(...strings.map(s => s.length));
    stats.maxLength = Math.max(...strings.map(s => s.length));
    stats.avgLength = strings.reduce((sum, s) => sum + s.length, 0) / strings.length;
  }
  
  return stats;
}

async function exportData(data, options) {
  const { format, columns } = options;
  const exportColumns = columns || getColumnNames(data);
  
  switch (format.toLowerCase()) {
    case 'csv':
      return convertToCSV(data, exportColumns);
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'jsonl':
      return data.map(row => JSON.stringify(row)).join('\n');
    case 'tsv':
      return convertToTSV(data, exportColumns);
    default:
      throw new Error(`Export format ${format} not supported`);
  }
}

async function searchData(data, options) {
  const { query, columns, caseSensitive = false } = options;
  
  if (!query) return data;
  
  const searchColumns = columns || getColumnNames(data);
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  
  return data.filter(row => {
    return searchColumns.some(column => {
      const value = row[column];
      if (value === null || value === undefined) return false;
      
      const stringValue = caseSensitive 
        ? String(value) 
        : String(value).toLowerCase();
      
      return stringValue.includes(searchQuery);
    });
  });
}

// Utility functions
function getColumnNames(data) {
  if (!data || data.length === 0) return [];
  
  const columnSet = new Set();
  for (const row of data.slice(0, Math.min(10, data.length))) {
    if (typeof row === 'object' && row !== null) {
      Object.keys(row).forEach(key => columnSet.add(key));
    }
  }
  
  return Array.from(columnSet).sort();
}

function detectType(value) {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    if (!isNaN(Date.parse(value))) return 'date';
    if (!isNaN(Number(value))) return 'number';
    return 'string';
  }
  if (value instanceof Date) return 'date';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  
  return 'unknown';
}

function calculateMedian(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  } else {
    return sorted[middle];
  }
}

function convertToCSV(data, columns) {
  if (!data || data.length === 0) return '';
  
  const rows = [columns.join(',')];
  
  for (const row of data) {
    const values = columns.map(column => {
      const value = row[column];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    rows.push(values.join(','));
  }
  
  return rows.join('\n');
}

function convertToTSV(data, columns) {
  if (!data || data.length === 0) return '';
  
  const rows = [columns.join('\t')];
  
  for (const row of data) {
    const values = columns.map(column => {
      const value = row[column];
      if (value === null || value === undefined) return '';
      return String(value).replace(/\t/g, ' '); // Replace tabs with spaces
    });
    rows.push(values.join('\t'));
  }
  
  return rows.join('\n');
}

// Dynamic format handler imports
async function importFormatHandler(format) {
  try {
    switch (format.toLowerCase()) {
      case 'parquet':
        return await import('../formats/single/ParquetFormat.js');
      case 'arrow':
      case 'feather':
        return await import('../formats/single/ArrowFormat.js');
      case 'avro':
        return await import('../formats/single/AvroFormat.js');
      case 'jsonl':
      case 'ndjson':
        return await import('../formats/single/JSONLFormat.js');
      case 'orc':
        return await import('../formats/single/ORCFormat.js');
      default:
        return null;
    }
  } catch (error) {
    console.error(`Failed to import format handler for ${format}:`, error);
    return null;
  }
}

// Progress reporting utility
function reportProgress(action, progress) {
  self.postMessage({
    action,
    status: 'progress',
    progress
  });
}