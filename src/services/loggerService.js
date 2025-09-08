import fs from 'fs';
import path from 'path';

class LoggerService {
  constructor(options = {}) {
    this.config = {
      enabled: process.env.ENABLE_LOGGING !== 'false' && options.enableLogging !== false,
      logRequests: process.env.LOG_REQUESTS !== 'false' && options.logRequests !== false,
      logResponses: process.env.LOG_RESPONSES !== 'false' && options.logResponses !== false,
      logErrors: process.env.LOG_ERRORS !== 'false' && options.logErrors !== false,
      logDirectory: process.env.LOG_DIRECTORY || options.logDirectory || 'log'
    };
    
    this.ensureLogDirectories();
  }

  ensureLogDirectories() {
    if (!this.config.enabled) return;

    const logDir = this.config.logDirectory;
    const subDirs = ['requests', 'responses', 'errors'];
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    subDirs.forEach(subDir => {
      const fullPath = path.join(logDir, subDir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    });
  }

  generateLogFilename(type, suffix = '') {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const randomId = Math.random().toString(36).substring(2, 8);
    return `${type}_${timestamp}_${randomId}${suffix}.json`;
  }

  async writeLogFile(type, data, filename = null) {
    if (!this.config.enabled) return;

    try {
      const logDir = this.config.logDirectory;
      filename = filename || this.generateLogFilename(type);
      const filePath = path.join(logDir, type, filename);
      
      await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[LOG] ${type} 저장됨: ${filePath}`);
    } catch (error) {
      console.warn(`[LOG] ${type} 저장 실패:`, error.message);
    }
  }

  logRequest(config) {
    if (!this.config.enabled || !this.config.logRequests) return;

    const requestData = {
      timestamp: new Date().toISOString(),
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      headers: config.headers,
      params: config.params,
      data: config.data,
      timeout: config.timeout,
      maxRedirects: config.maxRedirects
    };
    
    this.writeLogFile('requests', requestData).catch(err => {
      console.warn('[LOG] 요청 로그 저장 실패:', err.message);
    });
    
    console.log(`[REQUEST] ${config.method?.toUpperCase()} ${config.url}`);
  }

  logResponse(response) {
    if (!this.config.enabled || !this.config.logResponses) return;

    const responseData = {
      timestamp: new Date().toISOString(),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: {
        method: response.config?.method,
        url: response.config?.url,
        baseURL: response.config?.baseURL
      },
      data: response.data,
      request: {
        redirects: response.request._redirects?.length || 0,
        finalUrl: response.request.res?.responseUrl || response.config?.url
      }
    };
    
    this.writeLogFile('responses', responseData).catch(err => {
      console.warn('[LOG] 응답 로그 저장 실패:', err.message);
    });
    
    console.log(`[RESPONSE] ${response.status} ${response.statusText} - ${response.config?.url}`);
  }

  logError(error, type = 'general_error') {
    if (!this.config.enabled || !this.config.logErrors) return;

    const errorData = {
      timestamp: new Date().toISOString(),
      type: type,
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers,
      data: error.response?.data,
      config: {
        method: error.config?.method,
        url: error.config?.url,
        baseURL: error.config?.baseURL
      },
      code: error.code,
      stack: error.stack
    };
    
    this.writeLogFile('errors', errorData).catch(err => {
      console.warn('[LOG] 에러 로그 저장 실패:', err.message);
    });
    
    console.log(`[ERROR] ${error.response?.status || 'NETWORK'} - ${error.config?.url}`);
  }
}

export default LoggerService;