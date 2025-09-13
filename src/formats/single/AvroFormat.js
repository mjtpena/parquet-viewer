import { BaseFormat } from '../base/BaseFormat.js';

export class AvroFormat extends BaseFormat {
  constructor() {
    super();
    this.avro = null;
    this.avroSchema = null;
    this.decoder = null;
  }

  static canHandle(file) {
    if (file instanceof File) {
      return file.name.toLowerCase().endsWith('.avro');
    }
    return false;
  }

  async initializeLibrary() {
    if (!this.avro) {
      try {
        // Try to import avsc library
        this.avro = await import('https://cdn.jsdelivr.net/npm/avsc@latest/+esm');
      } catch (error) {
        // Fallback to a simpler Avro implementation
        console.warn('Could not load avsc library, using fallback implementation');
        this.avro = { createBlobDecoder: this.createFallbackDecoder.bind(this) };
      }
    }
    return this.avro;
  }

  async readMetadata(file) {
    const { createBlobDecoder } = await this.initializeLibrary();
    
    const buffer = await file.arrayBuffer();
    
    // Read Avro header to extract schema
    const header = await this.parseAvroHeader(buffer);
    
    this.metadata = {
      codec: header.codec || 'null',
      schema: header.schema,
      syncMarker: header.syncMarker,
      blockCount: header.blockCount || 'unknown',
      byteLength: buffer.byteLength
    };
    
    this.schema = this.extractSchema(header.schema);
    this.avroSchema = header.schema;
    
    return this.metadata;
  }

  async readData(file, options = {}) {
    if (!this.metadata) {
      await this.readMetadata(file);
    }

    const buffer = await file.arrayBuffer();
    const records = await this.decodeAvroData(buffer, options);
    
    this.data = records;
    return records;
  }

  async* streamData(file, options = {}) {
    if (!this.metadata) {
      await this.readMetadata(file);
    }

    const buffer = await file.arrayBuffer();
    const chunkSize = options.chunkSize || 1000;
    
    yield* this.streamAvroData(buffer, chunkSize, options);
  }

  async parseAvroHeader(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Check magic bytes: "Obj" + version (0x01)
    const magic = new Uint8Array(buffer, 0, 4);
    if (magic[0] !== 0x4F || magic[1] !== 0x62 || magic[2] !== 0x6A || magic[3] !== 0x01) {
      throw new Error('Invalid Avro file: magic bytes not found');
    }
    offset += 4;
    
    // Read metadata
    const metadata = {};
    const metadataCount = this.readLong(view, offset);
    offset += this.getLongSize(metadataCount.value);
    
    for (let i = 0; i < metadataCount.value; i++) {
      const keyLength = this.readLong(view, offset);
      offset += this.getLongSize(keyLength.value);
      
      const key = new TextDecoder().decode(new Uint8Array(buffer, offset, keyLength.value));
      offset += keyLength.value;
      
      const valueLength = this.readLong(view, offset);
      offset += this.getLongSize(valueLength.value);
      
      const value = new Uint8Array(buffer, offset, valueLength.value);
      offset += valueLength.value;
      
      if (key === 'avro.schema') {
        metadata.schema = JSON.parse(new TextDecoder().decode(value));
      } else if (key === 'avro.codec') {
        metadata.codec = new TextDecoder().decode(value);
      }
    }
    
    // Skip null terminator
    offset += this.getLongSize(0);
    
    // Read sync marker
    const syncMarker = new Uint8Array(buffer, offset, 16);
    offset += 16;
    
    return {
      schema: metadata.schema,
      codec: metadata.codec || 'null',
      syncMarker,
      headerSize: offset
    };
  }

  async decodeAvroData(buffer, options = {}) {
    const header = await this.parseAvroHeader(buffer);
    let offset = header.headerSize;
    const records = [];
    const view = new DataView(buffer);
    
    const startRecord = options.offset || 0;
    const maxRecords = options.limit || Infinity;
    let currentRecord = 0;
    let recordsAdded = 0;

    try {
      while (offset < buffer.byteLength && recordsAdded < maxRecords) {
        // Read block count
        const blockCount = this.readLong(view, offset);
        offset += this.getLongSize(blockCount.value);
        
        // Read block size
        const blockSize = this.readLong(view, offset);
        offset += this.getLongSize(blockSize.value);
        
        // Read block data
        const blockData = new Uint8Array(buffer, offset, blockSize.value);
        offset += blockSize.value;
        
        // Decode records in this block
        const blockRecords = this.decodeBlock(blockData, header.schema, header.codec);
        
        for (const record of blockRecords) {
          if (currentRecord >= startRecord && recordsAdded < maxRecords) {
            records.push(record);
            recordsAdded++;
          }
          currentRecord++;
        }
        
        // Skip sync marker
        offset += 16;
      }
    } catch (error) {
      console.warn('Error decoding Avro data:', error);
    }
    
    return records;
  }

  async* streamAvroData(buffer, chunkSize, options = {}) {
    const header = await this.parseAvroHeader(buffer);
    let offset = header.headerSize;
    const view = new DataView(buffer);
    
    let chunk = [];

    try {
      while (offset < buffer.byteLength) {
        // Read block
        const blockCount = this.readLong(view, offset);
        offset += this.getLongSize(blockCount.value);
        
        const blockSize = this.readLong(view, offset);
        offset += this.getLongSize(blockSize.value);
        
        const blockData = new Uint8Array(buffer, offset, blockSize.value);
        offset += blockSize.value;
        
        // Decode records in this block
        const blockRecords = this.decodeBlock(blockData, header.schema, header.codec);
        
        for (const record of blockRecords) {
          chunk.push(record);
          
          if (chunk.length >= chunkSize) {
            yield chunk;
            chunk = [];
          }
        }
        
        // Skip sync marker
        offset += 16;
      }
      
      // Yield remaining records
      if (chunk.length > 0) {
        yield chunk;
      }
    } catch (error) {
      console.warn('Error streaming Avro data:', error);
    }
  }

  decodeBlock(blockData, schema, codec) {
    // Simple implementation - in a real implementation you'd handle compression
    if (codec !== 'null') {
      console.warn(`Compression codec ${codec} not supported, data may be corrupted`);
    }
    
    const records = [];
    let offset = 0;
    const view = new DataView(blockData.buffer, blockData.byteOffset);
    
    try {
      while (offset < blockData.length) {
        const { record, bytesRead } = this.decodeRecord(view, offset, schema);
        if (bytesRead === 0) break;
        
        records.push(record);
        offset += bytesRead;
      }
    } catch (error) {
      console.warn('Error decoding block:', error);
    }
    
    return records;
  }

  decodeRecord(view, offset, schema) {
    // Simplified Avro record decoder
    if (schema.type === 'record') {
      const record = {};
      let currentOffset = offset;
      
      for (const field of schema.fields) {
        try {
          const { value, bytesRead } = this.decodeValue(view, currentOffset, field.type);
          record[field.name] = value;
          currentOffset += bytesRead;
        } catch (error) {
          console.warn(`Error decoding field ${field.name}:`, error);
          break;
        }
      }
      
      return { record, bytesRead: currentOffset - offset };
    }
    
    return { record: null, bytesRead: 0 };
  }

  decodeValue(view, offset, schema) {
    if (typeof schema === 'string') {
      return this.decodePrimitive(view, offset, schema);
    } else if (Array.isArray(schema)) {
      // Union type
      const index = this.readLong(view, offset);
      const selectedSchema = schema[index.value];
      return this.decodeValue(view, offset + this.getLongSize(index.value), selectedSchema);
    } else if (schema.type) {
      switch (schema.type) {
        case 'string':
        case 'bytes':
          return this.decodeString(view, offset);
        case 'int':
        case 'long':
          const longVal = this.readLong(view, offset);
          return { value: longVal.value, bytesRead: this.getLongSize(longVal.value) };
        case 'float':
          return { value: view.getFloat32(offset, true), bytesRead: 4 };
        case 'double':
          return { value: view.getFloat64(offset, true), bytesRead: 8 };
        case 'boolean':
          return { value: view.getUint8(offset) !== 0, bytesRead: 1 };
        case 'null':
          return { value: null, bytesRead: 0 };
        default:
          console.warn(`Unsupported Avro type: ${schema.type}`);
          return { value: null, bytesRead: 0 };
      }
    }
    
    return { value: null, bytesRead: 0 };
  }

  decodePrimitive(view, offset, type) {
    switch (type) {
      case 'null':
        return { value: null, bytesRead: 0 };
      case 'boolean':
        return { value: view.getUint8(offset) !== 0, bytesRead: 1 };
      case 'int':
      case 'long':
        const longVal = this.readLong(view, offset);
        return { value: longVal.value, bytesRead: this.getLongSize(longVal.value) };
      case 'float':
        return { value: view.getFloat32(offset, true), bytesRead: 4 };
      case 'double':
        return { value: view.getFloat64(offset, true), bytesRead: 8 };
      case 'string':
      case 'bytes':
        return this.decodeString(view, offset);
      default:
        return { value: null, bytesRead: 0 };
    }
  }

  decodeString(view, offset) {
    const length = this.readLong(view, offset);
    const lengthBytes = this.getLongSize(length.value);
    const stringBytes = new Uint8Array(view.buffer, view.byteOffset + offset + lengthBytes, length.value);
    const value = new TextDecoder().decode(stringBytes);
    return { value, bytesRead: lengthBytes + length.value };
  }

  readLong(view, offset) {
    // Variable-length encoding (zigzag)
    let result = 0;
    let shift = 0;
    let bytesRead = 0;
    
    while (true) {
      const byte = view.getUint8(offset + bytesRead);
      bytesRead++;
      
      result |= (byte & 0x7F) << shift;
      
      if ((byte & 0x80) === 0) {
        break;
      }
      
      shift += 7;
      if (shift >= 64) break; // Prevent infinite loop
    }
    
    // Convert from zigzag encoding
    return { value: (result >>> 1) ^ -(result & 1), bytesRead };
  }

  getLongSize(value) {
    // Calculate bytes needed for variable-length encoding
    let zigzag = (value << 1) ^ (value >> 31);
    let bytes = 0;
    while (zigzag > 0x7F) {
      zigzag >>>= 7;
      bytes++;
    }
    return bytes + 1;
  }

  extractSchema(avroSchema) {
    if (!avroSchema || avroSchema.type !== 'record') return {};
    
    const schema = {};
    for (const field of avroSchema.fields) {
      schema[field.name] = this.convertAvroType(field.type);
    }
    return schema;
  }

  convertAvroType(avroType) {
    if (typeof avroType === 'string') {
      switch (avroType) {
        case 'int':
        case 'long':
          return 'integer';
        case 'float':
        case 'double':
          return 'float';
        case 'boolean':
          return 'boolean';
        case 'string':
          return 'string';
        case 'bytes':
          return 'binary';
        case 'null':
          return 'null';
        default:
          return avroType;
      }
    } else if (Array.isArray(avroType)) {
      // Union type
      const types = avroType.map(t => this.convertAvroType(t)).filter(t => t !== 'null');
      return types.length === 1 ? types[0] + '?' : 'union';
    } else if (avroType.type) {
      switch (avroType.type) {
        case 'array':
          return 'array';
        case 'map':
          return 'object';
        case 'record':
          return 'record';
        case 'enum':
          return 'enum';
        case 'fixed':
          return 'binary';
        default:
          return avroType.type;
      }
    }
    
    return 'unknown';
  }

  // Fallback decoder for when avsc library is not available
  createFallbackDecoder(buffer) {
    console.warn('Using fallback Avro decoder - functionality may be limited');
    
    return {
      on: (event, callback) => {
        if (event === 'metadata') {
          // Simple metadata extraction
          setTimeout(() => {
            try {
              const header = this.parseAvroHeader(buffer);
              callback(header.schema, header.codec, {});
            } catch (error) {
              console.error('Error parsing metadata:', error);
            }
          }, 0);
        }
      }
    };
  }

  getSchemaInfo() {
    if (!this.avroSchema) return null;
    
    const columns = [];
    if (this.avroSchema.type === 'record' && this.avroSchema.fields) {
      for (const field of this.avroSchema.fields) {
        columns.push({
          name: field.name,
          type: this.convertAvroType(field.type),
          nullable: Array.isArray(field.type) && field.type.includes('null'),
          default: field.default
        });
      }
    }
    
    return { columns };
  }
}