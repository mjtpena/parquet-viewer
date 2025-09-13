export class FormatRegistry {
  constructor() {
    this.formats = new Map();
    this.handlers = new Map();
  }

  register(formatName, handlerClass) {
    if (!handlerClass.canHandle) {
      throw new Error(`Handler for ${formatName} must implement static canHandle method`);
    }
    
    this.formats.set(formatName, handlerClass);
    console.log(`Registered format handler: ${formatName}`);
  }

  getHandler(formatName) {
    const Handler = this.formats.get(formatName);
    if (!Handler) {
      throw new Error(`No handler registered for format: ${formatName}`);
    }
    return Handler;
  }

  getSupportedFormats() {
    return Array.from(this.formats.keys());
  }

  findHandler(file) {
    for (const [formatName, Handler] of this.formats) {
      try {
        if (Handler.canHandle(file)) {
          return { formatName, Handler };
        }
      } catch (error) {
        console.warn(`Error checking format ${formatName}:`, error);
      }
    }
    return null;
  }

  clear() {
    this.formats.clear();
    this.handlers.clear();
  }
}