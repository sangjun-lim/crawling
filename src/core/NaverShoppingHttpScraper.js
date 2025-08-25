import BaseScraper from './BaseScraper.js';
import CurlHttpClient from './CurlHttpClient.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

class NaverShoppingHttpScraper extends BaseScraper {
  constructor(options = {}) {
    super(options);
    
    this.options = {
      timeout: options.timeout ?? 30000,
      saveData: options.saveData ?? true,
      ...options,
    };

    // 프록시 설정을 CurlHttpClient 형식으로 변환
    const proxyConfig = this.getHttpProxyConfig();
    let curlOptions = { ...options };
    
    if (proxyConfig) {
      curlOptions.proxy = proxyConfig.protocol === 'https' 
        ? `https://${proxyConfig.host}:${proxyConfig.port}`
        : `http://${proxyConfig.host}:${proxyConfig.port}`;
      
      if (proxyConfig.auth) {
        curlOptions.proxyAuth = proxyConfig.auth;
      }
      
      this.logInfo(`CurlHttpClient 프록시 설정: ${curlOptions.proxy}`);
    }
    
    this.httpClient = new CurlHttpClient(curlOptions);
  }

  /**
   * 프록시 테스트용 HTTP 요청 (부모 클래스 오버라이드)
   */
  async makeTestRequest(url) {
    try {
      const response = await this.httpClient.get(url);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      return false;
    }
  }

  /**
   * 네이버 쇼핑 홈페이지 HTTP 요청으로 HTML 반환
   */
  async getHomepageHtml() {
    try {

      let url, response, payload;
      
      let ts = new Date().getTime();

      url = 'https://nlog.naver.com/n';
      payload = {
        "corp": "naver",
        "svc": "main",
        "location": "korea_real/korea",
        "svc_tags": {},
        "send_ts": ts + 1,
        "usr": {},
        "env": {},
        "evts": [
          {
            "page_url": "https://www.naver.com/",
            "page_ref": "pageview",
            "evt_ts": ts,
          }
        ]
      }

      response = await this.httpClient.post(url, payload, {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Origin': 'https://www.naver.com',
        'Referer': 'https://www.naver.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      });

      // 응답 쿠키 출력
      this.logInfo('=== nlog.naver.com POST 응답 정보 ===');
      console.log('Status:', response.status);
      console.log('Headers:', response.headers);
      
      // Set-Cookie 헤더에서 쿠키 정보 출력
      if (response.headers['set-cookie']) {
        this.logInfo('🍪 응답 쿠키:');
        response.headers['set-cookie'].forEach((cookie, index) => {
          console.log(`  ${index + 1}: ${cookie}`);
        });
      } else {
        this.logInfo('쿠키 없음');
      }
      
      // CurlHttpClient의 쿠키 저장소에서 현재 쿠키들 출력
      const domain = new URL(url).hostname;
      const cookieString = this.httpClient.getCookiesForDomain(domain);
      this.logInfo(`현재 쿠키 저장소 (${domain}): ${cookieString || 'None'}`);
      
      console.log('Response Data:', response.data);

      this.logInfo('네이버 쇼핑 홈페이지 HTTP 요청 중...');
      url = 'https://shopping.naver.com/ns/home';

      response = await this.httpClient.get(url, {}, {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://nlog.naver.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const htmlContent = response.data;
      this.logSuccess(`HTML 응답 수신 완료 (길이: ${htmlContent.length.toLocaleString()}자)`);
      
      return htmlContent;
    } catch (error) {
      this.logError(`네이버 쇼핑 HTTP 요청 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * HTML을 파일로 저장
   */
  async saveHtml(htmlContent, filename = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `result/naver-shopping-http-${timestamp}.html`;
      const filepath = filename || defaultFilename;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
      }

      await fsPromises.writeFile(filepath, htmlContent, 'utf8');
      this.logSuccess(`HTML 파일 저장 완료: ${filepath}`);
      
      return filepath;
    } catch (error) {
      this.logError(`HTML 파일 저장 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 네이버 쇼핑 홈페이지 HTTP 스크래핑 실행
   */
  async scrapeHomepage() {
    try {
      this.logInfo('네이버 쇼핑 HTTP 스크래핑 시작');

      // 부모 클래스 초기화 (프록시 테스트 포함)
      await this.init();

      // 홈페이지 HTML 가져오기
      const htmlContent = await this.getHomepageHtml();

      // HTML 파일 저장
      let savedPath = null;
      if (this.options.saveData) {
        savedPath = await this.saveHtml(htmlContent);
      }

      this.logSuccess('네이버 쇼핑 HTTP 스크래핑 완료');
      
      return {
        html: htmlContent,
        savedPath: savedPath,
        url: 'https://shopping.naver.com/ns/home',
        method: 'http',
        crawledAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logError(`네이버 쇼핑 HTTP 스크래핑 실패: ${error.message}`);
      throw error;
    }
  }
}

export default NaverShoppingHttpScraper;