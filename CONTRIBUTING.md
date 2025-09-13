# Contributing to Multi-Format Data Viewer

Thank you for your interest in contributing to Multi-Format Data Viewer! This document provides guidelines for contributing to the project.

## 🌟 Ways to Contribute

- **Bug Reports**: Report issues you encounter
- **Feature Requests**: Suggest new functionality
- **Code Contributions**: Submit bug fixes or new features
- **Documentation**: Improve documentation and examples
- **Testing**: Help test the application with different data file formats

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/parquet-viewer.git
   cd parquet-viewer
   ```
3. **Open `index.html`** in your browser to test the application

## 🐛 Reporting Bugs

When reporting bugs, please include:

- **Clear description** of the issue
- **Steps to reproduce** the problem
- **Expected behavior** vs actual behavior
- **Browser and version** information
- **Sample data file** (if possible) or description of file structure
- **Error messages** from browser console (if any)

### Bug Report Template

```markdown
**Bug Description:**
A clear description of what the bug is.

**Steps to Reproduce:**
1. Go to '...'
2. Click on '...'
3. Upload file '...'
4. See error

**Expected Behavior:**
What you expected to happen.

**Actual Behavior:**
What actually happened.

**Environment:**
- Browser: [e.g. Chrome 91.0]
- OS: [e.g. macOS 12.0]
- File size: [e.g. 10MB]
- File structure: [brief description]

**Additional Context:**
Any other context about the problem.
```

## 💡 Feature Requests

For feature requests, please:

- **Check existing issues** to avoid duplicates
- **Describe the feature** clearly and provide use cases
- **Explain the benefits** and why it would be useful
- **Consider implementation** complexity and browser limitations

## 🔧 Code Contributions

### Development Guidelines

1. **Keep it simple**: This is a single-file browser application
2. **No build process**: Avoid introducing compilation steps
3. **Browser compatibility**: Support modern browsers (Chrome 80+, Firefox 80+, Safari 14+, Edge 80+)
4. **Performance first**: Consider large file handling and memory usage
5. **Privacy focused**: All processing must remain client-side

### Code Style

- **ES6+ JavaScript**: Use modern JavaScript features
- **Semantic HTML**: Use appropriate HTML elements
- **CSS Variables**: Use CSS custom properties for theming
- **Responsive Design**: Ensure mobile compatibility
- **Accessibility**: Include ARIA labels and keyboard navigation

### Testing Your Changes

1. **Test with various file sizes**: Small (KB) to large (100MB+)
2. **Test different data formats**: Parquet, Arrow, Avro, JSONL, ORC, Delta Lake, Iceberg
3. **Browser testing**: Test in Chrome, Firefox, Safari, and Edge
4. **Mobile testing**: Verify responsive design on mobile devices
5. **Performance testing**: Monitor memory usage with large files

### Submission Process

1. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Test thoroughly** across different browsers and file types

4. **Commit with clear messages**:
   ```bash
   git commit -m "Add feature: brief description"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request** with:
   - Clear title and description
   - List of changes made
   - Testing performed
   - Screenshots (if UI changes)

## 📋 Pull Request Guidelines

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] Changes are tested across multiple browsers
- [ ] No new dependencies introduced
- [ ] Documentation updated (if needed)
- [ ] Performance impact considered

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested in Chrome
- [ ] Tested in Firefox
- [ ] Tested in Safari
- [ ] Tested in Edge
- [ ] Tested with small files (<1MB)
- [ ] Tested with medium files (1-50MB)
- [ ] Tested with large files (50MB+)

## Screenshots (if applicable)
Add screenshots here

## Additional Notes
Any additional information
```

## 🎯 Priority Areas

We're particularly interested in contributions for:

- **Performance optimizations** for large files
- **Multi-format export** capabilities (Parquet, Arrow, etc., not just CSV)
- **Advanced filtering** and search capabilities
- **Enhanced data editing** features (data validation, type checking)
- **Column statistics** and data profiling
- **Schema comparison** tools
- **Data visualization** features (charts, graphs)
- **Accessibility improvements**
- **Mobile experience** enhancements

## 🤝 Community Guidelines

- **Be respectful** and constructive in discussions
- **Help others** with questions and issues
- **Share knowledge** about data formats and browser limitations
- **Provide feedback** on proposed changes
- **Test beta features** and report findings

## 📚 Resources

- [Parquet Format Documentation](https://parquet.apache.org/docs/)
- [Apache Arrow JavaScript](https://arrow.apache.org/docs/js/)
- [Hyparquet Library](https://github.com/hyparam/hyparquet)
- [MDN Web Docs](https://developer.mozilla.org/en-US/)

## ❓ Questions?

If you have questions about contributing:

1. **Check existing issues** for similar questions
2. **Create a new issue** with the "question" label
3. **Be specific** about what you're trying to achieve

Thank you for contributing to Multi-Format Data Viewer! 🎉