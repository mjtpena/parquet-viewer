export class StreamReader {
  constructor(file, chunkSize = 1024 * 1024) { // 1MB chunks by default
    this.file = file;
    this.chunkSize = chunkSize;
    this.position = 0;
    this.size = file.size;
  }

  async* readChunks() {
    while (this.position < this.size) {
      const chunk = this.file.slice(
        this.position, 
        Math.min(this.position + this.chunkSize, this.size)
      );
      
      const buffer = await chunk.arrayBuffer();
      const isLast = this.position + buffer.byteLength >= this.size;
      
      yield {
        buffer: new Uint8Array(buffer),
        position: this.position,
        size: buffer.byteLength,
        isLast,
        progress: (this.position + buffer.byteLength) / this.size
      };
      
      this.position += buffer.byteLength;
    }
  }

  async* readTextChunks(encoding = 'utf-8') {
    const decoder = new TextDecoder(encoding);
    let previousChunk = '';
    
    for await (const chunk of this.readChunks()) {
      const text = decoder.decode(chunk.buffer, { stream: !chunk.isLast });
      const fullText = previousChunk + text;
      
      if (chunk.isLast) {
        // Last chunk - yield everything
        if (fullText) {
          yield {
            text: fullText,
            position: chunk.position,
            isLast: true,
            progress: chunk.progress
          };
        }
      } else {
        // Find the last complete line
        const lastNewlineIndex = fullText.lastIndexOf('\n');
        
        if (lastNewlineIndex !== -1) {
          // Yield complete lines
          const completeText = fullText.substring(0, lastNewlineIndex + 1);
          previousChunk = fullText.substring(lastNewlineIndex + 1);
          
          yield {
            text: completeText,
            position: chunk.position,
            isLast: false,
            progress: chunk.progress
          };
        } else {
          // No complete line found, accumulate
          previousChunk = fullText;
        }
      }
    }
  }

  async* readLines(encoding = 'utf-8') {
    let lineNumber = 0;
    let buffer = '';
    
    for await (const chunk of this.readTextChunks(encoding)) {
      buffer += chunk.text;
      const lines = buffer.split('\n');
      
      // Keep the last line in buffer (might be incomplete)
      buffer = chunk.isLast ? '' : lines.pop() || '';
      
      for (const line of lines) {
        yield {
          line,
          lineNumber: ++lineNumber,
          position: chunk.position,
          progress: chunk.progress
        };
      }
    }
  }

  // Specific method for JSON Lines format
  async* readJSONLines(options = {}) {
    const maxErrors = options.maxErrors || 10;
    let errorCount = 0;
    let validRecords = 0;
    
    for await (const { line, lineNumber, progress } of this.readLines()) {
      if (!line.trim()) continue; // Skip empty lines
      
      try {
        const record = JSON.parse(line);
        validRecords++;
        
        yield {
          record,
          lineNumber,
          validRecords,
          errorCount,
          progress,
          isValid: true
        };
      } catch (error) {
        errorCount++;
        
        if (options.includeErrors) {
          yield {
            error: error.message,
            line,
            lineNumber,
            validRecords,
            errorCount,
            progress,
            isValid: false
          };
        }
        
        if (errorCount >= maxErrors) {
          throw new Error(`Too many parsing errors (${errorCount}). Last error: ${error.message}`);
        }
      }
    }
  }

  // Method for reading CSV-like formats
  async* readCSVLines(options = {}) {
    const separator = options.separator || ',';
    const quote = options.quote || '"';
    const escape = options.escape || '"';
    const header = options.header !== false; // Default true
    
    let headerRow = null;
    let recordNumber = 0;
    
    for await (const { line, lineNumber, progress } of this.readLines()) {
      if (!line.trim()) continue;
      
      try {
        const fields = this.parseCSVLine(line, separator, quote, escape);
        
        if (header && recordNumber === 0) {
          headerRow = fields;
          recordNumber++;
          continue;
        }
        
        const record = headerRow ? 
          this.arrayToObject(fields, headerRow) : 
          fields;
        
        yield {
          record,
          lineNumber,
          recordNumber: recordNumber++,
          progress,
          fields: fields.length
        };
      } catch (error) {
        if (options.includeErrors) {
          yield {
            error: error.message,
            line,
            lineNumber,
            recordNumber,
            progress,
            isValid: false
          };
        }
      }
    }
  }

  parseCSVLine(line, separator, quote, escape) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === quote) {
        if (inQuotes) {
          if (nextChar === quote) {
            // Escaped quote
            current += quote;
            i += 2;
            continue;
          } else {
            // End quote
            inQuotes = false;
          }
        } else {
          // Start quote
          inQuotes = true;
        }
      } else if (char === separator && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
      
      i++;
    }
    
    fields.push(current); // Add last field
    return fields;
  }

  arrayToObject(fields, headers) {
    const record = {};
    for (let i = 0; i < Math.max(fields.length, headers.length); i++) {
      const key = headers[i] || `column_${i + 1}`;
      record[key] = fields[i] || null;
    }
    return record;
  }

  // Progress tracking utilities
  getProgress() {
    return this.position / this.size;
  }

  getProgressInfo() {
    return {
      bytesRead: this.position,
      totalBytes: this.size,
      progress: this.getProgress(),
      percentComplete: Math.round(this.getProgress() * 100)
    };
  }

  // Reset position
  reset() {
    this.position = 0;
  }

  // Skip to position
  skip(bytes) {
    this.position = Math.min(this.position + bytes, this.size);
  }

  // Seek to position
  seek(position) {
    this.position = Math.max(0, Math.min(position, this.size));
  }

  // Read specific range
  async readRange(start, end) {
    const chunk = this.file.slice(start, end);
    return await chunk.arrayBuffer();
  }

  // Read specific range as text
  async readRangeAsText(start, end, encoding = 'utf-8') {
    const buffer = await this.readRange(start, end);
    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  }

  // Utility for finding specific byte patterns
  async findPattern(pattern, startPos = 0) {
    const patternBytes = new Uint8Array(pattern);
    this.seek(startPos);
    
    let matchIndex = 0;
    
    for await (const chunk of this.readChunks()) {
      for (let i = 0; i < chunk.buffer.length; i++) {
        if (chunk.buffer[i] === patternBytes[matchIndex]) {
          matchIndex++;
          if (matchIndex === patternBytes.length) {
            return chunk.position + i - matchIndex + 1;
          }
        } else {
          matchIndex = 0;
        }
      }
    }
    
    return -1; // Pattern not found
  }

  // Memory-efficient file scanning
  async scanFile(callback, options = {}) {
    const results = [];
    const maxResults = options.maxResults || Infinity;
    
    this.reset();
    
    for await (const chunk of this.readChunks()) {
      const chunkResults = await callback(chunk);
      
      if (Array.isArray(chunkResults)) {
        results.push(...chunkResults);
      } else if (chunkResults) {
        results.push(chunkResults);
      }
      
      if (results.length >= maxResults) {
        return results.slice(0, maxResults);
      }
    }
    
    return results;
  }

  // Create a buffered reader for more efficient reading
  createBufferedReader(bufferSize = 8192) {
    let buffer = new Uint8Array(0);
    let bufferPosition = 0;
    let chunkIterator = null;
    let currentChunk = null;
    
    return {
      async readBytes(count) {
        while (buffer.length - bufferPosition < count) {
          // Need more data
          if (!chunkIterator) {
            chunkIterator = this.readChunks();
          }
          
          const { value: chunk, done } = await chunkIterator.next();
          if (done) break;
          
          // Append new chunk to buffer
          const newBuffer = new Uint8Array(buffer.length - bufferPosition + chunk.buffer.length);
          newBuffer.set(buffer.slice(bufferPosition), 0);
          newBuffer.set(chunk.buffer, buffer.length - bufferPosition);
          buffer = newBuffer;
          bufferPosition = 0;
        }
        
        if (buffer.length - bufferPosition < count) {
          // Not enough data available
          count = buffer.length - bufferPosition;
        }
        
        const result = buffer.slice(bufferPosition, bufferPosition + count);
        bufferPosition += count;
        
        return result;
      },
      
      async peek(count) {
        const bytes = await this.readBytes(count);
        bufferPosition -= bytes.length; // Put back the bytes
        return bytes;
      }
    };
  }
}