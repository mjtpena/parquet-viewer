export class ADLSGen2Adapter {
  constructor() {
    this.accountName = null;
    this.containerName = null;
    this.sasToken = null;
    this.accessKey = null;
    this.authType = null; // 'sas', 'key', 'anonymous'
    this.baseUrl = null;
    this.isAuthenticated = false;
  }

  // Parse ADLS Gen2 URLs and extract connection info
  parseUrl(url) {
    const patterns = {
      // abfss://container@account.dfs.core.windows.net/path
      abfss: /^abfss:\/\/([^@]+)@([^.]+)\.dfs\.core\.windows\.net\/?(.*)?$/,
      // https://account.dfs.core.windows.net/container/path
      https_dfs: /^https:\/\/([^.]+)\.dfs\.core\.windows\.net\/([^\/]+)\/?(.*)$/,
      // https://account.blob.core.windows.net/container/path
      https_blob: /^https:\/\/([^.]+)\.blob\.core\.windows\.net\/([^\/]+)\/?(.*)$/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = url.match(pattern);
      if (match) {
        if (type === 'abfss') {
          return {
            type,
            containerName: match[1],
            accountName: match[2],
            path: match[3] || '',
            baseUrl: `https://${match[2]}.dfs.core.windows.net`
          };
        } else {
          return {
            type,
            accountName: match[1],
            containerName: match[2],
            path: match[3] || '',
            baseUrl: type === 'https_dfs'
              ? `https://${match[1]}.dfs.core.windows.net`
              : `https://${match[1]}.blob.core.windows.net`
          };
        }
      }
    }

    throw new Error('Invalid ADLS Gen2 URL format. Supported formats:\n' +
      '• abfss://container@account.dfs.core.windows.net/path\n' +
      '• https://account.dfs.core.windows.net/container/path\n' +
      '• https://account.blob.core.windows.net/container/path');
  }

  // Connect using URL and optional credentials
  async connect(url, credentials = {}) {
    try {
      const urlInfo = this.parseUrl(url);

      this.accountName = urlInfo.accountName;
      this.containerName = urlInfo.containerName;
      this.baseUrl = urlInfo.baseUrl;
      this.basePath = urlInfo.path;

      // Determine authentication method
      if (credentials.sasToken) {
        this.authType = 'sas';
        this.sasToken = credentials.sasToken.startsWith('?')
          ? credentials.sasToken
          : '?' + credentials.sasToken;
      } else if (credentials.accessKey) {
        this.authType = 'key';
        this.accessKey = credentials.accessKey;
      } else {
        this.authType = 'anonymous';
      }

      // Test connection
      await this.testConnection();

      this.isAuthenticated = true;
      return {
        success: true,
        accountName: this.accountName,
        containerName: this.containerName,
        authType: this.authType,
        baseUrl: this.baseUrl
      };
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`Failed to connect to ADLS Gen2: ${error.message}`);
    }
  }

  // Test connection by listing container
  async testConnection() {
    try {
      const url = this.buildUrl(`/${this.containerName}`, {
        resource: 'container',
        timeout: '10'
      });

      const response = await this.makeRequest(url, { method: 'HEAD' });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Container '${this.containerName}' not found`);
        } else if (response.status === 403) {
          throw new Error('Access denied. Check your credentials and permissions.');
        } else {
          throw new Error(`Connection failed: ${response.statusText}`);
        }
      }

      return true;
    } catch (error) {
      if (error.message.includes('CORS')) {
        throw new Error(
          'CORS error: The storage account may not allow browser access. ' +
          'Enable CORS for your storage account or use a SAS token with appropriate permissions.'
        );
      }
      throw error;
    }
  }

  // List files and directories
  async listFiles(path = '') {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to ADLS Gen2');
    }

    const fullPath = this.combinePaths(this.basePath, path);
    const url = this.buildUrl(`/${this.containerName}`, {
      resource: 'filesystem',
      directory: fullPath || undefined,
      recursive: 'false',
      timeout: '30'
    });

    try {
      const response = await this.makeRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseListResponse(data, path);
    } catch (error) {
      if (error.name === 'SyntaxError') {
        // Not JSON response, might be XML error
        throw new Error('Invalid response format. Check your URL and credentials.');
      }
      throw error;
    }
  }

  // Download file
  async downloadFile(filePath) {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to ADLS Gen2');
    }

    const fullPath = this.combinePaths(this.basePath, filePath);
    const url = this.buildUrl(`/${this.containerName}/${fullPath}`);

    try {
      const response = await this.makeRequest(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File not found: ${filePath}`);
        }
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }

  // Get file metadata
  async getFileMetadata(filePath) {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to ADLS Gen2');
    }

    const fullPath = this.combinePaths(this.basePath, filePath);
    const url = this.buildUrl(`/${this.containerName}/${fullPath}`);

    try {
      const response = await this.makeRequest(url, { method: 'HEAD' });

      if (!response.ok) {
        throw new Error(`Failed to get metadata: ${response.status} ${response.statusText}`);
      }

      return {
        name: filePath.split('/').pop(),
        size: parseInt(response.headers.get('Content-Length')) || 0,
        lastModified: new Date(response.headers.get('Last-Modified')),
        contentType: response.headers.get('Content-Type'),
        etag: response.headers.get('ETag')
      };
    } catch (error) {
      throw new Error(`Metadata retrieval failed: ${error.message}`);
    }
  }

  // Utility methods
  buildUrl(path, params = {}) {
    const url = new URL(this.baseUrl + path);

    // Add query parameters
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    // Add authentication
    if (this.authType === 'sas' && this.sasToken) {
      // Parse existing SAS parameters
      const sasParams = new URLSearchParams(this.sasToken.substring(1));
      for (const [key, value] of sasParams) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  async makeRequest(url, options = {}) {
    const headers = { ...options.headers };

    // Add authentication headers
    if (this.authType === 'key') {
      // For simplicity, we'll use SAS tokens instead of signing requests
      throw new Error('Access key authentication requires server-side signing. Please use SAS tokens for browser access.');
    }

    // Add CORS headers
    headers['x-ms-version'] = '2020-04-08';

    const requestOptions = {
      ...options,
      headers,
      mode: 'cors'
    };

    try {
      return await fetch(url, requestOptions);
    } catch (error) {
      if (error.message.includes('CORS')) {
        throw new Error(
          'CORS policy blocks this request. Please:\n' +
          '1. Enable CORS on your storage account\n' +
          '2. Use a SAS token with appropriate permissions\n' +
          '3. Check that the storage account allows browser access'
        );
      }
      throw error;
    }
  }

  parseListResponse(data, currentPath) {
    const items = [];

    if (data.paths) {
      for (const item of data.paths) {
        const isDirectory = item.isDirectory === 'true';
        const relativePath = item.name.startsWith(this.basePath)
          ? item.name.substring(this.basePath.length).replace(/^\//, '')
          : item.name;

        items.push({
          name: relativePath.split('/').pop() || relativePath,
          path: relativePath,
          fullPath: item.name,
          isDirectory,
          size: isDirectory ? 0 : parseInt(item.contentLength) || 0,
          lastModified: item.lastModified ? new Date(item.lastModified) : null,
          etag: item.etag,
          type: isDirectory ? 'directory' : 'file'
        });
      }
    }

    return items.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  combinePaths(...paths) {
    return paths
      .filter(p => p && p !== '')
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\//, '')
      .replace(/\/$/, '');
  }

  // Generate SAS token URL (for documentation purposes)
  generateSasTokenInstructions() {
    return {
      title: 'How to create a SAS Token for ADLS Gen2',
      steps: [
        '1. Go to Azure Portal → Storage Account → Shared access signature',
        '2. Configure permissions:',
        '   • Allowed services: Blob',
        '   • Allowed resource types: Service, Container, Object',
        '   • Allowed permissions: Read, List',
        '3. Set expiry time',
        '4. Click "Generate SAS and connection string"',
        '5. Copy the "SAS token" (starts with ?sv=...)'
      ],
      securityNote: 'SAS tokens provide temporary, limited access to your storage account. They are safe to use in browser applications.'
    };
  }

  // Connection info
  getConnectionInfo() {
    return {
      accountName: this.accountName,
      containerName: this.containerName,
      baseUrl: this.baseUrl,
      basePath: this.basePath,
      authType: this.authType,
      isConnected: this.isAuthenticated
    };
  }

  // Supported file extensions for data formats
  getSupportedExtensions() {
    return [
      '.parquet',
      '.arrow', '.feather',
      '.avro',
      '.orc',
      '.jsonl', '.ndjson',
      '.json',
      '.csv'
    ];
  }

  // Filter files by supported formats
  filterDataFiles(files) {
    const supportedExts = this.getSupportedExtensions();
    return files.filter(file => {
      if (file.isDirectory) return true;
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return supportedExts.includes(ext);
    });
  }

  // Disconnect
  disconnect() {
    this.accountName = null;
    this.containerName = null;
    this.sasToken = null;
    this.accessKey = null;
    this.authType = null;
    this.baseUrl = null;
    this.basePath = null;
    this.isAuthenticated = false;
  }

  // Error handling with helpful messages
  getErrorHelp(error) {
    const errorHelp = {
      'CORS': {
        problem: 'Cross-Origin Resource Sharing (CORS) is not enabled',
        solution: 'Enable CORS on your Azure Storage Account for browser access'
      },
      '403': {
        problem: 'Access denied',
        solution: 'Check SAS token permissions and expiry date'
      },
      '404': {
        problem: 'Resource not found',
        solution: 'Verify the storage account, container, and path are correct'
      },
      'InvalidUrl': {
        problem: 'Invalid ADLS Gen2 URL format',
        solution: 'Use format: abfss://container@account.dfs.core.windows.net/path'
      }
    };

    for (const [key, help] of Object.entries(errorHelp)) {
      if (error.message.includes(key)) {
        return help;
      }
    }

    return {
      problem: 'Unknown error',
      solution: 'Check network connection and try again'
    };
  }
}