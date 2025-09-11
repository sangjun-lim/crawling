class ScrapingError extends Error {
  static TYPES = {
    RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    HTTP_ERROR: 'HTTP_ERROR'
  };

  constructor(type, message, context = {}) {
    super(message);
    this.name = 'ScrapingError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.retryable = this.isRetryable(type);
  }

  isRetryable(type) {
    switch (type) {
      case ScrapingError.TYPES.RATE_LIMIT_ERROR:
        return false;
      case ScrapingError.TYPES.NETWORK_ERROR:
        return true;
      case ScrapingError.TYPES.HTTP_ERROR:
        return false;
      default:
        return false;
    }
  }

  static fromAxiosError(error, context = {}) {
    if (error.response?.status === 429 || 
        error.response?.headers?.['x-ratelimit-remaining'] === '0') {
      return new ScrapingError(
        ScrapingError.TYPES.RATE_LIMIT_ERROR,
        `Rate limit exceeded: ${error.message}`,
        {
          statusCode: error.response?.status,
          headers: error.response?.headers,
          ...context
        }
      );
    }

    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' || 
        error.code === 'TIMEOUT' ||
        error.code === 'ECONNRESET') {
      return new ScrapingError(
        ScrapingError.TYPES.NETWORK_ERROR,
        `Network error: ${error.message}`,
        {
          code: error.code,
          ...context
        }
      );
    }

    if (error.response?.status >= 400) {
      return new ScrapingError(
        ScrapingError.TYPES.HTTP_ERROR,
        `HTTP error ${error.response.status}: ${error.response.statusText}`,
        {
          statusCode: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          ...context
        }
      );
    }

    return null;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      stack: this.stack
    };
  }
}

export default ScrapingError;