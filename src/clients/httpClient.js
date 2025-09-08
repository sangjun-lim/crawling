import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import LogUtils from '../services/loggerService.js';
import { HTTP_HEADERS, DEFAULT_OPTIONS } from '../config/constants.js';

class HttpClient {
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || DEFAULT_OPTIONS.timeout,
      maxRedirects: options.maxRedirects || DEFAULT_OPTIONS.maxRedirects,
      enableCookies: options.enableCookies !== false, // 기본적으로 쿠키 활성화
      ...options
    };
    
    this.logUtils = new LogUtils(options);
    
    // 프록시 로테이션 설정
    this.proxies = options.proxies || [];
    this.proxyRotation = options.proxyRotation !== false; // 기본값: true
    this.currentProxyIndex = 0;
    this.proxyStats = {}; // 프록시별 성공/실패 통계
    
    // 쿠키 지원 설정
    this.cookieJar = new CookieJar();
    
    this.session = this.createHttpSession();
    this.setupInterceptors();
  }

  createHttpSession() {
    const axiosInstance = axios.create({
      headers: HTTP_HEADERS,
      timeout: this.config.timeout,
      maxRedirects: this.config.maxRedirects,
      withCredentials: this.config.enableCookies,
      validateStatus: (status) => status >= 200 && status < 400
    });

    // 쿠키 지원이 활성화된 경우 wrapper 적용
    if (this.config.enableCookies) {
      return wrapper(axiosInstance, {
        jar: this.cookieJar
      });
    }
    
    return axiosInstance;
  }

  // 프록시 로테이션 메서드
  getNextProxy() {
    if (!this.proxyRotation || this.proxies.length === 0) {
      return null;
    }

    const proxy = this.proxies[this.currentProxyIndex];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
    
    return proxy;
  }

  parseProxyUrl(proxyUrl) {
    try {
      const url = new URL(proxyUrl);
      const proxy = {
        host: url.hostname,
        port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        protocol: url.protocol.replace(':', '')
      };

      // 인증 정보가 있는 경우
      if (url.username && url.password) {
        proxy.auth = {
          username: url.username,
          password: url.password
        };
      }

      return proxy;
    } catch (error) {
      console.warn(`프록시 URL 파싱 실패: ${proxyUrl}`, error.message);
      return null;
    }
  }

  updateProxyStats(proxyUrl, success) {
    if (!this.proxyStats[proxyUrl]) {
      this.proxyStats[proxyUrl] = { success: 0, failure: 0 };
    }
    
    if (success) {
      this.proxyStats[proxyUrl].success++;
    } else {
      this.proxyStats[proxyUrl].failure++;
    }
  }

  setupInterceptors() {
    this.session.interceptors.request.use(
      config => {
        // 프록시 설정 적용
        const proxyUrl = this.getNextProxy();
        if (proxyUrl) {
          const proxy = this.parseProxyUrl(proxyUrl);
          if (proxy) {
            config.proxy = proxy;
            config.proxyUrl = proxyUrl; // 통계를 위해 저장
            console.log(`[PROXY] ${proxyUrl} 사용`);
          }
        }

        this.logUtils.logRequest(config);
        return config;
      },
      error => {
        this.logUtils.logError(error, 'request_error');
        return Promise.reject(error);
      }
    );

    this.session.interceptors.response.use(
      response => {
        // 프록시 성공 통계 업데이트
        if (response.config.proxyUrl) {
          this.updateProxyStats(response.config.proxyUrl, true);
        }

        this.logUtils.logResponse(response);

        if (response.request._redirects?.length > 0) {
          console.log(`리다이렉트 발생: ${response.request._redirects.length}번`);
          console.log(`최종 URL: ${response.request.res.responseUrl}`);
        }
        
        return response;
      },
      error => {
        // 프록시 실패 통계 업데이트
        if (error.config?.proxyUrl) {
          this.updateProxyStats(error.config.proxyUrl, false);
          
          // 프록시 관련 에러인 경우 추가 로깅
          if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            console.warn(`[PROXY ERROR] ${error.config.proxyUrl}: ${error.message}`);
          }
        }

        this.logUtils.logError(error, 'response_error');

        if (error.response?.status >= 300 && error.response?.status < 400) {
          console.log(`리다이렉트 응답 (${error.response.status}):`, error.response.headers.location);
        }
        
        return Promise.reject(error);
      }
    );
  }

  async get(url, params = {}, headers = {}) {
    return this.session.get(url, { 
      params, 
      headers: { ...this.session.defaults.headers, ...headers }
    });
  }

  async post(url, data, headers = {}) {
    return this.session.post(url, data, {
      headers: { ...this.session.defaults.headers, ...headers }
    });
  }

  buildWtmGraphqlHeader(keyword) {
    const wtmData = {
      arg: keyword,
      type: "restaurant",
      source: "place"
    };
    
    const base64Encoded = Buffer.from(JSON.stringify(wtmData), 'utf-8').toString('base64');
    return base64Encoded;
  }

  // 프록시 통계 조회
  getProxyStats() {
    if (this.proxies.length === 0) {
      return { message: '프록시가 설정되지 않았습니다.' };
    }

    const stats = {};
    this.proxies.forEach(proxy => {
      const stat = this.proxyStats[proxy] || { success: 0, failure: 0 };
      const total = stat.success + stat.failure;
      stats[proxy] = {
        ...stat,
        total,
        successRate: total > 0 ? ((stat.success / total) * 100).toFixed(1) + '%' : '0%'
      };
    });

    return stats;
  }

  // 프록시 통계 출력
  logProxyStats() {
    const stats = this.getProxyStats();
    
    if (stats.message) {
      console.log(stats.message);
      return;
    }

    console.log('\n📊 프록시 사용 통계:');
    Object.entries(stats).forEach(([proxy, stat]) => {
      console.log(`  ${proxy}: 성공 ${stat.success}, 실패 ${stat.failure}, 성공률 ${stat.successRate}`);
    });
    console.log('');
  }
}

export default HttpClient;