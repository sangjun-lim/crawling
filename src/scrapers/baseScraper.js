class BaseScraper {
  constructor(options = {}) {
    this.options = {
      proxy: options.proxy || process.env.PROXY_SERVER || null,
      timeout: options.timeout || 30000,
      enableLogging: options.enableLogging ?? true,
      logDirectory: options.logDirectory || 'log',
      ...options,
    };

    // 프록시 설정 검증 및 초기화
    this.proxyConfig = null;
    if (this.options.proxy) {
      this.proxyConfig = this.parseProxyUrl(this.options.proxy);
      this.logInfo(`프록시 설정: ${this.proxyConfig.host}:${this.proxyConfig.port}`);
    }
  }

  /**
   * 프록시 URL 파싱
   */
  parseProxyUrl(proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      return {
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        username: url.username || null,
        password: url.password || null,
        auth: url.username ? `${url.username}:${url.password}` : null,
        fullUrl: proxyUrl,
      };
    } catch (error) {
      this.logError(`프록시 URL 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * HTTP 클라이언트용 프록시 설정 생성
   */
  getHttpProxyConfig() {
    if (!this.proxyConfig) return null;

    return {
      host: this.proxyConfig.host,
      port: parseInt(this.proxyConfig.port),
      auth: this.proxyConfig.auth,
      protocol: this.proxyConfig.protocol,
    };
  }

  /**
   * Playwright용 프록시 설정 생성
   */
  getPlaywrightProxyConfig() {
    if (!this.proxyConfig) return null;

    const config = {
      server: `${this.proxyConfig.protocol}://${this.proxyConfig.host}:${this.proxyConfig.port}`,
    };

    if (this.proxyConfig.username && this.proxyConfig.password) {
      config.username = this.proxyConfig.username;
      config.password = this.proxyConfig.password;
    }

    return config;
  }

  /**
   * 프록시 연결 테스트
   */
  async testProxyConnection() {
    if (!this.proxyConfig) {
      this.logInfo('프록시 설정 없음 - 연결 테스트 생략');
      return true;
    }

    try {
      this.logInfo(`프록시 연결 테스트 시작: ${this.proxyConfig.host}:${this.proxyConfig.port}`);
      
      // 간단한 HTTP 요청으로 프록시 테스트
      const testUrl = 'https://httpbin.org/ip';
      const response = await this.makeTestRequest(testUrl);
      
      if (response) {
        this.logInfo('프록시 연결 테스트 성공');
        return true;
      } else {
        this.logError('프록시 연결 테스트 실패');
        return false;
      }
    } catch (error) {
      this.logError(`프록시 연결 테스트 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 프록시 테스트용 HTTP 요청 (하위 클래스에서 구현)
   */
  async makeTestRequest(url) {
    // 기본 구현: fetch를 사용한 간단한 테스트
    try {
      const response = await fetch(url, { 
        method: 'GET',
        timeout: this.options.timeout,
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 로깅 메서드들
   */
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

  /**
   * 공통 초기화 메서드 (하위 클래스에서 오버라이드)
   */
  async init() {
    this.logInfo('스크래퍼 초기화 시작');
    
    if (this.options.proxy) {
      const proxyTestResult = await this.testProxyConnection();
      if (!proxyTestResult) {
        throw new Error('프록시 연결 테스트 실패');
      }
    }
    
    this.logSuccess('스크래퍼 초기화 완료');
    return true;
  }

  /**
   * 정리 메서드 (하위 클래스에서 오버라이드)
   */
  async close() {
    this.logInfo('스크래퍼 정리 중...');
  }
}

export default BaseScraper;