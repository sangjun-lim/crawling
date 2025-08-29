import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';

class PlaywrightTest {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    try {
      console.log('CDP를 통해 기존 브라우저에 연결 중...');

      // Stealth 플러그인 활성화
      chromium.use(stealth());

      const fingerprintGenerator = new FingerprintGenerator({
        devices: ['desktop'],
        operatingSystems: ['macos'],
        browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 130 }],
        locales: ['ko-KR', 'ko', 'en-US', 'en'],
        mockWebRTC: true,
      });
      const fingerprint = fingerprintGenerator.getFingerprint();

      // 디버깅: fingerprint 구조 확인
      console.log('Fingerprint 구조:', JSON.stringify(fingerprint, null, 2));

      // CDP를 통해 기존 브라우저에 연결 (IPv4 명시)
      this.browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

      // 기존 브라우저의 컨텍스트 가져오기
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        console.log('✅ 기존 컨텍스트 사용');
      } else {
        // 컨텍스트가 없으면 새로 생성
        this.context = await this.browser.newContext({
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: {
            width: 1440,
            height: 900,
          },
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul',
          extraHTTPHeaders: {
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
          deviceScaleFactor: 1.0,
          hasTouch: false,
          isMobile: false,
        });
        console.log('✅ 새 컨텍스트 생성');
      }

      // 기존 페이지가 있으면 사용, 없으면 새로 생성
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.page = pages[0];
        console.log('✅ 기존 페이지 사용');
      } else {
        this.page = await this.context.newPage();
        console.log('✅ 새 페이지 생성');
      }

      // fingerprint JS 스크립트 추가
      try {
        const fingerprintJS = fingerprintGenerator.getJS();
        if (fingerprintJS) {
          await this.context.addInitScript({ content: fingerprintJS });
          console.log('✅ Fingerprint JS 스크립트 적용 완료');
        } else {
          console.log(
            '⚠️ Fingerprint JS가 없음 - 기본 안티 탐지 스크립트만 사용'
          );
        }
      } catch (jsError) {
        console.log(
          `⚠️ Fingerprint JS 생성 실패: ${jsError.message} - 기본 안티 탐지 스크립트만 사용`
        );
      }

      // 강화된 안티 탐지 스크립트
      await this.context.addInitScript(() => {
        // webdriver 속성 완전 제거
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Chrome DevTools Protocol 관련 속성 제거
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

        // Playwright 및 자동화 도구 흔적 제거
        delete window.__playwright;
        delete window.__webdriver_script_fn;
        delete window.__webdriver_evaluate;
        delete window.__selenium_unwrapped;
        delete window.__webdriver_unwrapped;
        delete window.__driver_evaluate;
        delete window.__webdriver_script_func;
        delete window.__fxdriver_evaluate;
        delete window.__fxdriver_unwrapped;

        // 권한 관련 API 위장
        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
          window.navigator.permissions.query = function (parameters) {
            const permissionStatus = {
              state:
                parameters.name === 'notifications'
                  ? Notification.permission || 'default'
                  : 'granted',
              addEventListener: function () {},
              removeEventListener: function () {},
            };
            return Promise.resolve(permissionStatus);
          };
        }

        // WebGL 정보 위장
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          contextType,
          contextAttributes
        ) {
          if (contextType === 'webgl' || contextType === 'experimental-webgl') {
            const context = getContext.call(
              this,
              contextType,
              contextAttributes
            );
            if (context) {
              const getParameter = context.getParameter;
              context.getParameter = function (parameter) {
                // GPU 정보 위장 (MacBook Air M1)
                if (parameter === 37445) return 'Apple Inc.'; // VENDOR
                if (parameter === 37446)
                  return 'ANGLE (Apple, Apple M1, OpenGL 4.1 Metal - 83)'; // RENDERER
                return getParameter.call(this, parameter);
              };
            }
            return context;
          }
          return getContext.call(this, contextType, contextAttributes);
        };

        // 플러그인 정보 위장 (Chrome)
        const plugins = [
          {
            name: 'Chrome PDF Plugin',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format',
            length: 1,
          },
          {
            name: 'Chrome PDF Viewer',
            filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
            description: '',
            length: 1,
          },
        ];

        Object.defineProperty(navigator, 'plugins', {
          get: () => plugins,
        });

        // 언어 설정
        Object.defineProperty(navigator, 'languages', {
          get: () => ['ko-KR', 'ko', 'en-US', 'en'],
        });

        // 하드웨어 정보 위장 (MacBook Air M1)
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => 8, // M1 8코어
        });
        
        // 지리적 위치 설정 (한국)
        const originalGeolocation = navigator.geolocation?.getCurrentPosition;
        if (originalGeolocation) {
          navigator.geolocation.getCurrentPosition = function(success, error, options) {
            success({
              coords: {
                latitude: 37.5665, // 서울
                longitude: 126.9780,
                accuracy: 100
              }
            });
          };
        }

        // Connection API 위장
        if (navigator.connection) {
          Object.defineProperty(navigator, 'connection', {
            get: () => ({
              effectiveType: '4g',
              type: 'wifi',
              downlink: 10,
              rtt: 50,
              saveData: false,
            }),
          });
        }

        // Timing API 노이즈 추가
        const originalNow = performance.now;
        performance.now = function () {
          return originalNow.call(this) + Math.random() * 0.1;
        };
      });

      console.log('✅ 기존 브라우저에 연결 완료');
      console.log('🌐 localhost:9222에서 실행 중인 브라우저에 연결되었습니다');
      console.log('💻 데스크톱 MacBook Air M1 위장 설정됨');
      console.log('🔧 Ctrl+C를 눌러 연결을 종료하세요');

      return true;
    } catch (error) {
      console.error(`CDP 연결 실패: ${error.message}`);
      console.error('Chrome을 --remote-debugging-port=9222 옵션으로 실행했는지 확인하세요.');
      return false;
    }
  }

  async navigateToNaver() {
    try {
      console.log('네이버 메인 페이지로 이동 중...');
      await this.page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      console.log('✅ 네이버 메인 페이지 로딩 완료');
    } catch (error) {
      console.error(`네이버 접속 실패: ${error.message}`);
    }
  }

  async navigateToNaverShopping() {
    try {
      console.log('네이버 쇼핑 페이지로 이동 중...');
      await this.page.goto('https://search.shopping.naver.com/home', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      console.log('✅ 네이버 쇼핑 페이지 로딩 완료');
    } catch (error) {
      console.error(`네이버 쇼핑 접속 실패: ${error.message}`);
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
        // CDP 연결만 해제, 브라우저는 종료하지 않음
        await this.browser.close();
        this.browser = null;
      }
      console.log('✅ 브라우저 연결 해제 완료 (브라우저는 계속 실행 중)');
    } catch (error) {
      console.error(`브라우저 연결 해제 실패: ${error.message}`);
    }
  }
}

// 테스트 실행
async function runTest() {
  const test = new PlaywrightTest();

  try {
    const initialized = await test.init();
    if (!initialized) {
      process.exit(1);
    }

    // 네이버 메인 페이지로 이동
    await test.navigateToNaver();

    // 3초 대기 후 쇼핑 페이지로 이동
    setTimeout(async () => {
      await test.navigateToNaverShopping();
    }, 3000);

    // Ctrl+C 처리
    process.on('SIGINT', async () => {
      console.log('\n종료 신호 감지...');
      await test.close();
      process.exit(0);
    });

    // 무한 대기 (사용자가 직접 조작할 수 있도록)
    console.log('\n=== 테스트 시작 ===');
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
