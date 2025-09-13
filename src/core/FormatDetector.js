export class FormatDetector {
  constructor() {
    this.formatMap = new Map();
    this.initializeMagicBytes();
  }

  initializeMagicBytes() {
    // Magic bytes for different formats
    this.magicBytes = {
      parquet: [0x50, 0x41, 0x52, 0x31], // "PAR1"
      orc: [0x4F, 0x52, 0x43], // "ORC"
      avro: [0x4F, 0x62, 0x6A, 0x01], // "Obj" + version
      arrow: [0x41, 0x52, 0x52, 0x4F, 0x57, 0x31], // "ARROW1"
      feather: [0x46, 0x45, 0x41, 0x31], // "FEA1"
    };

    // File extensions mapping
    this.extensions = {
      'parquet': 'parquet',
      'arrow': 'arrow',
      'feather': 'arrow',
      'avro': 'avro',
      'orc': 'orc',
      'jsonl': 'jsonl',
      'ndjson': 'jsonl',
      'json': 'json'
    };
  }

  async detect(input) {
    try {
      // Handle File objects
      if (input instanceof File) {
        return await this.detectFileFormat(input);
      }
      
      // Handle FileSystemDirectoryHandle (for table formats)
      if (input && typeof input.getDirectoryHandle === 'function') {
        return await this.detectDirectoryFormat(input);
      }

      // Handle FileSystemFileHandle
      if (input && typeof input.getFile === 'function') {
        const file = await input.getFile();
        return await this.detectFileFormat(file);
      }

      return 'unknown';
    } catch (error) {
      console.error('Format detection error:', error);
      return 'unknown';
    }
  }

  async detectFileFormat(file) {
    // First, try magic bytes detection
    const magicFormat = await this.detectByMagicBytes(file);
    if (magicFormat !== 'unknown') {
      return magicFormat;
    }

    // Fall back to extension-based detection
    const extensionFormat = this.detectByExtension(file.name);
    if (extensionFormat !== 'unknown') {
      return extensionFormat;
    }

    // Try content-based detection for text formats
    const contentFormat = await this.detectByContent(file);
    return contentFormat;
  }

  async detectDirectoryFormat(dirHandle) {
    try {
      const entries = await this.listDirectoryEntries(dirHandle);
      
      // Check for Delta Lake
      if (entries.includes('_delta_log')) {
        return 'delta';
      }
      
      // Check for Iceberg
      if (entries.includes('metadata')) {
        try {
          const metadataHandle = await dirHandle.getDirectoryHandle('metadata');
          const metadataEntries = await this.listDirectoryEntries(metadataHandle);
          if (metadataEntries.some(entry => entry.includes('metadata.json') || entry.includes('.metadata.json'))) {
            return 'iceberg';
          }
        } catch (error) {
          // Metadata directory exists but can't read it
          console.warn('Could not read metadata directory:', error);
        }
      }

      // Check if directory contains mostly Parquet files
      const parquetFiles = entries.filter(entry => entry.toLowerCase().endsWith('.parquet'));
      if (parquetFiles.length > 0 && parquetFiles.length / entries.length > 0.5) {
        return 'parquet-directory';
      }

      return 'directory';
    } catch (error) {
      console.error('Directory format detection error:', error);
      return 'unknown';
    }
  }

  async detectByMagicBytes(file) {
    try {
      const headerSize = Math.max(...Object.values(this.magicBytes).map(bytes => bytes.length));
      const header = await this.readFileHeader(file, headerSize);
      
      for (const [format, bytes] of Object.entries(this.magicBytes)) {
        if (this.compareBytes(header, bytes)) {
          return format;
        }
      }
      
      return 'unknown';
    } catch (error) {
      console.error('Magic bytes detection error:', error);
      return 'unknown';
    }
  }

  detectByExtension(filename) {
    const extension = filename.split('.').pop()?.toLowerCase();
    return this.extensions[extension] || 'unknown';
  }

  async detectByContent(file) {
    try {
      // Only try content detection for smaller files to avoid performance issues
      if (file.size > 10 * 1024 * 1024) { // 10MB
        return 'unknown';
      }

      const sample = await this.readFileHeader(file, 1024);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
      
      // Check if it's valid JSON Lines
      if (this.isJSONL(text)) {
        return 'jsonl';
      }
      
      // Check if it's valid JSON
      if (this.isJSON(text)) {
        return 'json';
      }
      
      // Check if it's CSV
      if (this.isCSV(text)) {
        return 'csv';
      }
      
      return 'unknown';
    } catch (error) {
      console.error('Content detection error:', error);
      return 'unknown';
    }
  }

  async readFileHeader(file, bytes = 32) {
    const slice = file.slice(0, bytes);
    const buffer = await slice.arrayBuffer();
    return new Uint8Array(buffer);
  }

  compareBytes(header, magicBytes) {
    if (header.length < magicBytes.length) return false;
    
    for (let i = 0; i < magicBytes.length; i++) {
      if (header[i] !== magicBytes[i]) return false;
    }
    return true;
  }

  async listDirectoryEntries(dirHandle) {
    const entries = [];
    try {
      for await (const entry of dirHandle.values()) {
        entries.push(entry.name);
      }
    } catch (error) {
      console.error('Error listing directory entries:', error);
    }
    return entries;
  }

  isJSONL(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return false;
    
    // Check first few lines
    const samplesToCheck = Math.min(lines.length, 5);
    for (let i = 0; i < samplesToCheck; i++) {
      try {
        JSON.parse(lines[i]);
      } catch {
        return false;
      }
    }
    return true;
  }

  isJSON(text) {
    try {
      const trimmed = text.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  isCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return false;
    
    // Simple heuristic: check if first line has commas and second line has same number of commas
    const firstLineCommas = (lines[0].match(/,/g) || []).length;
    const secondLineCommas = (lines[1].match(/,/g) || []).length;
    
    return firstLineCommas > 0 && firstLineCommas === secondLineCommas;
  }

  // Get confidence score for detection
  getConfidence(input, detectedFormat) {
    // This could be expanded with more sophisticated confidence scoring
    if (detectedFormat === 'unknown') return 0;
    
    // Higher confidence for magic byte detection
    if (input instanceof File) {
      const extension = input.name.split('.').pop()?.toLowerCase();
      const expectedFormat = this.extensions[extension];
      if (expectedFormat === detectedFormat) {
        return 0.9; // High confidence when extension matches
      }
      return 0.7; // Medium confidence for magic byte detection
    }
    
    return 0.8; // Default confidence
  }
}