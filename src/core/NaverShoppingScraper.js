import BaseScraper from './BaseScraper.js';
import { chromium } from 'playwright';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

class NaverShoppingScraper extends BaseScraper {
  constructor(options = {}) {
    super(options);
    
    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 500,
      saveData: options.saveData ?? true,
      ...options,
    };

    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    try {
      // 부모 클래스 초기화 (프록시 테스트 포함)
      await super.init();
      
      this.logInfo('Playwright 브라우저 초기화 중...');

      const launchOptions = {
        headless: false,//this.options.headless,
        slowMo: this.options.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      };

      // 프록시 설정 적용
      const playwrightProxyConfig = this.getPlaywrightProxyConfig();
      if (playwrightProxyConfig) {
        launchOptions.proxy = playwrightProxyConfig;
        this.logInfo(`프록시 설정 적용: ${playwrightProxyConfig.server}`);
      }

      this.browser = await chromium.launch(launchOptions);

      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        extraHTTPHeaders: {
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });

      this.page = await this.context.newPage();
      await this.setupAntiDetection();

      this.logSuccess('Playwright 초기화 완료');
      return true;
    } catch (error) {
      this.logError(`Playwright 초기화 실패: ${error.message}`);
      return false;
    }
  }

  async setupAntiDetection() {
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      delete navigator.__proto__.webdriver;

      window.chrome = {
        runtime: {},
      };

      Object.defineProperty(navigator, 'languages', {
        get: () => ['ko-KR', 'ko', 'en'],
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });
  }

  /**
   * 네이버 쇼핑 홈페이지 접속 및 HTML 반환
   */
  async getHomepageHtml() {
    if (!this.page) {
      await this.init();
    }

    try {
      this.logInfo('네이버 쇼핑 홈페이지 접속 중...');
      const url = 'https://shopping.naver.com/ns/home';

      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout,
      });

      // 페이지 로딩 대기
      await this.page.waitForTimeout(2000);
      
      this.logSuccess('네이버 쇼핑 홈페이지 로딩 완료');

      // HTML 내용 추출
      const htmlContent = await this.page.content();
      
      this.logInfo(`HTML 길이: ${htmlContent.length.toLocaleString()}자`);

      return htmlContent;
    } catch (error) {
      this.logError(`네이버 쇼핑 페이지 접속 실패: ${error.message}`);
      
      // 에러 시 스크린샷 저장
      if (this.page) {
        await this.page.screenshot({
          path: `error-naver-shopping-${Date.now()}.png`,
          fullPage: true,
        });
      }
      
      throw error;
    }
  }

  /**
   * HTML을 파일로 저장
   */
  async saveHtml(htmlContent, filename = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `result/naver-shopping-${timestamp}.html`;
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
   * 네이버 쇼핑 홈페이지 스크래핑 실행
   */
  async scrapeHomepage() {
    try {
      this.logInfo('네이버 쇼핑 홈페이지 스크래핑 시작');

      // Playwright 초기화
      const initialized = await this.init();
      if (!initialized) {
        throw new Error('Playwright 초기화 실패');
      }

      // 홈페이지 HTML 가져오기
      const htmlContent = await this.getHomepageHtml();

      // HTML 파일 저장
      let savedPath = null;
      if (this.options.saveData) {
        savedPath = await this.saveHtml(htmlContent);
      }

      this.logSuccess('네이버 쇼핑 홈페이지 스크래핑 완료');
      
      return {
        html: htmlContent,
        savedPath: savedPath,
        url: 'https://shopping.naver.com/ns/home',
        crawledAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logError(`네이버 쇼핑 스크래핑 실패: ${error.message}`);
      throw error;
    } finally {
      await this.close();
    }
  }

  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.logSuccess('Playwright 브라우저 종료 완료');
      
      // 부모 클래스 정리 호출
      await super.close();
    } catch (error) {
      this.logError(`Playwright 브라우저 종료 실패: ${error.message}`);
    }
  }
}

export default NaverShoppingScraper;