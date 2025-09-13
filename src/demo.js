import { DataViewerApp } from './core/DataViewerApp.js';

// Demo script showing how to integrate the multi-format data viewer
class MultiFormatViewerDemo {
  constructor() {
    this.app = new DataViewerApp();
    this.setupEventHandlers();
    this.initializeUI();
  }

  setupEventHandlers() {
    // Loading events
    this.app.on('loading', (data) => {
      this.showLoading(data.message, data.progress);
    });

    // Format detection
    this.app.on('formatDetected', (data) => {
      console.log(`Detected format: ${data.format} (confidence: ${data.confidence})`);
      this.updateFormatBadge(data.format);
    });

    // Metadata loaded
    this.app.on('metadataLoaded', (data) => {
      console.log('Metadata loaded:', data.metadata);
      this.displayMetadata(data.metadata, data.schema);
    });

    // Data loaded
    this.app.on('loadComplete', (data) => {
      console.log(`Data loaded: ${data.rowCount} rows from ${data.format} file`);
      this.displayData(data.data, data.schema);
      this.displayStatistics(data.statistics);
      this.hideLoading();
    });

    // Error handling
    this.app.on('error', (message) => {
      console.error('Error:', message);
      this.showError(message);
      this.hideLoading();
    });

    // Success messages
    this.app.on('success', (message) => {
      console.log('Success:', message);
      this.showSuccess(message);
    });

    // Cloud storage events
    this.app.on('cloudConnected', (data) => {
      console.log(`Connected to ${data.provider}:`, data.info);
      this.updateCloudStorageStatus(data.provider, true);
    });

    // Data manipulation events
    this.app.on('dataFiltered', (data) => {
      this.displayData(data.data, null);
      this.updatePagination(data.pagination);
    });

    this.app.on('dataSorted', (data) => {
      this.displayData(data.data, null);
      this.updateSortIndicator(data.sort);
    });

    this.app.on('searchResults', (data) => {
      this.displayData(data.data, null);
      this.updateSearchResults(data.query, data.pagination.total);
    });
  }

  initializeUI() {
    // Create basic UI elements
    this.createUploadArea();
    this.createFormatInfo();
    this.createDataTable();
    this.createStatisticsPanel();
    this.createControlPanel();
  }

  createUploadArea() {
    const uploadArea = document.createElement('div');
    uploadArea.className = 'upload-area';
    uploadArea.innerHTML = `
      <div class="upload-content">
        <h3>Multi-Format Data Viewer</h3>
        <p>Supports: Parquet, Arrow, Avro, ORC, JSON Lines, Delta Lake</p>
        
        <div class="upload-options">
          <button id="selectFiles" class="btn btn-primary">
            📁 Select Files
          </button>
          <button id="selectDirectory" class="btn btn-secondary">
            📂 Select Directory
          </button>
        </div>
        
        <div class="cloud-options">
          <button id="connectGDrive" class="btn btn-outline">
            ☁️ Google Drive
          </button>
          <button id="connectDropbox" class="btn btn-outline">
            ☁️ Dropbox
          </button>
        </div>
        
        <div class="format-badge hidden" id="formatBadge"></div>
      </div>
    `;
    
    document.body.appendChild(uploadArea);
    this.setupUploadHandlers(uploadArea);
  }

  createFormatInfo() {
    const formatInfo = document.createElement('div');
    formatInfo.className = 'format-info hidden';
    formatInfo.id = 'formatInfo';
    formatInfo.innerHTML = `
      <div class="format-details">
        <div class="format-name"></div>
        <div class="format-metadata"></div>
        <div class="format-capabilities"></div>
      </div>
    `;
    
    document.body.appendChild(formatInfo);
  }

  createDataTable() {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container hidden';
    tableContainer.id = 'tableContainer';
    tableContainer.innerHTML = `
      <div class="table-controls">
        <input type="text" id="searchInput" placeholder="Search data..." />
        <select id="pageSizeSelect">
          <option value="100">100 rows</option>
          <option value="500">500 rows</option>
          <option value="1000" selected>1000 rows</option>
        </select>
      </div>
      
      <div class="table-wrapper">
        <table id="dataTable" class="data-table">
          <thead id="tableHead"></thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      
      <div class="pagination" id="pagination"></div>
    `;
    
    document.body.appendChild(tableContainer);
    this.setupTableHandlers(tableContainer);
  }

  createStatisticsPanel() {
    const statsPanel = document.createElement('div');
    statsPanel.className = 'statistics-panel hidden';
    statsPanel.id = 'statisticsPanel';
    statsPanel.innerHTML = `
      <h3>Data Statistics</h3>
      <div class="stats-content" id="statsContent"></div>
    `;
    
    document.body.appendChild(statsPanel);
  }

  createControlPanel() {
    const controlPanel = document.createElement('div');
    controlPanel.className = 'control-panel hidden';
    controlPanel.id = 'controlPanel';
    controlPanel.innerHTML = `
      <div class="controls">
        <button id="exportJSON" class="btn btn-small">Export JSON</button>
        <button id="exportCSV" class="btn btn-small">Export CSV</button>
        <button id="exportJSONL" class="btn btn-small">Export JSONL</button>
        <button id="clearFilters" class="btn btn-small">Clear Filters</button>
      </div>
    `;
    
    document.body.appendChild(controlPanel);
    this.setupControlHandlers(controlPanel);
  }

  setupUploadHandlers(uploadArea) {
    const selectFilesBtn = uploadArea.querySelector('#selectFiles');
    const selectDirBtn = uploadArea.querySelector('#selectDirectory');
    const gdriveBtn = uploadArea.querySelector('#connectGDrive');
    const dropboxBtn = uploadArea.querySelector('#connectDropbox');

    selectFilesBtn.addEventListener('click', () => {
      this.app.selectLocalFiles({
        accept: ['.parquet', '.arrow', '.feather', '.avro', '.orc', '.jsonl', '.ndjson']
      });
    });

    selectDirBtn.addEventListener('click', () => {
      this.app.selectLocalDirectory();
    });

    gdriveBtn.addEventListener('click', () => {
      const clientId = prompt('Enter Google Drive Client ID:');
      if (clientId) {
        this.app.connectCloudStorage('gdrive', clientId);
      }
    });

    dropboxBtn.addEventListener('click', () => {
      const clientId = prompt('Enter Dropbox App Key:');
      if (clientId) {
        this.app.connectCloudStorage('dropbox', clientId);
      }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', async (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await this.app.handleFileInput(files[0]);
      }
    });
  }

  setupTableHandlers(tableContainer) {
    const searchInput = tableContainer.querySelector('#searchInput');
    const pageSizeSelect = tableContainer.querySelector('#pageSizeSelect');

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.app.search(e.target.value);
      }, 300);
    });

    pageSizeSelect.addEventListener('change', (e) => {
      this.app.changePage(1, parseInt(e.target.value));
    });
  }

  setupControlHandlers(controlPanel) {
    const exportJSONBtn = controlPanel.querySelector('#exportJSON');
    const exportCSVBtn = controlPanel.querySelector('#exportCSV');
    const exportJSONLBtn = controlPanel.querySelector('#exportJSONL');
    const clearFiltersBtn = controlPanel.querySelector('#clearFilters');

    exportJSONBtn.addEventListener('click', () => {
      this.app.exportData('json', { exportFiltered: true });
    });

    exportCSVBtn.addEventListener('click', () => {
      this.app.exportData('csv', { exportFiltered: true });
    });

    exportJSONLBtn.addEventListener('click', () => {
      this.app.exportData('jsonl', { exportFiltered: true });
    });

    clearFiltersBtn.addEventListener('click', () => {
      this.app.engine.clearFilters();
      const page = this.app.engine.getPage();
      this.displayData(page.data, null);
    });
  }

  // UI Update Methods
  showLoading(message, progress = 0) {
    let loader = document.getElementById('loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'loader';
      loader.className = 'loading-overlay';
      document.body.appendChild(loader);
    }
    
    loader.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p>${message}</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
      </div>
    `;
    loader.style.display = 'flex';
  }

  hideLoading() {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.style.display = 'none';
    }
  }

  updateFormatBadge(format) {
    const badge = document.getElementById('formatBadge');
    badge.textContent = format.toUpperCase();
    badge.className = `format-badge format-${format}`;
    badge.classList.remove('hidden');
  }

  displayMetadata(metadata, schema) {
    const formatInfo = document.getElementById('formatInfo');
    const metadataDiv = formatInfo.querySelector('.format-metadata');
    
    metadataDiv.innerHTML = `
      <h4>Metadata</h4>
      <ul>
        ${Object.entries(metadata).map(([key, value]) => 
          `<li><strong>${key}:</strong> ${JSON.stringify(value)}</li>`
        ).join('')}
      </ul>
      
      <h4>Schema</h4>
      <ul>
        ${Object.entries(schema || {}).map(([column, type]) => 
          `<li><strong>${column}:</strong> ${type}</li>`
        ).join('')}
      </ul>
    `;
    
    formatInfo.classList.remove('hidden');
  }

  displayData(data, schema) {
    const tableContainer = document.getElementById('tableContainer');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    
    if (!data || data.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="100%">No data to display</td></tr>';
      return;
    }

    // Get columns
    const columns = schema ? Object.keys(schema) : Object.keys(data[0] || {});
    
    // Create header
    tableHead.innerHTML = `
      <tr>
        ${columns.map(column => `
          <th>
            <button class="sort-btn" onclick="demo.sortColumn('${column}')">
              ${column}
            </button>
          </th>
        `).join('')}
      </tr>
    `;
    
    // Create rows
    tableBody.innerHTML = data.slice(0, 100).map(row => `
      <tr>
        ${columns.map(column => `
          <td>${this.formatCellValue(row[column])}</td>
        `).join('')}
      </tr>
    `).join('');
    
    tableContainer.classList.remove('hidden');
    document.getElementById('controlPanel').classList.remove('hidden');
  }

  displayStatistics(statistics) {
    const statsContent = document.getElementById('statsContent');
    const statsPanel = document.getElementById('statisticsPanel');
    
    if (!statistics) return;
    
    statsContent.innerHTML = `
      <div class="overall-stats">
        <h4>Overall Statistics</h4>
        <p><strong>Total Rows:</strong> ${statistics.totalRows}</p>
        <p><strong>Memory Usage:</strong> ${this.formatBytes(statistics.memoryUsage)}</p>
      </div>
      
      <div class="column-stats">
        <h4>Column Statistics</h4>
        ${Object.entries(statistics.columns || {}).map(([column, stats]) => `
          <div class="column-stat">
            <strong>${column}</strong> (${stats.type})<br>
            Count: ${stats.count}, Null: ${stats.nullCount} (${stats.nullPercentage.toFixed(1)}%)<br>
            Unique: ${stats.uniqueValues}
            ${stats.min !== undefined ? `<br>Min: ${stats.min}, Max: ${stats.max}, Avg: ${stats.mean?.toFixed(2)}` : ''}
            ${stats.minLength !== undefined ? `<br>Length: ${stats.minLength}-${stats.maxLength} (avg: ${stats.avgLength?.toFixed(1)})` : ''}
          </div>
        `).join('')}
      </div>
    `;
    
    statsPanel.classList.remove('hidden');
  }

  formatCellValue(value) {
    if (value === null || value === undefined) return '<em>null</em>';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 50) + '...';
    }
    return String(value);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
      successDiv.remove();
    }, 3000);
  }

  // Public methods for UI interaction
  sortColumn(column) {
    // Toggle sort direction
    const currentSort = this.app.engine.sortOptions;
    const direction = (currentSort && currentSort.column === column && currentSort.direction === 'asc') 
      ? 'desc' : 'asc';
    
    this.app.applySort(column, direction);
  }

  filterColumn(column, filterType, value) {
    this.app.applyFilter(column, { type: filterType, value });
  }
}

// Initialize demo when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.demo = new MultiFormatViewerDemo();
  
  // Add basic styles
  const style = document.createElement('style');
  style.textContent = `
    .upload-area {
      border: 2px dashed #ccc;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      margin: 20px;
      background: #f9f9f9;
    }
    
    .upload-area.drag-over {
      border-color: #007acc;
      background: #e6f3ff;
    }
    
    .btn {
      padding: 10px 20px;
      margin: 5px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: #007acc;
      color: white;
    }
    
    .btn:hover { background: #005a9e; }
    .btn-secondary { background: #6c757d; }
    .btn-outline { background: transparent; border: 1px solid #007acc; color: #007acc; }
    .btn-small { padding: 5px 10px; font-size: 0.9em; }
    
    .format-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: bold;
      margin-top: 10px;
    }
    
    .format-parquet { background: #e1f5fe; color: #0277bd; }
    .format-arrow { background: #f3e5f5; color: #7b1fa2; }
    .format-avro { background: #e8f5e8; color: #2e7d32; }
    .format-jsonl { background: #fff3e0; color: #f57c00; }
    
    .hidden { display: none; }
    
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }
    
    .loading-content {
      background: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #007acc;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 10px;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .progress-bar {
      width: 200px;
      height: 4px;
      background: #f0f0f0;
      border-radius: 2px;
      margin: 10px auto;
    }
    
    .progress-fill {
      height: 100%;
      background: #007acc;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    
    .data-table th, .data-table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    
    .data-table th {
      background: #f5f5f5;
      font-weight: bold;
    }
    
    .sort-btn {
      background: none;
      border: none;
      cursor: pointer;
      width: 100%;
      text-align: left;
    }
    
    .error-message, .success-message {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 1001;
    }
    
    .error-message {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .success-message {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
  `;
  
  document.head.appendChild(style);
});

export { MultiFormatViewerDemo };