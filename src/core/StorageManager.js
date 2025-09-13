export class StorageManager {
  constructor() {
    this.adapters = new Map();
    this.activeAdapter = null;
    this.connectionStatus = new Map();
    this.initializeAdapters();
  }

  async initializeAdapters() {
    try {
      // Dynamic import of storage adapters
      const { LocalFileAdapter } = await import('../storage/LocalFileAdapter.js');
      const { CloudStorageAdapter } = await import('../storage/CloudStorageAdapter.js');
      
      // Register local file adapter
      const localAdapter = new LocalFileAdapter();
      this.adapters.set('local', localAdapter);
      this.connectionStatus.set('local', {
        connected: true,
        type: 'local',
        capabilities: localAdapter.getCompatibilityInfo()
      });

      // Register cloud storage adapters
      const providers = ['gdrive', 'dropbox', 'onedrive'];
      for (const provider of providers) {
        this.adapters.set(provider, new CloudStorageAdapter(provider));
        this.connectionStatus.set(provider, {
          connected: false,
          type: 'cloud',
          provider
        });
      }

      console.log('Storage adapters initialized:', Array.from(this.adapters.keys()));
    } catch (error) {
      console.error('Failed to initialize storage adapters:', error);
    }
  }

  // Storage adapter management
  getAdapter(type) {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(`Storage adapter not found: ${type}`);
    }
    return adapter;
  }

  setActiveAdapter(type) {
    if (!this.adapters.has(type)) {
      throw new Error(`Cannot set active adapter: ${type} not registered`);
    }
    this.activeAdapter = type;
  }

  getActiveAdapter() {
    return this.activeAdapter ? this.adapters.get(this.activeAdapter) : null;
  }

  // File operations
  async selectFiles(options = {}) {
    const adapter = this.getActiveAdapter() || this.adapters.get('local');
    
    if (adapter.selectFiles) {
      return await adapter.selectFiles(options);
    } else {
      throw new Error('File selection not supported by current adapter');
    }
  }

  async selectDirectory(options = {}) {
    const adapter = this.getActiveAdapter() || this.adapters.get('local');
    
    if (adapter.selectDirectory) {
      return await adapter.selectDirectory(options);
    } else {
      throw new Error('Directory selection not supported by current adapter');
    }
  }

  async readFile(handle) {
    const adapter = this.getActiveAdapter() || this.adapters.get('local');
    
    if (adapter.readFile) {
      return await adapter.readFile(handle);
    } else {
      throw new Error('File reading not supported by current adapter');
    }
  }

  async listDirectory(dirHandle, options = {}) {
    const adapter = this.getActiveAdapter() || this.adapters.get('local');
    
    if (adapter.listDirectory) {
      return await adapter.listDirectory(dirHandle, options);
    } else {
      throw new Error('Directory listing not supported by current adapter');
    }
  }

  // Cloud storage operations
  async connectToCloud(provider, credentials) {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Cloud provider not supported: ${provider}`);
    }

    try {
      await adapter.authenticate(credentials.clientId, credentials.redirectUri);
      
      this.connectionStatus.set(provider, {
        connected: true,
        type: 'cloud',
        provider,
        connectedAt: new Date(),
        info: adapter.getProviderInfo()
      });

      return true;
    } catch (error) {
      this.connectionStatus.set(provider, {
        connected: false,
        type: 'cloud',
        provider,
        error: error.message
      });
      throw error;
    }
  }

  async disconnectFromCloud(provider) {
    const adapter = this.adapters.get(provider);
    if (adapter && adapter.disconnect) {
      adapter.disconnect();
      
      this.connectionStatus.set(provider, {
        connected: false,
        type: 'cloud',
        provider
      });
    }
  }

  async listCloudFiles(provider, path = '/') {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Cloud provider not supported: ${provider}`);
    }

    const status = this.connectionStatus.get(provider);
    if (!status.connected) {
      throw new Error(`Not connected to ${provider}`);
    }

    return await adapter.listFiles(path);
  }

  async downloadCloudFile(provider, fileId) {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Cloud provider not supported: ${provider}`);
    }

    const status = this.connectionStatus.get(provider);
    if (!status.connected) {
      throw new Error(`Not connected to ${provider}`);
    }

    return await adapter.downloadFile(fileId);
  }

  // Connection management
  isConnected(provider) {
    const status = this.connectionStatus.get(provider);
    return status ? status.connected : false;
  }

  getConnectionStatus(provider) {
    return this.connectionStatus.get(provider);
  }

  getAllConnectionStatuses() {
    return Object.fromEntries(this.connectionStatus);
  }

  getAvailableStorageTypes() {
    return Array.from(this.adapters.keys());
  }

  // Storage capabilities
  getStorageCapabilities(type) {
    const adapter = this.adapters.get(type);
    if (!adapter) return null;

    const capabilities = {
      type,
      canSelectFiles: typeof adapter.selectFiles === 'function',
      canSelectDirectories: typeof adapter.selectDirectory === 'function',
      canListDirectories: typeof adapter.listDirectory === 'function',
      supportsStreaming: typeof adapter.createReadStream === 'function',
      requiresAuth: type !== 'local'
    };

    if (type === 'local' && adapter.getCompatibilityInfo) {
      capabilities.compatibility = adapter.getCompatibilityInfo();
    }

    return capabilities;
  }

  getAllCapabilities() {
    const capabilities = {};
    for (const [type] of this.adapters) {
      capabilities[type] = this.getStorageCapabilities(type);
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
    // Disconnect from all cloud providers
    for (const [provider, status] of this.connectionStatus) {
      if (status.connected && status.type === 'cloud') {
        await this.disconnectFromCloud(provider);
      }
    }

    this.adapters.clear();
    this.connectionStatus.clear();
    this.activeAdapter = null;
    
    if (this.eventListeners) {
      this.eventListeners.clear();
    }
  }
}