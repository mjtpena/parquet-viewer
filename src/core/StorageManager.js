export class StorageManager {
  constructor() {
    this.localAdapter = null;
    this.eventListeners = null;
    this.initializeAdapter();
  }

  async initializeAdapter() {
    try {
      // Only local file adapter
      const { LocalFileAdapter } = await import('../storage/LocalFileAdapter.js');
      this.localAdapter = new LocalFileAdapter();
      console.log('Local storage adapter initialized');
    } catch (error) {
      console.error('Failed to initialize storage adapter:', error);
    }
  }

  // File operations
  async selectFiles(options = {}) {
    if (!this.localAdapter) {
      throw new Error('Storage adapter not initialized');
    }

    if (this.localAdapter.selectFiles) {
      return await this.localAdapter.selectFiles(options);
    } else {
      throw new Error('File selection not supported');
    }
  }

  async selectDirectory(options = {}) {
    if (!this.localAdapter) {
      throw new Error('Storage adapter not initialized');
    }

    if (this.localAdapter.selectDirectory) {
      return await this.localAdapter.selectDirectory(options);
    } else {
      throw new Error('Directory selection not supported');
    }
  }

  async readFile(handle) {
    if (!this.localAdapter) {
      throw new Error('Storage adapter not initialized');
    }

    if (this.localAdapter.readFile) {
      return await this.localAdapter.readFile(handle);
    } else {
      throw new Error('File reading not supported');
    }
  }

  async listDirectory(dirHandle, options = {}) {
    if (!this.localAdapter) {
      throw new Error('Storage adapter not initialized');
    }

    if (this.localAdapter.listDirectory) {
      return await this.localAdapter.listDirectory(dirHandle, options);
    } else {
      throw new Error('Directory listing not supported');
    }
  }

  // Storage capabilities
  getStorageCapabilities() {
    if (!this.localAdapter) return null;

    const capabilities = {
      type: 'local',
      canSelectFiles: typeof this.localAdapter.selectFiles === 'function',
      canSelectDirectories: typeof this.localAdapter.selectDirectory === 'function',
      canListDirectories: typeof this.localAdapter.listDirectory === 'function',
      supportsStreaming: typeof this.localAdapter.createReadStream === 'function',
      requiresAuth: false
    };

    if (this.localAdapter.getCompatibilityInfo) {
      capabilities.compatibility = this.localAdapter.getCompatibilityInfo();
    }

    return capabilities;
  }

  // File filtering utilities
  filterFilesByExtension(files, extensions) {
    const extensionSet = new Set(
      extensions.map(ext => ext.toLowerCase().replace('.', ''))
    );

    return files.filter(file => {
      if (file.type !== 'file') return false;
      const extension = file.name.split('.').pop()?.toLowerCase();
      return extension && extensionSet.has(extension);
    });
  }

  filterFilesBySize(files, minSize = 0, maxSize = Infinity) {
    return files.filter(file => {
      if (file.type !== 'file' || !file.size) return true;
      return file.size >= minSize && file.size <= maxSize;
    });
  }

  filterFilesByPattern(files, pattern) {
    const regex = new RegExp(pattern, 'i');
    return files.filter(file => regex.test(file.name));
  }

  // Utility methods
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileExtension(filename) {
    return filename.split('.').pop()?.toLowerCase() || '';
  }

  validateFileName(filename) {
    // Basic filename validation
    const invalidChars = /[<>:"/\\|?*]/;
    return !invalidChars.test(filename) && filename.length > 0 && filename.length <= 255;
  }

  // Event system for storage operations
  addEventListener(event, callback) {
    if (!this.eventListeners) {
      this.eventListeners = new Map();
    }

    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }

    this.eventListeners.get(event).push(callback);
  }

  removeEventListener(event, callback) {
    if (this.eventListeners && this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventListeners && this.eventListeners.has(event)) {
      for (const callback of this.eventListeners.get(event)) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in storage event listener for ${event}:`, error);
        }
      }
    }
  }

  // Cleanup
  async cleanup() {
    this.localAdapter = null;

    if (this.eventListeners) {
      this.eventListeners.clear();
    }
  }
}
