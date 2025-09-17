export class S3Adapter {
  constructor() {
    this.bucketName = null;
    this.region = null;
    this.accessKeyId = null;
    this.secretAccessKey = null;
    this.sessionToken = null;
    this.endpoint = null;
    this.authType = null; // 'credentials', 'anonymous'
    this.baseUrl = null;
    this.basePath = null;
    this.isAuthenticated = false;
  }

  // Parse S3 URLs and extract connection info
  parseUrl(url) {
    const patterns = {
      // s3://bucket-name/path
      s3: /^s3:\/\/([^\/]+)\/?(.*)$/,
      // https://bucket-name.s3.region.amazonaws.com/path
      https_bucket: /^https:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/?(.*)$/,
      // https://s3.region.amazonaws.com/bucket-name/path
      https_region: /^https:\/\/s3\.([^.]+)\.amazonaws\.com\/([^\/]+)\/?(.*)$/,
      // https://bucket-name.s3.amazonaws.com/path (us-east-1)
      https_legacy: /^https:\/\/([^.]+)\.s3\.amazonaws\.com\/?(.*)$/,
      // Custom S3-compatible endpoints (MinIO, etc.)
      custom: /^https?:\/\/([^\/]+)\/([^\/]+)\/?(.*)$/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = url.match(pattern);
      if (match) {
        switch (type) {
          case 's3':
            return {
              type,
              bucketName: match[1],
              path: match[2] || '',
              region: 'us-east-1', // Default region
              baseUrl: 'https://s3.amazonaws.com'
            };
          case 'https_bucket':
            return {
              type,
              bucketName: match[1],
              region: match[2],
              path: match[3] || '',
              baseUrl: `https://s3.${match[2]}.amazonaws.com`
            };
          case 'https_region':
            return {
              type,
              region: match[1],
              bucketName: match[2],
              path: match[3] || '',
              baseUrl: `https://s3.${match[1]}.amazonaws.com`
            };
          case 'https_legacy':
            return {
              type,
              bucketName: match[1],
              path: match[2] || '',
              region: 'us-east-1',
              baseUrl: 'https://s3.amazonaws.com'
            };
          case 'custom':
            // For custom endpoints, assume bucket is in path
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            return {
              type,
              endpoint: urlObj.origin,
              bucketName: pathParts[0] || '',
              path: pathParts.slice(1).join('/') || '',
              region: 'us-east-1',
              baseUrl: urlObj.origin
            };
        }
      }
    }

    throw new Error('Invalid S3 URL format. Supported formats:\n' +
      '• s3://bucket-name/path\n' +
      '• https://bucket-name.s3.region.amazonaws.com/path\n' +
      '• https://s3.region.amazonaws.com/bucket-name/path\n' +
      '• https://custom-endpoint.com/bucket-name/path (S3-compatible)');
  }

  // Connect using URL and optional credentials
  async connect(url, credentials = {}) {
    try {
      const urlInfo = this.parseUrl(url);

      this.bucketName = urlInfo.bucketName;
      this.region = urlInfo.region;
      this.endpoint = urlInfo.endpoint;
      this.baseUrl = urlInfo.baseUrl;
      this.basePath = urlInfo.path;

      // Determine authentication method
      if (credentials.accessKeyId && credentials.secretAccessKey) {
        this.authType = 'credentials';
        this.accessKeyId = credentials.accessKeyId;
        this.secretAccessKey = credentials.secretAccessKey;
        this.sessionToken = credentials.sessionToken; // Optional for temporary credentials
      } else {
        this.authType = 'anonymous';
      }

      // Test connection
      await this.testConnection();

      this.isAuthenticated = true;
      return {
        success: true,
        bucketName: this.bucketName,
        region: this.region,
        authType: this.authType,
        baseUrl: this.baseUrl,
        endpoint: this.endpoint
      };
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`Failed to connect to S3: ${error.message}`);
    }
  }

  // Test connection by listing bucket or checking bucket existence
  async testConnection() {
    try {
      const url = this.buildUrl('/', { 'list-type': '2', 'max-keys': '1' });
      const response = await this.makeRequest(url, { method: 'GET' });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Bucket '${this.bucketName}' not found or not accessible`);
        } else if (response.status === 403) {
          throw new Error('Access denied. Check your credentials and bucket permissions.');
        } else {
          throw new Error(`Connection failed: ${response.statusText}`);
        }
      }

      return true;
    } catch (error) {
      if (error.message.includes('CORS')) {
        throw new Error(
          'CORS error: The S3 bucket may not allow browser access. ' +
          'Enable CORS for your bucket or use appropriate credentials.'
        );
      }
      throw error;
    }
  }

  // List files and directories (using S3 ListObjectsV2)
  async listFiles(path = '') {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to S3');
    }

    const fullPath = this.combinePaths(this.basePath, path);
    const url = this.buildUrl('/', {
      'list-type': '2',
      'prefix': fullPath ? fullPath + (fullPath.endsWith('/') ? '' : '/') : '',
      'delimiter': '/',
      'max-keys': '1000'
    });

    try {
      const response = await this.makeRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseListResponse(xmlText, path);
    } catch (error) {
      throw new Error(`List operation failed: ${error.message}`);
    }
  }

  // Download file
  async downloadFile(filePath) {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to S3');
    }

    const fullPath = this.combinePaths(this.basePath, filePath);
    const url = this.buildUrl('/' + encodeURIComponent(fullPath));

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

  // Get file metadata (using HEAD request)
  async getFileMetadata(filePath) {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to S3');
    }

    const fullPath = this.combinePaths(this.basePath, filePath);
    const url = this.buildUrl('/' + encodeURIComponent(fullPath));

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
        etag: response.headers.get('ETag')?.replace(/"/g, '')
      };
    } catch (error) {
      throw new Error(`Metadata retrieval failed: ${error.message}`);
    }
  }

  // Build URL with authentication
  buildUrl(path, params = {}) {
    let url;

    if (this.endpoint) {
      // Custom endpoint
      url = new URL(`${this.endpoint}/${this.bucketName}${path}`);
    } else {
      // AWS S3
      if (this.region === 'us-east-1') {
        url = new URL(`https://${this.bucketName}.s3.amazonaws.com${path}`);
      } else {
        url = new URL(`https://${this.bucketName}.s3.${this.region}.amazonaws.com${path}`);
      }
    }

    // Add query parameters
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  // Make authenticated request
  async makeRequest(url, options = {}) {
    const headers = { ...options.headers };

    // Add authentication headers if credentials are provided
    if (this.authType === 'credentials') {
      const authHeaders = await this.createAuthHeaders(url, options.method || 'GET', headers);
      Object.assign(headers, authHeaders);
    }

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
          '1. Enable CORS on your S3 bucket\n' +
          '2. Use appropriate credentials\n' +
          '3. Check that the bucket allows browser access'
        );
      }
      throw error;
    }
  }

  // Create AWS Signature Version 4 headers (simplified for browser use)
  async createAuthHeaders(url, method, headers) {
    if (!this.accessKeyId || !this.secretAccessKey) {
      return {};
    }

    // For browser implementation, we'll use a simplified approach
    // Note: Full AWS Signature V4 is complex and typically done server-side

    const urlObj = new URL(url);
    const host = urlObj.host;
    const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
    const dateStamp = date.substr(0, 8);

    // Basic headers for AWS requests
    const authHeaders = {
      'Host': host,
      'X-Amz-Date': date.replace(/(\d{8})T(\d{6})Z/, '$1T$2Z'),
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD'
    };

    if (this.sessionToken) {
      authHeaders['X-Amz-Security-Token'] = this.sessionToken;
    }

    // For browser use, we'll rely on temporary credentials or public buckets
    // Full signature calculation would require crypto operations
    console.warn('S3 authentication in browser is limited. Consider using temporary credentials or public buckets.');

    return authHeaders;
  }

  // Parse S3 XML list response
  parseListResponse(xmlText, currentPath) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const items = [];

    // Parse directories (CommonPrefixes)
    const prefixes = xmlDoc.getElementsByTagName('CommonPrefixes');
    for (let i = 0; i < prefixes.length; i++) {
      const prefix = prefixes[i].getElementsByTagName('Prefix')[0]?.textContent;
      if (prefix) {
        const relativePath = prefix.startsWith(this.basePath + '/')
          ? prefix.substring(this.basePath.length + 1)
          : prefix;

        const dirName = relativePath.replace(/\/$/, '').split('/').pop();

        if (dirName) {
          items.push({
            name: dirName,
            path: relativePath.replace(/\/$/, ''),
            fullPath: prefix.replace(/\/$/, ''),
            isDirectory: true,
            size: 0,
            lastModified: null,
            type: 'directory'
          });
        }
      }
    }

    // Parse files (Contents)
    const contents = xmlDoc.getElementsByTagName('Contents');
    for (let i = 0; i < contents.length; i++) {
      const key = contents[i].getElementsByTagName('Key')[0]?.textContent;
      const size = parseInt(contents[i].getElementsByTagName('Size')[0]?.textContent || '0');
      const lastModified = contents[i].getElementsByTagName('LastModified')[0]?.textContent;
      const etag = contents[i].getElementsByTagName('ETag')[0]?.textContent;

      if (key && !key.endsWith('/')) { // Skip directory markers
        const relativePath = key.startsWith(this.basePath + '/')
          ? key.substring(this.basePath.length + 1)
          : key.startsWith(this.basePath)
          ? key.substring(this.basePath.length)
          : key;

        // Only include files in the current directory level
        if (!relativePath.includes('/')) {
          items.push({
            name: relativePath,
            path: relativePath,
            fullPath: key,
            isDirectory: false,
            size,
            lastModified: lastModified ? new Date(lastModified) : null,
            etag: etag?.replace(/"/g, ''),
            type: 'file'
          });
        }
      }
    }

    return items.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  // Utility methods
  combinePaths(...paths) {
    return paths
      .filter(p => p && p !== '')
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\//, '')
      .replace(/\/$/, '');
  }

  // Connection info
  getConnectionInfo() {
    return {
      bucketName: this.bucketName,
      region: this.region,
      baseUrl: this.baseUrl,
      basePath: this.basePath,
      endpoint: this.endpoint,
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
    this.bucketName = null;
    this.region = null;
    this.accessKeyId = null;
    this.secretAccessKey = null;
    this.sessionToken = null;
    this.endpoint = null;
    this.authType = null;
    this.baseUrl = null;
    this.basePath = null;
    this.isAuthenticated = false;
  }

  // Generate credentials instructions
  generateCredentialsInstructions() {
    return {
      title: 'How to get S3 credentials',
      steps: [
        '1. Go to AWS Console → IAM → Users',
        '2. Create a new user or select existing user',
        '3. Attach policy with S3 permissions:',
        '   • AmazonS3ReadOnlyAccess (for read-only)',
        '   • Or custom policy with s3:GetObject, s3:ListBucket',
        '4. Go to Security Credentials tab',
        '5. Create Access Key → Application running outside AWS',
        '6. Copy Access Key ID and Secret Access Key'
      ],
      temporaryCredentials: [
        'For temporary access, you can also use:',
        '• AWS STS temporary credentials',
        '• IAM roles with AssumeRole',
        '• AWS CLI: aws sts get-session-token'
      ],
      publicBuckets: [
        'For public buckets, no credentials needed:',
        '• Select "Anonymous/Public" authentication',
        '• Bucket must have public read policy'
      ],
      securityNote: 'Never share permanent credentials. Use temporary credentials or IAM roles when possible.'
    };
  }

  // Error handling with helpful messages
  getErrorHelp(error) {
    const errorHelp = {
      'CORS': {
        problem: 'Cross-Origin Resource Sharing (CORS) is not enabled',
        solution: 'Enable CORS on your S3 bucket for browser access'
      },
      '403': {
        problem: 'Access denied',
        solution: 'Check credentials and bucket permissions'
      },
      '404': {
        problem: 'Bucket or object not found',
        solution: 'Verify the bucket name and region are correct'
      },
      'InvalidUrl': {
        problem: 'Invalid S3 URL format',
        solution: 'Use format: s3://bucket-name/path or https://bucket.s3.region.amazonaws.com/path'
      },
      'SignatureDoesNotMatch': {
        problem: 'Invalid credentials or signature',
        solution: 'Check your Access Key ID and Secret Access Key'
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