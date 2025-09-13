// Integration example: Adding multi-format support to existing Parquet viewer
// Place this script before the closing </body> tag in index.html

import { DataViewerApp } from './src/core/DataViewerApp.js';

// Global multi-format app instance
window.multiFormatApp = new DataViewerApp();

// Integration with existing UI
function integrateMultiFormatSupport() {
    console.log('🔄 Integrating multi-format support...');
    
    // Update file input to handle multiple formats
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        // Add support for additional formats
        const currentAccept = fileInput.getAttribute('accept') || '';
        const newAccept = currentAccept + ',.arrow,.feather,.avro,.jsonl,.ndjson,.orc';
        fileInput.setAttribute('accept', newAccept);
    }

    // Update drag and drop handler
    const dropZone = document.querySelector('.upload-area') || document.body;
    const originalDrop = dropZone.ondrop;
    
    dropZone.ondrop = async function(e) {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        
        if (files.length === 1) {
            const file = files[0];
            
            // Use multi-format detection
            const format = await multiFormatApp.detector.detect(file);
            console.log(`Detected format: ${format}`);
            
            if (format !== 'unknown') {
                await multiFormatApp.handleFileInput(file);
                return;
            }
        }
        
        // Fallback to original handler
        if (originalDrop) {
            originalDrop.call(this, e);
        }
    };

    // Add format detection badge
    addFormatBadge();
    
    // Add directory selection button  
    addDirectorySupport();
    
    // Add export options
    addExportOptions();

    // Setup event listeners
    setupEventListeners();
    
    console.log('✅ Multi-format support integrated successfully!');
}

function addFormatBadge() {
    const uploadArea = document.querySelector('.upload-area');
    if (uploadArea && !document.getElementById('formatBadge')) {
        const badge = document.createElement('div');
        badge.id = 'formatBadge';
        badge.className = 'format-badge hidden';
        badge.style.cssText = `
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            margin-top: 10px;
            text-transform: uppercase;
        `;
        uploadArea.appendChild(badge);
    }
}

function addDirectorySupport() {
    const controls = document.querySelector('.upload-controls') || 
                    document.querySelector('.upload-area') ||
                    document.body;
    
    if (!document.getElementById('selectDirectory')) {
        const dirButton = document.createElement('button');
        dirButton.id = 'selectDirectory';
        dirButton.className = 'btn btn-secondary';
        dirButton.innerHTML = '📂 Select Directory';
        dirButton.title = 'Select directory (Delta Lake tables)';
        dirButton.style.margin = '5px';
        
        dirButton.addEventListener('click', async () => {
            try {
                await multiFormatApp.selectLocalDirectory();
            } catch (error) {
                showError(`Directory selection failed: ${error.message}`);
            }
        });
        
        controls.appendChild(dirButton);
    }
}

function addExportOptions() {
    const existingExportContainer = document.querySelector('.export-controls');
    if (existingExportContainer && !document.getElementById('exportJSONL')) {
        // Add JSONL export option
        const jsonlBtn = document.createElement('button');
        jsonlBtn.id = 'exportJSONL';
        jsonlBtn.className = 'btn btn-outline';
        jsonlBtn.textContent = 'Export JSONL';
        jsonlBtn.addEventListener('click', () => {
            multiFormatApp.exportData('jsonl', { exportFiltered: true });
        });
        
        existingExportContainer.appendChild(jsonlBtn);
    }
}

function setupEventListeners() {
    // Format detection
    multiFormatApp.on('formatDetected', (data) => {
        const badge = document.getElementById('formatBadge');
        if (badge) {
            badge.textContent = data.format;
            badge.className = `format-badge format-${data.format}`;
            badge.classList.remove('hidden');
            
            // Update badge colors based on format
            const colors = {
                parquet: { bg: '#e3f2fd', color: '#1976d2' },
                arrow: { bg: '#f3e5f5', color: '#7b1fa2' },
                avro: { bg: '#e8f5e8', color: '#388e3c' },
                jsonl: { bg: '#fff3e0', color: '#f57c00' },
                orc: { bg: '#fce4ec', color: '#c2185b' },
                delta: { bg: '#e1f5fe', color: '#0288d1' }
            };
            
            const color = colors[data.format] || { bg: '#f5f5f5', color: '#666' };
            badge.style.backgroundColor = color.bg;
            badge.style.color = color.color;
        }
        
        console.log(`Format detected: ${data.format} (confidence: ${data.confidence})`);
    });

    // Loading updates - integrate with existing loading UI
    multiFormatApp.on('loading', (data) => {
        const existingProgressUpdate = window.updateProgress;
        if (existingProgressUpdate) {
            existingProgressUpdate(data.progress, data.message);
        } else {
            console.log(`Loading: ${data.message} (${data.progress}%)`);
        }
    });

    // Data loaded - integrate with existing display functions
    multiFormatApp.on('loadComplete', (data) => {
        console.log(`Loaded ${data.rowCount} rows from ${data.format} file`);
        
        // Use existing display functions if available
        if (window.displayData) {
            window.displayData(data.data);
        }
        
        if (window.updateMetadata) {
            window.updateMetadata(data.metadata);
        }
        
        if (window.updateStatistics) {
            window.updateStatistics(data.statistics);
        }
        
        // Show success message
        if (window.showToast) {
            window.showToast(`Successfully loaded ${data.rowCount} rows from ${data.format} file`, 'success');
        }

        // Update window state for compatibility
        window.state = {
            ...window.state,
            selectedFile: { name: data.format + ' file' },
            currentData: data.data,
            metadata: data.metadata,
            schema: data.schema,
            filteredData: data.data
        };
    });

    // Error handling
    multiFormatApp.on('error', (message) => {
        console.error('Multi-format error:', message);
        
        if (window.showError) {
            window.showError(message);
        } else if (window.showToast) {
            window.showToast(message, 'error');
        } else {
            alert('Error: ' + message);
        }
    });

    // Data manipulation events - integrate with existing table updates
    multiFormatApp.on('dataFiltered', (data) => {
        if (window.updateDataDisplay) {
            window.updateDataDisplay(data.data);
        }
    });

    multiFormatApp.on('dataSorted', (data) => {
        if (window.updateDataDisplay) {
            window.updateDataDisplay(data.data);
        }
    });
}

// Override existing file handling function if it exists
if (window.handleFiles) {
    const originalHandleFiles = window.handleFiles;
    
    window.handleFiles = async function(files) {
        if (files.length === 1) {
            const file = files[0];
            
            // Try multi-format detection first
            const format = await multiFormatApp.detector.detect(file);
            
            if (format !== 'unknown' && format !== 'parquet') {
                // Handle non-Parquet formats with multi-format viewer
                await multiFormatApp.handleFileInput(file);
                return;
            }
        }
        
        // Fall back to original Parquet-specific handling
        return originalHandleFiles.call(this, files);
    };
}

// Initialize integration when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', integrateMultiFormatSupport);
} else {
    integrateMultiFormatSupport();
}

// Utility function to show enhanced format info
function showFormatInfo(format, metadata) {
    const infoContainer = document.querySelector('.format-info') || 
                         document.querySelector('.info-cards') ||
                         createInfoContainer();
    
    const formatCapabilities = {
        parquet: 'Full support: metadata, statistics, compression info',
        arrow: 'Full support: columnar data, streaming, metadata',
        avro: 'Basic support: schema detection, data reading',
        jsonl: 'Full support: streaming, validation, schema inference',
        orc: 'Limited support: metadata detection only',
        delta: 'Basic support: transaction log, version history'
    };
    
    const capability = formatCapabilities[format] || 'Basic format support';
    
    infoContainer.innerHTML = `
        <div class="format-details">
            <h4>📄 ${format.toUpperCase()} Format</h4>
            <p><strong>Capability:</strong> ${capability}</p>
            <div class="metadata-summary">
                ${Object.entries(metadata || {}).slice(0, 5).map(([key, value]) => 
                    `<span class="metadata-item"><strong>${key}:</strong> ${JSON.stringify(value)}</span>`
                ).join('')}
            </div>
        </div>
    `;
}

function createInfoContainer() {
    const container = document.createElement('div');
    container.className = 'format-info';
    container.style.cssText = `
        margin: 20px 0;
        padding: 15px;
        border: 1px solid var(--vscode-border);
        border-radius: 4px;
        background: var(--vscode-panel-bg);
    `;
    
    const uploadArea = document.querySelector('.upload-area') || document.body;
    uploadArea.appendChild(container);
    
    return container;
}

// Export integration status
window.multiFormatIntegration = {
    version: '2.0.0',
    status: 'ready',
    supportedFormats: ['parquet', 'arrow', 'feather', 'avro', 'jsonl', 'ndjson', 'orc', 'delta'],
    app: multiFormatApp
};

console.log('🎯 Multi-format integration loaded successfully!');
console.log('Supported formats:', window.multiFormatIntegration.supportedFormats);