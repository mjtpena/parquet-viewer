import { BaseFormat } from '../base/BaseFormat.js';

export class ArrowFormat extends BaseFormat {
  constructor() {
    super();
    this.arrow = null;
    this.table = null;
  }

  static canHandle(file) {
    if (file instanceof File) {
      const name = file.name.toLowerCase();
      return name.endsWith('.arrow') || name.endsWith('.feather');
    }
    return false;
  }

  async initializeLibrary() {
    if (!this.arrow) {
      // Dynamic import of Apache Arrow
      this.arrow = await import('https://cdn.jsdelivr.net/npm/apache-arrow@latest/+esm');
    }
    return this.arrow;
  }

  async readMetadata(file) {
    const { Table } = await this.initializeLibrary();
    
    const buffer = await file.arrayBuffer();
    this.table = Table.from(buffer);
    
    this.metadata = {
      numRows: this.table.numRows,
      numCols: this.table.numCols,
      byteLength: buffer.byteLength,
      version: this.table.schema.metadata?.get('ARROW:schema') || 'unknown'
    };
    
    this.schema = this.extractSchema(this.table.schema);
    return this.metadata;
  }

  async readData(file, options = {}) {
    if (!this.table) {
      await this.readMetadata(file);
    }

    const startRow = options.offset || 0;
    const endRow = options.limit ? startRow + options.limit : this.table.numRows;
    
    // Convert Arrow table to row-based format for compatibility
    this.data = [];
    
    // Get all column names
    const columnNames = this.table.schema.fields.map(field => field.name);
    
    for (let i = startRow; i < Math.min(endRow, this.table.numRows); i++) {
      const row = {};
      for (const columnName of columnNames) {
        const column = this.table.getColumn(columnName);
        row[columnName] = this.convertArrowValue(column.get(i));
      }
      this.data.push(row);
    }
    
    return this.data;
  }

  async* streamData(file, options = {}) {
    if (!this.table) {
      await this.readMetadata(file);
    }

    const chunkSize = options.chunkSize || 1000;
    const startRow = options.offset || 0;
    const maxRows = options.limit ? startRow + options.limit : this.table.numRows;
    
    const columnNames = this.table.schema.fields.map(field => field.name);

    for (let i = startRow; i < maxRows; i += chunkSize) {
      const endRow = Math.min(i + chunkSize, maxRows);
      const chunk = [];
      
      for (let j = i; j < endRow; j++) {
        const row = {};
        for (const columnName of columnNames) {
          const column = this.table.getColumn(columnName);
          row[columnName] = this.convertArrowValue(column.get(j));
        }
        chunk.push(row);
      }
      
      if (chunk.length > 0) {
        yield chunk;
      }
    }
  }

  extractSchema(arrowSchema) {
    const schema = {};
    for (const field of arrowSchema.fields) {
      schema[field.name] = this.convertArrowType(field.type);
    }
    return schema;
  }

  convertArrowType(arrowType) {
    // Convert Arrow types to standard types
    const typeString = arrowType.toString().toLowerCase();
    
    if (typeString.includes('int')) return 'integer';
    if (typeString.includes('float') || typeString.includes('double')) return 'float';
    if (typeString.includes('string') || typeString.includes('utf8')) return 'string';
    if (typeString.includes('bool')) return 'boolean';
    if (typeString.includes('timestamp')) return 'timestamp';
    if (typeString.includes('date')) return 'date';
    if (typeString.includes('binary')) return 'binary';
    if (typeString.includes('decimal')) return 'decimal';
    if (typeString.includes('list')) return 'array';
    if (typeString.includes('struct')) return 'object';
    
    return typeString;
  }

  convertArrowValue(value) {
    // Handle Arrow-specific value conversion
    if (value === null || value === undefined) return null;
    
    // Handle BigInt conversion
    if (typeof value === 'bigint') {
      // Convert to number if it fits in JavaScript's safe integer range
      if (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) {
        return Number(value);
      }
      // Otherwise, convert to string to preserve precision
      return value.toString();
    }
    
    // Handle Arrow Vector values
    if (value && typeof value === 'object' && 'valueOf' in value) {
      return value.valueOf();
    }
    
    return value;
  }

  getColumns() {
    if (!this.table) return [];
    return this.table.schema.fields.map(field => field.name);
  }

  getRowCount() {
    return this.table ? this.table.numRows : this.data.length;
  }

  getSchemaInfo() {
    if (!this.table) return null;
    
    const columns = [];
    for (const field of this.table.schema.fields) {
      columns.push({
        name: field.name,
        type: this.convertArrowType(field.type),
        nullable: field.nullable,
        metadata: field.metadata ? Object.fromEntries(field.metadata) : null
      });
    }
    
    return { columns };
  }

  getStatistics() {
    if (!this.table) return null;
    
    const stats = {};
    
    for (const field of this.table.schema.fields) {
      const column = this.table.getColumn(field.name);
      const columnStats = {
        count: this.table.numRows,
        nullCount: column.nullCount,
        type: this.convertArrowType(field.type)
      };
      
      // Add type-specific statistics
      if (field.type.toString().includes('int') || field.type.toString().includes('float')) {
        try {
          const values = [];
          for (let i = 0; i < Math.min(this.table.numRows, 10000); i++) {
            const val = this.convertArrowValue(column.get(i));
            if (val !== null && !isNaN(val)) values.push(Number(val));
          }
          
          if (values.length > 0) {
            columnStats.min = Math.min(...values);
            columnStats.max = Math.max(...values);
            columnStats.mean = values.reduce((a, b) => a + b, 0) / values.length;
          }
        } catch (error) {
          console.warn(`Error calculating statistics for column ${field.name}:`, error);
        }
      }
      
      stats[field.name] = columnStats;
    }
    
    return stats;
  }

  // Export functionality
  async exportToFormat(format, options = {}) {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.toCSV();
      case 'json':
        return JSON.stringify(this.data, null, options.indent || 0);
      case 'jsonl':
        return this.data.map(row => JSON.stringify(row)).join('\n');
      case 'parquet':
        throw new Error('Arrow to Parquet conversion not implemented yet');
      default:
        throw new Error(`Export to ${format} not supported`);
    }
  }

  // Utility methods for Arrow-specific operations
  getArrowTable() {
    return this.table;
  }

  getColumnVector(columnName) {
    if (!this.table) return null;
    return this.table.getColumn(columnName);
  }

  // Memory usage information
  getMemoryUsage() {
    if (!this.table) return 0;
    
    let totalBytes = 0;
    for (const field of this.table.schema.fields) {
      const column = this.table.getColumn(field.name);
      if (column && column.data) {
        for (const chunk of column.data) {
          if (chunk.values && chunk.values.byteLength) {
            totalBytes += chunk.values.byteLength;
          }
        }
      }
    }
    
    return totalBytes;
  }
}