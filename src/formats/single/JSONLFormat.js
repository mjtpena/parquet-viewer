import { BaseFormat } from '../base/BaseFormat.js';

export class JSONLFormat extends BaseFormat {
  constructor() {
    super();
    this.totalLines = 0;
    this.sampleRecord = null;
  }

  static canHandle(file) {
    if (file instanceof File) {
      const name = file.name.toLowerCase();
      return name.endsWith('.jsonl') || name.endsWith('.ndjson');
    }
    return false;
  }

  async readMetadata(file) {
    // Read first few lines to understand the schema
    const sample = await this.readSample(file);
    
    this.metadata = {
      byteLength: file.size,
      estimatedRows: this.totalLines,
      sampleSize: sample.length,
      encoding: 'utf-8'
    };
    
    this.schema = this.inferSchema(sample);
    this.sampleRecord = sample[0] || null;
    
    return this.metadata;
  }

  async readData(file, options = {}) {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const startRow = options.offset || 0;
    const endRow = options.limit ? startRow + options.limit : lines.length;
    
    this.data = [];
    
    for (let i = startRow; i < Math.min(endRow, lines.length); i++) {
      try {
        const record = JSON.parse(lines[i]);
        this.data.push(record);
      } catch (error) {
        console.warn(`Error parsing line ${i + 1}:`, error);
        // Add error record to maintain line numbers
        this.data.push({ 
          _error: `Parse error: ${error.message}`, 
          _rawLine: lines[i],
          _lineNumber: i + 1 
        });
      }
    }
    
    this.totalLines = lines.length;
    return this.data;
  }

  async* streamData(file, options = {}) {
    const chunkSize = options.chunkSize || 1000;
    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let lineNumber = 0;
    let chunk = [];
    const startRow = options.offset || 0;
    const maxRows = options.limit || Infinity;

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Process remaining buffer
          if (buffer.trim()) {
            if (lineNumber >= startRow && lineNumber < startRow + maxRows) {
              try {
                const record = JSON.parse(buffer.trim());
                chunk.push(record);
              } catch (error) {
                chunk.push({
                  _error: `Parse error: ${error.message}`,
                  _rawLine: buffer.trim(),
                  _lineNumber: lineNumber + 1
                });
              }
            }
          }
          
          if (chunk.length > 0) {
            yield chunk;
          }
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim()) {
            if (lineNumber >= startRow && lineNumber < startRow + maxRows) {
              try {
                const record = JSON.parse(line);
                chunk.push(record);
              } catch (error) {
                chunk.push({
                  _error: `Parse error: ${error.message}`,
                  _rawLine: line,
                  _lineNumber: lineNumber + 1
                });
              }
              
              if (chunk.length >= chunkSize) {
                yield chunk;
                chunk = [];
              }
            }
            lineNumber++;
            
            if (lineNumber >= startRow + maxRows) {
              if (chunk.length > 0) {
                yield chunk;
              }
              return;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async readSample(file, sampleSize = 100) {
    // Read first 64KB to get a good sample
    const sampleBytes = Math.min(file.size, 64 * 1024);
    const blob = file.slice(0, sampleBytes);
    const text = await blob.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const sample = [];
    let validLines = 0;
    
    for (let i = 0; i < Math.min(lines.length, sampleSize) && validLines < sampleSize; i++) {
      try {
        const record = JSON.parse(lines[i]);
        sample.push(record);
        validLines++;
      } catch (error) {
        // Skip invalid lines in sample
        continue;
      }
    }
    
    // Estimate total lines from sample
    if (sample.length > 0) {
      const avgLineLength = text.length / lines.length;
      this.totalLines = Math.round(file.size / avgLineLength);
    }
    
    return sample;
  }

  inferSchema(sample) {
    if (!sample || sample.length === 0) return {};
    
    const schema = {};
    const fieldTypes = {};
    
    // Analyze all records in sample
    for (const record of sample) {
      if (typeof record === 'object' && record !== null) {
        for (const [key, value] of Object.entries(record)) {
          if (!fieldTypes[key]) {
            fieldTypes[key] = new Set();
          }
          fieldTypes[key].add(this.getJavaScriptType(value));
        }
      }
    }
    
    // Determine final types
    for (const [field, types] of Object.entries(fieldTypes)) {
      if (types.has('null') && types.size === 1) {
        schema[field] = 'null';
      } else if (types.size === 1 || (types.size === 2 && types.has('null'))) {
        // Single type or nullable type
        const nonNullTypes = Array.from(types).filter(t => t !== 'null');
        schema[field] = nonNullTypes.length > 0 ? nonNullTypes[0] : 'null';
        if (types.has('null')) {
          schema[field] += '?'; // Mark as nullable
        }
      } else {
        // Mixed types
        schema[field] = 'mixed';
      }
    }
    
    return schema;
  }

  getJavaScriptType(value) {
    if (value === null || value === undefined) return 'null';
    
    const type = typeof value;
    if (type === 'number') {
      return Number.isInteger(value) ? 'integer' : 'float';
    }
    if (type === 'object') {
      return Array.isArray(value) ? 'array' : 'object';
    }
    return type;
  }

  getColumns() {
    if (this.schema && Object.keys(this.schema).length > 0) {
      return Object.keys(this.schema);
    }
    
    // Fallback: get columns from first record
    if (this.data && this.data.length > 0) {
      const firstRecord = this.data[0];
      if (typeof firstRecord === 'object' && firstRecord !== null) {
        return Object.keys(firstRecord);
      }
    }
    
    return [];
  }

  getRowCount() {
    return this.totalLines || this.data.length;
  }

  getSchemaInfo() {
    if (!this.schema) return null;
    
    const columns = [];
    for (const [name, type] of Object.entries(this.schema)) {
      const isNullable = type.endsWith('?');
      const cleanType = isNullable ? type.slice(0, -1) : type;
      
      columns.push({
        name,
        type: cleanType,
        nullable: isNullable,
        inferred: true
      });
    }
    
    return { columns };
  }

  getStatistics() {
    if (!this.data || this.data.length === 0) return null;
    
    const stats = {};
    const columns = this.getColumns();
    
    for (const column of columns) {
      const values = this.data
        .map(row => row[column])
        .filter(v => v !== null && v !== undefined);
      
      if (values.length === 0) continue;
      
      const type = typeof values[0];
      stats[column] = {
        count: values.length,
        nullCount: this.data.length - values.length,
        type
      };
      
      if (type === 'number') {
        stats[column].min = Math.min(...values);
        stats[column].max = Math.max(...values);
        stats[column].mean = values.reduce((a, b) => a + b, 0) / values.length;
      } else if (type === 'string') {
        stats[column].minLength = Math.min(...values.map(v => v.length));
        stats[column].maxLength = Math.max(...values.map(v => v.length));
        stats[column].uniqueValues = new Set(values).size;
      } else if (type === 'boolean') {
        const trueCount = values.filter(v => v === true).length;
        stats[column].trueCount = trueCount;
        stats[column].falseCount = values.length - trueCount;
      }
    }
    
    return stats;
  }

  // Validation methods
  validateFormat(file) {
    return this.readSample(file, 10).then(sample => {
      if (sample.length === 0) {
        return { valid: false, error: 'No valid JSON records found' };
      }
      
      return { valid: true, records: sample.length };
    }).catch(error => {
      return { valid: false, error: error.message };
    });
  }

  // Export functionality
  async exportToFormat(format, options = {}) {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(this.data, null, options.indent || 0);
      case 'csv':
        return this.toCSV();
      case 'jsonl':
      case 'ndjson':
        return this.data.map(row => JSON.stringify(row)).join('\n');
      default:
        throw new Error(`Export to ${format} not supported`);
    }
  }

  // Utility methods
  getMemoryUsage() {
    if (!this.data) return 0;
    
    // Rough estimation based on JSON string length
    let size = 0;
    for (const record of this.data) {
      size += JSON.stringify(record).length;
    }
    
    return size;
  }

  // Data transformation utilities
  flattenNestedObjects(maxDepth = 2) {
    if (!this.data) return [];
    
    return this.data.map(record => this.flattenObject(record, '', maxDepth));
  }

  flattenObject(obj, prefix = '', maxDepth = 2, currentDepth = 0) {
    if (currentDepth >= maxDepth || typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    const flattened = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey, maxDepth, currentDepth + 1));
      } else {
        flattened[newKey] = value;
      }
    }
    
    return flattened;
  }

  // Sample data for preview
  getSampleData(count = 5) {
    if (!this.data) return [];
    return this.data.slice(0, count);
  }
}