# ⚡ Parquet Viewer

A modern, browser-based Parquet file viewer that runs entirely in your browser with zero uploads required. Analyze and explore your Parquet files privately and securely.

## 🌟 Features

- **100% Private**: All processing happens in your browser - no server uploads
- **No Installation Required**: Just open the web app and start analyzing
- **Drag & Drop Support**: Simply drag Parquet files onto the interface
- **Schema Inspection**: View column types, encodings, and metadata
- **Data Preview**: Browse through your data with pagination
- **Export Options**: Export filtered data to CSV or JSON
- **Modern Design**: Beautiful, responsive interface that works on all devices
- **Fast Performance**: Powered by the lightweight [hyparquet](https://github.com/hyparam/hyparquet) library

## 🚀 Live Demo

Visit the live application: [https://mjtpena.github.io/parquet-viewer](https://mjtpena.github.io/parquet-viewer)

## 📋 What You Can View

- **File Information**: Name, size, row count, column count
- **Schema Details**: Column names, data types, nullability
- **Data Preview**: Paginated view of your data (50 rows at a time)
- **Export Capabilities**: Download as CSV or JSON format

## 🔧 How It Works

1. **Select or Drop** a `.parquet` file onto the interface
2. **View Schema** - inspect column types and structure
3. **Browse Data** - paginate through your data rows
4. **Export Results** - download filtered data in your preferred format

## 🛠️ Technical Details

- Built with vanilla JavaScript (ES6 modules)
- Uses the [hyparquet](https://cdn.jsdelivr.net/npm/hyparquet@1.16.0/+esm) library for Parquet parsing
- No backend required - fully client-side processing
- Responsive design with CSS Grid and Flexbox
- Modern browser support (Chrome, Firefox, Safari, Edge)

## 🎯 Use Cases

- **Data Analysis**: Quick inspection of Parquet files without heavy tools
- **Data Quality**: Check schema and sample data before processing
- **File Verification**: Ensure Parquet files are properly formatted
- **Data Export**: Convert Parquet data to more accessible formats
- **Schema Documentation**: Understand data structure and types

## 🔒 Privacy & Security

- **No Data Upload**: Files are processed entirely in your browser
- **No Network Requests**: After initial page load, no external calls are made
- **Local Processing**: All parsing and analysis happens on your device
- **No Data Storage**: Files are not saved or cached anywhere

## 🌐 Browser Compatibility

- Chrome 80+
- Firefox 80+
- Safari 14+
- Edge 80+

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## ⭐ Support

If you find this tool useful, please consider giving it a star on GitHub!