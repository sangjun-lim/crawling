class ProxyService {
  constructor(options = {}) {
    this.proxy = options.proxy || process.env.PROXY_SERVER || null;
    this.timeout = options.timeout || 30000;
    this.proxyConfig = null;
    
    if (this.proxy) {
      this.proxyConfig = this.parseProxyUrl(this.proxy);
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
      throw new Error(`프록시 URL 파싱 실패: ${error.message}`);
    }
  }

  /**
   * HTTP 클라이언트용 프록시 설정 생성
   */
  getHttpConfig() {
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
  getPlaywrightConfig() {
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
  async testConnection() {
    if (!this.proxyConfig) {
      return true;
    }

    try {
      const testUrl = 'https://httpbin.org/ip';
      const response = await fetch(testUrl, { 
        method: 'GET',
        timeout: this.timeout,
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  isEnabled() {
    return this.proxyConfig !== null;
  }

  getInfo() {
    if (!this.proxyConfig) return null;
    return `${this.proxyConfig.host}:${this.proxyConfig.port}`;
  }
}

export default ProxyService;