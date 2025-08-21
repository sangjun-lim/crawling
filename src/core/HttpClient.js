import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import LogUtils from '../utils/LogUtils.js';
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

  setupInterceptors() {
    this.session.interceptors.request.use(
      config => {
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
        this.logUtils.logResponse(response);

        if (response.request._redirects?.length > 0) {
          console.log(`리다이렉트 발생: ${response.request._redirects.length}번`);
          console.log(`최종 URL: ${response.request.res.responseUrl}`);
        }
        
        return response;
      },
      error => {
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
}

export default HttpClient;