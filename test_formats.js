/**
 * Comprehensive format testing for Multi-Format Data Viewer
 * This script tests each format implementation
 */

// Import the multi-format system
import { FormatDetector } from './src/core/FormatDetector.js';
import { FormatRegistry } from './src/formats/base/FormatRegistry.js';

// Test configuration
const testFiles = [
    { 
        path: '/test-files/sample.jsonl', 
        expectedFormat: 'jsonl',
        description: 'JSON Lines format with 100 employee records'
    },
    { 
        path: '/test-files/sample.ndjson', 
        expectedFormat: 'jsonl', // NDJSON uses JSONL handler
        description: 'NDJSON format (same as JSONL)'
    },
    { 
        path: '/test-files/iris.parquet', 
        expectedFormat: 'parquet',
        description: 'Small Parquet file with Iris dataset'
    },
    { 
        path: '/test-files/sample.arrow', 
        expectedFormat: 'arrow',
        description: 'Apache Arrow format file'
    },
    { 
        path: '/test-files/users.avro', 
        expectedFormat: 'avro',
        description: 'Apache Avro format file'
    }
];

class FormatTester {
    constructor() {
        this.detector = new FormatDetector();
        this.registry = new FormatRegistry();
        this.results = [];
    }

    async runAllTests() {
        console.log('🚀 Starting Multi-Format Data Viewer Tests\n');
        
        // Test 1: Format Registration
        await this.testFormatRegistration();
        
        // Test 2: Format Detection
        await this.testFormatDetection();
        
        // Test 3: File Processing
        await this.testFileProcessing();
        
        // Test 4: Error Handling
        await this.testErrorHandling();
        
        // Print summary
        this.printSummary();
    }

    async testFormatRegistration() {
        console.log('📋 Test 1: Format Registration');
        
        try {
            const supportedFormats = this.registry.getSupportedFormats();
            const expectedFormats = ['parquet', 'arrow', 'feather', 'avro', 'jsonl', 'ndjson', 'orc', 'delta', 'iceberg'];
            
            console.log(`   Supported formats: ${supportedFormats.join(', ')}`);
            
            const missingFormats = expectedFormats.filter(f => !supportedFormats.includes(f));
            
            if (missingFormats.length === 0) {
                console.log('   ✅ All expected formats registered\n');
                this.results.push({ test: 'Format Registration', status: 'PASS' });
            } else {
                console.log(`   ❌ Missing formats: ${missingFormats.join(', ')}\n`);
                this.results.push({ test: 'Format Registration', status: 'FAIL', details: missingFormats });
            }
        } catch (error) {
            console.log(`   ❌ Registration test failed: ${error.message}\n`);
            this.results.push({ test: 'Format Registration', status: 'ERROR', error: error.message });
        }
    }

    async testFormatDetection() {
        console.log('🔍 Test 2: Format Detection');
        
        for (const testFile of testFiles) {
            try {
                const response = await fetch(`http://localhost:8081${testFile.path}`);
                if (!response.ok) {
                    console.log(`   ⚠️ ${testFile.path}: File not found, skipping`);
                    continue;
                }
                
                const buffer = await response.arrayBuffer();
                const file = new File([buffer], testFile.path.split('/').pop());
                
                const detectedFormat = await this.detector.detect(file);
                const confidence = this.detector.getConfidence ? this.detector.getConfidence(file, detectedFormat) : 1.0;
                
                if (detectedFormat === testFile.expectedFormat) {
                    console.log(`   ✅ ${testFile.path}: Detected as ${detectedFormat} (confidence: ${(confidence * 100).toFixed(1)}%)`);
                    this.results.push({ 
                        test: `Detection: ${testFile.path}`, 
                        status: 'PASS',
                        format: detectedFormat,
                        confidence: confidence
                    });
                } else {
                    console.log(`   ❌ ${testFile.path}: Expected ${testFile.expectedFormat}, got ${detectedFormat}`);
                    this.results.push({ 
                        test: `Detection: ${testFile.path}`, 
                        status: 'FAIL',
                        expected: testFile.expectedFormat,
                        actual: detectedFormat
                    });
                }
            } catch (error) {
                console.log(`   ❌ ${testFile.path}: Detection failed - ${error.message}`);
                this.results.push({ 
                    test: `Detection: ${testFile.path}`, 
                    status: 'ERROR',
                    error: error.message
                });
            }
        }
        console.log('');
    }

    async testFileProcessing() {
        console.log('⚡ Test 3: File Processing');
        
        for (const testFile of testFiles) {
            try {
                const response = await fetch(`http://localhost:8081${testFile.path}`);
                if (!response.ok) {
                    console.log(`   ⚠️ ${testFile.path}: File not found, skipping`);
                    continue;
                }
                
                const buffer = await response.arrayBuffer();
                const file = new File([buffer], testFile.path.split('/').pop());
                
                const format = await this.detector.detect(file);
                if (format === 'unknown') {
                    console.log(`   ❌ ${testFile.path}: Unknown format, cannot process`);
                    continue;
                }
                
                const Handler = this.registry.getHandler(format);
                if (!Handler) {
                    console.log(`   ❌ ${testFile.path}: No handler found for format ${format}`);
                    continue;
                }
                
                const handler = new Handler();
                
                // Test metadata reading
                try {
                    await handler.readMetadata(file);
                    console.log(`   ✅ ${testFile.path}: Metadata read successfully`);
                } catch (metaError) {
                    console.log(`   ⚠️ ${testFile.path}: Metadata reading failed - ${metaError.message}`);
                }
                
                // Test data reading
                try {
                    const data = await handler.readData(file);
                    const rowCount = Array.isArray(data) ? data.length : 0;
                    console.log(`   ✅ ${testFile.path}: Data read successfully (${rowCount} rows)`);
                    
                    this.results.push({ 
                        test: `Processing: ${testFile.path}`, 
                        status: 'PASS',
                        rows: rowCount,
                        format: format
                    });
                } catch (dataError) {
                    console.log(`   ❌ ${testFile.path}: Data reading failed - ${dataError.message}`);
                    this.results.push({ 
                        test: `Processing: ${testFile.path}`, 
                        status: 'FAIL',
                        error: dataError.message
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ ${testFile.path}: Processing failed - ${error.message}`);
                this.results.push({ 
                    test: `Processing: ${testFile.path}`, 
                    status: 'ERROR',
                    error: error.message
                });
            }
        }
        console.log('');
    }

    async testErrorHandling() {
        console.log('🛡️ Test 4: Error Handling');
        
        // Test with invalid file
        try {
            const invalidFile = new File(['invalid content'], 'test.unknown');
            const format = await this.detector.detect(invalidFile);
            
            if (format === 'unknown') {
                console.log('   ✅ Correctly identifies unknown format');
                this.results.push({ test: 'Error Handling: Unknown format', status: 'PASS' });
            } else {
                console.log(`   ❌ Should return "unknown" for invalid file, got "${format}"`);
                this.results.push({ test: 'Error Handling: Unknown format', status: 'FAIL' });
            }
        } catch (error) {
            console.log(`   ✅ Correctly throws error for invalid format: ${error.message}`);
            this.results.push({ test: 'Error Handling: Unknown format', status: 'PASS' });
        }
        
        // Test with null input
        try {
            const format = await this.detector.detect(null);
            console.log(`   ⚠️ Null input returned: ${format}`);
        } catch (error) {
            console.log('   ✅ Correctly handles null input');
        }
        
        console.log('');
    }

    printSummary() {
        console.log('📊 TEST SUMMARY');
        console.log('================');
        
        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;
        const errors = this.results.filter(r => r.status === 'ERROR').length;
        
        console.log(`Total Tests: ${this.results.length}`);
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`⚠️ Errors: ${errors}`);
        console.log(`Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);
        
        if (failed > 0 || errors > 0) {
            console.log('\nFailed/Error Tests:');
            this.results
                .filter(r => r.status !== 'PASS')
                .forEach(r => {
                    console.log(`  - ${r.test}: ${r.status} ${r.error ? `(${r.error})` : ''}`);
                });
        }
        
        console.log('\n🎯 Multi-Format Data Viewer Testing Complete!');
        console.log('You can now manually test by visiting: http://localhost:8081');
        console.log('Try uploading files from the test-files/ directory.');
    }
}

// Run tests when loaded
if (typeof window !== 'undefined') {
    window.runFormatTests = async function() {
        const tester = new FormatTester();
        await tester.runAllTests();
    };
    
    // Auto-run tests
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('🔧 Multi-Format Data Viewer loaded - run runFormatTests() to test formats');
    });
} else {
    // Node.js environment
    const tester = new FormatTester();
    tester.runAllTests().catch(console.error);
}