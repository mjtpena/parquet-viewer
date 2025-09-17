# ⚡ Multi-Format Data Viewer

A powerful, modern, browser-based data viewer that supports multiple formats (Parquet, Arrow, Avro, JSONL, ORC, Delta Lake, Iceberg) and **connects directly to cloud storage** (Azure, S3, GCS). Runs entirely in your browser with zero uploads required. Analyze and explore your data files privately and securely with advanced features and beautiful UI.

![Multi-Format Data Viewer Screenshot](https://via.placeholder.com/800x400/1e1e1e/ffffff?text=🗃️+Multi-Format+Data+Viewer+-+Modern+Browser-based+Analytics)

## 🌟 Features

### 🔒 Privacy & Security
- **100% Private**: All processing happens in your browser - no server uploads
- **No Installation Required**: Just open the web app and start analyzing
- **Local Processing**: All parsing and analysis happens on your device
- **No Data Storage**: Files are not saved or cached anywhere
- **Direct Cloud Access**: Connect to your cloud storage without proxies or backends

### ☁️ Cloud Storage Integration
- **Azure Data Lake Storage Gen2**: SAS token authentication, multiple URL formats
- **Amazon S3**: Access key authentication, supports S3-compatible services
- **Google Cloud Storage**: OAuth token authentication, public bucket support
- **Enterprise Ready**: Temporary credentials, CORS-aware, secure browser access

### 📊 Data Analysis & Editing
- **Advanced Schema Inspection**: View column types, encodings, compression, and metadata
- **Smart Data Preview**: Browse through your data with intelligent pagination
- **In-Place Data Editing**: Click any cell to edit values with real-time modification tracking
- **Real-time Search**: Search across all data with instant filtering
- **Column Sorting**: Click any column header to sort data
- **Data Statistics**: Automatic calculation of null counts, unique values, and data types
- **Performance Metrics**: Track processing speed and memory usage
- **View/Edit Mode Toggle**: Switch between viewing and editing modes

### 🎨 Modern Interface
- **Drag & Drop Support**: Simply drag data files onto the interface
- **VSCode-Like Themes**: Beautiful dark and light themes with proper contrast
- **Responsive Design**: Beautiful interface that works on all devices
- **Collapsible Tree Views**: Organized metadata display with expandable sections
- **Enhanced Data Tables**: Sticky headers, row numbers, and type-specific cell styling
- **In-Place Editing**: Click-to-edit data cells with modification tracking
- **Progress Indicators**: Real-time feedback during file processing
- **Keyboard Shortcuts**: Efficient navigation with keyboard commands

### 📤 Export & Save Options
- **Export Modified CSV**: Save your data modifications as CSV files
- **Export Original Data**: Export as CSV or JSON formats
- **Schema Export**: Download schema definitions
- **Smart Filename Generation**: Automatic naming based on source file
- **Large File Support**: Handle files up to 500MB efficiently

### ⚡ Performance
- **Lightning Fast**: Powered by the lightweight [hyparquet](https://github.com/hyparam/hyparquet) library
- **Memory Optimized**: Efficient handling of large datasets
- **Streaming Processing**: Progressive loading with status updates
- **Browser Optimized**: Tested across all modern browsers

## 🚀 Live Demo

**Try it now:** [https://mjtpena.github.io/parquet-viewer](https://mjtpena.github.io/parquet-viewer)

## 📋 What You Can Analyze

### 📁 File Information
- File name, size, and format version
- Total rows and columns
- Row groups and compression info
- Processing performance metrics

### 🏗️ Schema Details
- Column names, data types, and nullability
- Parquet-specific encodings and compression
- Repetition types and converted types
- Storage size analysis with compression ratios

### 📊 Data Exploration
- **Paginated Data View**: Navigate through large datasets efficiently
- **Smart Search**: Find data across all columns instantly
- **Column Sorting**: Sort by any column in ascending/descending order
- **Type-Aware Display**: Different styling for strings, numbers, booleans, nulls
- **Row-by-Row Navigation**: Jump to specific pages or use keyboard navigation

### 📈 Advanced Statistics
- Null value counts and percentages
- Data type distribution analysis
- Unique value counting
- Column-specific compression statistics

## 🔧 How It Works

### 📂 Local Files
1. **📂 Select or Drop** a data file in any supported format (up to 500MB)
2. **⚡ Automatic Processing** with real-time progress updates
3. **🔍 Explore Schema** - inspect column types, encodings, and metadata in collapsible tree views
4. **📊 Browse & Edit Data** - search, sort, navigate, and edit data in-place
5. **💾 Export Modified Data** - download your modifications as CSV files

### ☁️ Cloud Storage
1. **🔗 Connect to Cloud Storage** - click the cloud button in the interface
2. **🎯 Select Provider** - choose Azure, S3, or Google Cloud Storage
3. **📋 Enter Details** - paste your storage URL and add credentials
4. **🌐 Browse Files** - navigate your cloud storage like a desktop app
5. **📊 Analyze Data** - click any data file to load and analyze instantly

## 🛠️ Technical Details

### Architecture
- **Pure Client-Side**: Built with vanilla JavaScript (ES6 modules)
- **Zero Dependencies**: No frameworks or build processes required
- **Single File**: Everything in one HTML file for easy deployment
- **Web Standards**: Uses modern browser APIs for optimal performance

### Libraries Used
- **[Hyparquet v1.16.0](https://github.com/hyparam/hyparquet)**: Fast, lightweight Parquet parser
- **Apache Arrow**: In-browser Arrow file processing
- **AVSC**: Avro schema and data processing
- **Cloud APIs**: Direct REST API integration (Azure, S3, GCS)
- **No heavy frameworks**: Keeps the application fast and secure

### Browser Support
- **Chrome 80+** ✅
- **Firefox 80+** ✅ 
- **Safari 14+** ✅
- **Edge 80+** ✅

### Performance Characteristics
- **File Size Limit**: 500MB (browser memory dependent)
- **Processing Speed**: ~50,000-100,000 rows/second
- **Memory Usage**: ~2-3x file size during processing
- **Supported Encodings**: All standard Parquet encodings
- **Compression Support**: GZIP, Snappy, LZ4, ZSTD

## ☁️ Cloud Storage Setup

### Azure Data Lake Storage Gen2
```
URL formats supported:
• abfss://container@account.dfs.core.windows.net/path
• https://account.dfs.core.windows.net/container/path
• https://account.blob.core.windows.net/container/path

Authentication:
• SAS Token (recommended for browser use)
• Anonymous/Public (for public containers)
```

### Amazon S3
```
URL formats supported:
• s3://bucket-name/path
• https://bucket-name.s3.region.amazonaws.com/path
• https://s3.region.amazonaws.com/bucket-name/path

Authentication:
• Access Key ID + Secret Access Key
• Session Token (for temporary credentials)
• Anonymous/Public (for public buckets)
```

### Google Cloud Storage
```
URL formats supported:
• gs://bucket-name/path
• https://storage.googleapis.com/bucket-name/path
• https://bucket-name.storage.googleapis.com/path

Authentication:
• OAuth Access Token (get via: gcloud auth print-access-token)
• Anonymous/Public (for public buckets)
```

## 🎯 Use Cases

### 👨‍💻 Developers
- **API Testing**: Quickly inspect Parquet responses
- **Data Pipeline Debugging**: Verify intermediate file formats
- **Schema Validation**: Ensure data types match expectations
- **Performance Analysis**: Check compression and encoding efficiency

### 📊 Data Analysts
- **Quick Data Inspection**: View file contents without heavy tools
- **Data Quality Assessment**: Check for nulls, duplicates, and anomalies
- **Schema Documentation**: Understand data structure and types
- **Sample Data Extraction**: Export subsets for further analysis

### 🏢 Business Users
- **Report Verification**: Confirm data exports are correct
- **Data Sharing**: Convert Parquet to accessible formats
- **File Validation**: Ensure data integrity before processing
- **Quick Previews**: Get instant insights without technical setup

## ⌨️ Keyboard Shortcuts

- **`Ctrl+F`**: Focus search box
- **`←` / `→`**: Navigate between pages
- **`Ctrl+S`**: Export modified data as CSV
- **`Ctrl+E`**: Export original data as CSV
- **`Esc`**: Reset view/clear search
- **`?`**: Toggle keyboard shortcuts help

## 🌐 Deployment Options

### GitHub Pages (Recommended)
```bash
# Fork the repository and enable GitHub Pages
git clone https://github.com/yourusername/parquet-viewer.git
cd parquet-viewer
# Enable GitHub Pages in repository settings
```

### Local Development
```bash
# Clone and serve locally
git clone https://github.com/mjtpena/parquet-viewer.git
cd parquet-viewer
# Open index.html in your browser or serve with any web server
python -m http.server 8000  # Python 3
# or
npx serve .  # Node.js
```

### Self-Hosting
Simply download `index.html` and serve it from any web server. No build process or dependencies required.

## 🔒 Privacy & Security Features

- **No Network Requests**: After initial page load, everything runs offline
- **No Telemetry**: No analytics, tracking, or data collection
- **No External Dependencies**: All code is self-contained
- **No Server Storage**: Files never leave your device
- **Memory Management**: Automatic cleanup after processing
- **Secure Processing**: Files are processed in isolated browser context

## 🐛 Troubleshooting

### Common Issues

**Q: File won't load or shows error**
- Ensure file is a valid Parquet format
- Check file size is under 500MB
- Try with a different browser
- Verify file isn't corrupted

**Q: Browser runs out of memory**
- Use a smaller file or close other browser tabs
- Try increasing browser memory limits
- Consider using a 64-bit browser

**Q: Performance is slow**
- Close unnecessary browser tabs
- Disable browser extensions temporarily
- Use a modern browser version
- Check available system memory

**Q: Features not working**
- Enable JavaScript in your browser
- Update to a supported browser version
- Clear browser cache and reload

## 📊 Supported Parquet Features

### Data Types ✅
- Primitive types (INT32, INT64, FLOAT, DOUBLE, BOOLEAN, BYTE_ARRAY)
- Logical types (STRING, TIMESTAMP, DECIMAL, etc.)
- Complex types (basic support for nested structures)

### Compression ✅
- GZIP, Snappy, LZ4, ZSTD
- Uncompressed files
- Compression ratio analysis

### Encodings ✅
- Plain, Dictionary, RLE
- Delta encoding variants
- All standard Parquet encodings

### Not Yet Supported ⏳
- Complex nested schemas (deep nesting)
- Map and List types (full support)
- Advanced filtering predicates
- Multi-file datasets

## 📄 License

**MIT License** - Free for personal and commercial use. See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Start for Contributors
1. Fork the repository
2. Make your changes to `index.html`
3. Test across different browsers and file types
4. Submit a pull request with clear description

### Priority Areas
- Performance optimizations for large files
- Support for complex nested types
- Advanced filtering and search
- Additional export formats
- Accessibility improvements

## ⭐ Support the Project

If you find Multi-Format Data Viewer useful:

- ⭐ **Star the repository** on GitHub
- 🐛 **Report bugs** and request features
- 🔄 **Share with colleagues** who work with data files
- 💡 **Contribute improvements** via pull requests
- 📢 **Spread the word** on social media

## 🔗 Related Projects

- **[Apache Parquet](https://parquet.apache.org/)**: The Parquet format specification
- **[Hyparquet](https://github.com/hyparam/hyparquet)**: The JavaScript Parquet parser we use
- **[Apache Arrow](https://arrow.apache.org/)**: Columnar data format and processing libraries
- **[DuckDB](https://duckdb.org/)**: Fast analytical database with Parquet support

## 📈 Project Stats

![GitHub stars](https://img.shields.io/github/stars/mjtpena/parquet-viewer?style=social)
![GitHub forks](https://img.shields.io/github/forks/mjtpena/parquet-viewer?style=social)
![GitHub issues](https://img.shields.io/github/issues/mjtpena/parquet-viewer)
![GitHub license](https://img.shields.io/github/license/mjtpena/parquet-viewer)

---

**Made with ❤️ for the data community**