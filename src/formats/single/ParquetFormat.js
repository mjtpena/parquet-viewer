import { BaseFormat } from '../base/BaseFormat.js';

export class ParquetFormat extends BaseFormat {
  constructor() {
    super();
    this.hyparquet = null;
  }

  static canHandle(file) {
    if (file instanceof File) {
      return file.name.toLowerCase().endsWith('.parquet');
    }
    return false;
  }

  async initializeLibrary() {
    if (!this.hyparquet) {
      // Dynamic import of hyparquet
      this.hyparquet = await import('https://cdn.jsdelivr.net/npm/hyparquet@1.16.0/+esm');
    }
    return this.hyparquet;
  }

  async readMetadata(file) {
    const { parquetMetadata, parquetSchema } = await this.initializeLibrary();
    
    const buffer = await file.arrayBuffer();
    this.metadata = parquetMetadata(buffer);
    this.schema = parquetSchema(this.metadata);
    
    return this.metadata;
  }

  async readData(file, options = {}) {
    const { parquetRead } = await this.initializeLibrary();
    
    if (!this.metadata) {
      await this.readMetadata(file);
    }

    const buffer = await file.arrayBuffer();
    
    // Read data using hyparquet
    const data = [];
    await parquetRead({
      file: buffer,
      onComplete: (rows) => {
        data.push(...rows);
      },
      rowStart: options.offset || 0,
      rowEnd: options.limit ? (options.offset || 0) + options.limit : undefined
    });

    this.data = data;
    return data;
  }

  async* streamData(file, options = {}) {
    const { parquetRead } = await this.initializeLibrary();
    
    if (!this.metadata) {
      await this.readMetadata(file);
    }

    const buffer = await file.arrayBuffer();
    const chunkSize = options.chunkSize || 1000;
    let currentOffset = options.offset || 0;
    const maxRows = options.limit || this.metadata.num_rows;

    while (currentOffset < maxRows) {
      const batchSize = Math.min(chunkSize, maxRows - currentOffset);
      const chunk = [];
      
      await parquetRead({
        file: buffer,
        onComplete: (rows) => {
          chunk.push(...rows);
        },
        rowStart: currentOffset,
        rowEnd: currentOffset + batchSize
      });

      if (chunk.length > 0) {
        yield chunk;
        currentOffset += chunk.length;
      } else {
        break;
      }
    }
  }

  getColumns() {
    if (!this.schema) return [];
    return Object.keys(this.schema);
  }

  getRowCount() {
    return this.metadata ? this.metadata.num_rows : this.data.length;
  }

  getFileSize() {
    return this.metadata ? this.metadata.serialized_size : 0;
  }

  getCompressionInfo() {
    if (!this.metadata || !this.metadata.row_groups) return null;
    
    const compressionTypes = new Set();
    let totalCompressed = 0;
    let totalUncompressed = 0;

    for (const rowGroup of this.metadata.row_groups) {
      if (rowGroup.columns) {
        for (const column of rowGroup.columns) {
          if (column.meta_data) {
            const codec = column.meta_data.codec;
            if (codec) compressionTypes.add(codec);
            
            totalCompressed += column.meta_data.total_compressed_size || 0;
            totalUncompressed += column.meta_data.total_uncompressed_size || 0;
          }
        }
      }
    }

    return {
      codecs: Array.from(compressionTypes),
      compressionRatio: totalUncompressed > 0 ? totalCompressed / totalUncompressed : 1,
      totalCompressed,
      totalUncompressed
    };
  }

  getSchemaInfo() {
    if (!this.schema) return null;
    
    const columns = [];
    for (const [name, type] of Object.entries(this.schema)) {
      columns.push({
        name,
        type: this.normalizeType(type),
        nullable: true // Parquet columns can be nullable
      });
    }
    
    return { columns };
  }

  normalizeType(type) {
    // Convert Parquet types to standard types
    if (typeof type === 'string') {
      const lower = type.toLowerCase();
      if (lower.includes('int')) return 'integer';
      if (lower.includes('double') || lower.includes('float')) return 'float';
      if (lower.includes('string') || lower.includes('byte_array')) return 'string';
      if (lower.includes('bool')) return 'boolean';
      if (lower.includes('timestamp')) return 'timestamp';
      if (lower.includes('date')) return 'date';
    }
    return type;
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
      default:
        throw new Error(`Export to ${format} not supported`);
    }
  }

  // Statistics
  getStatistics() {
    if (!this.data || this.data.length === 0) return null;
    
    const stats = {};
    const columns = this.getColumns();
    
    for (const column of columns) {
      const values = this.data.map(row => row[column]).filter(v => v != null);
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
      }
    }
    
    return stats;
  }
}