export class TypeDetector {
  constructor() {
    this.typePatterns = this.initializeTypePatterns();
    this.dateFormats = this.initializeDateFormats();
  }

  initializeTypePatterns() {
    return {
      // Numeric patterns
      integer: /^-?\d+$/,
      bigInteger: /^-?\d{16,}$/,
      decimal: /^-?\d+\.\d+$/,
      scientific: /^-?\d+\.?\d*[eE][+-]?\d+$/,
      percentage: /^-?\d+\.?\d*%$/,
      currency: /^[$£€¥₹₽₩₪₦₨₱₡₵₫₲₴₺₼₽₸₹₺]\s*-?\d+\.?\d*$/,
      
      // Boolean patterns
      boolean: /^(true|false|yes|no|1|0|on|off)$/i,
      
      // String patterns
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      url: /^https?:\/\/[^\s]+$/,
      ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      ipv6: /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      json: /^[\[\{].*[\]\}]$/,
      xml: /^<.*>.*<\/.*>$/,
      base64: /^[A-Za-z0-9+/]*={0,2}$/,
      
      // Date/time patterns
      isoDateTime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
      isoDate: /^\d{4}-\d{2}-\d{2}$/,
      usDate: /^\d{1,2}\/\d{1,2}\/\d{4}$/,
      euroDate: /^\d{1,2}\.\d{1,2}\.\d{4}$/,
      time: /^\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM))?$/i,
      
      // Specialized formats
      phoneNumber: /^[\+]?[1-9][\d\s\-\(\)]{7,15}$/,
      creditCard: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
      zipCode: /^\d{5}(-\d{4})?$/,
      socialSecurityNumber: /^\d{3}-\d{2}-\d{4}$/,
      
      // Binary and encoded data
      hex: /^[0-9a-fA-F]+$/,
      binary: /^[01]+$/,
      
      // Geographic
      coordinate: /^-?\d+\.?\d*,\s*-?\d+\.?\d*$/,
      latLng: /^-?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*-?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/
    };
  }

  initializeDateFormats() {
    return [
      'YYYY-MM-DD',
      'YYYY-MM-DDTHH:mm:ss',
      'YYYY-MM-DDTHH:mm:ss.SSSZ',
      'MM/DD/YYYY',
      'DD/MM/YYYY',
      'DD.MM.YYYY',
      'YYYY/MM/DD',
      'MMM DD, YYYY',
      'DD MMM YYYY',
      'HH:mm:ss',
      'HH:mm',
      'h:mm A'
    ];
  }

  // Main type detection method
  detectType(value, options = {}) {
    const context = {
      strictMode: options.strict || false,
      sampleSize: options.sampleSize || 1,
      confidence: options.includeConfidence || false
    };

    if (value === null || value === undefined || value === '') {
      return this.createTypeResult('null', 1.0, context);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return this.detectArrayType(value, context);
    }

    // Handle objects
    if (typeof value === 'object') {
      return this.detectObjectType(value, context);
    }

    // Convert to string for pattern matching
    const stringValue = String(value).trim();
    
    // Try each type in order of specificity
    const typeChecks = [
      () => this.checkNumericTypes(stringValue, context),
      () => this.checkBooleanType(stringValue, context),
      () => this.checkDateTimeTypes(stringValue, context),
      () => this.checkSpecializedTypes(stringValue, context),
      () => this.checkEncodedTypes(stringValue, context),
      () => this.checkStringTypes(stringValue, context)
    ];

    for (const check of typeChecks) {
      const result = check();
      if (result) {
        return result;
      }
    }

    // Fallback to string
    return this.createTypeResult('string', 0.5, context);
  }

  // Detect type from array of values
  detectTypeFromSample(values, options = {}) {
    if (!values || values.length === 0) {
      return this.createTypeResult('unknown', 0.0, options);
    }

    const typeCounts = new Map();
    const subtypeCounts = new Map();
    let nullCount = 0;

    // Analyze each value
    for (const value of values.slice(0, options.maxSamples || 1000)) {
      if (value === null || value === undefined || value === '') {
        nullCount++;
        continue;
      }

      const result = this.detectType(value, options);
      const mainType = result.type.split(':')[0]; // Get main type before subtype
      
      typeCounts.set(mainType, (typeCounts.get(mainType) || 0) + 1);
      subtypeCounts.set(result.type, (subtypeCounts.get(result.type) || 0) + 1);
    }

    if (typeCounts.size === 0) {
      return this.createTypeResult('null', 1.0, options);
    }

    // Find dominant type
    const totalValues = values.length - nullCount;
    const dominantType = this.findDominantType(typeCounts, totalValues);
    const dominantSubtype = this.findDominantType(subtypeCounts, totalValues);
    
    // Calculate confidence
    const confidence = this.calculateTypeConfidence(
      dominantType.count, 
      totalValues, 
      typeCounts.size
    );

    const result = this.createTypeResult(dominantSubtype.type, confidence, options);
    
    // Add distribution information
    result.distribution = {
      nullPercentage: (nullCount / values.length) * 100,
      typeDistribution: Object.fromEntries(typeCounts),
      dominantTypePercentage: (dominantType.count / totalValues) * 100
    };

    return result;
  }

  // Type checking methods
  checkNumericTypes(value, context) {
    // Check for percentage
    if (this.typePatterns.percentage.test(value)) {
      return this.createTypeResult('number:percentage', 0.9, context);
    }

    // Check for currency
    if (this.typePatterns.currency.test(value)) {
      return this.createTypeResult('number:currency', 0.9, context);
    }

    // Check for scientific notation
    if (this.typePatterns.scientific.test(value)) {
      return this.createTypeResult('number:scientific', 0.95, context);
    }

    // Check for big integer
    if (this.typePatterns.bigInteger.test(value)) {
      return this.createTypeResult('number:bigint', 0.9, context);
    }

    // Check for decimal
    if (this.typePatterns.decimal.test(value)) {
      return this.createTypeResult('number:decimal', 0.95, context);
    }

    // Check for integer
    if (this.typePatterns.integer.test(value)) {
      const num = parseInt(value, 10);
      if (num >= -2147483648 && num <= 2147483647) {
        return this.createTypeResult('number:integer', 0.95, context);
      } else {
        return this.createTypeResult('number:bigint', 0.9, context);
      }
    }

    return null;
  }

  checkBooleanType(value, context) {
    if (this.typePatterns.boolean.test(value)) {
      return this.createTypeResult('boolean', 0.9, context);
    }
    return null;
  }

  checkDateTimeTypes(value, context) {
    // ISO DateTime
    if (this.typePatterns.isoDateTime.test(value)) {
      return this.createTypeResult('datetime:iso', 0.95, context);
    }

    // ISO Date
    if (this.typePatterns.isoDate.test(value)) {
      return this.createTypeResult('date:iso', 0.95, context);
    }

    // US Date format
    if (this.typePatterns.usDate.test(value)) {
      return this.createTypeResult('date:us', 0.8, context);
    }

    // European Date format
    if (this.typePatterns.euroDate.test(value)) {
      return this.createTypeResult('date:euro', 0.8, context);
    }

    // Time
    if (this.typePatterns.time.test(value)) {
      return this.createTypeResult('time', 0.85, context);
    }

    // Try parsing as date
    const dateValue = new Date(value);
    if (!isNaN(dateValue.getTime()) && value.length > 6) {
      return this.createTypeResult('datetime:parsed', 0.7, context);
    }

    return null;
  }

  checkSpecializedTypes(value, context) {
    const specializedTypes = [
      ['email', 0.95],
      ['url', 0.95],
      ['uuid', 0.98],
      ['ipv4', 0.95],
      ['ipv6', 0.95],
      ['phoneNumber', 0.85],
      ['creditCard', 0.9],
      ['zipCode', 0.9],
      ['socialSecurityNumber', 0.95],
      ['coordinate', 0.9],
      ['latLng', 0.95]
    ];

    for (const [type, confidence] of specializedTypes) {
      if (this.typePatterns[type].test(value)) {
        return this.createTypeResult(type, confidence, context);
      }
    }

    return null;
  }

  checkEncodedTypes(value, context) {
    // JSON
    if (this.typePatterns.json.test(value)) {
      try {
        JSON.parse(value);
        return this.createTypeResult('json', 0.95, context);
      } catch {
        // Not valid JSON
      }
    }

    // XML
    if (this.typePatterns.xml.test(value)) {
      return this.createTypeResult('xml', 0.8, context);
    }

    // Base64 (only if reasonably long)
    if (value.length > 10 && this.typePatterns.base64.test(value)) {
      return this.createTypeResult('base64', 0.7, context);
    }

    // Hex
    if (value.length > 4 && this.typePatterns.hex.test(value)) {
      return this.createTypeResult('hex', 0.6, context);
    }

    // Binary
    if (value.length > 4 && this.typePatterns.binary.test(value)) {
      return this.createTypeResult('binary', 0.6, context);
    }

    return null;
  }

  checkStringTypes(value, context) {
    // Check string characteristics
    const characteristics = this.analyzeStringCharacteristics(value);
    
    if (characteristics.isAlpha) {
      return this.createTypeResult('string:text', 0.8, context, characteristics);
    }
    
    if (characteristics.isAlphaNumeric) {
      return this.createTypeResult('string:alphanumeric', 0.7, context, characteristics);
    }
    
    if (characteristics.hasSpecialChars) {
      return this.createTypeResult('string:mixed', 0.6, context, characteristics);
    }

    return this.createTypeResult('string', 0.5, context, characteristics);
  }

  detectArrayType(array, context) {
    if (array.length === 0) {
      return this.createTypeResult('array:empty', 1.0, context);
    }

    // Detect element types
    const elementTypes = array.map(element => this.detectType(element, context));
    const typeSet = new Set(elementTypes.map(t => t.type));

    if (typeSet.size === 1) {
      return this.createTypeResult(`array:${elementTypes[0].type}`, 0.9, context);
    } else {
      return this.createTypeResult('array:mixed', 0.8, context);
    }
  }

  detectObjectType(obj, context) {
    const keys = Object.keys(obj);
    
    if (keys.length === 0) {
      return this.createTypeResult('object:empty', 1.0, context);
    }

    // Check if it looks like a specific object type
    if (this.looksLikeGeoJSON(obj)) {
      return this.createTypeResult('object:geojson', 0.9, context);
    }

    return this.createTypeResult('object', 0.8, context);
  }

  // Utility methods
  analyzeStringCharacteristics(str) {
    return {
      length: str.length,
      isAlpha: /^[a-zA-Z\s]+$/.test(str),
      isAlphaNumeric: /^[a-zA-Z0-9\s]+$/.test(str),
      isNumeric: /^[0-9\s]+$/.test(str),
      hasSpecialChars: /[^\w\s]/.test(str),
      hasUnicode: /[^\x00-\x7F]/.test(str),
      wordCount: str.split(/\s+/).length,
      avgWordLength: str.split(/\s+/).reduce((sum, word) => sum + word.length, 0) / str.split(/\s+/).length
    };
  }

  looksLikeGeoJSON(obj) {
    return obj.type && obj.coordinates && 
           ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(obj.type);
  }

  findDominantType(typeCounts, totalValues) {
    let maxCount = 0;
    let dominantType = 'unknown';

    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    return { type: dominantType, count: maxCount };
  }

  calculateTypeConfidence(dominantCount, totalValues, typeVariety) {
    const dominanceRatio = dominantCount / totalValues;
    const varietyPenalty = Math.min(typeVariety - 1, 3) * 0.1; // Penalty for type variety
    
    return Math.max(0, Math.min(1, dominanceRatio - varietyPenalty));
  }

  createTypeResult(type, confidence, context, extra = {}) {
    const result = {
      type,
      confidence,
      ...extra
    };

    if (context.includeConfidence === false) {
      delete result.confidence;
    }

    return result;
  }

  // Schema inference from data
  inferSchema(data, options = {}) {
    if (!Array.isArray(data) || data.length === 0) {
      return {};
    }

    const schema = {};
    const sampleSize = Math.min(data.length, options.maxSamples || 1000);
    
    // Get all unique keys
    const allKeys = new Set();
    for (let i = 0; i < sampleSize; i++) {
      if (data[i] && typeof data[i] === 'object') {
        Object.keys(data[i]).forEach(key => allKeys.add(key));
      }
    }

    // Analyze each column
    for (const key of allKeys) {
      const values = [];
      let nullCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        const value = data[i] && data[i][key];
        if (value === null || value === undefined) {
          nullCount++;
        } else {
          values.push(value);
        }
      }

      const typeResult = this.detectTypeFromSample(values, options);
      
      schema[key] = {
        type: typeResult.type,
        confidence: typeResult.confidence,
        nullable: nullCount > 0,
        nullPercentage: (nullCount / sampleSize) * 100,
        sampleSize: values.length,
        ...typeResult.distribution
      };
    }

    return schema;
  }

  // Type conversion suggestions
  suggestTypeConversions(schema) {
    const suggestions = {};

    for (const [field, info] of Object.entries(schema)) {
      const conversions = [];

      if (info.type.startsWith('string')) {
        // Suggest numeric conversion if it looks numeric
        if (info.type === 'string' && info.confidence < 0.7) {
          conversions.push('number');
        }
        
        // Suggest date conversion if it looks like a date
        if (info.avgWordLength && info.avgWordLength > 8) {
          conversions.push('date');
        }
      }

      if (info.type.startsWith('number') && info.confidence < 0.8) {
        conversions.push('string');
      }

      if (conversions.length > 0) {
        suggestions[field] = conversions;
      }
    }

    return suggestions;
  }

  // Validation
  validateType(value, expectedType) {
    const detected = this.detectType(value);
    const mainDetectedType = detected.type.split(':')[0];
    const mainExpectedType = expectedType.split(':')[0];
    
    return {
      valid: mainDetectedType === mainExpectedType,
      detected: detected.type,
      expected: expectedType,
      confidence: detected.confidence
    };
  }
}