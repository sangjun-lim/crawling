class LogUtils {
  constructor(options = {}) {
    this.options = {
      ...options,
    };
  }

  logInfo(message) {
    if (this.options.enableLogging) {
      console.log(`ℹ️  ${message}`);
    }
  }

  logError(message) {
    if (this.options.enableLogging) {
      console.error(`❌ ${message}`);
    }
  }

  logSuccess(message) {
    if (this.options.enableLogging) {
      console.log(`✅ ${message}`);
    }
  }

  logWarning(message) {
    if (this.options.enableLogging) {
      console.warn(`⚠️  ${message}`);
    }
  }
}

export default LogUtils;
