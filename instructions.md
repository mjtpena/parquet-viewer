Multi-Format Data Viewer Implementation Guide
Project Overview
Extend the existing Parquet Viewer to support multiple data formats while maintaining 100% client-side processing and user privacy.
Success Criteria
The implementation is considered complete when:

✅ Successfully reads and displays at least 5 additional formats (Arrow, Avro, ORC, Delta Lake, JSONL)
✅ Maintains 100% client-side processing - no data sent to servers
✅ Auto-detects file formats with 95%+ accuracy
✅ Handles files up to 500MB without browser crashes
✅ Supports read-only connection to local directories and cloud storage
✅ Performance: Processes 100k rows in <3 seconds
✅ All existing Parquet viewer features work with new formats
✅ Clean error handling with user-friendly messages

Implementation Instructions
Phase 1: Core Architecture Setup
1.1 Project Structure
parquet-viewer/
├── index.html (existing, needs modification)
├── src/
│   ├── core/
│   │   ├── FormatDetector.js
│   │   ├── DataEngine.js
│   │   ├── StorageManager.js
│   │   └── CacheManager.js
│   ├── formats/
│   │   ├── base/
│   │   │   ├── BaseFormat.js
│   │   │   └── FormatRegistry.js
│   │   ├── single/
│   │   │   ├── ParquetFormat.js (refactor existing)
│   │   │   ├── ArrowFormat.js
│   │   │   ├── AvroFormat.js
│   │   │   ├── ORCFormat.js
│   │   │   └── JSONLFormat.js
│   │   └── table/
│   │       ├── DeltaLakeFormat.js
│   │       └── IcebergFormat.js
│   ├── storage/
│   │   ├── LocalFileAdapter.js
│   │   └── CloudStorageAdapter.js
│   ├── workers/
│   │   └── DataProcessor.worker.js
│   └── utils/
│       ├── StreamReader.js
│       └── TypeDetector.js
└── tests/
    └── test-files/
1.2 Create Base Format Class
javascript// src/formats/base/BaseFormat.js
export class BaseFormat {
  constructor() {
    this.metadata = null;
    this.schema = null;
    this.data = [];
  }

  // Must be implemented by subclasses
  static canHandle(file) { throw new Error('Not implemented'); }
  async readMetadata(source) { throw new Error('Not implemented'); }
  async readData(source, options) { throw new Error('Not implemented'); }
  async* streamData(source, options) { throw new Error('Not implemented'); }
  
  // Common functionality
  getColumns() { return Object.keys(this.schema || {}); }
  getRowCount() { return this.data.length; }
  toJSON() { return this.data; }
  toCSV() { /* implement CSV conversion */ }
}
Phase 2: Format Implementations
2.1 Arrow/Feather Format
javascript// src/formats/single/ArrowFormat.js
import { Table } from 'https://cdn.jsdelivr.net/npm/apache-arrow@latest/+esm';

export class ArrowFormat extends BaseFormat {
  static canHandle(file) {
    return file.name.endsWith('.arrow') || 
           file.name.endsWith('.feather');
  }

  async readData(file, options = {}) {
    const buffer = await file.arrayBuffer();
    const table = Table.from(buffer);
    
    this.schema = this.extractSchema(table.schema);
    this.metadata = {
      numRows: table.numRows,
      numCols: table.numCols,
      byteLength: buffer.byteLength
    };
    
    // Convert to row-based format for compatibility
    this.data = [];
    for (let i = 0; i < table.numRows; i++) {
      const row = {};
      for (const field of table.schema.fields) {
        row[field.name] = table.getColumn(field.name).get(i);
      }
      this.data.push(row);
    }
    
    return this.data;
  }
}
2.2 Avro Format
javascript// src/formats/single/AvroFormat.js
import avro from 'https://cdn.jsdelivr.net/npm/avsc@latest/+esm';

export class AvroFormat extends BaseFormat {
  static canHandle(file) {
    return file.name.endsWith('.avro');
  }

  async readData(file, options = {}) {
    const buffer = await file.arrayBuffer();
    const decoder = avro.createBlobDecoder(buffer);
    
    this.data = [];
    decoder.on('metadata', (type, codec, header) => {
      this.metadata = { type, codec, header };
      this.schema = type.getSchema();
    });
    
    decoder.on('data', (record) => {
      this.data.push(record);
    });
    
    await new Promise((resolve, reject) => {
      decoder.on('end', resolve);
      decoder.on('error', reject);
    });
    
    return this.data;
  }
}
2.3 Delta Lake Format
javascript// src/formats/table/DeltaLakeFormat.js
export class DeltaLakeFormat extends BaseFormat {
  static canHandle(input) {
    // Check if directory contains _delta_log
    return input.type === 'directory' && input.hasSubdir('_delta_log');
  }

  async readMetadata(directoryHandle) {
    const deltaLog = await directoryHandle.getDirectoryHandle('_delta_log');
    const logFiles = [];
    
    // Read all transaction log files
    for await (const entry of deltaLog.values()) {
      if (entry.name.endsWith('.json')) {
        logFiles.push(entry);
      }
    }
    
    // Sort by version number
    logFiles.sort((a, b) => {
      const versionA = parseInt(a.name.match(/(\d+)\.json/)[1]);
      const versionB = parseInt(b.name.match(/(\d+)\.json/)[1]);
      return versionA - versionB;
    });
    
    // Build current state from transaction log
    this.transactionLog = [];
    for (const logFile of logFiles) {
      const file = await logFile.getFile();
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      
      for (const line of lines) {
        this.transactionLog.push(JSON.parse(line));
      }
    }
    
    this.buildTableState();
  }

  buildTableState() {
    const activeFiles = new Map();
    let schema = null;
    
    for (const entry of this.transactionLog) {
      if (entry.add) {
        activeFiles.set(entry.add.path, entry.add);
      } else if (entry.remove) {
        activeFiles.delete(entry.remove.path);
      } else if (entry.metaData) {
        schema = JSON.parse(entry.metaData.schemaString);
        this.metadata = entry.metaData;
      }
    }
    
    this.activeFiles = Array.from(activeFiles.values());
    this.schema = schema;
  }

  async readData(directoryHandle, options = {}) {
    if (!this.activeFiles) {
      await this.readMetadata(directoryHandle);
    }
    
    const allData = [];
    
    // Read each active Parquet file
    for (const fileInfo of this.activeFiles) {
      const fileHandle = await this.resolveFile(directoryHandle, fileInfo.path);
      const file = await fileHandle.getFile();
      
      // Reuse existing Parquet reader
      const parquetData = await this.readParquetFile(file);
      allData.push(...parquetData);
    }
    
    this.data = allData;
    return this.data;
  }
}
Phase 3: Format Detection System
3.1 Format Detector
javascript// src/core/FormatDetector.js
export class FormatDetector {
  constructor() {
    this.formats = new Map();
    this.registerFormats();
  }

  registerFormats() {
    // Register all format handlers
    this.formats.set('parquet', ParquetFormat);
    this.formats.set('arrow', ArrowFormat);
    this.formats.set('avro', AvroFormat);
    this.formats.set('orc', ORCFormat);
    this.formats.set('jsonl', JSONLFormat);
    this.formats.set('delta', DeltaLakeFormat);
  }

  async detect(input) {
    // For files, check magic bytes
    if (input instanceof File) {
      const header = await this.readHeader(input);
      
      // Check magic bytes
      if (this.isParquet(header)) return 'parquet';
      if (this.isORC(header)) return 'orc';
      if (this.isAvro(header)) return 'avro';
      if (this.isArrow(header)) return 'arrow';
      
      // Fall back to extension
      const ext = input.name.split('.').pop().toLowerCase();
      if (this.formats.has(ext)) return ext;
    }
    
    // For directories, check structure
    if (input instanceof FileSystemDirectoryHandle) {
      const entries = await this.listEntries(input);
      
      if (entries.includes('_delta_log')) return 'delta';
      if (entries.includes('metadata')) {
        // Further check for Iceberg
        const metadata = await input.getDirectoryHandle('metadata');
        const metaEntries = await this.listEntries(metadata);
        if (metaEntries.some(e => e.includes('metadata.json'))) {
          return 'iceberg';
        }
      }
    }
    
    return 'unknown';
  }

  async readHeader(file, bytes = 32) {
    const slice = file.slice(0, bytes);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }

  isParquet(header) {
    // Check for "PAR1" magic bytes
    return header[0] === 0x50 && header[1] === 0x41 && 
           header[2] === 0x52 && header[3] === 0x31;
  }

  isORC(header) {
    // Check for "ORC" magic bytes
    return header[0] === 0x4F && header[1] === 0x52 && header[2] === 0x43;
  }

  isAvro(header) {
    // Check for Avro magic bytes
    return header[0] === 0x4F && header[1] === 0x62 && 
           header[2] === 0x6A && header[3] === 0x01;
  }

  isArrow(header) {
    // Check for "ARROW1" magic bytes
    return header[0] === 0x41 && header[1] === 0x52 && 
           header[2] === 0x52 && header[3] === 0x4F && 
           header[4] === 0x57 && header[5] === 0x31;
  }
}
Phase 4: Storage Integration
4.1 Local File System Access
javascript// src/storage/LocalFileAdapter.js
export class LocalFileAdapter {
  async selectDirectory() {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('File System Access API not supported');
    }
    
    try {
      this.directoryHandle = await window.showDirectoryPicker({
        mode: 'read'
      });
      return this.directoryHandle;
    } catch (err) {
      if (err.name === 'AbortError') {
        return null; // User cancelled
      }
      throw err;
    }
  }

  async* walkDirectory(dirHandle, path = '') {
    for await (const entry of dirHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      
      if (entry.kind === 'file') {
        yield { type: 'file', path: entryPath, handle: entry };
      } else if (entry.kind === 'directory') {
        yield { type: 'directory', path: entryPath, handle: entry };
        yield* this.walkDirectory(entry, entryPath);
      }
    }
  }
}
4.2 Cloud Storage Support
javascript// src/storage/CloudStorageAdapter.js
export class CloudStorageAdapter {
  constructor(provider) {
    this.provider = provider;
    this.config = this.getProviderConfig(provider);
  }

  getProviderConfig(provider) {
    const configs = {
      gdrive: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
      },
      dropbox: {
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        scope: 'files.metadata.read files.content.read'
      },
      onedrive: {
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        scope: 'files.read files.read.all'
      }
    };
    return configs[provider];
  }

  async authenticate() {
    // OAuth flow implementation
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: window.location.origin,
      scope: this.config.scope,
      response_type: 'token'
    });
    
    window.location.href = `${this.config.authUrl}?${params}`;
  }

  async listFiles(path = '/') {
    // Provider-specific implementation
    switch (this.provider) {
      case 'gdrive':
        return this.listGoogleDriveFiles(path);
      case 'dropbox':
        return this.listDropboxFiles(path);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }
}
Phase 5: UI Integration
5.1 Update HTML Structure
html<!-- Add to index.html -->
<div id="formatSelector" class="format-selector hidden">
  <h3>Multiple Formats Detected</h3>
  <div id="formatOptions"></div>
</div>

<div id="storageSelector" class="storage-selector">
  <button onclick="selectLocalFiles()">
    <svg><!-- folder icon --></svg>
    Local Folder
  </button>
  <button onclick="connectCloudStorage('gdrive')">
    <svg><!-- gdrive icon --></svg>
    Google Drive
  </button>
  <button onclick="connectCloudStorage('dropbox')">
    <svg><!-- dropbox icon --></svg>
    Dropbox
  </button>
</div>

<div id="formatInfo" class="format-info">
  <span id="currentFormat" class="format-badge"></span>
  <span id="formatVersion" class="format-version"></span>
</div>
5.2 Main Application Controller
javascript// src/app.js
import { FormatDetector } from './core/FormatDetector.js';
import { FormatRegistry } from './formats/base/FormatRegistry.js';
import { StorageManager } from './core/StorageManager.js';
import { DataEngine } from './core/DataEngine.js';

class DataViewerApp {
  constructor() {
    this.detector = new FormatDetector();
    this.registry = new FormatRegistry();
    this.storage = new StorageManager();
    this.engine = new DataEngine();
    
    this.initializeEventListeners();
  }

  async handleFileInput(input) {
    try {
      // Show loading
      this.showLoading('Detecting format...');
      
      // Detect format
      const format = await this.detector.detect(input);
      
      if (format === 'unknown') {
        throw new Error('Unsupported file format');
      }
      
      // Get appropriate handler
      const Handler = this.registry.getHandler(format);
      const handler = new Handler();
      
      // Update UI
      this.updateFormatInfo(format, handler);
      
      // Read data
      this.showLoading('Reading data...');
      const data = await handler.readData(input);
      
      // Display data
      this.displayData(data, handler.schema);
      
      // Show success
      this.showSuccess(`Loaded ${data.length} rows from ${format} file`);
      
    } catch (error) {
      this.showError(error.message);
    }
  }

  async handleDirectoryInput(dirHandle) {
    // Check for table formats
    const format = await this.detector.detect(dirHandle);
    
    if (format === 'delta' || format === 'iceberg') {
      const Handler = this.registry.getHandler(format);
      const handler = new Handler();
      
      await handler.readMetadata(dirHandle);
      
      // Show table format UI
      this.showTableFormatUI(handler);
      
      // Load data with pagination
      const data = await handler.readData(dirHandle, {
        limit: 1000,
        offset: 0
      });
      
      this.displayData(data, handler.schema);
    }
  }

  showTableFormatUI(handler) {
    // Show version history for Delta/Iceberg
    if (handler.getVersions) {
      const versions = handler.getVersions();
      this.displayVersionSelector(versions);
    }
    
    // Show partition information
    if (handler.partitions) {
      this.displayPartitionInfo(handler.partitions);
    }
  }
}

// Initialize app
const app = new DataViewerApp();
window.dataViewerApp = app;
Phase 6: Performance Optimization
6.1 Web Worker for Processing
javascript// src/workers/DataProcessor.worker.js
self.addEventListener('message', async (event) => {
  const { action, data, options } = event.data;
  
  switch (action) {
    case 'parse':
      await parseData(data, options);
      break;
    case 'filter':
      await filterData(data, options);
      break;
    case 'aggregate':
      await aggregateData(data, options);
      break;
  }
});

async function parseData(buffer, format) {
  // Import format handler dynamically
  const module = await import(`../formats/single/${format}Format.js`);
  const Handler = module[`${format}Format`];
  
  const handler = new Handler();
  const data = await handler.readData(buffer);
  
  self.postMessage({
    action: 'parseComplete',
    data: data,
    metadata: handler.metadata
  });
}
6.2 Streaming for Large Files
javascript// src/utils/StreamReader.js
export class StreamReader {
  constructor(file, chunkSize = 1024 * 1024) { // 1MB chunks
    this.file = file;
    this.chunkSize = chunkSize;
    this.position = 0;
  }

  async* readChunks() {
    while (this.position < this.file.size) {
      const chunk = this.file.slice(
        this.position, 
        Math.min(this.position + this.chunkSize, this.file.size)
      );
      
      const buffer = await chunk.arrayBuffer();
      yield {
        buffer,
        position: this.position,
        size: buffer.byteLength,
        isLast: this.position + buffer.byteLength >= this.file.size
      };
      
      this.position += buffer.byteLength;
    }
  }
}
Phase 7: Testing
7.1 Test Plan
javascript// tests/format-tests.js
const tests = [
  {
    name: 'Parquet Detection',
    file: 'sample.parquet',
    expectedFormat: 'parquet',
    expectedRows: 1000
  },
  {
    name: 'Arrow Detection',
    file: 'sample.arrow',
    expectedFormat: 'arrow',
    expectedRows: 1000
  },
  {
    name: 'Delta Lake Detection',
    directory: 'delta-table/',
    expectedFormat: 'delta',
    expectedVersions: 5
  },
  {
    name: 'Large File Streaming',
    file: 'large-file.parquet', // 100MB
    maxMemory: 50 * 1024 * 1024, // Should use less than 50MB
    expectedRows: 1000000
  }
];

async function runTests() {
  for (const test of tests) {
    console.log(`Running: ${test.name}`);
    try {
      await runTest(test);
      console.log(`✅ ${test.name} passed`);
    } catch (error) {
      console.error(`❌ ${test.name} failed:`, error);
    }
  }
}
Implementation Checklist
Core Features

 Format detection system with magic bytes
 Modular format handler architecture
 Web Worker integration for non-blocking processing
 File System Access API integration
 Cloud storage OAuth support (Google Drive, Dropbox, OneDrive)

Format Support

 Apache Arrow/Feather (using apache-arrow library)
 Apache Avro (using avsc library)
 Apache ORC (basic implementation)
 JSON Lines (native implementation)
 Delta Lake (transaction log + parquet)
 Apache Iceberg (basic metadata reading)

Performance

 Streaming for files >10MB
 IndexedDB caching for processed data
 Virtual scrolling for large datasets
 Lazy loading for table formats

UI/UX

 Format auto-detection with manual override
 Progress indicators with time estimates
 Format-specific metadata viewers
 Version history UI for Delta/Iceberg
 Responsive design maintained

Testing

 Unit tests for each format handler
 Integration tests for storage adapters
 Performance benchmarks
 Browser compatibility tests (Chrome, Firefox, Safari, Edge)

Dependencies to Add
json{
  "dependencies": {
    "apache-arrow": "^14.0.0",
    "avsc": "^5.7.0",
    "localforage": "^1.10.0"
  },
  "devDependencies": {
    "@types/wicg-file-system-access": "^2023.10.0"
  }
}
Browser Compatibility Requirements

Chrome 86+ (File System Access API)
Firefox 111+ (basic support, no File System Access)
Safari 15.4+ (basic support, no File System Access)
Edge 86+ (File System Access API)

Security Considerations

All processing must remain client-side
OAuth tokens stored in sessionStorage only
No data persistence without explicit user consent
Clear memory after processing large files
Validate all file inputs before processing

Final Deliverable Structure
dist/
├── index.html (single file with embedded modules)
├── data-viewer.min.js (bundled application)
├── workers/
│   └── processor.worker.js
└── formats/ (optional lazy-loaded modules)
Completion Verification
Run the following checks:

Load each supported format and verify data displays correctly
Process a 100MB file without browser crash
Connect to Google Drive and read a Parquet file
Load a Delta Lake table with 5+ versions
Export viewed data to CSV/JSON
Verify no network requests to external servers (except CDN for libraries)
Test on all major browsers

Once all success criteria are met and verification passes, the implementation is complete.