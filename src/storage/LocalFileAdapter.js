export class LocalFileAdapter {
  constructor() {
    this.directoryHandle = null;
    this.fileHandles = new Map();
    this.supportLevel = this.checkSupport();
  }

  checkSupport() {
    if ('showOpenFilePicker' in window && 'showDirectoryPicker' in window) {
      return 'full'; // Full File System Access API support
    } else if ('webkitdirectory' in HTMLInputElement.prototype) {
      return 'partial'; // Fallback to directory input
    } else {
      return 'none'; // No directory access support
    }
  }

  async selectFiles(options = {}) {
    if (this.supportLevel === 'none') {
      throw new Error('File System Access not supported in this browser');
    }

    try {
      if (this.supportLevel === 'full') {
        return await this.selectFilesWithFSA(options);
      } else {
        return await this.selectFilesWithInput(options);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return null; // User cancelled
      }
      throw error;
    }
  }

  async selectFilesWithFSA(options) {
    const fileHandles = await window.showOpenFilePicker({
      multiple: options.multiple !== false,
      types: this.getFileTypes(options.accept),
      excludeAcceptAllOption: false
    });

    const files = [];
    for (const handle of fileHandles) {
      const file = await handle.getFile();
      files.push({
        file,
        handle,
        type: 'file',
        path: file.name
      });
    }

    return files;
  }

  async selectFilesWithInput(options) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = options.multiple !== false;
      
      if (options.accept) {
        input.accept = Array.isArray(options.accept) 
          ? options.accept.join(',') 
          : options.accept;
      }

      input.onchange = (event) => {
        const files = Array.from(event.target.files).map(file => ({
          file,
          handle: null,
          type: 'file',
          path: file.name
        }));
        resolve(files);
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async selectDirectory(options = {}) {
    if (this.supportLevel !== 'full') {
      throw new Error('Directory selection requires File System Access API support');
    }

    try {
      this.directoryHandle = await window.showDirectoryPicker({
        mode: options.mode || 'read'
      });

      return {
        handle: this.directoryHandle,
        type: 'directory',
        path: this.directoryHandle.name
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        return null; // User cancelled
      }
      throw error;
    }
  }

  async* walkDirectory(dirHandle, path = '') {
    try {
      for await (const entry of dirHandle.values()) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        
        if (entry.kind === 'file') {
          yield {
            type: 'file',
            path: entryPath,
            handle: entry,
            name: entry.name
          };
        } else if (entry.kind === 'directory') {
          yield {
            type: 'directory',
            path: entryPath,
            handle: entry,
            name: entry.name
          };
          
          // Recursively walk subdirectory
          yield* this.walkDirectory(entry, entryPath);
        }
      }
    } catch (error) {
      console.warn(`Error walking directory ${path}:`, error);
    }
  }

  async listDirectory(dirHandle, options = {}) {
    const entries = [];
    const maxDepth = options.maxDepth || 1;
    
    try {
      for await (const entry of this.walkDirectory(dirHandle)) {
        const depth = entry.path.split('/').length;
        
        if (depth <= maxDepth) {
          // Add file size and modification time if available
          if (entry.type === 'file') {
            try {
              const file = await entry.handle.getFile();
              entry.size = file.size;
              entry.lastModified = file.lastModified;
              entry.mimeType = file.type;
            } catch (error) {
              console.warn(`Error reading file info for ${entry.path}:`, error);
            }
          }
          
          entries.push(entry);
        }
      }
    } catch (error) {
      console.error('Error listing directory:', error);
    }
    
    return entries;
  }

  async readFile(fileHandle) {
    try {
      if (fileHandle.getFile) {
        return await fileHandle.getFile();
      } else {
        // Already a File object
        return fileHandle;
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async readTextFile(fileHandle) {
    const file = await this.readFile(fileHandle);
    return await file.text();
  }

  async readBinaryFile(fileHandle) {
    const file = await this.readFile(fileHandle);
    return await file.arrayBuffer();
  }

  // Stream reading for large files
  createReadStream(fileHandle, options = {}) {
    return {
      async* readChunks() {
        const file = await this.readFile(fileHandle);
        const chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
        let offset = 0;

        while (offset < file.size) {
          const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
          const buffer = await chunk.arrayBuffer();
          
          yield {
            buffer,
            offset,
            size: buffer.byteLength,
            isLast: offset + buffer.byteLength >= file.size
          };
          
          offset += buffer.byteLength;
        }
      }
    };
  }

  // File filtering utilities
  filterByExtension(entries, extensions) {
    const extensionSet = new Set(
      extensions.map(ext => ext.toLowerCase().replace('.', ''))
    );
    
    return entries.filter(entry => {
      if (entry.type !== 'file') return false;
      const extension = entry.name.split('.').pop()?.toLowerCase();
      return extension && extensionSet.has(extension);
    });
  }

  filterByPattern(entries, pattern) {
    const regex = new RegExp(pattern, 'i');
    return entries.filter(entry => regex.test(entry.name));
  }

  // Utility methods
  getFileTypes(accept) {
    if (!accept) return [];
    
    const types = [];
    const acceptArray = Array.isArray(accept) ? accept : [accept];
    
    for (const acceptItem of acceptArray) {
      if (acceptItem === '.parquet') {
        types.push({
          description: 'Parquet files',
          accept: { 'application/octet-stream': ['.parquet'] }
        });
      } else if (acceptItem === '.arrow' || acceptItem === '.feather') {
        types.push({
          description: 'Arrow/Feather files',
          accept: { 'application/octet-stream': ['.arrow', '.feather'] }
        });
      } else if (acceptItem === '.avro') {
        types.push({
          description: 'Avro files',
          accept: { 'application/octet-stream': ['.avro'] }
        });
      } else if (acceptItem === '.orc') {
        types.push({
          description: 'ORC files',
          accept: { 'application/octet-stream': ['.orc'] }
        });
      } else if (acceptItem === '.jsonl' || acceptItem === '.ndjson') {
        types.push({
          description: 'JSON Lines files',
          accept: { 'application/json': ['.jsonl', '.ndjson'] }
        });
      }
    }
    
    return types;
  }

  // Permission management
  async requestPermission(handle, mode = 'read') {
    if (!handle.requestPermission) {
      return 'granted'; // Older browsers don't need explicit permission
    }
    
    try {
      const permission = await handle.requestPermission({ mode });
      return permission;
    } catch (error) {
      console.warn('Permission request failed:', error);
      return 'denied';
    }
  }

  async verifyPermission(handle, mode = 'read') {
    if (!handle.queryPermission) {
      return true; // Older browsers don't need explicit permission
    }
    
    try {
      const permission = await handle.queryPermission({ mode });
      return permission === 'granted';
    } catch (error) {
      console.warn('Permission query failed:', error);
      return false;
    }
  }

  // Cache management
  cacheFileHandle(path, handle) {
    this.fileHandles.set(path, handle);
  }

  getCachedFileHandle(path) {
    return this.fileHandles.get(path);
  }

  clearCache() {
    this.fileHandles.clear();
  }

  // Error handling utilities
  handleFileSystemError(error, context = '') {
    const message = context ? `${context}: ${error.message}` : error.message;
    
    switch (error.name) {
      case 'NotFoundError':
        throw new Error(`File or directory not found. ${message}`);
      case 'NotAllowedError':
        throw new Error(`Permission denied. ${message}`);
      case 'SecurityError':
        throw new Error(`Security error. ${message}`);
      case 'AbortError':
        return null; // User cancelled, not an error
      case 'InvalidStateError':
        throw new Error(`Invalid state. ${message}`);
      case 'QuotaExceededError':
        throw new Error(`Storage quota exceeded. ${message}`);
      default:
        throw new Error(`File system error: ${message}`);
    }
  }

  // Browser compatibility info
  getCompatibilityInfo() {
    return {
      supportLevel: this.supportLevel,
      features: {
        showOpenFilePicker: 'showOpenFilePicker' in window,
        showDirectoryPicker: 'showDirectoryPicker' in window,
        showSaveFilePicker: 'showSaveFilePicker' in window,
        webkitdirectory: 'webkitdirectory' in HTMLInputElement.prototype,
        fileSystemAccess: this.supportLevel === 'full'
      },
      limitations: this.getLimitations()
    };
  }

  getLimitations() {
    const limitations = [];
    
    if (this.supportLevel === 'partial') {
      limitations.push('Directory selection requires full File System Access API');
      limitations.push('File permissions cannot be verified');
    } else if (this.supportLevel === 'none') {
      limitations.push('No file system access available');
      limitations.push('Files must be selected via drag and drop');
    }
    
    return limitations;
  }
}