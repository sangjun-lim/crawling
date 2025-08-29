import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

class SeleniumTest {
  constructor() {
    this.driver = null;
  }

  async init() {
    try {
      console.log('Selenium Chrome 초기화 중...');

      // Chrome 옵션 설정
      const options = new chrome.Options();

      // 데스크톱 설정 (모바일 에뮬레이션 제거)

      // 탐지 방지 옵션들
      options.addArguments([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions-except',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-web-security',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ]);

      // automation 관련 플래그 제거
      options.excludeSwitches(['enable-automation']);
      options.addArguments(['--disable-blink-features=AutomationControlled']);

      // 실험적 옵션
      options.setUserPreferences({
        'profile.default_content_setting_values.notifications': 2,
        'profile.default_content_settings.popups': 0,
        'profile.managed_default_content_settings.images': 1, // 1: 이미지 허용, 2: 이미지 차단
      });

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      // JavaScript로 webdriver 흔적 제거
      await this.driver.executeScript(`
        // webdriver 속성 제거
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Chrome DevTools Protocol 관련 속성 제거
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_JSON;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Object;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Proxy;

        // 자동화 도구 흔적 제거
        delete window.__webdriver_evaluate;
        delete window.__selenium_unwrapped;
        delete window.__webdriver_unwrapped;
        delete window.__driver_evaluate;
        delete window.__webdriver_script_func;
        delete window.__fxdriver_evaluate;
        delete window.__fxdriver_unwrapped;

        // Chrome runtime 위장
        if (!window.chrome) {
          window.chrome = {};
        }
        
        Object.defineProperty(window.chrome, 'runtime', {
          value: {
            onConnect: { addListener: function () {} },
            onMessage: { addListener: function () {} },
            connect: function () { return { onMessage: { addListener: function () {} } }; },
            sendMessage: function () {},
          },
          writable: false,
          configurable: false,
        });

        // 플러그인 정보 위장
        const plugins = [
          {
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format',
            length: 1,
          }
        ];

        Object.defineProperty(navigator, 'plugins', {
          get: () => plugins,
        });

        // 언어 설정
        Object.defineProperty(navigator, 'languages', {
          get: () => ['ko-KR', 'ko', 'en-US', 'en'],
        });

        // 권한 API 위장
        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
          window.navigator.permissions.query = function (parameters) {
            return Promise.resolve({
              state: parameters.name === 'notifications' ? 'default' : 'granted',
              addEventListener: function () {},
              removeEventListener: function () {},
            });
          };
        }
      `);

      console.log('✅ Selenium Chrome 초기화 완료');
      console.log('🌐 브라우저가 열렸습니다. 직접 조작해보세요!');
      console.log('💻 데스크톱 Chrome으로 설정됨 (1920x1080)');
      console.log('🔧 Ctrl+C를 눌러 종료하세요');

      return true;
    } catch (error) {
      console.error(`Selenium 초기화 실패: ${error.message}`);
      return false;
    }
  }

  async navigateToNaver() {
    try {
      console.log('네이버 메인 페이지로 이동 중...');
      await this.driver.get('https://www.naver.com');
      await this.driver.wait(until.titleContains('NAVER'), 10000);
      console.log('✅ 네이버 메인 페이지 로딩 완료');
    } catch (error) {
      console.error(`네이버 접속 실패: ${error.message}`);
    }
  }

  async navigateToNaverShopping() {
    try {
      console.log('네이버 쇼핑 페이지로 이동 중...');
      await this.driver.get('https://search.shopping.naver.com/home');

      // 페이지 로딩 대기
      await this.driver.sleep(3000);
      console.log('✅ 네이버 쇼핑 페이지 로딩 완료');
    } catch (error) {
      console.error(`네이버 쇼핑 접속 실패: ${error.message}`);
    }
  }

  async close() {
    try {
      if (this.driver) {
        await this.driver.quit();
        this.driver = null;
      }
      console.log('✅ 브라우저 종료 완료');
    } catch (error) {
      console.error(`브라우저 종료 실패: ${error.message}`);
    }
  }
}

// 테스트 실행
async function runTest() {
  const test = new SeleniumTest();

  try {
    const initialized = await test.init();
    if (!initialized) {
      process.exit(1);
    }

    // 네이버 메인 페이지로 이동
    await test.navigateToNaver();

    // Ctrl+C 처리
    process.on('SIGINT', async () => {
      console.log('\n종료 신호 감지...');
      await test.close();
      process.exit(0);
    });

    // 무한 대기 (사용자가 직접 조작할 수 있도록)
    console.log('\n=== Selenium 테스트 시작 ===');
    console.log('브라우저에서 직접 조작해보세요!');
    console.log('종료하려면 Ctrl+C를 누르세요.');

    // 무한 루프로 대기
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('테스트 실행 중 오류:', error);
    await test.close();
    process.exit(1);
  }
}

// 테스트 시작
runTest();
