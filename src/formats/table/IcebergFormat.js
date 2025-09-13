import { BaseFormat } from '../base/BaseFormat.js';

export class IcebergFormat extends BaseFormat {
  constructor() {
    super();
    this.tableMetadata = null;
    this.manifestFiles = [];
    this.dataFiles = [];
    this.snapshots = [];
    this.currentSnapshot = null;
    this.parquetHandler = null;
  }

  static canHandle(input) {
    // Check if directory contains Iceberg metadata structure
    return input && typeof input.getDirectoryHandle === 'function';
  }

  async readMetadata(directoryHandle) {
    try {
      // Look for Iceberg metadata directory
      const metadataHandle = await directoryHandle.getDirectoryHandle('metadata');
      
      // Load table metadata
      await this.loadTableMetadata(metadataHandle);
      
      // Load snapshots
      await this.loadSnapshots(metadataHandle);
      
      // Load manifest files for current snapshot
      if (this.currentSnapshot) {
        await this.loadManifests(metadataHandle, this.currentSnapshot);
      }
      
      this.metadata = {
        tableUuid: this.tableMetadata?.['table-uuid'],
        formatVersion: this.tableMetadata?.['format-version'],
        location: this.tableMetadata?.location,
        snapshots: this.snapshots.length,
        currentSnapshotId: this.currentSnapshot?.['snapshot-id'],
        schema: this.tableMetadata?.schema,
        partitionSpec: this.tableMetadata?.['partition-spec'],
        sortOrders: this.tableMetadata?.['sort-orders'] || []
      };
      
      this.schema = this.extractSchemaFromIceberg(this.tableMetadata?.schema);
      
      return this.metadata;
    } catch (error) {
      throw new Error(`Failed to read Iceberg metadata: ${error.message}`);
    }
  }

  async loadTableMetadata(metadataHandle) {
    try {
      // Find the latest metadata JSON file
      const metadataFiles = [];
      
      for await (const entry of metadataHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/^v\d+\.metadata\.json$/)) {
          metadataFiles.push({
            name: entry.name,
            handle: entry,
            version: parseInt(entry.name.match(/^v(\d+)\.metadata\.json$/)[1])
          });
        }
      }
      
      if (metadataFiles.length === 0) {
        throw new Error('No Iceberg metadata files found');
      }
      
      // Sort by version and get the latest
      metadataFiles.sort((a, b) => b.version - a.version);
      const latestMetadata = metadataFiles[0];
      
      const file = await latestMetadata.handle.getFile();
      const text = await file.text();
      this.tableMetadata = JSON.parse(text);
      
      console.log(`Loaded Iceberg metadata version ${latestMetadata.version}`);
      
    } catch (error) {
      throw new Error(`Failed to load table metadata: ${error.message}`);
    }
  }

  async loadSnapshots(metadataHandle) {
    if (!this.tableMetadata || !this.tableMetadata.snapshots) {
      return;
    }
    
    this.snapshots = this.tableMetadata.snapshots;
    
    // Set current snapshot (latest by default)
    if (this.tableMetadata['current-snapshot-id']) {
      this.currentSnapshot = this.snapshots.find(
        s => s['snapshot-id'] === this.tableMetadata['current-snapshot-id']
      );
    } else if (this.snapshots.length > 0) {
      // Fallback to most recent snapshot
      this.currentSnapshot = this.snapshots.reduce((latest, current) => {
        return current['timestamp-ms'] > latest['timestamp-ms'] ? current : latest;
      });
    }
  }

  async loadManifests(metadataHandle, snapshot) {
    if (!snapshot || !snapshot['manifest-list']) {
      return;
    }
    
    try {
      // Load manifest list file
      const manifestListPath = this.resolveMetadataPath(snapshot['manifest-list']);
      const manifestListHandle = await this.resolveFileHandle(metadataHandle, manifestListPath);
      const manifestListFile = await manifestListHandle.getFile();
      
      // Parse manifest list (Avro format typically)
      const manifestEntries = await this.parseManifestList(manifestListFile);
      
      // Load individual manifest files
      for (const entry of manifestEntries) {
        if (entry.manifest_path) {
          await this.loadManifestFile(metadataHandle, entry.manifest_path);
        }
      }
      
    } catch (error) {
      console.warn('Error loading manifests:', error);
    }
  }

  async parseManifestList(file) {
    // Simplified manifest list parsing
    // In a full implementation, this would use proper Avro parsing
    console.warn('Manifest list parsing not fully implemented - using basic approach');
    
    // For now, return empty array - full implementation would parse Avro
    return [];
  }

  async loadManifestFile(metadataHandle, manifestPath) {
    try {
      const manifestHandle = await this.resolveFileHandle(metadataHandle, manifestPath);
      const manifestFile = await manifestHandle.getFile();
      
      // Parse manifest (also Avro format)
      const dataFiles = await this.parseManifest(manifestFile);
      this.dataFiles.push(...dataFiles);
      
    } catch (error) {
      console.warn(`Error loading manifest ${manifestPath}:`, error);
    }
  }

  async parseManifest(file) {
    // Simplified manifest parsing
    // In a full implementation, this would use proper Avro parsing
    console.warn('Manifest parsing not fully implemented - using basic approach');
    
    // For now, return empty array - full implementation would parse Avro
    return [];
  }

  resolveMetadataPath(path) {
    // Remove metadata/ prefix if present
    return path.startsWith('metadata/') ? path.substring(9) : path;
  }

  async resolveFileHandle(baseHandle, relativePath) {
    const pathParts = relativePath.split('/');
    let currentHandle = baseHandle;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
    }
    
    const filename = pathParts[pathParts.length - 1];
    return await currentHandle.getFileHandle(filename);
  }

  async readData(directoryHandle, options = {}) {
    if (!this.currentSnapshot) {
      await this.readMetadata(directoryHandle);
    }
    
    // For basic implementation, show metadata information instead of actual data
    // Full implementation would read the actual Parquet data files
    const basicData = [{
      _notice: 'Iceberg table detected',
      _message: 'Full data reading requires specialized Iceberg libraries',
      _tableInfo: {
        uuid: this.metadata.tableUuid,
        formatVersion: this.metadata.formatVersion,
        snapshots: this.metadata.snapshots,
        currentSnapshot: this.metadata.currentSnapshotId
      },
      _schema: this.schema,
      _recommendation: 'Use Apache Iceberg tools or Spark for full data access'
    }];
    
    this.data = basicData;
    return basicData;
  }

  async* streamData(directoryHandle, options = {}) {
    // Placeholder for streaming implementation
    yield [{
      _notice: 'Iceberg streaming not implemented',
      _message: 'This format requires specialized Iceberg libraries for data reading',
      _metadata: this.metadata
    }];
  }

  extractSchemaFromIceberg(icebergSchema) {
    if (!icebergSchema || !icebergSchema.fields) {
      return {};
    }
    
    const schema = {};
    for (const field of icebergSchema.fields) {
      schema[field.name] = this.convertIcebergType(field.type);
    }
    
    return schema;
  }

  convertIcebergType(icebergType) {
    if (typeof icebergType === 'string') {
      switch (icebergType) {
        case 'boolean':
          return 'boolean';
        case 'int':
        case 'long':
          return 'integer';
        case 'float':
        case 'double':
          return 'float';
        case 'string':
        case 'uuid':
          return 'string';
        case 'binary':
        case 'fixed':
          return 'binary';
        case 'date':
          return 'date';
        case 'timestamp':
        case 'timestamptz':
          return 'timestamp';
        default:
          return icebergType;
      }
    } else if (typeof icebergType === 'object') {
      if (icebergType.type) {
        switch (icebergType.type) {
          case 'decimal':
            return 'decimal';
          case 'list':
            return 'array';
          case 'map':
            return 'object';
          case 'struct':
            return 'record';
          default:
            return icebergType.type;
        }
      }
    }
    
    return 'unknown';
  }

  // Iceberg-specific methods
  getSnapshots() {
    return this.snapshots.map(snapshot => ({
      id: snapshot['snapshot-id'],
      timestampMs: snapshot['timestamp-ms'],
      timestamp: new Date(snapshot['timestamp-ms']),
      operation: snapshot.operation || 'unknown',
      summary: snapshot.summary || {}
    }));
  }

  async readSnapshot(directoryHandle, snapshotId) {
    const snapshot = this.snapshots.find(s => s['snapshot-id'] === snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    
    const oldSnapshot = this.currentSnapshot;
    this.currentSnapshot = snapshot;
    
    try {
      const data = await this.readData(directoryHandle);
      return data;
    } finally {
      this.currentSnapshot = oldSnapshot;
    }
  }

  getSchema() {
    return this.tableMetadata?.schema;
  }

  getPartitionSpec() {
    return this.tableMetadata?.['partition-spec'];
  }

  getSortOrders() {
    return this.tableMetadata?.['sort-orders'] || [];
  }

  getTableProperties() {
    return this.tableMetadata?.properties || {};
  }

  // Statistics and information
  getTableStatistics() {
    const stats = {
      tableUuid: this.metadata?.tableUuid,
      formatVersion: this.metadata?.formatVersion,
      snapshots: this.snapshots.length,
      currentSnapshot: this.currentSnapshot?.['snapshot-id'],
      dataFiles: this.dataFiles.length,
      manifestFiles: this.manifestFiles.length
    };
    
    if (this.currentSnapshot && this.currentSnapshot.summary) {
      const summary = this.currentSnapshot.summary;
      stats.totalRecords = summary['total-records'];
      stats.totalDataFiles = summary['total-data-files'];
      stats.totalDeleteFiles = summary['total-delete-files'];
      stats.totalPositionDeletes = summary['total-position-deletes'];
      stats.totalEqualityDeletes = summary['total-equality-deletes'];
    }
    
    return stats;
  }

  getSchemaEvolution() {
    // Track schema changes across snapshots
    const evolution = [];
    
    for (const snapshot of this.snapshots) {
      if (snapshot.operation === 'replace' || snapshot.operation === 'append') {
        evolution.push({
          snapshotId: snapshot['snapshot-id'],
          timestamp: new Date(snapshot['timestamp-ms']),
          operation: snapshot.operation,
          schemaId: snapshot['schema-id']
        });
      }
    }
    
    return evolution;
  }

  // Validation
  async validateIcebergTable(directoryHandle) {
    try {
      const metadataHandle = await directoryHandle.getDirectoryHandle('metadata');
      
      // Check for required metadata files
      let hasMetadataJson = false;
      let hasVersionHint = false;
      
      for await (const entry of metadataHandle.values()) {
        if (entry.name.match(/^v\d+\.metadata\.json$/)) {
          hasMetadataJson = true;
        }
        if (entry.name === 'version-hint.text') {
          hasVersionHint = true;
        }
      }
      
      return {
        valid: hasMetadataJson,
        hasVersionHint,
        message: hasMetadataJson ? 'Valid Iceberg table' : 'Missing metadata.json files'
      };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid Iceberg table: ${error.message}`
      };
    }
  }

  // Export functionality (limited)
  async exportToFormat(format, options = {}) {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify({
          tableMetadata: this.tableMetadata,
          snapshots: this.getSnapshots(),
          schema: this.schema,
          statistics: this.getTableStatistics()
        }, null, options.indent || 2);
      default:
        throw new Error(`Export to ${format} not supported for Iceberg tables without data access`);
    }
  }

  // Recommendations for full Iceberg support
  getRecommendations() {
    return {
      libraries: [
        'Apache Iceberg Java libraries',
        'PyIceberg (Python)',
        'Apache Spark with Iceberg support'
      ],
      cloudServices: [
        'AWS Glue with Iceberg support',
        'Databricks with Iceberg tables',
        'Snowflake Iceberg tables'
      ],
      limitations: [
        'Manifest files are in Avro format - requires Avro parsing',
        'Data files are typically in Parquet format',
        'Full implementation requires schema evolution support',
        'Partition pruning and predicate pushdown need specialized logic'
      ]
    };
  }
}