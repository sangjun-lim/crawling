import { CurlImpersonate } from 'node-curl-impersonate';
import HttpRequestLoggerService from '../services/http-request-logger-service.js';

class CurlHttpClient {
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || 30000,
      enableCookies: options.enableCookies !== false,
      proxy: options.proxy || null, // 프록시 설정
      proxyAuth: options.proxyAuth || null, // 프록시 인증 (username:password)
      ...options,
    };

    this.httpLogger = new HttpRequestLoggerService(options);
    this.cookieJar = new Map(); // 쿠키 저장소 (domain -> cookies)
    this.sessionHeaders = new Map(); // 세션 헤더 저장소
  }

  async get(url, params = {}, headers = {}) {
    try {
      // URL에 파라미터 추가
      const urlObj = new URL(url);
      Object.keys(params).forEach((key) => {
        urlObj.searchParams.append(key, params[key]);
      });
      const finalUrl = urlObj.toString();

      // 기본 헤더 설정 (Chrome 116 모방)
      const defaultHeaders = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua':
          '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      };

      const finalHeaders = { ...defaultHeaders, ...headers };

      // 저장된 쿠키 추가
      const domain = new URL(finalUrl).hostname;
      const cookies = this.getCookiesForDomain(domain);
      if (cookies) {
        finalHeaders['Cookie'] = cookies;
        console.log(
          `[COOKIE] Sending cookies to ${domain}: ${cookies.substring(0, 100)}${
            cookies.length > 100 ? '...' : ''
          }`
        );
      } else {
        console.log(`[COOKIE] No cookies found for ${domain}`);
      }

      // 세션 헤더 추가
      const sessionHeaders = this.getSessionHeaders(domain);
      Object.assign(finalHeaders, sessionHeaders);

      // 로그 요청
      const logConfig = {
        method: 'GET',
        url: finalUrl,
        headers: finalHeaders,
      };
      this.httpLogger.logRequest(logConfig);

      // curl-impersonate로 요청 실행 (Chrome 브라우저 모방)
      const curlOptions = {
        method: 'GET',
        impersonate: 'chrome-116',
        headers: finalHeaders,
      };

      // 프록시 설정 추가
      if (this.config.proxy) {
        curlOptions.proxy = this.config.proxy;
        console.log(`[PROXY] GET request using proxy: ${this.config.proxy}`);
        console.log(`[PROXY] Target URL: ${finalUrl}`);
      }

      // 프록시 인증 추가
      if (this.config.proxyAuth) {
        curlOptions.proxyAuth = this.config.proxyAuth;
        console.log(`[PROXY] Using proxy authentication`);
      }

      const curl = new CurlImpersonate(finalUrl, curlOptions);

      const response = await curl.makeRequest();

      // 응답 객체 구성 (axios와 비슷한 형태)
      const responseObj = {
        status: response.statusCode,
        statusText: this.getStatusText(response.statusCode),
        data: response.response,
        headers: response.responseHeaders || {},
        config: logConfig,
        request: {
          res: {
            responseUrl: finalUrl,
          },
        },
      };

      // 로그 응답
      this.httpLogger.logResponse(responseObj);

      // 쿠키 저장
      if (this.config.enableCookies && response.responseHeaders) {
        const beforeCount = this.cookieJar.get(domain)?.length || 0;
        this.saveCookiesFromResponse(domain, response.responseHeaders);
        const afterCount = this.cookieJar.get(domain)?.length || 0;
        if (afterCount > beforeCount) {
          console.log(
            `[COOKIE] Saved ${
              afterCount - beforeCount
            } new cookies from ${domain} (total: ${afterCount})`
          );
        }
      }

      if (response.statusCode >= 400) {
        const error = new Error(
          `Request failed with status code ${response.statusCode}`
        );
        error.response = responseObj;
        this.httpLogger.logError(error, 'response_error');
        throw error;
      }

      return responseObj;
    } catch (error) {
      this.httpLogger.logError(error, 'request_error');
      throw error;
    }
  }

  async post(url, data, headers = {}) {
    try {
      const defaultHeaders = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        DNT: '1',
        Connection: 'keep-alive',
        'sec-ch-ua':
          '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      };

      const finalHeaders = { ...defaultHeaders, ...headers };

      // 저장된 쿠키 추가
      const domain = new URL(url).hostname;
      const cookies = this.getCookiesForDomain(domain);
      if (cookies) {
        finalHeaders['Cookie'] = cookies;
        console.log(
          `[COOKIE] Sending cookies to ${domain}: ${cookies.substring(0, 100)}${
            cookies.length > 100 ? '...' : ''
          }`
        );
      } else {
        console.log(`[COOKIE] No cookies found for ${domain}`);
      }

      // 세션 헤더 추가
      const sessionHeaders = this.getSessionHeaders(domain);
      Object.assign(finalHeaders, sessionHeaders);

      const logConfig = {
        method: 'POST',
        url: url,
        headers: finalHeaders,
        data: data,
      };
      this.httpLogger.logRequest(logConfig);

      const curlOptions = {
        method: 'POST',
        impersonate: 'chrome-116',
        headers: finalHeaders,
        body: typeof data === 'string' ? data : JSON.stringify(data),
      };

      // 프록시 설정 추가
      if (this.config.proxy) {
        curlOptions.proxy = this.config.proxy;
        console.log(`[PROXY] POST request using proxy: ${this.config.proxy}`);
        console.log(`[PROXY] Target URL: ${url}`);
      }

      // 프록시 인증 추가
      if (this.config.proxyAuth) {
        curlOptions.proxyAuth = this.config.proxyAuth;
        console.log(`[PROXY] Using proxy authentication`);
      }

      const curl = new CurlImpersonate(url, curlOptions);

      const response = await curl.makeRequest();

      const responseObj = {
        status: response.statusCode,
        statusText: this.getStatusText(response.statusCode),
        data: response.response,
        headers: response.responseHeaders || {},
        config: logConfig,
        request: {
          res: {
            responseUrl: url,
          },
        },
      };

      this.httpLogger.logResponse(responseObj);

      // 쿠키 저장
      if (this.config.enableCookies && response.responseHeaders) {
        const beforeCount = this.cookieJar.get(domain)?.length || 0;
        this.saveCookiesFromResponse(domain, response.responseHeaders);
        const afterCount = this.cookieJar.get(domain)?.length || 0;
        if (afterCount > beforeCount) {
          console.log(
            `[COOKIE] Saved ${
              afterCount - beforeCount
            } new cookies from ${domain} (total: ${afterCount})`
          );
        }
      }

      if (response.statusCode >= 400) {
        const error = new Error(
          `Request failed with status code ${response.statusCode}`
        );
        error.response = responseObj;
        this.httpLogger.logError(error, 'response_error');
        throw error;
      }

      return responseObj;
    } catch (error) {
      this.httpLogger.logError(error, 'request_error');
      throw error;
    }
  }

  getStatusText(statusCode) {
    const statusTexts = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return statusTexts[statusCode] || 'Unknown';
  }

  buildWtmGraphqlHeader(keyword) {
    const wtmData = {
      arg: keyword,
      type: 'restaurant',
      source: 'place',
    };

    const base64Encoded = Buffer.from(
      JSON.stringify(wtmData),
      'utf-8'
    ).toString('base64');
    return base64Encoded;
  }

  // 쿠키 관리 메서드들
  getCookiesForDomain(domain) {
    let allCookies = [];

    // 현재 도메인과 매칭되는 모든 쿠키 찾기
    for (const [cookieDomain, cookies] of this.cookieJar.entries()) {
      if (this.isDomainMatch(domain, cookieDomain)) {
        allCookies.push(...cookies);
      }
    }

    if (allCookies.length === 0) {
      return null;
    }

    // 만료된 쿠키 제거
    const validCookies = allCookies.filter((cookie) => {
      if (cookie.expires) {
        return new Date() < new Date(cookie.expires);
      }
      return true; // 만료 시간이 없으면 세션 쿠키
    });

    if (validCookies.length === 0) {
      return null;
    }

    // 쿠키 문자열로 변환
    return validCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  // 도메인 매칭 로직
  isDomainMatch(requestDomain, cookieDomain) {
    if (requestDomain === cookieDomain) {
      return true;
    }

    // .naver.com 같은 상위 도메인 쿠키 체크
    if (cookieDomain.startsWith('.')) {
      const baseDomain = cookieDomain.substring(1); // . 제거
      return (
        requestDomain === baseDomain || requestDomain.endsWith('.' + baseDomain)
      );
    }

    return false;
  }

  saveCookiesFromResponse(domain, responseHeaders) {
    const setCookieHeaders = [];

    // Set-Cookie 헤더 찾기 (대소문자 구분 없이)
    Object.keys(responseHeaders).forEach((key) => {
      if (key.toLowerCase() === 'set-cookie') {
        const headerValue = responseHeaders[key];
        if (Array.isArray(headerValue)) {
          setCookieHeaders.push(...headerValue);
        } else {
          setCookieHeaders.push(headerValue);
        }
      }
    });

    if (setCookieHeaders.length === 0) {
      return;
    }

    // 새 쿠키 파싱 및 저장
    setCookieHeaders.forEach((cookieStr) => {
      const cookie = this.parseCookie(cookieStr);
      if (cookie) {
        // 쿠키 도메인 결정
        let cookieDomain = domain; // 기본값: 요청한 도메인

        if (cookie.domain) {
          // Set-Cookie에 domain 속성이 있으면 사용
          cookieDomain = cookie.domain.startsWith('.')
            ? cookie.domain
            : cookie.domain;
          console.log(`[COOKIE] Using domain from Set-Cookie: ${cookieDomain}`);
        }

        // 해당 도메인의 기존 쿠키 가져오기
        let domainCookies = this.cookieJar.get(cookieDomain) || [];

        // 같은 이름의 쿠키가 있으면 교체
        domainCookies = domainCookies.filter((c) => c.name !== cookie.name);
        domainCookies.push(cookie);

        this.cookieJar.set(cookieDomain, domainCookies);
      }
    });
  }

  parseCookie(cookieStr) {
    const parts = cookieStr.split(';').map((part) => part.trim());
    const [nameValue] = parts;
    const [name, value] = nameValue.split('=').map((part) => part.trim());

    if (!name || value === undefined) {
      return null;
    }

    const cookie = { name, value };

    // 쿠키 속성 파싱
    parts.slice(1).forEach((part) => {
      const [key, val] = part.split('=').map((p) => p.trim());
      const keyLower = key.toLowerCase();

      if (keyLower === 'expires') {
        cookie.expires = val;
      } else if (keyLower === 'max-age') {
        const maxAge = parseInt(val);
        if (!isNaN(maxAge)) {
          cookie.expires = new Date(Date.now() + maxAge * 1000).toISOString();
        }
      } else if (keyLower === 'domain') {
        cookie.domain = val;
      } else if (keyLower === 'path') {
        cookie.path = val;
      } else if (keyLower === 'secure') {
        cookie.secure = true;
      } else if (keyLower === 'httponly') {
        cookie.httpOnly = true;
      }
    });

    return cookie;
  }

  getSessionHeaders(domain) {
    return this.sessionHeaders.get(domain) || {};
  }

  setSessionHeader(domain, key, value) {
    if (!this.sessionHeaders.has(domain)) {
      this.sessionHeaders.set(domain, {});
    }
    this.sessionHeaders.get(domain)[key] = value;
  }

  clearCookies(domain = null) {
    if (domain) {
      this.cookieJar.delete(domain);
      this.sessionHeaders.delete(domain);
    } else {
      this.cookieJar.clear();
      this.sessionHeaders.clear();
    }
  }

  // 프록시 관리 메서드들
  setProxy(proxy, auth = null) {
    this.config.proxy = proxy;
    this.config.proxyAuth = auth;
    console.log(`[PROXY] Proxy set to: ${proxy}`);
    if (auth) {
      console.log(`[PROXY] Proxy authentication enabled`);
    }
  }

  setHttpProxy(host, port, username = null, password = null) {
    const proxy = `http://${host}:${port}`;
    const auth = username && password ? `${username}:${password}` : null;
    this.setProxy(proxy, auth);
  }

  setSocksProxy(host, port, username = null, password = null) {
    const proxy = `socks5://${host}:${port}`;
    const auth = username && password ? `${username}:${password}` : null;
    this.setProxy(proxy, auth);
  }

  removeProxy() {
    this.config.proxy = null;
    this.config.proxyAuth = null;
    console.log(`[PROXY] Proxy removed`);
  }

  getProxyInfo() {
    return {
      proxy: this.config.proxy,
      hasAuth: !!this.config.proxyAuth,
    };
  }

  // 수동 쿠키 주입 메서드
  injectCookies(domain, cookieString) {
    const cookies = cookieString.split('; ').map((cookiePair) => {
      const [name, value] = cookiePair.split('=');
      return { name: name.trim(), value: value?.trim() || '' };
    });

    this.cookieJar.set(domain, cookies);
    console.log(
      `[COOKIE] Manually injected ${cookies.length} cookies for ${domain}`
    );
  }
}

export default CurlHttpClient;
