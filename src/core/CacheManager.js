export class CacheManager {
  constructor(options = {}) {
    this.maxMemoryMB = options.maxMemoryMB || 100;
    this.maxEntries = options.maxEntries || 50;
    this.defaultTTL = options.defaultTTL || 30 * 60 * 1000; // 30 minutes
    
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalMemoryMB: 0
    };
    
    this.initializePersistentCache();
    this.startCleanupTimer();
  }

  async initializePersistentCache() {
    try {
      // Try to use IndexedDB for persistent caching
      if ('indexedDB' in window) {
        this.persistentCache = await this.initIndexedDB();
        console.log('Persistent cache initialized (IndexedDB)');
      } else if ('localStorage' in window) {
        this.persistentCache = new LocalStorageCache();
        console.log('Persistent cache initialized (localStorage)');
      } else {
        console.warn('No persistent cache available');
        this.persistentCache = null;
      }
    } catch (error) {
      console.warn('Failed to initialize persistent cache:', error);
      this.persistentCache = null;
    }
  }

  async initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DataViewerCache', 1);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        resolve(new IndexedDBCache(db));
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores
        if (!db.objectStoreNames.contains('fileCache')) {
          const fileStore = db.createObjectStore('fileCache', { keyPath: 'id' });
          fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          fileStore.createIndex('size', 'size', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('metadataCache')) {
          const metaStore = db.createObjectStore('metadataCache', { keyPath: 'id' });
          metaStore.createIndex('fileHash', 'fileHash', { unique: false });
        }
      };
    });
  }

  // Memory cache operations
  setMemoryCache(key, data, ttl = this.defaultTTL) {
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
      size: this.estimateSize(data),
      accessCount: 0
    };

    // Check if we need to evict entries
    this.evictIfNeeded(entry.size);
    
    this.memoryCache.set(key, entry);
    this.updateMemoryStats();
  }

  getMemoryCache(key) {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      this.cacheStats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.memoryCache.delete(key);
      this.cacheStats.misses++;
      return null;
    }

    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.cacheStats.hits++;
    
    return entry.data;
  }

  deleteMemoryCache(key) {
    const deleted = this.memoryCache.delete(key);
    if (deleted) {
      this.updateMemoryStats();
    }
    return deleted;
  }

  // Persistent cache operations
  async setPersistentCache(key, data, metadata = {}) {
    if (!this.persistentCache) return false;
    
    try {
      const entry = {
        id: key,
        data,
        metadata,
        timestamp: Date.now(),
        size: this.estimateSize(data)
      };
      
      await this.persistentCache.set(key, entry);
      return true;
    } catch (error) {
      console.warn('Failed to set persistent cache:', error);
      return false;
    }
  }

  async getPersistentCache(key) {
    if (!this.persistentCache) return null;
    
    try {
      const entry = await this.persistentCache.get(key);
      if (!entry) return null;
      
      // Check if expired (24 hour default for persistent cache)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - entry.timestamp > maxAge) {
        await this.deletePersistentCache(key);
        return null;
      }
      
      return entry.data;
    } catch (error) {
      console.warn('Failed to get persistent cache:', error);
      return null;
    }
  }

  async deletePersistentCache(key) {
    if (!this.persistentCache) return false;
    
    try {
      return await this.persistentCache.delete(key);
    } catch (error) {
      console.warn('Failed to delete persistent cache:', error);
      return false;
    }
  }

  // High-level caching methods
  async cacheFileData(fileHash, data, metadata = {}) {
    const key = `file:${fileHash}`;
    
    // Store in memory cache for quick access
    this.setMemoryCache(key, data, 10 * 60 * 1000); // 10 minutes
    
    // Store in persistent cache for longer term
    await this.setPersistentCache(key, data, {
      ...metadata,
      type: 'fileData',
      fileHash
    });
  }

  async getCachedFileData(fileHash) {
    const key = `file:${fileHash}`;
    
    // Try memory cache first
    let data = this.getMemoryCache(key);
    if (data) return data;
    
    // Try persistent cache
    data = await this.getPersistentCache(key);
    if (data) {
      // Promote to memory cache
      this.setMemoryCache(key, data, 5 * 60 * 1000);
    }
    
    return data;
  }

  async cacheMetadata(fileHash, metadata) {
    const key = `meta:${fileHash}`;
    
    // Metadata is small, cache both in memory and persistent
    this.setMemoryCache(key, metadata, 30 * 60 * 1000);
    await this.setPersistentCache(key, metadata, {
      type: 'metadata',
      fileHash
    });
  }

  async getCachedMetadata(fileHash) {
    const key = `meta:${fileHash}`;
    
    // Try memory cache first
    let metadata = this.getMemoryCache(key);
    if (metadata) return metadata;
    
    // Try persistent cache
    return await this.getPersistentCache(key);
  }

  // File hashing for cache keys
  async generateFileHash(file) {
    try {
      const buffer = await this.readFileSample(file);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      // Fallback to simple hash based on file properties
      const simple = `${file.name}_${file.size}_${file.lastModified}`;
      return btoa(simple).replace(/[+/=]/g, '');
    }
  }

  async readFileSample(file, sampleSize = 1024) {
    // Read first 1KB of file for hashing
    const size = Math.min(sampleSize, file.size);
    const blob = file.slice(0, size);
    return await blob.arrayBuffer();
  }

  // Cache management
  evictIfNeeded(newEntrySize = 0) {
    const currentMemoryMB = this.cacheStats.totalMemoryMB + (newEntrySize / (1024 * 1024));
    
    if (currentMemoryMB > this.maxMemoryMB || this.memoryCache.size >= this.maxEntries) {
      this.evictLRUEntries();
    }
  }

  evictLRUEntries() {
    // Sort by last access time (LRU)
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => {
      const aTime = a[1].lastAccess || a[1].timestamp;
      const bTime = b[1].lastAccess || b[1].timestamp;
      return aTime - bTime;
    });

    // Remove oldest 25% of entries
    const toRemove = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toRemove; i++) {
      const [key] = entries[i];
      this.memoryCache.delete(key);
      this.cacheStats.evictions++;
    }

    this.updateMemoryStats();
  }

  updateMemoryStats() {
    let totalSize = 0;
    for (const entry of this.memoryCache.values()) {
      totalSize += entry.size || 0;
    }
    this.cacheStats.totalMemoryMB = totalSize / (1024 * 1024);
  }

  estimateSize(data) {
    try {
      if (typeof data === 'string') {
        return data.length * 2; // Rough estimate for UTF-16
      } else if (data instanceof ArrayBuffer) {
        return data.byteLength;
      } else if (Array.isArray(data)) {
        return JSON.stringify(data).length * 2;
      } else if (typeof data === 'object' && data !== null) {
        return JSON.stringify(data).length * 2;
      }
      return 64; // Default estimate
    } catch (error) {
      return 64; // Fallback
    }
  }

  // Cleanup and maintenance
  startCleanupTimer() {
    // Clean up expired entries every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
  }

  cleanupExpiredEntries() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.updateMemoryStats();
      console.log(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  async cleanupPersistentCache() {
    if (!this.persistentCache) return 0;
    
    try {
      return await this.persistentCache.cleanup();
    } catch (error) {
      console.warn('Failed to cleanup persistent cache:', error);
      return 0;
    }
  }

  // Statistics and monitoring
  getStats() {
    return {
      memory: {
        ...this.cacheStats,
        entries: this.memoryCache.size,
        hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0
      },
      persistent: {
        available: !!this.persistentCache,
        type: this.persistentCache?.constructor.name || 'none'
      }
    };
  }

  clearMemoryCache() {
    const count = this.memoryCache.size;
    this.memoryCache.clear();
    this.updateMemoryStats();
    return count;
  }

  async clearPersistentCache() {
    if (!this.persistentCache) return 0;
    
    try {
      return await this.persistentCache.clear();
    } catch (error) {
      console.warn('Failed to clear persistent cache:', error);
      return 0;
    }
  }

  async clearAllCaches() {
    const memoryCount = this.clearMemoryCache();
    const persistentCount = await this.clearPersistentCache();
    
    return { memory: memoryCount, persistent: persistentCount };
  }

  // Cleanup
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.clearMemoryCache();
    
    if (this.persistentCache && this.persistentCache.close) {
      this.persistentCache.close();
    }
  }
}

// IndexedDB cache implementation
class IndexedDBCache {
  constructor(db) {
    this.db = db;
  }

  async set(key, entry) {
    const transaction = this.db.transaction(['fileCache'], 'readwrite');
    const store = transaction.objectStore('fileCache');
    await store.put(entry);
  }

  async get(key) {
    const transaction = this.db.transaction(['fileCache'], 'readonly');
    const store = transaction.objectStore('fileCache');
    return await store.get(key);
  }

  async delete(key) {
    const transaction = this.db.transaction(['fileCache'], 'readwrite');
    const store = transaction.objectStore('fileCache');
    await store.delete(key);
    return true;
  }

  async cleanup() {
    const transaction = this.db.transaction(['fileCache'], 'readwrite');
    const store = transaction.objectStore('fileCache');
    const index = store.index('timestamp');
    
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    const range = IDBKeyRange.upperBound(cutoff);
    
    let count = 0;
    const cursor = await index.openCursor(range);
    
    while (cursor) {
      await cursor.delete();
      count++;
      cursor.continue();
    }
    
    return count;
  }

  async clear() {
    const transaction = this.db.transaction(['fileCache'], 'readwrite');
    const store = transaction.objectStore('fileCache');
    await store.clear();
    return true;
  }

  close() {
    this.db.close();
  }
}

// LocalStorage cache fallback
class LocalStorageCache {
  constructor() {
    this.prefix = 'dataviewer_cache_';
  }

  async set(key, entry) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    } catch (error) {
      // Handle quota exceeded
      this.cleanup();
      localStorage.setItem(this.prefix + key, JSON.stringify(entry));
    }
  }

  async get(key) {
    const item = localStorage.getItem(this.prefix + key);
    return item ? JSON.parse(item) : null;
  }

  async delete(key) {
    localStorage.removeItem(this.prefix + key);
    return true;
  }

  async cleanup() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    
    // Remove oldest 50% of entries
    keys.splice(0, Math.ceil(keys.length * 0.5)).forEach(key => {
      localStorage.removeItem(key);
    });
    
    return keys.length;
  }

  async clear() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    
    keys.forEach(key => localStorage.removeItem(key));
    return keys.length;
  }
}