export class GCSAdapter {
  constructor() {
    this.bucketName = null;
    this.projectId = null;
    this.accessToken = null;
    this.serviceAccountKey = null;
    this.authType = null; // 'oauth', 'service-account', 'anonymous'
    this.baseUrl = 'https://storage.googleapis.com';
    this.basePath = null;
    this.isAuthenticated = false;
  }

  // Parse GCS URLs and extract connection info
  parseUrl(url) {
    const patterns = {
      // gs://bucket-name/path
      gs: /^gs:\/\/([^\/]+)\/?(.*)$/,
      // https://storage.googleapis.com/bucket-name/path
      https_api: /^https:\/\/storage\.googleapis\.com\/([^\/]+)\/?(.*)$/,
      // https://storage.cloud.google.com/bucket-name/path
      https_cloud: /^https:\/\/storage\.cloud\.google\.com\/([^\/]+)\/?(.*)$/,
      // https://bucket-name.storage.googleapis.com/path
      https_bucket: /^https:\/\/([^.]+)\.storage\.googleapis\.com\/?(.*)$/
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      const match = url.match(pattern);
      if (match) {
        return {
          type,
          bucketName: match[1],
          path: match[2] || '',
          baseUrl: this.baseUrl
        };
      }
    }

    throw new Error('Invalid Google Cloud Storage URL format. Supported formats:\n' +
      '• gs://bucket-name/path\n' +
      '• https://storage.googleapis.com/bucket-name/path\n' +
      '• https://storage.cloud.google.com/bucket-name/path\n' +
      '• https://bucket-name.storage.googleapis.com/path');
  }

  // Connect using URL and optional credentials
  async connect(url, credentials = {}) {
    try {
      const urlInfo = this.parseUrl(url);

      this.bucketName = urlInfo.bucketName;
      this.basePath = urlInfo.path;

      // Determine authentication method
      if (credentials.accessToken) {
        this.authType = 'oauth';
        this.accessToken = credentials.accessToken;
      } else if (credentials.serviceAccountKey) {
        this.authType = 'service-account';
        this.serviceAccountKey = credentials.serviceAccountKey;
        // In a full implementation, we'd use the service account key to get access token
        throw new Error('Service account authentication requires server-side implementation for security');
      } else {
        this.authType = 'anonymous';
      }

      // Test connection
      await this.testConnection();

      this.isAuthenticated = true;
      return {
        success: true,
        bucketName: this.bucketName,
        projectId: this.projectId,
        authType: this.authType,
        baseUrl: this.baseUrl
      };
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`Failed to connect to Google Cloud Storage: ${error.message}`);
    }
  }

  // Test connection by checking bucket accessibility
  async testConnection() {
    try {
      // Try to get bucket metadata
      const url = `${this.baseUrl}/storage/v1/b/${this.bucketName}`;
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

      const bucketInfo = await response.json();
      this.projectId = bucketInfo.projectNumber;

      return true;
    } catch (error) {
      if (error.message.includes('CORS')) {
        throw new Error(
          'CORS error: The GCS bucket may not allow browser access. ' +
          'Enable CORS for your bucket or use appropriate credentials.'
        );
      }
      throw error;
    }
  }

  // List files and directories (using GCS API)
  async listFiles(path = '') {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to Google Cloud Storage');
    }

    const fullPath = this.combinePaths(this.basePath, path);
    const url = `${this.baseUrl}/storage/v1/b/${this.bucketName}/o`;

    const params = {
      delimiter: '/',
      maxResults: '1000'
    };

    if (fullPath) {
      params.prefix = fullPath.endsWith('/') ? fullPath : fullPath + '/';
    }

    const queryString = new URLSearchParams(params).toString();
    const requestUrl = `${url}?${queryString}`;

    try {
      const response = await this.makeRequest(requestUrl);

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseListResponse(data, path);
    } catch (error) {
      throw new Error(`List operation failed: ${error.message}`);
    }
  }

  // Download file
  async downloadFile(filePath) {
    if (!this.isAuthenticated) {
      throw new Error('Not connected to Google Cloud Storage');
    }

    const fullPath = this.combinePaths(this.basePath, filePath);
    const encodedPath = encodeURIComponent(fullPath);
    const url = `${this.baseUrl}/storage/v1/b/${this.bucketName}/o/${encodedPath}?alt=media`;

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
      throw new Error('Not connected to Google Cloud Storage');
    }

    const fullPath = this.combinePaths(this.basePath, filePath);
    const encodedPath = encodeURIComponent(fullPath);
    const url = `${this.baseUrl}/storage/v1/b/${this.bucketName}/o/${encodedPath}`;

    try {
      const response = await this.makeRequest(url);

      if (!response.ok) {
        throw new Error(`Failed to get metadata: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return {
        name: filePath.split('/').pop(),
        size: parseInt(data.size) || 0,
        lastModified: data.updated ? new Date(data.updated) : null,
        contentType: data.contentType,
        etag: data.etag,
        md5Hash: data.md5Hash,
        crc32c: data.crc32c
      };
    } catch (error) {
      throw new Error(`Metadata retrieval failed: ${error.message}`);
    }
  }

  // Make authenticated request
  async makeRequest(url, options = {}) {
    const headers = { ...options.headers };

    // Add authentication headers
    if (this.authType === 'oauth' && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // Add standard headers
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';

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
          '1. Enable CORS on your GCS bucket\n' +
          '2. Use appropriate credentials\n' +
          '3. Check that the bucket allows browser access'
        );
      }
      throw error;
    }
  }

  // Parse GCS API list response
  parseListResponse(data, currentPath) {
    const items = [];

    // Parse directories (prefixes)
    if (data.prefixes) {
      for (const prefix of data.prefixes) {
        const relativePath = prefix.startsWith(this.basePath + '/')
          ? prefix.substring(this.basePath.length + 1)
          : prefix.startsWith(this.basePath)
          ? prefix.substring(this.basePath.length)
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

    // Parse files (items)
    if (data.items) {
      for (const item of data.items) {
        const relativePath = item.name.startsWith(this.basePath + '/')
          ? item.name.substring(this.basePath.length + 1)
          : item.name.startsWith(this.basePath)
          ? item.name.substring(this.basePath.length)
          : item.name;

        // Only include files in the current directory level
        if (!relativePath.includes('/') && relativePath) {
          items.push({
            name: relativePath,
            path: relativePath,
            fullPath: item.name,
            isDirectory: false,
            size: parseInt(item.size) || 0,
            lastModified: item.updated ? new Date(item.updated) : null,
            etag: item.etag,
            contentType: item.contentType,
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
      projectId: this.projectId,
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
    this.bucketName = null;
    this.projectId = null;
    this.accessToken = null;
    this.serviceAccountKey = null;
    this.authType = null;
    this.basePath = null;
    this.isAuthenticated = false;
  }

  // Generate OAuth instructions
  generateOAuthInstructions() {
    return {
      title: 'How to get Google Cloud Storage OAuth token',
      steps: [
        '1. Go to Google Cloud Console → APIs & Services → Credentials',
        '2. Create OAuth 2.0 Client ID:',
        '   • Application type: Web application',
        '   • Add authorized origins: https://your-domain.com',
        '3. Enable Cloud Storage API',
        '4. Use OAuth 2.0 flow to get access token:',
        '   • Scope: https://www.googleapis.com/auth/devstorage.read_only',
        '   • Or: https://www.googleapis.com/auth/cloud-platform'
      ],
      publicBuckets: [
        'For public buckets, no authentication needed:',
        '• Select "Anonymous/Public" authentication',
        '• Bucket must have public read permissions'
      ],
      gcloudCLI: [
        'Quick OAuth token using gcloud CLI:',
        '• gcloud auth application-default print-access-token',
        '• Copy the token for temporary access'
      ],
      securityNote: 'OAuth tokens are temporary and more secure than service account keys for browser use.'
    };
  }

  // Generate service account instructions
  generateServiceAccountInstructions() {
    return {
      title: 'Service Account Setup (Server-side recommended)',
      warning: 'Service account keys should NOT be used directly in browsers for security reasons.',
      serverSideOptions: [
        '1. Use server-side proxy with service account',
        '2. Generate temporary OAuth tokens server-side',
        '3. Use Google Cloud Functions or App Engine',
        '4. Implement token exchange endpoint'
      ],
      keyCreation: [
        'If you need to create a service account key:',
        '1. Go to Google Cloud Console → IAM & Admin → Service Accounts',
        '2. Create service account with Storage Object Viewer role',
        '3. Create JSON key (store securely, never in browser)',
        '4. Use server-side code to exchange for access token'
      ]
    };
  }

  // Error handling with helpful messages
  getErrorHelp(error) {
    const errorHelp = {
      'CORS': {
        problem: 'Cross-Origin Resource Sharing (CORS) is not enabled',
        solution: 'Enable CORS on your GCS bucket for browser access'
      },
      '401': {
        problem: 'Authentication required or token expired',
        solution: 'Check your OAuth token or re-authenticate'
      },
      '403': {
        problem: 'Access denied',
        solution: 'Check token permissions and bucket access rights'
      },
      '404': {
        problem: 'Bucket or object not found',
        solution: 'Verify the bucket name and object path are correct'
      },
      'InvalidUrl': {
        problem: 'Invalid Google Cloud Storage URL format',
        solution: 'Use format: gs://bucket-name/path or https://storage.googleapis.com/bucket-name/path'
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

  // CORS configuration helper
  getCORSConfiguration() {
    return {
      title: 'CORS Configuration for GCS Bucket',
      note: 'Add this CORS configuration to your bucket to allow browser access',
      gcloudCommand: `gsutil cors set cors.json gs://${this.bucketName || 'your-bucket-name'}`,
      corsJson: {
        description: 'Save this as cors.json and apply with gsutil',
        content: [
          {
            "origin": ["*"],
            "method": ["GET", "HEAD"],
            "responseHeader": ["Content-Type", "Content-Length", "ETag", "Last-Modified"],
            "maxAgeSeconds": 3600
          }
        ]
      },
      consoleSteps: [
        '1. Go to Google Cloud Console → Cloud Storage → Browser',
        '2. Select your bucket → Permissions tab',
        '3. Click "Add" and add "allUsers" with "Storage Object Viewer" role (for public access)',
        '4. Or use more restrictive permissions based on your needs'
      ]
    };
  }
}