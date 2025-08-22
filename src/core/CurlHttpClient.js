import { CurlImpersonate } from 'node-curl-impersonate';
import LogUtils from '../utils/LogUtils.js';

class CurlHttpClient {
  constructor(options = {}) {
    this.config = {
      timeout: options.timeout || 30000,
      enableCookies: options.enableCookies !== false,
      ...options
    };
    
    this.logUtils = new LogUtils(options);
    this.cookieJar = new Map(); // 간단한 쿠키 저장소
  }

  async get(url, params = {}, headers = {}) {
    try {
      // URL에 파라미터 추가
      const urlObj = new URL(url);
      Object.keys(params).forEach(key => {
        urlObj.searchParams.append(key, params[key]);
      });
      const finalUrl = urlObj.toString();

      // 기본 헤더 설정 (Chrome 131 모방)
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      };

      const finalHeaders = { ...defaultHeaders, ...headers };

      // 로그 요청
      const logConfig = {
        method: 'GET',
        url: finalUrl,
        headers: finalHeaders
      };
      this.logUtils.logRequest(logConfig);

      // curl-impersonate로 요청 실행 (Chrome 브라우저 모방)
      const curl = new CurlImpersonate(finalUrl, {
        method: 'GET',
        impersonate: 'chrome-116',
        headers: finalHeaders
      });
      
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
            responseUrl: finalUrl
          }
        }
      };

      // 로그 응답
      this.logUtils.logResponse(responseObj);

      if (response.statusCode >= 400) {
        const error = new Error(`Request failed with status code ${response.statusCode}`);
        error.response = responseObj;
        this.logUtils.logError(error, 'response_error');
        throw error;
      }

      return responseObj;

    } catch (error) {
      this.logUtils.logError(error, 'request_error');
      throw error;
    }
  }

  async post(url, data, headers = {}) {
    try {
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        'DNT': '1',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      };

      const finalHeaders = { ...defaultHeaders, ...headers };

      const logConfig = {
        method: 'POST',
        url: url,
        headers: finalHeaders,
        data: data
      };
      this.logUtils.logRequest(logConfig);

      const curl = new CurlImpersonate(url, {
        method: 'POST',
        impersonate: 'chrome-116',
        headers: finalHeaders,
        body: typeof data === 'string' ? data : JSON.stringify(data)
      });
      
      const response = await curl.makeRequest();

      const responseObj = {
        status: response.statusCode,
        statusText: this.getStatusText(response.statusCode),
        data: response.response,
        headers: response.responseHeaders || {},
        config: logConfig,
        request: {
          res: {
            responseUrl: url
          }
        }
      };

      this.logUtils.logResponse(responseObj);

      if (response.statusCode >= 400) {
        const error = new Error(`Request failed with status code ${response.statusCode}`);
        error.response = responseObj;
        this.logUtils.logError(error, 'response_error');
        throw error;
      }

      return responseObj;

    } catch (error) {
      this.logUtils.logError(error, 'request_error');
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
      503: 'Service Unavailable'
    };
    return statusTexts[statusCode] || 'Unknown';
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

export default CurlHttpClient;