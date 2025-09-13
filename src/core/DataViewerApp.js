import { FormatDetector } from './FormatDetector.js';
import { FormatRegistry } from '../formats/base/FormatRegistry.js';
import { DataEngine } from './DataEngine.js';
import { LocalFileAdapter } from '../storage/LocalFileAdapter.js';
import { CloudStorageAdapter } from '../storage/CloudStorageAdapter.js';

// Format handlers
import { ParquetFormat } from '../formats/single/ParquetFormat.js';
import { ArrowFormat } from '../formats/single/ArrowFormat.js';
import { AvroFormat } from '../formats/single/AvroFormat.js';
import { JSONLFormat } from '../formats/single/JSONLFormat.js';
import { ORCFormat } from '../formats/single/ORCFormat.js';
import { DeltaLakeFormat } from '../formats/table/DeltaLakeFormat.js';
import { IcebergFormat } from '../formats/table/IcebergFormat.js';

export class DataViewerApp {
  constructor() {
    this.detector = new FormatDetector();
    this.registry = new FormatRegistry();
    this.engine = new DataEngine();
    this.localStorage = new LocalFileAdapter();
    this.cloudStorage = new Map();
    
    this.currentHandler = null;
    this.currentData = null;
    this.currentFormat = null;
    this.currentSource = null;
    
    this.eventListeners = new Map();
    
    this.initializeFormatHandlers();
    this.initializeEventHandlers();
  }

  initializeFormatHandlers() {
    // Register all format handlers
    this.registry.register('parquet', ParquetFormat);
    this.registry.register('arrow', ArrowFormat);
    this.registry.register('feather', ArrowFormat); // Feather uses Arrow format
    this.registry.register('avro', AvroFormat);
    this.registry.register('jsonl', JSONLFormat);
    this.registry.register('ndjson', JSONLFormat); // NDJSON uses JSONL format
    this.registry.register('orc', ORCFormat);
    this.registry.register('delta', DeltaLakeFormat);
    this.registry.register('iceberg', IcebergFormat);
    
    console.log('Registered format handlers:', this.registry.getSupportedFormats());
  }

  initializeEventHandlers() {
    // Set up drag and drop
    this.setupDragAndDrop();
    
    // Set up file input handlers
    this.setupFileInputs();
    
    // Set up cloud storage handlers
    this.setupCloudStorage();
  }

  // File handling methods
  async handleFileInput(input, options = {}) {
    try {
      this.emit('loading', { message: 'Detecting format...', progress: 0 });
      
      // Detect format
      const format = await this.detector.detect(input);
      const confidence = this.detector.getConfidence(input, format);
      
      if (format === 'unknown') {
        throw new Error('Unsupported file format or corrupted file');
      }
      
      this.emit('formatDetected', { format, confidence });
      
      // Get appropriate handler
      const Handler = this.registry.getHandler(format);
      const handler = new Handler();
      
      this.currentHandler = handler;
      this.currentFormat = format;
      this.currentSource = input;
      
      // Update UI with format info
      this.updateFormatInfo(format, handler);
      
      // Read metadata first
      this.emit('loading', { message: 'Reading metadata...', progress: 25 });
      const metadata = await handler.readMetadata(input);
      
      this.emit('metadataLoaded', { metadata, schema: handler.schema });
      
      // Determine if we should stream or load all data
      const shouldStream = this.shouldStreamFile(input, metadata, options);
      
      if (shouldStream) {
        await this.handleStreamingLoad(handler, input, options);
      } else {
        await this.handleDirectLoad(handler, input, options);
      }
      
      // Update data engine
      this.engine.setData(this.currentData);
      
      // Calculate statistics
      this.emit('loading', { message: 'Calculating statistics...', progress: 90 });
      const statistics = this.engine.getStatistics();
      
      // Complete
      this.emit('loadComplete', {
        format,
        data: this.currentData,
        metadata,
        schema: handler.schema,
        statistics,
        rowCount: this.currentData.length
      });
      
      this.emit('success', `Successfully loaded ${this.currentData.length} rows from ${format} file`);
      
    } catch (error) {
      this.emit('error', error.message);
      console.error('File handling error:', error);
    }
  }

  async handleDirectoryInput(dirHandle, options = {}) {
    try {
      this.emit('loading', { message: 'Analyzing directory structure...', progress: 0 });
      
      // Check for table formats
      const format = await this.detector.detect(dirHandle);
      
      if (format === 'delta' || format === 'iceberg') {
        const Handler = this.registry.getHandler(format);
        const handler = new Handler();
        
        this.currentHandler = handler;
        this.currentFormat = format;
        this.currentSource = dirHandle;
        
        // Read metadata
        this.emit('loading', { message: 'Reading table metadata...', progress: 25 });
        await handler.readMetadata(dirHandle);
        
        // Show table format UI
        this.showTableFormatUI(handler);
        
        // Load initial data with pagination
        this.emit('loading', { message: 'Loading data...', progress: 50 });
        const data = await handler.readData(dirHandle, {
          limit: options.initialLimit || 1000,
          offset: 0
        });
        
        this.currentData = data;
        this.engine.setData(data);
        
        this.emit('loadComplete', {
          format,
          data,
          metadata: handler.metadata,
          schema: handler.schema,
          statistics: this.engine.getStatistics(),
          rowCount: data.length,
          isTableFormat: true
        });
        
        this.emit('success', `Successfully loaded ${format} table with ${data.length} rows`);
        
      } else {
        throw new Error('Directory does not contain a recognized table format');
      }
      
    } catch (error) {
      this.emit('error', error.message);
      console.error('Directory handling error:', error);
    }
  }

  shouldStreamFile(input, metadata, options) {
    // Stream if file is large or user requested streaming
    if (options.forceStreaming) return true;
    
    // Check file size
    if (input instanceof File && input.size > 10 * 1024 * 1024) { // 10MB
      return true;
    }
    
    // Check estimated rows
    if (metadata && metadata.numberOfRows > 50000) {
      return true;
    }
    
    return false;
  }

  async handleStreamingLoad(handler, input, options) {
    this.emit('loading', { message: 'Streaming data...', progress: 50 });
    
    const chunks = [];
    let totalRows = 0;
    const maxRows = options.maxRows || 10000; // Limit for initial load
    
    try {
      for await (const chunk of handler.streamData(input, { 
        chunkSize: 1000,
        limit: maxRows 
      })) {
        chunks.push(...chunk);
        totalRows += chunk.length;
        
        this.emit('loading', { 
          message: `Loaded ${totalRows} rows...`, 
          progress: 50 + (totalRows / maxRows) * 40 
        });
        
        if (totalRows >= maxRows) break;
      }
      
      this.currentData = chunks;
      
      // Emit streaming info
      this.emit('streamingInfo', {
        loadedRows: totalRows,
        isPartialLoad: totalRows >= maxRows,
        canLoadMore: totalRows >= maxRows
      });
      
    } catch (error) {
      console.error('Streaming error:', error);
      // Fall back to direct loading with smaller limit
      await this.handleDirectLoad(handler, input, { limit: 1000 });
    }
  }

  async handleDirectLoad(handler, input, options) {
    this.emit('loading', { message: 'Loading data...', progress: 50 });
    
    const data = await handler.readData(input, {
      limit: options.limit || 10000,
      offset: options.offset || 0
    });
    
    this.currentData = data;
  }

  // UI Integration methods
  updateFormatInfo(format, handler) {
    const formatInfo = {
      format,
      version: handler.getVersion?.() || 'unknown',
      capabilities: this.getFormatCapabilities(format),
      handler: handler.constructor.name
    };
    
    this.emit('formatInfo', formatInfo);
  }

  getFormatCapabilities(format) {
    const capabilities = {
      read: true,
      metadata: true,
      streaming: false,
      export: ['json', 'csv'],
      statistics: true
    };
    
    switch (format) {
      case 'parquet':
      case 'arrow':
      case 'jsonl':
        capabilities.streaming = true;
        capabilities.export.push('jsonl');
        break;
      case 'delta':
        capabilities.streaming = true;
        capabilities.versionHistory = true;
        break;
      case 'orc':
        capabilities.read = 'limited';
        capabilities.streaming = false;
        break;
    }
    
    return capabilities;
  }

  showTableFormatUI(handler) {
    const tableInfo = {
      type: 'table',
      versions: handler.getVersions?.() || [],
      partitions: handler.getPartitionInfo?.() || null,
      statistics: handler.getTableStatistics?.() || null
    };
    
    this.emit('tableInfo', tableInfo);
  }

  // Storage integration
  async selectLocalFiles(options = {}) {
    try {
      const files = await this.localStorage.selectFiles(options);
      if (files && files.length > 0) {
        if (files.length === 1) {
          await this.handleFileInput(files[0].file);
        } else {
          this.emit('multipleFiles', files);
        }
      }
    } catch (error) {
      this.emit('error', `File selection failed: ${error.message}`);
    }
  }

  async selectLocalDirectory(options = {}) {
    try {
      const result = await this.localStorage.selectDirectory(options);
      if (result) {
        await this.handleDirectoryInput(result.handle);
      }
    } catch (error) {
      this.emit('error', `Directory selection failed: ${error.message}`);
    }
  }

  async connectCloudStorage(provider, clientId) {
    try {
      if (!this.cloudStorage.has(provider)) {
        this.cloudStorage.set(provider, new CloudStorageAdapter(provider));
      }
      
      const adapter = this.cloudStorage.get(provider);
      const redirectUri = window.location.origin;
      
      await adapter.authenticate(clientId, redirectUri);
      
      this.emit('cloudConnected', { 
        provider, 
        info: adapter.getProviderInfo() 
      });
      
    } catch (error) {
      this.emit('error', `Cloud storage connection failed: ${error.message}`);
    }
  }

  // Data manipulation methods
  applyFilter(column, filter) {
    this.engine.addFilter(column, filter);
    const page = this.engine.getPage();
    this.emit('dataFiltered', { 
      data: page.data, 
      pagination: page,
      filters: Array.from(this.engine.filters.keys())
    });
  }

  applySort(column, direction) {
    this.engine.setSortOptions(column, direction);
    const page = this.engine.getPage();
    this.emit('dataSorted', { 
      data: page.data, 
      pagination: page,
      sort: { column, direction }
    });
  }

  search(query, columns) {
    this.engine.search(query, columns);
    const page = this.engine.getPage();
    this.emit('searchResults', { 
      data: page.data, 
      pagination: page,
      query 
    });
  }

  changePage(page, pageSize) {
    const result = this.engine.getPage(page, pageSize);
    this.emit('pageChanged', { 
      data: result.data, 
      pagination: result 
    });
  }

  // Export methods
  async exportData(format, options = {}) {
    try {
      if (!this.currentHandler) {
        throw new Error('No data loaded to export');
      }
      
      let exportData;
      
      if (options.exportFiltered && this.engine.currentData.length !== this.engine.originalData.length) {
        // Export filtered data
        exportData = this.engine.exportFiltered(format);
      } else if (this.currentHandler.exportToFormat) {
        // Use format handler's export
        exportData = await this.currentHandler.exportToFormat(format, options);
      } else {
        // Use data engine's export
        exportData = this.engine.exportFiltered(format);
      }
      
      this.downloadData(exportData, `data.${format}`, this.getMimeType(format));
      
    } catch (error) {
      this.emit('error', `Export failed: ${error.message}`);
    }
  }

  downloadData(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    
    this.emit('downloadComplete', { filename, size: blob.size });
  }

  getMimeType(format) {
    const mimeTypes = {
      json: 'application/json',
      csv: 'text/csv',
      jsonl: 'application/jsonl',
      txt: 'text/plain'
    };
    return mimeTypes[format] || 'application/octet-stream';
  }

  // Event system
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      for (const callback of this.eventListeners.get(event)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  // Drag and drop setup
  setupDragAndDrop() {
    // This would be implemented to integrate with the HTML elements
    // For now, providing the interface
  }

  setupFileInputs() {
    // This would be implemented to integrate with HTML file inputs
    // For now, providing the interface
  }

  setupCloudStorage() {
    // This would be implemented to integrate with cloud storage UI
    // For now, providing the interface
  }

  // Status and info
  getStatus() {
    return {
      currentFormat: this.currentFormat,
      dataLoaded: this.currentData !== null,
      rowCount: this.currentData ? this.currentData.length : 0,
      engineStatus: this.engine.getStatus(),
      supportedFormats: this.registry.getSupportedFormats(),
      storageCompatibility: this.localStorage.getCompatibilityInfo()
    };
  }

  // Cleanup
  cleanup() {
    this.currentData = null;
    this.currentHandler = null;
    this.engine.clearFilters();
    this.eventListeners.clear();
  }
}