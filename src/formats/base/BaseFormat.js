export class BaseFormat {
  constructor() {
    this.metadata = null;
    this.schema = null;
    this.data = [];
  }

  // Must be implemented by subclasses
  static canHandle(file) { 
    throw new Error('canHandle method must be implemented by subclasses'); 
  }
  
  async readMetadata(source) { 
    throw new Error('readMetadata method must be implemented by subclasses'); 
  }
  
  async readData(source, options) { 
    throw new Error('readData method must be implemented by subclasses'); 
  }
  
  async* streamData(source, options) { 
    throw new Error('streamData method must be implemented by subclasses'); 
  }
  
  // Common functionality
  getColumns() { 
    return this.schema ? Object.keys(this.schema) : []; 
  }
  
  getRowCount() { 
    return this.data.length; 
  }
  
  toJSON() { 
    return this.data; 
  }
  
  toCSV() {
    if (!this.data || this.data.length === 0) return '';
    
    const headers = this.getColumns();
    const csvRows = [headers.join(',')];
    
    for (const row of this.data) {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
  
  // Helper methods for schema extraction
  extractSchema(source) {
    if (!source) return {};
    
    // Generic schema extraction - subclasses can override
    if (Array.isArray(source.fields)) {
      const schema = {};
      for (const field of source.fields) {
        schema[field.name] = field.type || 'unknown';
      }
      return schema;
    }
    
    return source;
  }
  
  // Helper for converting columnar to row-based data
  columnarToRows(columns, numRows) {
    const rows = [];
    for (let i = 0; i < numRows; i++) {
      const row = {};
      for (const [colName, colData] of Object.entries(columns)) {
        row[colName] = colData[i];
      }
      rows.push(row);
    }
    return rows;
  }
}