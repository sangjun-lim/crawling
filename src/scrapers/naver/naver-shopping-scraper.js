import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import AntiDetectionService from '../../services/anti-detection-service.js';
import LoggerService from '../../services/logger-service.js';
import ProxyService from '../../services/proxy-service.js';
import StorageService from '../../services/storage-service.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { FingerprintGenerator } from 'fingerprint-generator';

class NaverShoppingScraper {
  constructor(options = {}) {
    // 서비스 조합 (Composition 패턴)
    this.logger = new LoggerService(options);
    this.proxyService = new ProxyService(options);
    this.storageService = new StorageService(options);

    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 100,
      enableLogging: options.enableLogging ?? true,
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
      this.logInfo('CDP를 통해 기존 브라우저에 연결 중...');

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
      // console.log('Fingerprint 구조:', JSON.stringify(fingerprint, null, 2));

      // CDP를 통해 기존 브라우저에 연결 (IPv4 명시)
      this.browser = await chromium.connectOverCDP('http://127.0.0.1:9222');

      // 기존 브라우저의 컨텍스트 가져오기
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        this.logInfo('✅ 기존 컨텍스트 사용');
      } else {
        // 컨텍스트가 없으면 새로 생성
        this.context = await this.browser.newContext({
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          viewport: {
            width: 1440,
            height: 900,
          },
          locale: 'ko-KR',
          timezoneId: 'Asia/Seoul',
          extraHTTPHeaders: {
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.1',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
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
        this.logInfo('✅ 새 컨텍스트 생성');
      }

      // 기존 페이지가 있으면 사용, 없으면 새로 생성
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.page = pages[0];
        this.logInfo('✅ 기존 페이지 사용');
      } else {
        this.page = await this.context.newPage();
        this.logInfo('✅ 새 페이지 생성');
      }

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

      this.logSuccess('기존 브라우저에 연결 완료');
      this.logInfo('🌐 localhost:9222에서 실행 중인 브라우저에 연결되었습니다');
      return true;
    } catch (error) {
      this.logError(`CDP 연결 실패: ${error.message}`);
      this.logError(
        'Chrome을 --remote-debugging-port=9222 옵션으로 실행했는지 확인하세요.'
      );
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
    this.logInfo('🛡️ waitForSecurityCheck 함수 시작');
    try {
      // 페이지 네비게이션 완료 대기
      await this.page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      await this.randomWait(1000, 2000);

      let pageContent;
      try {
        // 보안 확인 페이지 감지
        pageContent = await this.page.content();
      } catch (contentError) {
        this.logInfo('페이지 컨텐츠 가져오기 실패 - 잠시 후 재시도...');
        await this.randomWait(2000, 3000);
        pageContent = await this.page.content();
      }

      const currentUrl = this.page.url();
      const pageTitle = await this.page.title();

      // 다양한 보안 확인 패턴 감지
      const securityPatterns = [
        '보안 확인을 완료해 주세요',
        'captcha',
        'CAPTCHA',
        'WtmCaptcha',
        'rcpt_answer',
        '정답을 입력해주세요',
        '이 절차는 귀하가 실제 사용자임을 확인',
      ];

      // 디버깅: URL과 제목 항상 출력
      this.logInfo('🔍 보안 확인 페이지 검사 중...');
      this.logInfo('📍 현재 URL: ' + currentUrl);
      this.logInfo('📋 페이지 제목: ' + pageTitle);

      const isSecurityCheck = securityPatterns.some(
        (pattern) =>
          pageContent.includes(pattern) || pageTitle.includes(pattern)
      );

      // 디버깅: 패턴 매칭 결과
      const foundPatterns = securityPatterns.filter(
        (pattern) =>
          pageContent.includes(pattern) || pageTitle.includes(pattern)
      );
      this.logInfo(
        '🎯 매칭된 패턴: ' +
          (foundPatterns.length > 0 ? foundPatterns.join(', ') : '없음')
      );

      if (isSecurityCheck) {
        this.logInfo('🚨🚨🚨 보안 확인 페이지 감지됨! 🚨🚨🚨');
        this.logInfo('📍 현재 URL: ' + currentUrl);
        this.logInfo('📋 페이지 제목: ' + pageTitle);
        this.logInfo('🔍 감지된 보안 확인 유형을 분석 중...');

        // 감지된 패턴 출력
        const detectedPatterns = securityPatterns.filter(
          (pattern) =>
            pageContent.includes(pattern) || pageTitle.includes(pattern)
        );
        this.logInfo('🎯 감지된 패턴: ' + detectedPatterns.join(', '));

        this.logInfo('');
        this.logInfo(
          '┌─────────────────────────────────────────────────────────┐'
        );
        this.logInfo(
          '│                  🛡️ 보안 확인 필요 🛡️                    │'
        );
        this.logInfo(
          '├─────────────────────────────────────────────────────────┤'
        );
        this.logInfo(
          '│  👆 브라우저에서 직접 보안 확인을 완료해 주세요          │'
        );
        this.logInfo(
          '│  📝 영수증 캡차, 문자 입력, 이미지 선택 등을 해결하세요  │'
        );
        this.logInfo(
          '│  ⏰ 최대 15분간 대기합니다                              │'
        );
        this.logInfo(
          '│  🔄 완료 후 자동으로 다음 단계로 진행됩니다             │'
        );
        this.logInfo(
          '└─────────────────────────────────────────────────────────┘'
        );
        this.logInfo('');

        // 보안 확인이 완료될 때까지 대기 (최대 15분)
        const maxWaitTime = 15 * 60 * 1000; // 15분
        const checkInterval = 3000; // 3초마다 확인
        let waitedTime = 0;

        while (waitedTime < maxWaitTime) {
          await this.page.waitForTimeout(checkInterval);
          waitedTime += checkInterval;

          // 현재 페이지 내용 다시 확인
          let currentContent;
          let currentTitle;
          try {
            currentContent = await this.page.content();
            currentTitle = await this.page.title();
          } catch (contentError) {
            this.logInfo('⚠️ 페이지 컨텐츠 가져오기 실패 - 계속 대기...');
            continue;
          }

          const newUrl = this.page.url();

          // 보안 확인 패턴이 더 이상 없는지 확인
          const stillHasSecurityCheck = securityPatterns.some(
            (pattern) =>
              currentContent.includes(pattern) || currentTitle.includes(pattern)
          );

          // 보안 확인 페이지를 벗어났는지 확인
          if (
            !stillHasSecurityCheck &&
            (newUrl.includes('naver.com') || newUrl.includes('shopping'))
          ) {
            this.logSuccess('');
            this.logSuccess('🎉🎉🎉 보안 확인 완료 감지! 🎉🎉🎉');
            this.logSuccess('📍 새로운 URL: ' + newUrl);
            this.logSuccess('📋 새로운 제목: ' + currentTitle);
            this.logSuccess('✅ 다음 단계로 진행합니다...');
            this.logSuccess('');
            break;
          }

          // 진행 상황 로그 (30초마다)
          if (waitedTime % 30000 === 0) {
            const remainingMinutes = Math.ceil(
              (maxWaitTime - waitedTime) / 60000
            );
            this.logInfo(
              `⏳ 보안 확인 대기 중... (남은 시간: ${remainingMinutes}분)`
            );
            this.logInfo(`📍 현재 URL: ${newUrl}`);
          }
        }

        if (waitedTime >= maxWaitTime) {
          this.logError('⚠️ 보안 확인 대기 시간 초과 (15분)');
          throw new Error('보안 확인 대기 시간 초과');
        }

        // 보안 확인 완료 후 세션 상태 확인
        this.logInfo('🔍 보안 확인 완료 후 세션 상태 확인 중...');
        await this.randomWait(2000, 3000);

        // 현재 쿠키 확인
        const cookies = await this.context.cookies();
        this.logInfo(`🍪 보유 쿠키 수: ${cookies.length}`);

        // 중요 쿠키만 표시 (너무 많은 로그 방지)
        const importantCookies = cookies.filter(
          (cookie) =>
            cookie.name.includes('NID') ||
            cookie.name.includes('session') ||
            cookie.name.includes('auth')
        );

        if (importantCookies.length > 0) {
          importantCookies.forEach((cookie, index) => {
            this.logInfo(
              `🍪 주요 쿠키 ${index + 1}: ${
                cookie.name
              } = ${cookie.value.substring(0, 20)}...`
            );
          });
        }

        // 페이지 URL과 상태 확인
        const finalUrl = this.page.url();
        this.logInfo(`📍 보안 확인 완료 후 최종 URL: ${finalUrl}`);

        // 페이지 타이틀 확인
        const finalPageTitle = await this.page.title();
        this.logInfo(`📋 페이지 제목: ${finalPageTitle}`);

        // 페이지에 검색창이 있는지 확인
        const hasSearchInput =
          (await this.page.$('input[type="text"]')) !== null;
        this.logInfo(
          `🔍 검색창 존재 여부: ${hasSearchInput ? '있음' : '없음'}`
        );

        this.logSuccess('✅ 세션 상태 확인 완료 - 정상적으로 진행 중');
      } else {
        // 보안 확인 페이지가 감지되지 않았을 때
        this.logInfo('✅ 보안 확인 페이지 없음 - 정상 진행');
      }
    } catch (error) {
      this.logError(`보안 확인 처리 오류: ${error.message}`);
      // 보안 확인 에러는 치명적이지 않을 수 있으므로 경고만 출력
      this.logInfo(
        '⚠️ 보안 확인 처리에서 오류가 발생했지만 계속 진행합니다...'
      );
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
        await AntiDetectionService.naturalMouseMovement(
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
   * 네이버 쇼핑 검색 프로세스 수행
   */
  async scrapeProduct(searchKeyword) {
    if (!this.page) {
      await this.init();
    }

    try {
      // 1단계: 네이버 메인 페이지 접속 (세션 및 쿠키 설정)
      this.logInfo('네이버 메인 페이지 접속 중...');
      await this.page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      // 네이버 메인 페이지 로딩 대기
      await this.randomWait(2000, 4000);
      this.logSuccess('네이버 메인 페이지 접속 완료');

      // 2단계: 네이버 쇼핑 모바일 검색 홈페이지 접속
      this.logInfo('네이버 쇼핑 모바일 검색 페이지 접속 중...');
      const url = 'https://search.shopping.naver.com/home';

      await this.page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout,
      });

      // 페이지 안정적 로딩 대기
      await AntiDetectionService.waitForStableLoad(this.page);

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
   * 상품 페이지 HTML을 파일로 저장
   */
  async saveProductHtml(htmlContent, productId = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const productIdStr = productId ? `_${productId}` : '';
      const filename = `result/naver-product${productIdStr}_${timestamp}.html`;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
        this.logInfo('📁 result 디렉토리 생성됨');
      }

      // HTML 내용에 메타데이터 추가
      const metaComment = `<!--
=== 네이버 상품 페이지 HTML ===
상품 ID: ${productId || 'Unknown'}
수집 시간: ${new Date().toISOString()}
파일 크기: ${htmlContent.length.toLocaleString()} 문자
수집 도구: NaverShoppingScraper (CDP 연결)
-->
`;

      const htmlWithMeta = metaComment + htmlContent;

      await fsPromises.writeFile(filename, htmlWithMeta, 'utf8');
      this.logSuccess(`상품 HTML 파일 저장 완료: ${filename}`);

      // 파일 크기 정보 출력
      const stats = await fsPromises.stat(filename);
      this.logInfo(
        `📊 저장된 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
      );

      return filename;
    } catch (error) {
      this.logError(`상품 HTML 파일 저장 실패: ${error.message}`);
      throw error;
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
      this.logSuccess('브라우저 연결 해제 완료 (브라우저는 계속 실행 중)');

      // 부모 클래스 정리 호출
      await super.close();
    } catch (error) {
      this.logError(`Playwright 브라우저 종료 실패: ${error.message}`);
    }
  }
}

export default NaverShoppingScraper;
