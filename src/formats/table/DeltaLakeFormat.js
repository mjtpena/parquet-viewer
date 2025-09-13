import { BaseFormat } from '../base/BaseFormat.js';

export class DeltaLakeFormat extends BaseFormat {
  constructor() {
    super();
    this.transactionLog = [];
    this.activeFiles = [];
    this.currentVersion = 0;
    this.tableSchema = null;
    this.partitionColumns = [];
    this.versions = new Map();
    this.parquetHandler = null;
  }

  static canHandle(input) {
    // Check if directory contains _delta_log
    return input && typeof input.getDirectoryHandle === 'function';
  }

  async readMetadata(directoryHandle) {
    try {
      const deltaLogHandle = await directoryHandle.getDirectoryHandle('_delta_log');
      await this.loadTransactionLog(deltaLogHandle);
      this.buildTableState();
      
      this.metadata = {
        tableVersion: this.currentVersion,
        numVersions: this.versions.size,
        numFiles: this.activeFiles.length,
        partitionColumns: this.partitionColumns,
        protocol: this.getProtocolVersion(),
        createdTime: this.getCreatedTime(),
        lastModified: this.getLastModified()
      };
      
      return this.metadata;
    } catch (error) {
      throw new Error(`Failed to read Delta Lake metadata: ${error.message}`);
    }
  }

  async loadTransactionLog(deltaLogHandle) {
    const logFiles = [];
    
    // Collect all log files
    for await (const entry of deltaLogHandle.values()) {
      if (entry.kind === 'file' && this.isLogFile(entry.name)) {
        logFiles.push({
          name: entry.name,
          handle: entry,
          version: this.extractVersion(entry.name)
        });
      }
    }
    
    // Sort by version
    logFiles.sort((a, b) => a.version - b.version);
    
    // Read transaction log in order
    for (const logFile of logFiles) {
      try {
        const file = await logFile.handle.getFile();
        const text = await file.text();
        const entries = await this.parseLogFile(text, logFile.version);
        this.transactionLog.push(...entries);
        
        // Track versions
        if (!this.versions.has(logFile.version)) {
          this.versions.set(logFile.version, {
            version: logFile.version,
            timestamp: file.lastModified,
            entries: entries.length
          });
        }
        
        this.currentVersion = Math.max(this.currentVersion, logFile.version);
      } catch (error) {
        console.warn(`Error reading log file ${logFile.name}:`, error);
      }
    }
  }

  isLogFile(filename) {
    // Delta log files: 000000000000000000.json, 000000000000000001.json, etc.
    return /^\d{20}\.json$/.test(filename);
  }

  extractVersion(filename) {
    const match = filename.match(/^(\d{20})\.json$/);
    return match ? parseInt(match[1], 10) : -1;
  }

  async parseLogFile(text, version) {
    const lines = text.split('\n').filter(line => line.trim());
    const entries = [];
    
    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        entry._version = version;
        entry._lineNumber = i + 1;
        entries.push(entry);
      } catch (error) {
        console.warn(`Error parsing line ${i + 1} in version ${version}:`, error);
      }
    }
    
    return entries;
  }

  buildTableState() {
    const activeFiles = new Map();
    let schema = null;
    let protocol = null;
    let metadata = null;
    
    // Replay transaction log
    for (const entry of this.transactionLog) {
      if (entry.add) {
        // File added
        activeFiles.set(entry.add.path, {
          path: entry.add.path,
          partitionValues: entry.add.partitionValues || {},
          size: entry.add.size,
          modificationTime: entry.add.modificationTime,
          dataChange: entry.add.dataChange !== false,
          stats: entry.add.stats ? JSON.parse(entry.add.stats) : null,
          version: entry._version
        });
      } else if (entry.remove) {
        // File removed
        activeFiles.delete(entry.remove.path);
      } else if (entry.metaData) {
        // Metadata update
        metadata = entry.metaData;
        if (entry.metaData.schemaString) {
          try {
            schema = JSON.parse(entry.metaData.schemaString);
          } catch (error) {
            console.warn('Error parsing schema:', error);
          }
        }
        this.partitionColumns = entry.metaData.partitionColumns || [];
      } else if (entry.protocol) {
        // Protocol version
        protocol = entry.protocol;
      }
    }
    
    this.activeFiles = Array.from(activeFiles.values());
    this.tableSchema = schema;
    this.protocolVersion = protocol;
    this.tableMetadata = metadata;
    
    // Extract schema for BaseFormat compatibility
    if (schema) {
      this.schema = this.extractSchemaFromDelta(schema);
    }
  }

  extractSchemaFromDelta(deltaSchema) {
    const schema = {};
    
    if (deltaSchema.type === 'struct' && deltaSchema.fields) {
      for (const field of deltaSchema.fields) {
        schema[field.name] = this.convertDeltaType(field.type);
      }
    }
    
    return schema;
  }

  convertDeltaType(deltaType) {
    if (typeof deltaType === 'string') {
      switch (deltaType) {
        case 'boolean':
          return 'boolean';
        case 'byte':
        case 'short':
        case 'integer':
        case 'long':
          return 'integer';
        case 'float':
        case 'double':
          return 'float';
        case 'string':
          return 'string';
        case 'binary':
          return 'binary';
        case 'date':
          return 'date';
        case 'timestamp':
          return 'timestamp';
        default:
          return deltaType;
      }
    } else if (deltaType.type) {
      switch (deltaType.type) {
        case 'decimal':
          return 'decimal';
        case 'array':
          return 'array';
        case 'map':
        case 'struct':
          return 'object';
        default:
          return deltaType.type;
      }
    }
    
    return 'unknown';
  }

  async readData(directoryHandle, options = {}) {
    if (!this.activeFiles || this.activeFiles.length === 0) {
      await this.readMetadata(directoryHandle);
    }
    
    const version = options.version || this.currentVersion;
    const limit = options.limit || 1000;
    const offset = options.offset || 0;
    
    // Build file list for requested version
    const filesToRead = this.getFilesForVersion(version);
    
    if (filesToRead.length === 0) {
      this.data = [];
      return this.data;
    }
    
    // Load Parquet handler for reading data files
    await this.initializeParquetHandler();
    
    const allData = [];
    let rowsRead = 0;
    
    // Read data from Parquet files
    for (const fileInfo of filesToRead) {
      if (rowsRead >= offset + limit) break;
      
      try {
        const fileHandle = await this.resolveFileHandle(directoryHandle, fileInfo.path);
        const file = await fileHandle.getFile();
        
        const fileData = await this.readParquetFile(file, {
          offset: Math.max(0, offset - rowsRead),
          limit: Math.max(0, offset + limit - rowsRead)
        });
        
        // Apply partition values
        const enrichedData = this.applyPartitionValues(fileData, fileInfo.partitionValues);
        allData.push(...enrichedData);
        rowsRead += fileData.length;
        
      } catch (error) {
        console.warn(`Error reading file ${fileInfo.path}:`, error);
      }
    }
    
    // Apply any table-level transformations
    this.data = this.applyTableTransformations(allData, options);
    return this.data;
  }

  async* streamData(directoryHandle, options = {}) {
    if (!this.activeFiles || this.activeFiles.length === 0) {
      await this.readMetadata(directoryHandle);
    }
    
    const version = options.version || this.currentVersion;
    const chunkSize = options.chunkSize || 1000;
    const filesToRead = this.getFilesForVersion(version);
    
    await this.initializeParquetHandler();
    
    for (const fileInfo of filesToRead) {
      try {
        const fileHandle = await this.resolveFileHandle(directoryHandle, fileInfo.path);
        const file = await fileHandle.getFile();
        
        // Stream data from each Parquet file
        for await (const chunk of this.streamParquetFile(file, { chunkSize })) {
          const enrichedChunk = this.applyPartitionValues(chunk, fileInfo.partitionValues);
          if (enrichedChunk.length > 0) {
            yield enrichedChunk;
          }
        }
        
      } catch (error) {
        console.warn(`Error streaming file ${fileInfo.path}:`, error);
      }
    }
  }

  getFilesForVersion(version) {
    // Filter files by version - only include files added up to the specified version
    return this.activeFiles.filter(file => file.version <= version);
  }

  async initializeParquetHandler() {
    if (!this.parquetHandler) {
      const { ParquetFormat } = await import('../single/ParquetFormat.js');
      this.parquetHandler = new ParquetFormat();
    }
    return this.parquetHandler;
  }

  async readParquetFile(file, options = {}) {
    await this.parquetHandler.readData(file, options);
    return this.parquetHandler.data;
  }

  async* streamParquetFile(file, options = {}) {
    yield* this.parquetHandler.streamData(file, options);
  }

  async resolveFileHandle(directoryHandle, relativePath) {
    // Navigate to the file using the relative path
    const pathParts = relativePath.split('/');
    let currentHandle = directoryHandle;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
    }
    
    const filename = pathParts[pathParts.length - 1];
    return await currentHandle.getFileHandle(filename);
  }

  applyPartitionValues(data, partitionValues) {
    if (!partitionValues || Object.keys(partitionValues).length === 0) {
      return data;
    }
    
    // Add partition columns to each row
    return data.map(row => ({
      ...row,
      ...partitionValues
    }));
  }

  applyTableTransformations(data, options) {
    // Apply any Delta Lake specific transformations
    // For now, just return the data as-is
    return data;
  }

  // Version management
  getVersions() {
    return Array.from(this.versions.values()).sort((a, b) => b.version - a.version);
  }

  async readVersion(directoryHandle, version) {
    const originalVersion = this.currentVersion;
    try {
      const data = await this.readData(directoryHandle, { version });
      return data;
    } finally {
      // Restore original version
      this.currentVersion = originalVersion;
    }
  }

  // Utility methods
  getProtocolVersion() {
    return this.protocolVersion ? {
      minReaderVersion: this.protocolVersion.minReaderVersion,
      minWriterVersion: this.protocolVersion.minWriterVersion
    } : null;
  }

  getCreatedTime() {
    if (this.tableMetadata && this.tableMetadata.createdTime) {
      return new Date(this.tableMetadata.createdTime);
    }
    
    // Fall back to earliest version timestamp
    const versions = this.getVersions();
    return versions.length > 0 ? new Date(versions[versions.length - 1].timestamp) : null;
  }

  getLastModified() {
    const versions = this.getVersions();
    return versions.length > 0 ? new Date(versions[0].timestamp) : null;
  }

  getTableId() {
    return this.tableMetadata ? this.tableMetadata.id : null;
  }

  getTableName() {
    return this.tableMetadata ? this.tableMetadata.name : null;
  }

  getPartitionInfo() {
    if (!this.partitionColumns || this.partitionColumns.length === 0) {
      return null;
    }
    
    const partitionValues = new Map();
    
    for (const file of this.activeFiles) {
      if (file.partitionValues) {
        for (const [column, value] of Object.entries(file.partitionValues)) {
          if (!partitionValues.has(column)) {
            partitionValues.set(column, new Set());
          }
          partitionValues.get(column).add(value);
        }
      }
    }
    
    const partitions = {};
    for (const [column, values] of partitionValues) {
      partitions[column] = Array.from(values).sort();
    }
    
    return partitions;
  }

  // Statistics
  getTableStatistics() {
    const stats = {
      numFiles: this.activeFiles.length,
      numVersions: this.versions.size,
      currentVersion: this.currentVersion,
      partitionColumns: this.partitionColumns,
      totalSize: 0,
      numRecords: 0
    };
    
    for (const file of this.activeFiles) {
      if (file.size) {
        stats.totalSize += file.size;
      }
      if (file.stats && file.stats.numRecords) {
        stats.numRecords += file.stats.numRecords;
      }
    }
    
    return stats;
  }

  // Schema evolution info
  getSchemaEvolution() {
    const schemas = [];
    
    for (const entry of this.transactionLog) {
      if (entry.metaData && entry.metaData.schemaString) {
        try {
          const schema = JSON.parse(entry.metaData.schemaString);
          schemas.push({
            version: entry._version,
            schema,
            timestamp: this.versions.get(entry._version)?.timestamp
          });
        } catch (error) {
          console.warn('Error parsing schema for version', entry._version, error);
        }
      }
    }
    
    return schemas;
  }

  // Export functionality
  async exportToFormat(format, options = {}) {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(this.data, null, options.indent || 0);
      case 'csv':
        return this.toCSV();
      case 'jsonl':
        return this.data.map(row => JSON.stringify(row)).join('\n');
      default:
        throw new Error(`Export to ${format} not supported for Delta Lake tables`);
    }
  }

  // Validation
  async validateDeltaTable(directoryHandle) {
    try {
      const deltaLogHandle = await directoryHandle.getDirectoryHandle('_delta_log');
      
      let hasVersionZero = false;
      for await (const entry of deltaLogHandle.values()) {
        if (entry.name === '00000000000000000000.json') {
          hasVersionZero = true;
          break;
        }
      }
      
      return {
        valid: hasVersionZero,
        message: hasVersionZero ? 'Valid Delta table' : 'Missing version 0 log file'
      };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid Delta table: ${error.message}`
      };
    }
  }
}