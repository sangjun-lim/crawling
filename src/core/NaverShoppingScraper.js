import BaseScraper from './BaseScraper.js';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import AntiDetectionUtils from '../utils/AntiDetectionUtils.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { FingerprintGenerator } from 'fingerprint-generator';

class NaverShoppingScraper extends BaseScraper {
  constructor(options = {}) {
    super(options);

    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 100,
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
      this.logInfo('Playwright-Extra + FingerprintGenerator 초기화 중...');

      // Stealth 플러그인 임시 비활성화 (헤더 테스트용)
      chromium.use(stealth());
      const fingerprintGenerator = new FingerprintGenerator({
        devices: ['mobile'],
        operatingSystems: ['android'],
        browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 130 }],
        locales: ['ko-KR', 'en-US'],
        mockWebRTC: true,
      });
      const fingerprint = fingerprintGenerator.getFingerprint();

      // 디버깅: fingerprint 구조 확인
      console.log('Fingerprint 구조:', JSON.stringify(fingerprint, null, 2));

      const launchOptions = {
        headless: false,
        slowMo: this.options.slowMo,
        args: [
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
          '--no-zygote',
          '--disable-extensions-except',
          '--disable-extensions',
          '--disable-default-apps',
          '--window-size=375,812',
          // 실제 브라우저와 더 유사하게
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
        ignoreDefaultArgs: [
          '--enable-automation',
          '--enable-blink-features=AutomationControlled',
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
        userAgent: fingerprint.headers['user-agent'],
        viewport: {
          width: fingerprint.fingerprint.screen.width,
          height: fingerprint.fingerprint.screen.height,
        },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        extraHTTPHeaders: fingerprint.headers,
        deviceScaleFactor: fingerprint.fingerprint.screen.devicePixelRatio,
        hasTouch: true,
        isMobile: true,
      });

      this.page = await this.context.newPage();

      // fingerprint JS 스크립트 추가 (최신 API 사용)
      try {
        const fingerprintJS = fingerprintGenerator.getJS();
        if (fingerprintJS) {
          await this.context.addInitScript({ content: fingerprintJS });
          this.logInfo('✅ Fingerprint JS 스크립트 적용 완료');
        } else {
          this.logInfo(
            '⚠️ Fingerprint JS가 없음 - 기본 안티 탐지 스크립트만 사용'
          );
        }
      } catch (jsError) {
        this.logInfo(
          `⚠️ Fingerprint JS 생성 실패: ${jsError.message} - 기본 안티 탐지 스크립트만 사용`
        );
      }
      await this.context.addInitScript(() => {
        // webdriver 속성은 확실하게 제거
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        // Playwright 특정 흔적 제거
        delete window.__playwright;
      });

      // 네트워크 요청/응답 로깅 설정
      this.page.on('request', async (request) => {
        const url = request.url();
        if (url.includes('shopping.naver.com') || url.includes('search')) {
          this.logInfo(`🔵 REQUEST: ${request.method()} ${url}`);
          this.logInfo(
            `📤 Headers: ${JSON.stringify(request.headers(), null, 2)}`
          );

          // 쿠키 정보도 로깅
          const cookies = await this.context.cookies(url);
          if (cookies.length > 0) {
            this.logInfo(`🍪 Cookies: ${JSON.stringify(cookies, null, 2)}`);
          } else {
            this.logInfo(`🍪 Cookies: 없음`);
          }

          const postData = request.postData();
          if (postData) {
            this.logInfo(`📤 Body: ${postData}`);
          }
        }
      });

      this.page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('shopping.naver.com') || url.includes('search')) {
          this.logInfo(`🔴 RESPONSE: ${response.status()} ${url}`);
          this.logInfo(
            `📥 Headers: ${JSON.stringify(response.headers(), null, 2)}`
          );

          // 418 에러인 경우 응답 내용도 확인
          if (response.status() === 418) {
            try {
              const responseText = await response.text();
              this.logInfo(
                `📄 418 응답 내용 (처음 500자): ${responseText.substring(
                  0,
                  500
                )}`
              );
            } catch (textError) {
              this.logInfo(`📄 응답 내용 읽기 실패: ${textError.message}`);
            }
          }
        }
      });

      // 강력한 탐지 방지 스크립트
      // await this.context.addInitScript(() => {
      //   // webdriver 속성 완전 제거
      //   Object.defineProperty(navigator, 'webdriver', {
      //     get: () => undefined,
      //   });

      //   // Chrome DevTools Protocol 관련 속성 제거
      //   delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      //   delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      //   delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      //   delete window.cdc_adoQpoasnfa76pfcZLmcfl_JSON;
      //   delete window.cdc_adoQpoasnfa76pfcZLmcfl_Object;
      //   delete window.cdc_adoQpoasnfa76pfcZLmcfl_Proxy;

      //   // Playwright 및 자동화 도구 흔적 제거
      //   delete window.__playwright;
      //   delete window.__webdriver_script_fn;
      //   delete window.__webdriver_evaluate;
      //   delete window.__selenium_unwrapped;
      //   delete window.__webdriver_unwrapped;
      //   delete window.__driver_evaluate;
      //   delete window.__webdriver_script_func;
      //   delete window.__fxdriver_evaluate;
      //   delete window.__fxdriver_unwrapped;
      //   delete window.__nightmare;
      //   delete window.phantom;
      //   delete window.callPhantom;

      //   // 추가 자동화 도구 흔적 제거
      //   delete window.domAutomation;
      //   delete window.domAutomationController;
      //   delete window.htmlWebdriverApi;
      //   delete window.selenium;
      //   delete window._Selenium_IDE_Recorder;
      //   delete window._selenium;
      //   delete window.calledSelenium;
      //   delete window._WEBDRIVER_ELEM_CACHE;
      //   delete window.ChromeDriverw;
      //   delete window.driver;
      //   delete window.webdriver;

      //   // performance.timing 자연스럽게 위장
      //   if (window.performance && window.performance.timing) {
      //     const timing = window.performance.timing;
      //     const fakeStart = Date.now() - Math.random() * 5000;
      //     Object.defineProperty(timing, 'navigationStart', {
      //       get: () => fakeStart,
      //     });
      //     Object.defineProperty(timing, 'loadEventEnd', {
      //       get: () => fakeStart + Math.random() * 3000 + 1000,
      //     });
      //   }

      //   // Chrome runtime 및 extension API 완전 위장
      //   if (!window.chrome) {
      //     window.chrome = {};
      //   }

      //   Object.defineProperty(window.chrome, 'runtime', {
      //     value: {
      //       onConnect: {
      //         addListener: function () {},
      //         removeListener: function () {},
      //         hasListener: function () {
      //           return false;
      //         },
      //       },
      //       onMessage: {
      //         addListener: function () {},
      //         removeListener: function () {},
      //         hasListener: function () {
      //           return false;
      //         },
      //       },
      //       connect: function () {
      //         return { onMessage: { addListener: function () {} } };
      //       },
      //       sendMessage: function () {},
      //       getManifest: function () {
      //         return {};
      //       },
      //       getURL: function (path) {
      //         return 'chrome-extension://invalid/' + path;
      //       },
      //     },
      //     writable: false,
      //     configurable: false,
      //   });

      //   // loadTimes API 위장
      //   if (!window.chrome.loadTimes) {
      //     Object.defineProperty(window.chrome, 'loadTimes', {
      //       value: function () {
      //         return {
      //           requestTime: performance.timing.navigationStart / 1000,
      //           startLoadTime: performance.timing.navigationStart / 1000,
      //           commitLoadTime: performance.timing.responseStart / 1000,
      //           finishDocumentLoadTime:
      //             performance.timing.domContentLoadedEventEnd / 1000,
      //           finishLoadTime: performance.timing.loadEventEnd / 1000,
      //           firstPaintTime: performance.timing.loadEventEnd / 1000,
      //           firstPaintAfterLoadTime: 0,
      //           navigationType: 'Other',
      //           wasFetchedViaSpdy: false,
      //           wasNpnNegotiated: false,
      //           npnNegotiatedProtocol: 'unknown',
      //           wasAlternateProtocolAvailable: false,
      //           connectionInfo: 'http/1.1',
      //         };
      //       },
      //       writable: false,
      //       configurable: false,
      //     });
      //   }

      //   // 권한 관련 API 완전 위장
      //   const originalQuery = window.navigator.permissions?.query;
      //   if (originalQuery) {
      //     window.navigator.permissions.query = function (parameters) {
      //       const permissionStatus = {
      //         state:
      //           parameters.name === 'notifications'
      //             ? Notification.permission || 'default'
      //             : 'granted',
      //         addEventListener: function () {},
      //         removeEventListener: function () {},
      //       };
      //       return Promise.resolve(permissionStatus);
      //     };
      //   }

      //   // WebGL 완전 위장 (더 정교하게)
      //   const contexts = [
      //     'webgl',
      //     'webgl2',
      //     'experimental-webgl',
      //     'experimental-webgl2',
      //   ];
      //   const getContext = HTMLCanvasElement.prototype.getContext;

      //   HTMLCanvasElement.prototype.getContext = function (
      //     contextType,
      //     contextAttributes
      //   ) {
      //     if (contexts.includes(contextType)) {
      //       const context = getContext.call(
      //         this,
      //         contextType,
      //         contextAttributes
      //       );
      //       if (context) {
      //         const getParameter = context.getParameter;
      //         context.getParameter = function (parameter) {
      //           // GPU 정보 위장
      //           if (parameter === 37445) return 'Intel Inc.'; // VENDOR
      //           if (parameter === 37446) return 'Intel Iris Pro OpenGL Engine'; // RENDERER
      //           if (parameter === 7936)
      //             return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)'; // VERSION
      //           if (parameter === 35724)
      //             return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)'; // SHADING_LANGUAGE_VERSION

      //           // 기타 파라미터들
      //           if (parameter === 34921) return new Float32Array([1, 1]); // ALIASED_LINE_WIDTH_RANGE
      //           if (parameter === 34930) return new Float32Array([1, 1024]); // ALIASED_POINT_SIZE_RANGE
      //           if (parameter === 3379) return 16384; // MAX_TEXTURE_SIZE
      //           if (parameter === 34076) return 16384; // MAX_CUBE_MAP_TEXTURE_SIZE

      //           return getParameter.call(this, parameter);
      //         };
      //       }
      //       return context;
      //     }
      //     return getContext.call(this, contextType, contextAttributes);
      //   };

      //   // Canvas fingerprinting 방지
      //   const getImageData = CanvasRenderingContext2D.prototype.getImageData;
      //   CanvasRenderingContext2D.prototype.getImageData = function (
      //     sx,
      //     sy,
      //     sw,
      //     sh
      //   ) {
      //     const imageData = getImageData.call(this, sx, sy, sw, sh);
      //     // 매우 미세한 노이즈 추가
      //     for (let i = 0; i < imageData.data.length; i += 4) {
      //       if (Math.random() < 0.001) {
      //         imageData.data[i] = Math.max(
      //           0,
      //           Math.min(255, imageData.data[i] + Math.random() - 0.5)
      //         );
      //       }
      //     }
      //     return imageData;
      //   };

      //   // 플러그인 정보 더 현실적으로 위장
      //   const plugins = [
      //     {
      //       name: 'Chrome PDF Plugin',
      //       filename: 'internal-pdf-viewer',
      //       description: 'Portable Document Format',
      //       length: 1,
      //     },
      //     {
      //       name: 'Chrome PDF Viewer',
      //       filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
      //       description: '',
      //       length: 1,
      //     },
      //     {
      //       name: 'Native Client',
      //       filename: 'internal-nacl-plugin',
      //       description: '',
      //       length: 2,
      //     },
      //   ];

      //   Object.defineProperty(navigator, 'plugins', {
      //     get: () => plugins,
      //   });

      //   // 언어 설정 더 자연스럽게
      //   Object.defineProperty(navigator, 'languages', {
      //     get: () => ['ko-KR', 'ko', 'en-US', 'en'],
      //   });

      //   // 하드웨어 정보 위장
      //   Object.defineProperty(navigator, 'hardwareConcurrency', {
      //     get: () =>
      //       Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 16)),
      //   });

      //   // 메모리 정보 위장 (있는 경우에만)
      //   if (navigator.deviceMemory) {
      //     Object.defineProperty(navigator, 'deviceMemory', {
      //       get: () => 8,
      //     });
      //   }

      //   // Connection API 위장
      //   if (navigator.connection) {
      //     Object.defineProperty(navigator, 'connection', {
      //       get: () => ({
      //         effectiveType: '4g',
      //         type: 'wifi',
      //         downlink: 10,
      //         rtt: 50,
      //         saveData: false,
      //       }),
      //     });
      //   }

      //   // Timing API 노이즈 추가
      //   const originalNow = performance.now;
      //   performance.now = function () {
      //     return originalNow.call(this) + Math.random() * 0.1;
      //   };
      // });

      this.logSuccess('Playwright-Extra with Stealth 초기화 완료');
      return true;
    } catch (error) {
      this.logError(`Playwright 초기화 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 랜덤 대기 시간 생성 (자연스러운 사용자 행동 시뮬레이션)
   */
  async randomWait(min = 800, max = 2500) {
    const waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await this.page.waitForTimeout(waitTime);
  }

  /**
   * 보안 확인 페이지 처리 - 사용자가 수동으로 해결할 때까지 대기
   */
  async waitForSecurityCheck() {
    try {
      // 페이지 네비게이션 완료 대기
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await this.randomWait(2000, 3000);

      let pageContent;
      try {
        // 보안 확인 페이지 감지
        pageContent = await this.page.content();
      } catch (contentError) {
        this.logInfo('페이지 컨텐츠 가져오기 실패 - 잠시 후 재시도...');
        await this.randomWait(3000, 5000);
        pageContent = await this.page.content();
      }

      if (
        pageContent.includes('보안 확인을 완료해 주세요') ||
        pageContent.includes('보안문자') ||
        pageContent.includes('captcha') ||
        pageContent.includes('영수증')
      ) {
        this.logInfo('🚨 보안 확인 페이지 감지 - 사용자 입력 대기 중...');
        this.logInfo('👆 브라우저에서 보안 확인을 완료해 주세요.');

        // 보안 확인이 완료될 때까지 대기 (최대 10분)
        const maxWaitTime = 10 * 60 * 1000; // 10분
        const checkInterval = 3000; // 3초마다 확인
        let waitedTime = 0;

        while (waitedTime < maxWaitTime) {
          await this.page.waitForTimeout(checkInterval);
          waitedTime += checkInterval;

          // 현재 페이지 내용 다시 확인
          let currentContent;
          try {
            currentContent = await this.page.content();
          } catch (contentError) {
            this.logInfo('페이지 컨텐츠 가져오기 실패 - 계속 대기...');
            continue;
          }
          const currentUrl = this.page.url();

          // 보안 확인 페이지를 벗어났는지 확인
          if (
            !currentContent.includes('보안 확인을 완료해 주세요') &&
            !currentContent.includes('보안문자') &&
            !currentContent.includes('captcha') &&
            !currentContent.includes('영수증') &&
            (currentUrl.includes('naver.com') ||
              currentUrl.includes('shopping'))
          ) {
            this.logSuccess('✅ 보안 확인 완료 감지 - 계속 진행합니다.');
            break;
          }

          // 진행 상황 로그
          const remainingMinutes = Math.ceil(
            (maxWaitTime - waitedTime) / 60000
          );
          this.logInfo(
            `⏳ 보안 확인 대기 중... (남은 시간: ${remainingMinutes}분)`
          );
        }

        if (waitedTime >= maxWaitTime) {
          this.logError('⚠️ 보안 확인 대기 시간 초과 (10분)');
          throw new Error('보안 확인 대기 시간 초과');
        }

        // CAPTCHA 완료 후 세션 상태 확인
        this.logInfo('🔍 CAPTCHA 완료 후 세션 상태 확인 중...');

        // 현재 쿠키 확인
        const cookies = await this.context.cookies();
        this.logInfo(`🍪 보유 쿠키 수: ${cookies.length}`);

        cookies.forEach((cookie, index) => {
          this.logInfo(
            `🍪 쿠키 ${index + 1}: ${cookie.name} = ${cookie.value.substring(
              0,
              20
            )}...`
          );
        });

        // 페이지 URL과 상태 확인
        const finalUrl = this.page.url();
        this.logInfo(`📍 CAPTCHA 완료 후 최종 URL: ${finalUrl}`);

        // 페이지 타이틀 확인
        const pageTitle = await this.page.title();
        this.logInfo(`📋 페이지 제목: ${pageTitle}`);

        // 페이지에 검색창이 있는지 확인
        const hasSearchInput =
          (await this.page.$('input[type="text"]')) !== null;
        this.logInfo(
          `🔍 검색창 존재 여부: ${hasSearchInput ? '있음' : '없음'}`
        );
      }
    } catch (error) {
      this.logError(`보안 확인 처리 오류: ${error.message}`);
      throw error;
    }
  }

  /**
   * 서비스 이용 제한 페이지 감지
   */
  async checkServiceRestriction() {
    try {
      const pageContent = await this.page.content();
      const currentUrl = this.page.url();

      // 서비스 제한 페이지 감지
      const isRestricted =
        pageContent.includes('일시적으로 제한') ||
        pageContent.includes('VPN을 사용하여 접속');

      if (isRestricted) {
        this.logInfo('🚨 서비스 이용 제한 페이지 감지');
        return true;
      }

      return false;
    } catch (error) {
      this.logError(`서비스 제한 감지 오류: ${error.message}`);
      return false;
    }
  }

  /**
   * 스토어 홈페이지에서 다시 검색 시도
   */
  async retryFromStorePage(searchKeyword) {
    try {
      this.logInfo('스토어 홈페이지로 이동 중...');

      // 스토어 홈페이지로 이동
      await this.page.goto('https://shopping.naver.com/ns/home', {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      await this.randomWait(3000, 5000);
      this.logSuccess('스토어 홈페이지 로딩 완료');

      // 다시 검색 시도
      this.logInfo(`다시 검색 시도: ${searchKeyword}`);

      // 검색창 찾기
      const searchInput =
        (await this.page.$('input[placeholder*="상품명 또는 브랜드"]')) ||
        (await this.page.$('input[title*="검색어"]')) ||
        (await this.page.$('input[class*="searchInput"][class*="text"]'));

      if (!searchInput) {
        throw new Error('검색창을 찾을 수 없습니다');
      }

      this.logInfo('검색창 발견 - 검색어 입력 중...');

      // 검색어 입력
      await this.naturalHover('input[placeholder*="상품명 또는 브랜드"]');
      await searchInput.click();
      await this.randomWait(300, 800);

      await searchInput.fill('');
      await this.randomWait(200, 400);

      for (const char of searchKeyword) {
        await searchInput.type(char);
        await this.randomWait(100, 300);
      }
      await this.randomWait(500, 1000);

      // Enter 키로 검색
      this.logInfo('Enter 키로 검색 실행...');
      await searchInput.press('Enter');
      await this.randomWait(2000, 4000);

      // 다시 검색 결과 로딩 대기
      await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await this.randomWait(3000, 5000);

      // 보안 확인 페이지 처리
      await this.waitForSecurityCheck();

      this.logSuccess('스토어에서 다시 검색 완료');

      // 최종 HTML 내용 추출
      const htmlContent = await this.page.content();
      const currentUrl = this.page.url();

      this.logInfo(`최종 URL: ${currentUrl}`);
      this.logInfo(`HTML 길이: ${htmlContent.length.toLocaleString()}자`);

      return {
        html: htmlContent,
        url: currentUrl,
        savedPath: null,
        retried: true, // 재시도 플래그
        stats: {
          crawlCount: 1,
          nextSessionReset: 10,
          tlsSupport: 'TLSv1.3',
        },
      };
    } catch (error) {
      this.logError(`스토어에서 다시 검색 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 자연스러운 마우스 호버 액션
   */
  async naturalHover(selector) {
    const element = await this.page.$(selector);
    if (element) {
      // 요소 위치 가져오기
      const box = await element.boundingBox();
      if (box) {
        const viewport = this.page.viewportSize();
        const startX = Math.random() * viewport.width * 0.3;
        const startY = Math.random() * viewport.height * 0.3;
        const endX = box.x + box.width / 2;
        const endY = box.y + box.height / 2;

        // 자연스러운 마우스 움직임 시뮬레이션
        await AntiDetectionUtils.naturalMouseMovement(
          this.page,
          { x: startX, y: startY },
          { x: endX, y: endY },
          15
        );
      }

      await element.hover();
      await this.randomWait(200, 800);
    }
  }

  /**
   * 자연스러운 페이지 스크롤
   */
  async naturalScroll() {
    // 더 자연스러운 단계적 스크롤
    await this.page.evaluate(async () => {
      const scrollHeight = document.body.scrollHeight;
      const viewportHeight = window.innerHeight;
      const scrollStep = viewportHeight / 4;

      for (
        let y = 0;
        y < Math.min(scrollHeight, viewportHeight * 2);
        y += scrollStep
      ) {
        window.scrollTo(0, y);
        await new Promise((resolve) =>
          setTimeout(resolve, 150 + Math.random() * 100)
        );
      }
    });
    await this.randomWait(300, 800);
  }

  /**
   * 네이버 쇼핑 검색 프로세스 수행
   */
  async scrapeProduct(searchKeyword = '의자') {
    if (!this.page) {
      await this.init();
    }

    try {
      // 네이버 쇼핑 모바일 검색 홈페이지 직접 접속
      this.logInfo('네이버 쇼핑 모바일 검색 페이지 접속 중...');
      const url = 'https://search.shopping.naver.com/home';

      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout,
      });

      // 페이지 안정적 로딩 대기
      await AntiDetectionUtils.waitForStableLoad(this.page);

      // 캡차 및 보안 확인 처리
      await this.waitForSecurityCheck();

      // 페이지 재로딩 대기 (캡차 완료 후)
      await this.randomWait(3000, 5000);

      this.logSuccess('네이버 쇼핑 검색 페이지 로딩 완료');

      // 검색창 찾고 검색어 입력
      this.logInfo('검색창 찾는 중...');

      // 검색창 요소 새로 찾기 (캡차 완료 후 DOM 변경 대응)
      let searchInput = null;
      let attempts = 0;
      const maxAttempts = 5;

      while (!searchInput && attempts < maxAttempts) {
        attempts++;
        this.logInfo(`검색창 찾기 시도 ${attempts}/${maxAttempts}...`);

        await this.randomWait(2000, 3000);

        searchInput =
          (await this.page.$(
            'input[placeholder*="상품명 또는 브랜드 입력"]'
          )) ||
          (await this.page.$('input[title*="검색어 입력"]')) ||
          (await this.page.$('input[class*="searchInput"][type*="text"]')) ||
          (await this.page.$('input[type="text"]'));
      }

      if (!searchInput) {
        throw new Error('검색창을 찾을 수 없습니다');
      }

      this.logInfo(`검색창 발견 - "${searchKeyword}" 입력 중...`);

      // 검색창에 실제로 클릭하고 포커스 설정
      try {
        // 먼저 검색창이 보이는지 확인
        await this.page.waitForSelector('input[type="text"]', {
          timeout: 10000,
        });

        // 스크롤해서 검색창이 보이도록
        await searchInput.scrollIntoViewIfNeeded();
        await this.randomWait(1000, 2000);

        // 검색창 직접 클릭
        await searchInput.click();
        await this.randomWait(500, 1000);
      } catch (clickError) {
        this.logInfo(
          `직접 클릭 실패: ${clickError.message} - 좌표로 클릭 시도`
        );

        // 좌표로 클릭
        const box = await searchInput.boundingBox();
        if (box) {
          await this.page.mouse.click(
            box.x + box.width / 2,
            box.y + box.height / 2
          );
          await this.randomWait(500, 1000);
        }
      }

      // 전체 선택 후 입력
      await this.page.keyboard.press('Control+A');
      await this.randomWait(200, 400);

      // 한글자씩 타이핑
      for (const char of searchKeyword) {
        await this.page.keyboard.type(char);
        await this.randomWait(100, 300);
      }
      await this.randomWait(500, 1000);

      // 4단계: 검색 버튼 클릭 (여러 방법 시도)
      this.logInfo('검색 실행 중...');

      try {
        // 방법 1: Enter 키 입력 (가장 자연스러운 방법)
        this.logInfo('Enter 키로 검색 시도...');
        await this.page.keyboard.press('Enter');
        await this.randomWait(1500, 3000);
      } catch (enterError) {
        this.logInfo('Enter 키 실패, 검색 버튼 클릭 시도...');

        // 방법 2: 검색 버튼 클릭 (data 속성 기반)
        const searchButton =
          (await this.page.$('button[data-shp-area-id="search"]')) ||
          (await this.page.$(
            'button[class*="searchInput"][class*="search"]'
          )) ||
          (await this.page.$('button:has(span.blind:text("검색"))')) ||
          (await this.page.$('button:has(svg circle)'));

        if (!searchButton) {
          throw new Error('검색 버튼을 찾을 수 없습니다');
        }

        // 검색 버튼에 호버 후 클릭
        await this.naturalHover('button[data-shp-area-id="search"]');
        await searchButton.click();
      }

      // 검색 결과 로딩 대기 (더 안정적인 대기)
      await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await this.randomWait(3000, 5000);

      // 검색 완료 후 상태 확인
      this.logInfo('🔍 검색 완료 후 상태 확인 중...');
      const searchResultUrl = this.page.url();
      this.logInfo(`📍 검색 결과 URL: ${searchResultUrl}`);

      const searchResultTitle = await this.page.title();
      this.logInfo(`📋 검색 결과 페이지 제목: ${searchResultTitle}`);

      // 보안 확인 페이지 처리
      await this.waitForSecurityCheck();

      this.logSuccess('검색 완료');

      // 5단계: 가격비교 더보기 버튼 찾기 (수동 클릭 대기)
      this.logInfo('가격비교 더보기 버튼 찾는 중...');

      // 검색어 URL 인코딩
      const searchText = searchKeyword;
      const encodedQuery = encodeURIComponent(searchText);
      this.logInfo(`검색어: ${searchText} (인코딩: ${encodedQuery})`);

      // DOM이 안정화될 때까지 대기
      await this.randomWait(3000, 5000);

      // 가격비교 더보기 버튼 찾기
      const buttonSelectors = [
        `a[href*="search.shopping.naver.com"][href*="query=${encodedQuery}"]`,
        'a[class*="_gnbContent_link_search"]',
        'a:has-text("검색에서 더보기")',
        'a:has-text("더보기")',
        'a[href*="search.shopping.naver.com"]',
      ];

      let buttonFound = false;
      let foundSelector = '';

      for (const selector of buttonSelectors) {
        try {
          await this.page.waitForSelector(selector, {
            state: 'visible',
            timeout: 3000,
          });

          // 버튼 하이라이트 (시각적 표시)
          await this.page.evaluate((sel) => {
            const button = document.querySelector(sel);
            if (button) {
              button.style.border = '3px solid red';
              button.style.backgroundColor = 'yellow';
              button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, selector);

          foundSelector = selector;
          buttonFound = true;
          this.logSuccess(`✅ 가격비교 더보기 버튼 발견: ${selector}`);
          break;
        } catch (error) {
          continue;
        }
      }

      if (!buttonFound) {
        this.logError('❌ 가격비교 더보기 버튼을 찾을 수 없습니다');

        // 페이지의 모든 링크를 찾아서 관련된 것들 출력
        const links = await this.page.evaluate(() => {
          const allLinks = Array.from(document.querySelectorAll('a'));
          return allLinks
            .filter(
              (a) =>
                a.textContent.includes('더보기') ||
                a.textContent.includes('검색') ||
                a.href.includes('shopping')
            )
            .map((a) => ({ text: a.textContent.trim(), href: a.href }))
            .slice(0, 10);
        });

        this.logInfo('📋 관련 링크들:');
        links.forEach((link, index) => {
          console.log(`${index + 1}. "${link.text}" -> ${link.href}`);
        });
      }

      // 수동 클릭 대기 메시지
      this.logInfo('🖱️  사용자 수동 조작 대기 중...');
      this.logInfo(
        '👆 브라우저에서 "가격비교 더보기" 버튼을 직접 클릭해 주세요'
      );
      this.logInfo('⏱️  최대 5분간 대기합니다...');

      // 페이지 URL 변경을 감지하여 클릭 완료 확인
      let currentUrl = this.page.url();
      const maxWaitTime = 5 * 60 * 1000; // 5분
      const checkInterval = 1000; // 1초마다 확인
      let waitedTime = 0;

      while (waitedTime < maxWaitTime) {
        await this.page.waitForTimeout(checkInterval);
        waitedTime += checkInterval;

        const newUrl = this.page.url();

        // URL이 변경되고 쇼핑 검색 페이지로 이동했는지 확인
        if (
          newUrl !== currentUrl &&
          newUrl.includes('search.shopping.naver.com')
        ) {
          this.logSuccess('✅ 가격비교 검색 페이지로 이동 완료!');
          break;
        }

        // 진행 상황 로그 (30초마다)
        if (waitedTime % 30000 === 0) {
          const remainingMinutes = Math.ceil(
            (maxWaitTime - waitedTime) / 60000
          );
          this.logInfo(`⏳ 대기 중... (남은 시간: ${remainingMinutes}분)`);
        }
      }

      if (waitedTime >= maxWaitTime) {
        this.logError('⚠️ 수동 클릭 대기 시간 초과 (5분)');
        throw new Error('사용자 수동 클릭 대기 시간 초과');
      }

      // 가격비교 페이지 로딩 대기 (더 안정적인 대기)
      await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      await this.randomWait(3000, 5000);

      // 서비스 이용 제한 페이지 처리
      const isBlocked = await this.checkServiceRestriction();
      if (isBlocked) {
        this.logInfo(
          '서비스 이용 제한 감지 - 스토어 홈페이지에서 다시 검색 시도...'
        );
        return await this.retryFromStorePage(searchKeyword);
      }

      // 보안 확인 페이지 처리
      await this.waitForSecurityCheck();

      this.logSuccess('가격비교 검색 페이지 이동 완료');

      // 최종 HTML 내용 추출
      const htmlContent = await this.page.content();
      currentUrl = this.page.url();

      this.logInfo(`최종 URL: ${currentUrl}`);
      this.logInfo(`HTML 길이: ${htmlContent.length.toLocaleString()}자`);

      return {
        html: htmlContent,
        url: currentUrl,
        savedPath: null,
        stats: {
          crawlCount: 1,
          nextSessionReset: 10,
          tlsSupport: 'TLSv1.3',
        },
      };
    } catch (error) {
      this.logError(`네이버 쇼핑 검색 프로세스 실패: ${error.message}`);

      // 에러 시 스크린샷 저장
      if (this.page) {
        await this.page.screenshot({
          path: `error-naver-shopping-${Date.now()}.png`,
          fullPage: true,
        });
      }

      throw error;
    } finally {
      // 브라우저 리소스 정리
      await this.close();
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
