export class DataEngine {
  constructor() {
    this.currentData = [];
    this.originalData = [];
    this.filters = new Map();
    this.sortOptions = null;
    this.pagination = {
      page: 1,
      pageSize: 1000,
      total: 0
    };
    this.statistics = null;
  }

  setData(data) {
    this.originalData = [...data];
    this.currentData = [...data];
    this.pagination.total = data.length;
    this.calculateStatistics();
    return this;
  }

  // Filtering
  addFilter(column, filter) {
    this.filters.set(column, filter);
    this.applyFilters();
    return this;
  }

  removeFilter(column) {
    this.filters.delete(column);
    this.applyFilters();
    return this;
  }

  clearFilters() {
    this.filters.clear();
    this.currentData = [...this.originalData];
    this.pagination.total = this.currentData.length;
    return this;
  }

  applyFilters() {
    if (this.filters.size === 0) {
      this.currentData = [...this.originalData];
    } else {
      this.currentData = this.originalData.filter(row => {
        return Array.from(this.filters.entries()).every(([column, filter]) => {
          return this.applyFilter(row[column], filter);
        });
      });
    }
    
    this.pagination.total = this.currentData.length;
    this.pagination.page = 1; // Reset to first page
    return this;
  }

  applyFilter(value, filter) {
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
      case 'not_contains':
        return !String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      case 'starts_with':
        return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase());
      case 'ends_with':
        return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase());
      case 'greater_than':
        return Number(value) > Number(filter.value);
      case 'less_than':
        return Number(value) < Number(filter.value);
      case 'greater_equal':
        return Number(value) >= Number(filter.value);
      case 'less_equal':
        return Number(value) <= Number(filter.value);
      case 'between':
        const numValue = Number(value);
        return numValue >= Number(filter.min) && numValue <= Number(filter.max);
      case 'in':
        return filter.values.includes(value);
      case 'not_in':
        return !filter.values.includes(value);
      case 'regex':
        try {
          const regex = new RegExp(filter.pattern, filter.flags || 'i');
          return regex.test(String(value));
        } catch (error) {
          console.warn('Invalid regex pattern:', filter.pattern);
          return true;
        }
      case 'date_equals':
        return this.compareDates(value, filter.value) === 0;
      case 'date_before':
        return this.compareDates(value, filter.value) < 0;
      case 'date_after':
        return this.compareDates(value, filter.value) > 0;
      default:
        return true;
    }
  }

  compareDates(a, b) {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA.getTime() - dateB.getTime();
  }

  // Sorting
  setSortOptions(column, direction = 'asc') {
    this.sortOptions = { column, direction };
    this.applySort();
    return this;
  }

  clearSort() {
    this.sortOptions = null;
    // Re-apply filters to get original order
    this.applyFilters();
    return this;
  }

  applySort() {
    if (!this.sortOptions) return;

    const { column, direction } = this.sortOptions;
    
    this.currentData.sort((a, b) => {
      const valueA = a[column];
      const valueB = b[column];
      
      // Handle null/undefined values
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return direction === 'asc' ? -1 : 1;
      if (valueB == null) return direction === 'asc' ? 1 : -1;
      
      // Determine comparison based on type
      const comparison = this.compareValues(valueA, valueB);
      return direction === 'asc' ? comparison : -comparison;
    });
    
    return this;
  }

  compareValues(a, b) {
    // Try numeric comparison first
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
    
    // Fall back to string comparison
    const strA = String(a).toLowerCase();
    const strB = String(b).toLowerCase();
    
    return strA.localeCompare(strB);
  }

  // Pagination
  setPagination(page, pageSize) {
    this.pagination.page = Math.max(1, page);
    this.pagination.pageSize = Math.max(1, pageSize);
    return this;
  }

  getPage(page = null, pageSize = null) {
    if (page !== null) this.pagination.page = page;
    if (pageSize !== null) this.pagination.pageSize = pageSize;
    
    const start = (this.pagination.page - 1) * this.pagination.pageSize;
    const end = start + this.pagination.pageSize;
    
    return {
      data: this.currentData.slice(start, end),
      page: this.pagination.page,
      pageSize: this.pagination.pageSize,
      total: this.pagination.total,
      totalPages: Math.ceil(this.pagination.total / this.pagination.pageSize),
      hasNext: end < this.pagination.total,
      hasPrev: this.pagination.page > 1
    };
  }

  // Statistics and analysis
  calculateStatistics() {
    if (!this.originalData || this.originalData.length === 0) {
      this.statistics = null;
      return;
    }

    const stats = {
      totalRows: this.originalData.length,
      columns: {},
      memoryUsage: this.estimateMemoryUsage()
    };

    // Get all column names
    const columns = this.getColumnNames();
    
    for (const column of columns) {
      stats.columns[column] = this.calculateColumnStatistics(column);
    }

    this.statistics = stats;
  }

  calculateColumnStatistics(column) {
    const values = this.originalData
      .map(row => row[column])
      .filter(v => v !== null && v !== undefined);
    
    const nullCount = this.originalData.length - values.length;
    
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
      nullPercentage: (nullCount / this.originalData.length) * 100,
      uniqueValues: new Set(values).size
    };

    // Type detection
    const sampleValue = values[0];
    stats.type = this.detectType(sampleValue);

    // Type-specific statistics
    if (stats.type === 'number') {
      const numbers = values.map(Number).filter(n => !isNaN(n));
      if (numbers.length > 0) {
        stats.min = Math.min(...numbers);
        stats.max = Math.max(...numbers);
        stats.mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        stats.median = this.calculateMedian(numbers);
        stats.stdDev = this.calculateStandardDeviation(numbers, stats.mean);
      }
    } else if (stats.type === 'string') {
      const strings = values.map(String);
      stats.minLength = Math.min(...strings.map(s => s.length));
      stats.maxLength = Math.max(...strings.map(s => s.length));
      stats.avgLength = strings.reduce((sum, s) => sum + s.length, 0) / strings.length;
    } else if (stats.type === 'date') {
      const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
      if (dates.length > 0) {
        stats.minDate = new Date(Math.min(...dates));
        stats.maxDate = new Date(Math.max(...dates));
      }
    }

    return stats;
  }

  detectType(value) {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
      // Check if it's a date
      if (!isNaN(Date.parse(value))) return 'date';
      // Check if it's a number
      if (!isNaN(Number(value))) return 'number';
      return 'string';
    }
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    
    return 'unknown';
  }

  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    } else {
      return sorted[middle];
    }
  }

  calculateStandardDeviation(numbers, mean) {
    const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
    return Math.sqrt(variance);
  }

  // Utility methods
  getColumnNames() {
    if (!this.originalData || this.originalData.length === 0) return [];
    
    const columnSet = new Set();
    for (const row of this.originalData.slice(0, Math.min(100, this.originalData.length))) {
      if (typeof row === 'object' && row !== null) {
        Object.keys(row).forEach(key => columnSet.add(key));
      }
    }
    
    return Array.from(columnSet).sort();
  }

  estimateMemoryUsage() {
    if (!this.originalData) return 0;
    
    // Rough estimation based on JSON serialization
    try {
      const sample = this.originalData.slice(0, Math.min(10, this.originalData.length));
      const sampleSize = JSON.stringify(sample).length;
      const estimatedTotal = (sampleSize / sample.length) * this.originalData.length;
      return estimatedTotal;
    } catch (error) {
      return 0;
    }
  }

  // Export current state
  exportFiltered(format = 'json') {
    const data = this.currentData;
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(data);
      case 'jsonl':
        return data.map(row => JSON.stringify(row)).join('\n');
      default:
        throw new Error(`Export format ${format} not supported`);
    }
  }

  convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const columns = this.getColumnNames();
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

  // Search functionality
  search(query, columns = null) {
    if (!query) {
      this.applyFilters();
      return this;
    }
    
    const searchColumns = columns || this.getColumnNames();
    const lowerQuery = query.toLowerCase();
    
    this.currentData = this.originalData.filter(row => {
      // Apply existing filters first
      const passesFilters = Array.from(this.filters.entries()).every(([column, filter]) => {
        return this.applyFilter(row[column], filter);
      });
      
      if (!passesFilters) return false;
      
      // Then apply search
      return searchColumns.some(column => {
        const value = row[column];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(lowerQuery);
      });
    });
    
    this.pagination.total = this.currentData.length;
    this.pagination.page = 1;
    
    return this;
  }

  // Status and info
  getStatus() {
    return {
      originalRows: this.originalData.length,
      filteredRows: this.currentData.length,
      filtersActive: this.filters.size > 0,
      sortActive: this.sortOptions !== null,
      pagination: this.pagination,
      memoryUsage: this.statistics?.memoryUsage || 0
    };
  }

  getStatistics() {
    return this.statistics;
  }
}