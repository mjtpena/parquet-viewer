export class CloudStorageConnector {
  constructor(storageManager) {
    this.storageManager = storageManager;
    this.currentAdapter = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    this.createUI();
    this.attachEventListeners();
  }

  createUI() {
    // Main container
    this.container = document.createElement('div');
    this.container.className = 'cloud-storage-connector';
    this.container.innerHTML = `
      <div class="cloud-connector-header">
        <h3>
          <span class="icon">☁️</span>
          Connect to Cloud Storage
        </h3>
        <button class="close-btn" type="button">×</button>
      </div>

      <div class="cloud-connector-content">
        <div class="connection-form">
          <div class="provider-section">
            <label for="provider-select">Cloud Provider</label>
            <select id="provider-select" class="provider-select">
              <option value="adls">Azure Data Lake Storage Gen2</option>
              <option value="s3">Amazon S3</option>
              <option value="gcs">Google Cloud Storage</option>
            </select>
          </div>

          <div class="url-section">
            <label for="storage-url">Storage URL</label>
            <input
              type="text"
              id="storage-url"
              placeholder="abfss://container@account.dfs.core.windows.net/path"
              class="url-input"
            />
            <div class="url-examples">
              <button type="button" class="example-btn" data-example="adls-abfss">ADLS Gen2 (abfss://)</button>
              <button type="button" class="example-btn" data-example="adls-https">ADLS Gen2 (https://)</button>
              <button type="button" class="example-btn" data-example="s3-bucket">S3 (s3://)</button>
              <button type="button" class="example-btn" data-example="s3-https">S3 (https://)</button>
              <button type="button" class="example-btn" data-example="gcs-gs">GCS (gs://)</button>
              <button type="button" class="example-btn" data-example="gcs-https">GCS (https://)</button>
            </div>
          </div>

          <div class="auth-section">
            <div class="auth-type-selector">
              <label>Authentication</label>
              <div class="radio-group">
                <label class="radio-label adls-auth">
                  <input type="radio" name="auth-type" value="sas" checked>
                  <span>SAS Token</span>
                </label>
                <label class="radio-label s3-auth" style="display: none;">
                  <input type="radio" name="auth-type" value="credentials">
                  <span>Access Key & Secret</span>
                </label>
                <label class="radio-label gcs-auth" style="display: none;">
                  <input type="radio" name="auth-type" value="oauth">
                  <span>OAuth Token</span>
                </label>
                <label class="radio-label">
                  <input type="radio" name="auth-type" value="anonymous">
                  <span>Anonymous/Public</span>
                </label>
              </div>
            </div>

            <!-- ADLS Authentication -->
            <div class="sas-token-section auth-option">
              <label for="sas-token">SAS Token</label>
              <input
                type="password"
                id="sas-token"
                placeholder="?sv=2020-08-04&ss=bfqt&srt=sco&sp=rl..."
                class="token-input"
              />
              <button type="button" class="toggle-token-visibility">👁️</button>
              <div class="help-text">
                <a href="#" class="auth-help-link" data-provider="adls">How to generate a SAS token?</a>
              </div>
            </div>

            <!-- S3 Authentication -->
            <div class="s3-credentials-section auth-option" style="display: none;">
              <div class="credential-row">
                <label for="access-key-id">Access Key ID</label>
                <input
                  type="text"
                  id="access-key-id"
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  class="credential-input"
                />
              </div>
              <div class="credential-row">
                <label for="secret-access-key">Secret Access Key</label>
                <input
                  type="password"
                  id="secret-access-key"
                  placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  class="credential-input"
                />
                <button type="button" class="toggle-secret-visibility">👁️</button>
              </div>
              <div class="credential-row">
                <label for="session-token">Session Token (Optional)</label>
                <input
                  type="password"
                  id="session-token"
                  placeholder="For temporary credentials..."
                  class="credential-input"
                />
              </div>
              <div class="help-text">
                <a href="#" class="auth-help-link" data-provider="s3">How to get S3 credentials?</a>
              </div>
            </div>

            <!-- GCS Authentication -->
            <div class="gcs-oauth-section auth-option" style="display: none;">
              <label for="oauth-token">OAuth Access Token</label>
              <input
                type="password"
                id="oauth-token"
                placeholder="ya29.a0AfH6SMBq1..."
                class="token-input"
              />
              <button type="button" class="toggle-oauth-visibility">👁️</button>
              <div class="help-text">
                <a href="#" class="auth-help-link" data-provider="gcs">How to get OAuth token?</a>
              </div>
            </div>
          </div>

          <div class="connection-actions">
            <button type="button" class="connect-btn primary">Connect</button>
            <button type="button" class="test-btn secondary">Test Connection</button>
          </div>
        </div>

        <div class="connection-status" style="display: none;">
          <div class="status-header">
            <span class="status-icon">✅</span>
            <span class="status-text">Connected to Azure Storage</span>
            <button type="button" class="disconnect-btn">Disconnect</button>
          </div>
          <div class="connection-details">
            <div class="detail-item">
              <span class="label">Account:</span>
              <span class="value account-name">-</span>
            </div>
            <div class="detail-item">
              <span class="label">Container:</span>
              <span class="value container-name">-</span>
            </div>
            <div class="detail-item">
              <span class="label">Auth Type:</span>
              <span class="value auth-type">-</span>
            </div>
          </div>
        </div>

        <div class="file-browser" style="display: none;">
          <div class="browser-header">
            <div class="breadcrumb">
              <span class="breadcrumb-item root">📁 Root</span>
            </div>
            <div class="browser-actions">
              <button type="button" class="refresh-btn">🔄 Refresh</button>
              <button type="button" class="filter-btn">🔍 Filter Data Files</button>
            </div>
          </div>

          <div class="file-list">
            <div class="loading-indicator" style="display: none;">
              <div class="spinner"></div>
              <span>Loading files...</span>
            </div>
            <div class="file-items"></div>
            <div class="empty-state" style="display: none;">
              <span class="icon">📂</span>
              <p>No files found in this directory</p>
            </div>
          </div>
        </div>

        <div class="error-section" style="display: none;">
          <div class="error-message">
            <span class="error-icon">⚠️</span>
            <div class="error-text"></div>
          </div>
          <div class="error-help"></div>
        </div>
      </div>
    `;

    this.addStyles();
  }

  addStyles() {
    if (document.getElementById('cloud-storage-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'cloud-storage-styles';
    styles.textContent = `
      .cloud-storage-connector {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        max-width: 800px;
        max-height: 80vh;
        background: var(--background-color, #1e1e1e);
        border: 1px solid var(--border-color, #333);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .cloud-connector-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: var(--header-background, #2d2d2d);
        border-bottom: 1px solid var(--border-color, #333);
      }

      .cloud-connector-header h3 {
        margin: 0;
        color: var(--text-color, #fff);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .close-btn {
        background: none;
        border: none;
        color: var(--text-color, #fff);
        font-size: 24px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .cloud-connector-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }

      .provider-section, .url-section, .auth-section {
        margin-bottom: 24px;
      }

      .provider-section label, .url-section label, .auth-section label {
        display: block;
        margin-bottom: 8px;
        color: var(--text-color, #fff);
        font-weight: 500;
      }

      .provider-select {
        width: 100%;
        padding: 12px;
        border: 1px solid var(--border-color, #555);
        border-radius: 6px;
        background: var(--input-background, #2d2d2d);
        color: var(--text-color, #fff);
        font-family: inherit;
        font-size: 14px;
      }

      .provider-select:focus {
        outline: none;
        border-color: var(--accent-color, #007acc);
        box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.3);
      }

      .url-input, .token-input, .credential-input {
        width: 100%;
        padding: 12px;
        border: 1px solid var(--border-color, #555);
        border-radius: 6px;
        background: var(--input-background, #2d2d2d);
        color: var(--text-color, #fff);
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 14px;
      }

      .url-input:focus, .token-input:focus, .credential-input:focus {
        outline: none;
        border-color: var(--accent-color, #007acc);
        box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.3);
      }

      .credential-row {
        position: relative;
        margin-bottom: 16px;
      }

      .credential-row:last-child {
        margin-bottom: 0;
      }

      .auth-option {
        margin-top: 16px;
      }

      .url-examples {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .example-btn {
        background: var(--button-secondary, #3c3c3c);
        border: 1px solid var(--border-color, #555);
        color: var(--text-color, #fff);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }

      .example-btn:hover {
        background: var(--button-secondary-hover, #4c4c4c);
      }

      .radio-group {
        display: flex;
        gap: 16px;
        margin-top: 8px;
      }

      .radio-label {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        color: var(--text-color, #fff);
        font-weight: normal;
      }

      .sas-token-section {
        position: relative;
        margin-top: 16px;
      }

      .toggle-token-visibility {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
      }

      .help-text {
        margin-top: 6px;
      }

      .sas-help-link {
        color: var(--accent-color, #007acc);
        text-decoration: none;
        font-size: 12px;
      }

      .sas-help-link:hover {
        text-decoration: underline;
      }

      .connection-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }

      .connect-btn, .test-btn {
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
      }

      .primary {
        background: var(--accent-color, #007acc);
        color: white;
      }

      .primary:hover {
        background: var(--accent-color-hover, #005a9e);
      }

      .secondary {
        background: var(--button-secondary, #3c3c3c);
        color: var(--text-color, #fff);
        border: 1px solid var(--border-color, #555);
      }

      .secondary:hover {
        background: var(--button-secondary-hover, #4c4c4c);
      }

      .connection-status {
        background: var(--success-background, rgba(0, 200, 0, 0.1));
        border: 1px solid var(--success-border, #00c800);
        border-radius: 6px;
        padding: 16px;
        margin-bottom: 20px;
      }

      .status-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .status-text {
        color: var(--success-color, #00c800);
        font-weight: 500;
      }

      .disconnect-btn {
        background: var(--error-color, #dc3545);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }

      .connection-details {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 8px;
      }

      .detail-item {
        display: flex;
        gap: 8px;
      }

      .detail-item .label {
        color: var(--text-muted, #999);
        font-weight: 500;
      }

      .detail-item .value {
        color: var(--text-color, #fff);
      }

      .file-browser {
        border: 1px solid var(--border-color, #555);
        border-radius: 6px;
        overflow: hidden;
      }

      .browser-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--header-background, #2d2d2d);
        border-bottom: 1px solid var(--border-color, #555);
      }

      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--text-color, #fff);
      }

      .breadcrumb-item {
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
      }

      .breadcrumb-item:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .browser-actions {
        display: flex;
        gap: 8px;
      }

      .refresh-btn, .filter-btn {
        background: var(--button-secondary, #3c3c3c);
        border: 1px solid var(--border-color, #555);
        color: var(--text-color, #fff);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }

      .file-list {
        max-height: 300px;
        overflow-y: auto;
      }

      .file-item {
        display: flex;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color, #333);
        cursor: pointer;
        transition: background-color 0.15s;
      }

      .file-item:hover {
        background: var(--hover-background, rgba(255, 255, 255, 0.05));
      }

      .file-item:last-child {
        border-bottom: none;
      }

      .file-icon {
        margin-right: 12px;
        font-size: 16px;
      }

      .file-info {
        flex: 1;
      }

      .file-name {
        color: var(--text-color, #fff);
        font-weight: 500;
      }

      .file-meta {
        color: var(--text-muted, #999);
        font-size: 12px;
        margin-top: 2px;
      }

      .loading-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: var(--text-muted, #999);
        gap: 12px;
      }

      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--border-color, #555);
        border-top-color: var(--accent-color, #007acc);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .empty-state {
        text-align: center;
        padding: 40px;
        color: var(--text-muted, #999);
      }

      .empty-state .icon {
        font-size: 32px;
        margin-bottom: 8px;
        display: block;
      }

      .error-section {
        background: var(--error-background, rgba(220, 53, 69, 0.1));
        border: 1px solid var(--error-border, #dc3545);
        border-radius: 6px;
        padding: 16px;
        margin-top: 16px;
      }

      .error-message {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
      }

      .error-text {
        color: var(--error-color, #dc3545);
        font-weight: 500;
      }

      .error-help {
        margin-left: 24px;
        color: var(--text-muted, #999);
        font-size: 14px;
      }
    `;

    document.head.appendChild(styles);
  }

  attachEventListeners() {
    // Close button
    this.container.querySelector('.close-btn').addEventListener('click', () => {
      this.hide();
    });

    // Provider selection
    this.container.querySelector('#provider-select').addEventListener('change', (e) => {
      this.updateProviderUI(e.target.value);
    });

    // Example buttons
    this.container.querySelectorAll('.example-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const example = e.target.getAttribute('data-example');
        this.setExample(example);
      });
    });

    // Auth type change
    this.container.querySelectorAll('input[name="auth-type"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.updateAuthUI();
      });
    });

    // Toggle token/credential visibility
    this.container.querySelector('.toggle-token-visibility')?.addEventListener('click', () => {
      this.togglePasswordVisibility('sas-token', '.toggle-token-visibility');
    });

    this.container.querySelector('.toggle-secret-visibility')?.addEventListener('click', () => {
      this.togglePasswordVisibility('secret-access-key', '.toggle-secret-visibility');
    });

    this.container.querySelector('.toggle-oauth-visibility')?.addEventListener('click', () => {
      this.togglePasswordVisibility('oauth-token', '.toggle-oauth-visibility');
    });

    // Auth help links
    this.container.querySelectorAll('.auth-help-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const provider = e.target.getAttribute('data-provider');
        this.showAuthHelp(provider);
      });
    });

    // Connect and test buttons
    this.container.querySelector('.connect-btn').addEventListener('click', () => {
      this.connect();
    });

    this.container.querySelector('.test-btn').addEventListener('click', () => {
      this.testConnection();
    });

    // Disconnect button
    this.container.querySelector('.disconnect-btn').addEventListener('click', () => {
      this.disconnect();
    });

    // File browser actions
    this.container.querySelector('.refresh-btn').addEventListener('click', () => {
      this.refreshFileList();
    });

    this.container.querySelector('.filter-btn').addEventListener('click', () => {
      this.toggleDataFileFilter();
    });
  }

  updateProviderUI(provider) {
    // Update URL placeholder
    const urlInput = this.container.querySelector('#storage-url');
    const placeholders = {
      adls: 'abfss://container@account.dfs.core.windows.net/path',
      s3: 's3://bucket-name/path',
      gcs: 'gs://bucket-name/path'
    };
    urlInput.placeholder = placeholders[provider] || '';

    // Show/hide auth options based on provider
    const adlsAuth = this.container.querySelectorAll('.adls-auth');
    const s3Auth = this.container.querySelectorAll('.s3-auth');
    const gcsAuth = this.container.querySelectorAll('.gcs-auth');

    // Hide all provider-specific auth options
    adlsAuth.forEach(el => el.style.display = provider === 'adls' ? 'flex' : 'none');
    s3Auth.forEach(el => el.style.display = provider === 's3' ? 'flex' : 'none');
    gcsAuth.forEach(el => el.style.display = provider === 'gcs' ? 'flex' : 'none');

    // Update example buttons
    this.updateExampleButtons(provider);

    // Reset auth selection and update UI
    this.resetAuthSelection(provider);
    this.updateAuthUI();
  }

  updateExampleButtons(provider) {
    const buttons = this.container.querySelectorAll('.example-btn');
    buttons.forEach(btn => {
      const example = btn.getAttribute('data-example');
      const isRelevant = example.startsWith(provider);
      btn.style.display = isRelevant ? 'inline-block' : 'none';
    });
  }

  resetAuthSelection(provider) {
    // Reset all radio buttons
    this.container.querySelectorAll('input[name="auth-type"]').forEach(radio => {
      radio.checked = false;
    });

    // Set default for each provider
    const defaults = {
      adls: 'sas',
      s3: 'credentials',
      gcs: 'oauth'
    };

    const defaultAuth = defaults[provider] || 'anonymous';
    const defaultRadio = this.container.querySelector(`input[name="auth-type"][value="${defaultAuth}"]`);
    if (defaultRadio && defaultRadio.closest('.radio-label').style.display !== 'none') {
      defaultRadio.checked = true;
    } else {
      // Fall back to anonymous if default not available
      const anonymousRadio = this.container.querySelector('input[name="auth-type"][value="anonymous"]');
      if (anonymousRadio) anonymousRadio.checked = true;
    }
  }

  setExample(type) {
    const urlInput = this.container.querySelector('#storage-url');
    const examples = {
      'adls-abfss': 'abfss://mycontainer@mystorageaccount.dfs.core.windows.net/data/',
      'adls-https': 'https://mystorageaccount.dfs.core.windows.net/mycontainer/data/',
      's3-bucket': 's3://my-bucket/data/',
      's3-https': 'https://my-bucket.s3.us-east-1.amazonaws.com/data/',
      'gcs-gs': 'gs://my-bucket/data/',
      'gcs-https': 'https://storage.googleapis.com/my-bucket/data/'
    };

    urlInput.value = examples[type] || '';
    urlInput.focus();

    // Auto-select appropriate provider if example is from different provider
    const provider = type.split('-')[0];
    const currentProvider = this.container.querySelector('#provider-select').value;
    if (provider !== currentProvider) {
      this.container.querySelector('#provider-select').value = provider;
      this.updateProviderUI(provider);
    }
  }

  updateAuthUI() {
    const authType = this.container.querySelector('input[name="auth-type"]:checked')?.value;

    // Hide all auth sections
    const sasSection = this.container.querySelector('.sas-token-section');
    const s3Section = this.container.querySelector('.s3-credentials-section');
    const gcsSection = this.container.querySelector('.gcs-oauth-section');

    sasSection.style.display = authType === 'sas' ? 'block' : 'none';
    s3Section.style.display = authType === 'credentials' ? 'block' : 'none';
    gcsSection.style.display = authType === 'oauth' ? 'block' : 'none';
  }

  togglePasswordVisibility(inputId, buttonSelector) {
    const input = this.container.querySelector(`#${inputId}`);
    const toggleBtn = this.container.querySelector(buttonSelector);

    if (input && toggleBtn) {
      if (input.type === 'password') {
        input.type = 'text';
        toggleBtn.textContent = '🙈';
      } else {
        input.type = 'password';
        toggleBtn.textContent = '👁️';
      }
    }
  }

  showAuthHelp(provider) {
    let instructions;

    switch (provider) {
      case 'adls':
        if (this.currentAdapter && this.currentAdapter.generateSasTokenInstructions) {
          instructions = this.currentAdapter.generateSasTokenInstructions();
        } else {
          instructions = {
            title: 'Azure Data Lake Storage Gen2 SAS Token',
            steps: [
              '1. Go to Azure Portal → Storage Account → Shared access signature',
              '2. Configure permissions: Blob service, Container & Object resources, Read & List permissions',
              '3. Set expiry time',
              '4. Click "Generate SAS and connection string"',
              '5. Copy the "SAS token" (starts with ?sv=...)'
            ]
          };
        }
        break;
      case 's3':
        instructions = {
          title: 'Amazon S3 Access Credentials',
          steps: [
            '1. Go to AWS Console → IAM → Users',
            '2. Create user with S3 permissions (S3ReadOnlyAccess policy)',
            '3. Go to Security Credentials → Create Access Key',
            '4. Copy Access Key ID and Secret Access Key',
            '5. For temporary access, use STS tokens'
          ]
        };
        break;
      case 'gcs':
        instructions = {
          title: 'Google Cloud Storage OAuth Token',
          steps: [
            '1. Go to Google Cloud Console → APIs & Services → Credentials',
            '2. Create OAuth 2.0 Client ID for web application',
            '3. Enable Cloud Storage API',
            '4. Use OAuth flow with scope: https://www.googleapis.com/auth/devstorage.read_only',
            '5. Or use: gcloud auth application-default print-access-token'
          ]
        };
        break;
      default:
        instructions = { title: 'Authentication Help', steps: ['Provider-specific instructions not available'] };
    }

    alert(`${instructions.title}\n\n${instructions.steps.join('\n')}`);
  }

  async connect() {
    const url = this.container.querySelector('#storage-url').value.trim();
    const provider = this.container.querySelector('#provider-select').value;
    const authType = this.container.querySelector('input[name="auth-type"]:checked')?.value;

    if (!url) {
      this.showError('Please enter a storage URL');
      return;
    }

    this.showLoading('Connecting...');

    try {
      // Get credentials based on provider and auth type
      const credentials = this.getCredentials(provider, authType);

      // Import and create appropriate adapter
      let AdapterClass;
      switch (provider) {
        case 'adls':
          const adlsModule = await import('../storage/ADLSGen2Adapter.js');
          AdapterClass = adlsModule.ADLSGen2Adapter;
          break;
        case 's3':
          const s3Module = await import('../storage/S3Adapter.js');
          AdapterClass = s3Module.S3Adapter;
          break;
        case 'gcs':
          const gcsModule = await import('../storage/GCSAdapter.js');
          AdapterClass = gcsModule.GCSAdapter;
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      this.currentAdapter = new AdapterClass();
      const result = await this.currentAdapter.connect(url, credentials);

      this.isConnected = true;
      this.currentProvider = provider;
      this.showConnectionSuccess(result);
      await this.loadFileList();

    } catch (error) {
      this.showError(error.message, this.getErrorHelp(error));
    }
  }

  getCredentials(provider, authType) {
    const credentials = {};

    if (authType === 'anonymous') {
      return credentials;
    }

    switch (provider) {
      case 'adls':
        if (authType === 'sas') {
          const sasToken = this.container.querySelector('#sas-token').value.trim();
          if (sasToken) credentials.sasToken = sasToken;
        }
        break;

      case 's3':
        if (authType === 'credentials') {
          const accessKeyId = this.container.querySelector('#access-key-id').value.trim();
          const secretAccessKey = this.container.querySelector('#secret-access-key').value.trim();
          const sessionToken = this.container.querySelector('#session-token').value.trim();

          if (accessKeyId) credentials.accessKeyId = accessKeyId;
          if (secretAccessKey) credentials.secretAccessKey = secretAccessKey;
          if (sessionToken) credentials.sessionToken = sessionToken;
        }
        break;

      case 'gcs':
        if (authType === 'oauth') {
          const oauthToken = this.container.querySelector('#oauth-token').value.trim();
          if (oauthToken) credentials.accessToken = oauthToken;
        }
        break;
    }

    return credentials;
  }

  async testConnection() {
    const url = this.container.querySelector('#storage-url').value.trim();
    const provider = this.container.querySelector('#provider-select').value;
    const authType = this.container.querySelector('input[name="auth-type"]:checked')?.value;

    if (!url) {
      this.showError('Please enter a storage URL');
      return;
    }

    this.showLoading('Testing connection...');

    try {
      // Get credentials
      const credentials = this.getCredentials(provider, authType);

      // Import and create appropriate adapter
      let AdapterClass;
      switch (provider) {
        case 'adls':
          const adlsModule = await import('../storage/ADLSGen2Adapter.js');
          AdapterClass = adlsModule.ADLSGen2Adapter;
          break;
        case 's3':
          const s3Module = await import('../storage/S3Adapter.js');
          AdapterClass = s3Module.S3Adapter;
          break;
        case 'gcs':
          const gcsModule = await import('../storage/GCSAdapter.js');
          AdapterClass = gcsModule.GCSAdapter;
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      const testAdapter = new AdapterClass();
      await testAdapter.connect(url, credentials);

      this.hideError();
      alert('✅ Connection test successful!');

    } catch (error) {
      this.showError(`Test failed: ${error.message}`, this.getErrorHelp(error));
    }
  }

  disconnect() {
    if (this.currentAdapter) {
      this.currentAdapter.disconnect();
    }
    this.currentAdapter = null;
    this.isConnected = false;
    this.showConnectionForm();
  }

  async loadFileList(path = '') {
    if (!this.currentAdapter) return;

    this.showFileLoading();

    try {
      const files = await this.currentAdapter.listFiles(path);
      this.displayFiles(files, path);
    } catch (error) {
      this.showError(`Failed to load files: ${error.message}`);
    }
  }

  displayFiles(files, currentPath) {
    const fileItems = this.container.querySelector('.file-items');
    const emptyState = this.container.querySelector('.empty-state');
    const loadingIndicator = this.container.querySelector('.loading-indicator');

    loadingIndicator.style.display = 'none';

    if (files.length === 0) {
      fileItems.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    fileItems.innerHTML = '';

    // Add parent directory link if not at root
    if (currentPath) {
      const parentItem = this.createFileItem({
        name: '..',
        isDirectory: true,
        path: this.getParentPath(currentPath)
      }, true);
      fileItems.appendChild(parentItem);
    }

    files.forEach(file => {
      const fileItem = this.createFileItem(file);
      fileItems.appendChild(fileItem);
    });
  }

  createFileItem(file, isParent = false) {
    const item = document.createElement('div');
    item.className = 'file-item';

    const icon = isParent ? '⬆️' : (file.isDirectory ? '📁' : this.getFileIcon(file.name));
    const size = file.isDirectory ? '' : this.formatFileSize(file.size);
    const lastModified = file.lastModified ? this.formatDate(file.lastModified) : '';

    item.innerHTML = `
      <span class="file-icon">${icon}</span>
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-meta">${size} ${lastModified}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      if (file.isDirectory || isParent) {
        this.loadFileList(file.path || file.name);
      } else {
        this.selectFile(file);
      }
    });

    return item;
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const icons = {
      'parquet': '📊',
      'arrow': '➡️',
      'feather': '🪶',
      'avro': '🔷',
      'orc': '🏛️',
      'jsonl': '📄',
      'ndjson': '📄',
      'json': '📋',
      'csv': '📈'
    };
    return icons[ext] || '📄';
  }

  async selectFile(file) {
    try {
      this.hide();

      // Download the file and process it
      const blob = await this.currentAdapter.downloadFile(file.path);
      const fileHandle = new File([blob], file.name, { type: blob.type });

      // Emit event for the main app to handle
      window.dispatchEvent(new CustomEvent('cloudFileSelected', {
        detail: { file: fileHandle, metadata: file }
      }));

    } catch (error) {
      this.showError(`Failed to load file: ${error.message}`);
    }
  }

  // UI State Management
  showConnectionForm() {
    this.container.querySelector('.connection-form').style.display = 'block';
    this.container.querySelector('.connection-status').style.display = 'none';
    this.container.querySelector('.file-browser').style.display = 'none';
  }

  showConnectionSuccess(connectionInfo) {
    this.container.querySelector('.connection-form').style.display = 'none';
    this.container.querySelector('.connection-status').style.display = 'block';
    this.container.querySelector('.file-browser').style.display = 'block';

    // Update connection details
    this.container.querySelector('.account-name').textContent = connectionInfo.accountName;
    this.container.querySelector('.container-name').textContent = connectionInfo.containerName;
    this.container.querySelector('.auth-type').textContent = connectionInfo.authType.toUpperCase();

    this.hideError();
  }

  showLoading(message) {
    // Could add a loading state to the connect button
    const connectBtn = this.container.querySelector('.connect-btn');
    connectBtn.textContent = message;
    connectBtn.disabled = true;
  }

  showFileLoading() {
    this.container.querySelector('.loading-indicator').style.display = 'flex';
    this.container.querySelector('.file-items').innerHTML = '';
    this.container.querySelector('.empty-state').style.display = 'none';
  }

  showError(message, help = null) {
    const errorSection = this.container.querySelector('.error-section');
    const errorText = this.container.querySelector('.error-text');
    const errorHelp = this.container.querySelector('.error-help');

    errorText.textContent = message;
    errorHelp.textContent = help || '';
    errorSection.style.display = 'block';

    // Reset connect button
    const connectBtn = this.container.querySelector('.connect-btn');
    connectBtn.textContent = 'Connect';
    connectBtn.disabled = false;
  }

  hideError() {
    this.container.querySelector('.error-section').style.display = 'none';
  }

  getErrorHelp(error) {
    if (this.currentAdapter && this.currentAdapter.getErrorHelp) {
      const help = this.currentAdapter.getErrorHelp(error);
      return `${help.problem}. ${help.solution}`;
    }
    return null;
  }

  // Utility methods
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(date) {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  getParentPath(path) {
    const parts = path.split('/').filter(p => p);
    parts.pop();
    return parts.join('/');
  }

  // Public methods
  show() {
    document.body.appendChild(this.container);

    // Add backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999;
    `;
    document.body.appendChild(this.backdrop);

    this.backdrop.addEventListener('click', () => this.hide());

    // Initialize UI for default provider
    const defaultProvider = this.container.querySelector('#provider-select').value;
    this.updateProviderUI(defaultProvider);
  }

  hide() {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }
  }

  showSasHelp() {
    if (this.currentAdapter && this.currentAdapter.generateSasTokenInstructions) {
      const instructions = this.currentAdapter.generateSasTokenInstructions();
      alert(`${instructions.title}\n\n${instructions.steps.join('\n')}\n\n⚠️ ${instructions.securityNote}`);
    }
  }
}