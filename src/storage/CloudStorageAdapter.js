export class CloudStorageAdapter {
  constructor(provider) {
    this.provider = provider;
    this.config = this.getProviderConfig(provider);
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.isAuthenticated = false;
  }

  getProviderConfig(provider) {
    const configs = {
      gdrive: {
        name: 'Google Drive',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        apiUrl: 'https://www.googleapis.com/drive/v3',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        responseType: 'code',
        grantType: 'authorization_code'
      },
      dropbox: {
        name: 'Dropbox',
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        apiUrl: 'https://api.dropboxapi.com/2',
        scope: 'files.metadata.read files.content.read',
        responseType: 'code',
        grantType: 'authorization_code'
      },
      onedrive: {
        name: 'OneDrive',
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        apiUrl: 'https://graph.microsoft.com/v1.0/me/drive',
        scope: 'files.read files.read.all',
        responseType: 'code',
        grantType: 'authorization_code'
      }
    };
    
    return configs[provider];
  }

  // Authentication flow
  async authenticate(clientId, redirectUri) {
    if (!this.config) {
      throw new Error(`Unsupported provider: ${this.provider}`);
    }

    // Check if we have a valid cached token
    if (await this.loadCachedToken()) {
      return true;
    }

    // Start OAuth flow
    const authUrl = this.buildAuthUrl(clientId, redirectUri);
    
    try {
      // Open auth window
      const authResult = await this.openAuthWindow(authUrl);
      
      if (authResult.error) {
        throw new Error(`Authentication failed: ${authResult.error}`);
      }

      // Exchange code for token
      await this.exchangeCodeForToken(authResult.code, clientId, redirectUri);
      
      // Cache the token
      await this.cacheToken();
      
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  buildAuthUrl(clientId, redirectUri) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.config.scope,
      response_type: this.config.responseType,
      access_type: 'offline', // Request refresh token
      prompt: 'consent'
    });
    
    return `${this.config.authUrl}?${params}`;
  }

  async openAuthWindow(authUrl) {
    return new Promise((resolve, reject) => {
      const popup = window.open(
        authUrl,
        'oauth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        reject(new Error('Popup blocked. Please allow popups and try again.'));
        return;
      }

      const pollTimer = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(pollTimer);
            reject(new Error('Authentication cancelled by user'));
            return;
          }

          // Check if we can access the popup URL (same origin)
          const url = popup.location.href;
          
          if (url.includes('code=')) {
            clearInterval(pollTimer);
            const urlParams = new URLSearchParams(popup.location.search);
            const code = urlParams.get('code');
            const error = urlParams.get('error');
            
            popup.close();
            
            if (error) {
              reject(new Error(error));
            } else {
              resolve({ code });
            }
          }
        } catch (error) {
          // Cross-origin error - still waiting for redirect
        }
      }, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollTimer);
        popup.close();
        reject(new Error('Authentication timeout'));
      }, 300000);
    });
  }

  async exchangeCodeForToken(code, clientId, redirectUri) {
    const tokenData = {
      grant_type: this.config.grantType,
      client_id: clientId,
      code: code,
      redirect_uri: redirectUri
    };

    try {
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(tokenData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Token exchange failed: ${errorData.error || response.statusText}`);
      }

      const tokens = await response.json();
      
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;
      this.tokenExpiresAt = Date.now() + (tokens.expires_in * 1000);
      
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }

  // File operations
  async listFiles(path = '/') {
    await this.ensureValidToken();
    
    switch (this.provider) {
      case 'gdrive':
        return this.listGoogleDriveFiles(path);
      case 'dropbox':
        return this.listDropboxFiles(path);
      case 'onedrive':
        return this.listOneDriveFiles(path);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  async listGoogleDriveFiles(path) {
    const params = new URLSearchParams({
      q: `'${path}' in parents and trashed=false`,
      fields: 'files(id,name,size,mimeType,modifiedTime,parents)',
      pageSize: '1000'
    });

    const response = await this.makeAuthenticatedRequest(
      `${this.config.apiUrl}/files?${params}`
    );

    const data = await response.json();
    
    return data.files.map(file => ({
      id: file.id,
      name: file.name,
      path: `${path}/${file.name}`,
      size: parseInt(file.size) || 0,
      isDirectory: file.mimeType === 'application/vnd.google-apps.folder',
      lastModified: new Date(file.modifiedTime),
      mimeType: file.mimeType
    }));
  }

  async listDropboxFiles(path) {
    const requestData = {
      path: path === '/' ? '' : path,
      recursive: false,
      include_media_info: false,
      include_deleted: false
    };

    const response = await this.makeAuthenticatedRequest(
      `${this.config.apiUrl}/files/list_folder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      }
    );

    const data = await response.json();
    
    return data.entries.map(entry => ({
      id: entry.id,
      name: entry.name,
      path: entry.path_display,
      size: entry.size || 0,
      isDirectory: entry['.tag'] === 'folder',
      lastModified: new Date(entry.server_modified || entry.client_modified),
      mimeType: this.getMimeTypeFromExtension(entry.name)
    }));
  }

  async listOneDriveFiles(path) {
    let url = `${this.config.apiUrl}/root/children`;
    
    if (path !== '/') {
      const encodedPath = encodeURIComponent(path);
      url = `${this.config.apiUrl}/root:/${encodedPath}:/children`;
    }

    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json();
    
    return data.value.map(item => ({
      id: item.id,
      name: item.name,
      path: `${path}/${item.name}`,
      size: item.size || 0,
      isDirectory: !!item.folder,
      lastModified: new Date(item.lastModifiedDateTime),
      mimeType: item.file ? item.file.mimeType : 'application/vnd.microsoft.folder'
    }));
  }

  async downloadFile(fileId) {
    await this.ensureValidToken();
    
    switch (this.provider) {
      case 'gdrive':
        return this.downloadGoogleDriveFile(fileId);
      case 'dropbox':
        return this.downloadDropboxFile(fileId);
      case 'onedrive':
        return this.downloadOneDriveFile(fileId);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  async downloadGoogleDriveFile(fileId) {
    const response = await this.makeAuthenticatedRequest(
      `${this.config.apiUrl}/files/${fileId}?alt=media`
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return await response.blob();
  }

  async downloadDropboxFile(path) {
    const requestData = { path };

    const response = await this.makeAuthenticatedRequest(
      `https://content.dropboxapi.com/2/files/download`,
      {
        method: 'POST',
        headers: {
          'Dropbox-API-Arg': JSON.stringify(requestData)
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return await response.blob();
  }

  async downloadOneDriveFile(fileId) {
    const response = await this.makeAuthenticatedRequest(
      `${this.config.apiUrl}/items/${fileId}/content`
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return await response.blob();
  }

  // Token management
  async ensureValidToken() {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    if (this.isTokenExpired()) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        throw new Error('Token expired and no refresh token available');
      }
    }
  }

  isTokenExpired() {
    if (!this.tokenExpiresAt) return false;
    return Date.now() >= this.tokenExpiresAt - 60000; // 1 minute buffer
  }

  async refreshAccessToken() {
    // Implementation would depend on provider
    console.warn('Token refresh not implemented for', this.provider);
    throw new Error('Token expired - please re-authenticate');
  }

  async makeAuthenticatedRequest(url, options = {}) {
    await this.ensureValidToken();

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      // Token might be expired
      this.accessToken = null;
      throw new Error('Authentication failed - token may be expired');
    }

    return response;
  }

  // Caching
  async cacheToken() {
    const tokenData = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiresAt: this.tokenExpiresAt,
      provider: this.provider
    };

    try {
      sessionStorage.setItem(`cloudAuth_${this.provider}`, JSON.stringify(tokenData));
    } catch (error) {
      console.warn('Failed to cache token:', error);
    }
  }

  async loadCachedToken() {
    try {
      const cached = sessionStorage.getItem(`cloudAuth_${this.provider}`);
      if (!cached) return false;

      const tokenData = JSON.parse(cached);
      
      if (tokenData.provider !== this.provider) return false;

      this.accessToken = tokenData.accessToken;
      this.refreshToken = tokenData.refreshToken;
      this.tokenExpiresAt = tokenData.tokenExpiresAt;

      // Check if token is still valid
      if (this.isTokenExpired() && !this.refreshToken) {
        this.clearCachedToken();
        return false;
      }

      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.warn('Failed to load cached token:', error);
      return false;
    }
  }

  clearCachedToken() {
    try {
      sessionStorage.removeItem(`cloudAuth_${this.provider}`);
    } catch (error) {
      console.warn('Failed to clear cached token:', error);
    }
    
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.isAuthenticated = false;
  }

  // Utility methods
  getMimeTypeFromExtension(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      'parquet': 'application/octet-stream',
      'arrow': 'application/octet-stream',
      'feather': 'application/octet-stream',
      'avro': 'application/octet-stream',
      'orc': 'application/octet-stream',
      'jsonl': 'application/json',
      'ndjson': 'application/json',
      'json': 'application/json',
      'csv': 'text/csv'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  // Status and info
  isConnected() {
    return this.isAuthenticated && this.accessToken;
  }

  getProviderInfo() {
    return {
      name: this.config.name,
      provider: this.provider,
      isConnected: this.isConnected(),
      tokenExpires: this.tokenExpiresAt ? new Date(this.tokenExpiresAt) : null
    };
  }

  // Error handling
  handleCloudError(error, context = '') {
    const message = context ? `${context}: ${error.message}` : error.message;
    
    if (error.message.includes('authentication') || error.message.includes('401')) {
      throw new Error(`Authentication required. Please re-connect to ${this.config.name}.`);
    } else if (error.message.includes('permission') || error.message.includes('403')) {
      throw new Error(`Permission denied. Check your ${this.config.name} permissions.`);
    } else if (error.message.includes('not found') || error.message.includes('404')) {
      throw new Error(`File or folder not found in ${this.config.name}.`);
    } else if (error.message.includes('quota') || error.message.includes('429')) {
      throw new Error(`Rate limit or quota exceeded for ${this.config.name}.`);
    } else {
      throw new Error(`${this.config.name} error: ${message}`);
    }
  }

  // Disconnect
  disconnect() {
    this.clearCachedToken();
    console.log(`Disconnected from ${this.config.name}`);
  }
}