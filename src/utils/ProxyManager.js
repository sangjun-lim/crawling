import https from 'https';
import http from 'http';

class ProxyManager {
  constructor(proxyList = [], options = {}) {
    this.proxyList = Array.isArray(proxyList) ? proxyList : [proxyList].filter(Boolean);
    this.currentIndex = 0;
    this.options = {
      rotateOnFailure: options.rotateOnFailure ?? true,
      maxRetries: options.maxRetries || 3,
      testTimeout: options.testTimeout || 10000,
      ...options,
    };
    
    this.failureCount = new Map(); // 프록시별 실패 횟수 추적
  }

  /**
   * 다음 사용할 프록시 반환
   */
  getNextProxy() {
    if (this.proxyList.length === 0) return null;
    
    const proxy = this.proxyList[this.currentIndex];
    if (this.options.rotateOnFailure) {
      this.currentIndex = (this.currentIndex + 1) % this.proxyList.length;
    }
    
    return this.parseProxyUrl(proxy);
  }

  /**
   * 현재 프록시 반환
   */
  getCurrentProxy() {
    if (this.proxyList.length === 0) return null;
    return this.parseProxyUrl(this.proxyList[this.currentIndex]);
  }

  /**
   * 프록시 실패 처리
   */
  markProxyAsFailed(proxyUrl) {
    const failureKey = this.getProxyKey(proxyUrl);
    const currentFailures = this.failureCount.get(failureKey) || 0;
    this.failureCount.set(failureKey, currentFailures + 1);
    
    console.log(`🚫 프록시 실패 기록: ${failureKey} (실패횟수: ${currentFailures + 1})`);
    
    // 최대 재시도 횟수 초과시 프록시 목록에서 제거
    if (currentFailures + 1 >= this.options.maxRetries) {
      this.removeProxy(proxyUrl);
    }
  }

  /**
   * 프록시 성공 처리
   */
  markProxyAsSuccess(proxyUrl) {
    const failureKey = this.getProxyKey(proxyUrl);
    this.failureCount.delete(failureKey);
    console.log(`✅ 프록시 성공: ${failureKey}`);
  }

  /**
   * 프록시 제거
   */
  removeProxy(proxyUrl) {
    const index = this.proxyList.findIndex(proxy => this.getProxyKey(proxy) === this.getProxyKey(proxyUrl));
    if (index !== -1) {
      const removed = this.proxyList.splice(index, 1)[0];
      console.log(`🗑️  프록시 제거: ${removed}`);
      
      // 인덱스 조정
      if (this.currentIndex >= this.proxyList.length) {
        this.currentIndex = 0;
      }
    }
  }

  /**
   * 프록시 URL 파싱
   */
  parseProxyUrl(proxyUrl) {
    if (!proxyUrl) return null;
    
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
      console.error(`❌ 프록시 URL 파싱 실패: ${proxyUrl} - ${error.message}`);
      return null;
    }
  }

  /**
   * 프록시 키 생성 (중복 확인용)
   */
  getProxyKey(proxyUrl) {
    if (typeof proxyUrl === 'object' && proxyUrl.fullUrl) {
      return proxyUrl.fullUrl;
    }
    return proxyUrl;
  }

  /**
   * 모든 프록시 연결 테스트
   */
  async testAllProxies() {
    if (this.proxyList.length === 0) {
      console.log('ℹ️  테스트할 프록시가 없습니다');
      return [];
    }

    console.log(`🔍 ${this.proxyList.length}개 프록시 연결 테스트 시작...`);
    const results = [];

    for (const proxyUrl of this.proxyList) {
      try {
        const isWorking = await this.testSingleProxy(proxyUrl);
        results.push({
          proxy: proxyUrl,
          working: isWorking,
        });
      } catch (error) {
        results.push({
          proxy: proxyUrl,
          working: false,
          error: error.message,
        });
      }
    }

    const workingProxies = results.filter(r => r.working);
    console.log(`✅ 사용 가능한 프록시: ${workingProxies.length}/${this.proxyList.length}개`);
    
    return results;
  }

  /**
   * 단일 프록시 연결 테스트
   */
  async testSingleProxy(proxyUrl, testUrl = 'https://httpbin.org/ip') {
    return new Promise((resolve) => {
      const proxyConfig = this.parseProxyUrl(proxyUrl);
      if (!proxyConfig) {
        resolve(false);
        return;
      }

      const targetUrl = new URL(testUrl);
      const isHttps = targetUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const requestOptions = {
        hostname: proxyConfig.host,
        port: proxyConfig.port,
        path: testUrl,
        method: 'GET',
        timeout: this.options.testTimeout,
        headers: {
          'Host': targetUrl.hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      };

      if (proxyConfig.auth) {
        requestOptions.headers['Proxy-Authorization'] = `Basic ${Buffer.from(proxyConfig.auth).toString('base64')}`;
      }

      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ 프록시 테스트 성공: ${proxyUrl}`);
            resolve(true);
          } else {
            console.log(`❌ 프록시 테스트 실패: ${proxyUrl} (상태코드: ${res.statusCode})`);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.log(`❌ 프록시 테스트 실패: ${proxyUrl} - ${error.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        console.log(`⏰ 프록시 테스트 타임아웃: ${proxyUrl}`);
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * 상태 정보 출력
   */
  getStatus() {
    return {
      totalProxies: this.proxyList.length,
      currentProxy: this.getCurrentProxy()?.fullUrl || 'None',
      failureCount: Object.fromEntries(this.failureCount),
      nextIndex: this.currentIndex,
    };
  }

  /**
   * 프록시 목록 추가
   */
  addProxy(proxyUrl) {
    if (!this.proxyList.includes(proxyUrl)) {
      this.proxyList.push(proxyUrl);
      console.log(`➕ 프록시 추가: ${proxyUrl}`);
    }
  }

  /**
   * 사용 가능한 프록시가 있는지 확인
   */
  hasAvailableProxy() {
    return this.proxyList.length > 0;
  }
}

export default ProxyManager;