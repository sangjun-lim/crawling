import { connect } from 'puppeteer-real-browser';
import ProxyService from '../../services/proxy-service.js';
import NaverReceiptCaptchaSolver from '../../captcha/naver-receipt-captcha-solver.js';
import NaverShoppingNextDataParser from '../../parsers/naver/shopping-next-data-parser.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import LogUtils from '../../utils/log-utils.js';

class NaverShoppingRealBrowserScraper {
  constructor(options = {}) {
    // 서비스 조합 (Composition 패턴)
    this.logger = new LogUtils(options);
    this.proxyService = new ProxyService(options);
    this.captchaSolver = new NaverReceiptCaptchaSolver(options);
    this.dataParser = new NaverShoppingNextDataParser();

    this.options = {
      headless: options.headless ?? false,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 100,
      enableLogging: options.enableLogging ?? true,
      ...options,
    };

    this.browser = null;
    this.page = null;

    // 영수증 CAPTCHA 데이터 대기용 Promise 관리
    this.waitingForReceiptData = false;
    this.receiptDataPromise = null;
    this.resolveReceiptData = null;
  }

  async init() {
    try {
      this.logger.logInfo(
        'puppeteer-real-browser를 사용하여 브라우저 연결 중...'
      );

      // puppeteer-real-browser 연결 설정
      const { browser, page } = await connect({
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=ChromeWhatsNewUI,ChromeTips,SidePanel',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-fre',
          '--password-store=basic',
          '--disable-crash-reporter',
        ],
        connectOption: {
          defaultViewport: null,
          ignoreHTTPSErrors: true,
          ignoreDefaultArgs: false,
        },
        ignoreAllFlags: true,
      });

      this.browser = browser;
      this.page = page;

      // 브라우저의 모든 탭 모니터링 설정
      this.setupGlobalNetworkMonitoring();

      // 초기 페이지의 네트워크 모니터링 설정
      this.setupPageNetworkMonitoring(this.page);

      this.logger.logSuccess('puppeteer-real-browser 연결 완료');
      return true;
    } catch (error) {
      this.logger.logError(
        `puppeteer-real-browser 연결 실패: ${error.message}`
      );
      this.logger.logError(`에러 스택: ${error.stack}`);
      return false;
    }
  }

  /**
   * 모든 탭에서 발생하는 새로운 탭 생성 이벤트를 모니터링하고 네트워크 리스너를 자동 설정
   */
  setupGlobalNetworkMonitoring() {
    this.logger.logInfo('🌐 전역 네트워크 모니터링 설정 중...');

    this.browser.on('targetcreated', async (target) => {
      try {
        // 새로 생성된 대상이 페이지인지 확인
        if (target.type() === 'page') {
          const page = await target.page();
          if (page) {
            const url = page.url();
            this.logger.logInfo(`🆕 새 탭 생성 감지: ${url}`);

            // 새 페이지에 네트워크 모니터링 설정
            this.setupPageNetworkMonitoring(page);
          }
        }
      } catch (error) {
        this.logger.logError(`새 탭 모니터링 설정 실패: ${error.message}`);
      }
    });
  }

  /**
   * 특정 페이지에 대한 네트워크 모니터링 설정
   */
  setupPageNetworkMonitoring(page) {
    try {
      const pageUrl = page.url();
      this.logger.logInfo(`🔧 페이지 네트워크 모니터링 설정: ${pageUrl}`);

      // request 이벤트 리스너 설정
      page.on('request', async (request) => {
        const url = request.url();

        // 영수증 captcha API 요청 감지
        if (
          url.includes('ncpt.naver.com/v1/wcpt/m/challenge/receipt/question')
        ) {
          this.logger.logInfo('🧐🧐🧐 영수증 CAPTCHA API 요청 감지! 🧐🧐🧐');
          this.logger.logInfo(`📍 API URL: ${url}`);
          this.logger.logInfo(
            `🔗 Referrer: ${request.headers().referer || 'None'}`
          );
          this.logger.logInfo(
            `🍪 User-Agent: ${request.headers()['user-agent'] || 'None'}`
          );

          // URL에서 key 파라미터 추출
          try {
            const urlParams = new URL(url).searchParams;
            const captchaKey = urlParams.get('key');
            if (captchaKey) {
              this.logger.logInfo(`🔑 CAPTCHA Key: ${captchaKey}`);
            }
          } catch (urlError) {
            this.logger.logInfo(`URL 파라미터 추출 실패: ${urlError.message}`);
          }

          return; // 영수증 API는 별도 처리하므로 일반 로깅 생략
        }
      });

      // response 이벤트 리스너 설정
      page.on('response', async (response) => {});
    } catch (error) {
      this.logger.logError(
        `페이지 네트워크 모니터링 설정 실패: ${error.message}`
      );
    }
  }

  /**
   * 랜덤 대기 시간 생성 (자연스러운 사용자 행동 시뮬레이션)
   */
  async randomWait(min = 800, max = 2500) {
    const waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  async handleCaptchaAutomatically(page) {
    return await this.captchaSolver.handleCaptchaAutomatically(page);
  }

  /**
   * 특정 상품 ID가 포함된 상품 클릭하는 시나리오
   */
  async scrapeProductPriceComparison(searchKeyword, productId) {
    if (!this.page) {
      await this.init();
    }

    try {
      // 1단계: 네이버 메인 페이지 접속
      this.logger.logInfo('네이버 메인 페이지 접속 중...');
      await this.page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      await this.randomWait(1000, 1500);
      this.logger.logSuccess('네이버 메인 페이지 접속 완료');

      // 2단계: 네이버 메인 페이지에서 검색
      this.logger.logInfo(`네이버 메인에서 "${searchKeyword}" 검색 중...`);

      // 메인 페이지 검색창 찾기
      const mainSearchSelectors = [
        'input#query',
        'input[name="query"]',
        'input[placeholder*="검색"]',
        'input[data-module="SearchBox"]',
        'input.search_input',
        'input[type="text"]',
      ];

      let mainSearchInput = null;
      for (const selector of mainSearchSelectors) {
        try {
          this.logger.logInfo(`메인 검색창 선택자 시도: ${selector}`);
          mainSearchInput = await this.page.waitForSelector(selector, {
            timeout: 3000,
          });
          if (mainSearchInput) {
            this.logger.logSuccess(`✅ 메인 검색창 발견: ${selector}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!mainSearchInput) {
        throw new Error('네이버 메인 검색창을 찾을 수 없습니다');
      }

      // 검색어 입력 및 실행
      await mainSearchInput.click();
      await this.randomWait(500, 600);
      await mainSearchInput.evaluate((input) => (input.value = ''));
      await mainSearchInput.type(searchKeyword);
      await this.randomWait(500, 600);
      await mainSearchInput.press('Enter');

      // 통합검색 결과 페이지 로딩 대기
      await this.page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
        .catch(() => {});
      await this.randomWait(1500, 3000);

      this.logger.logSuccess(`"${searchKeyword}" 통합검색 완료`);

      // 3단계: 네이버 가격비교 더보기 클릭
      this.logger.logInfo('네이버 가격비교 더보기 버튼 찾는 중...');

      const moreLinkSelectors = [
        'a[class*="storeMoreLink"]',
        'a:has(text()[contains(., "네이버 가격비교 더보기")])',
        'a[href*="search.shopping.naver.com"]',
        'a[class*="more"][href*="shopping"]',
        '.storeMoreLink-pc-module__link___OCNh8',
      ];

      let moreLinkElement = null;

      // 스크롤하면서 더보기 링크 찾기
      for (let scrollAttempt = 0; scrollAttempt < 3; scrollAttempt++) {
        for (const selector of moreLinkSelectors) {
          try {
            this.logger.logInfo(`더보기 링크 선택자 시도: ${selector}`);
            moreLinkElement = await this.page.$(selector);
            if (moreLinkElement) {
              this.logger.logSuccess(`✅ 더보기 링크 발견: ${selector}`);
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (moreLinkElement) break;

        // 페이지 스크롤
        this.logger.logInfo(
          `더보기 링크를 찾기 위해 스크롤 (${scrollAttempt + 1}/3)...`
        );
        await this.page.evaluate(() => window.scrollBy(0, 800));
        await this.randomWait(1000, 2000);
      }

      if (!moreLinkElement) {
        // 모든 링크 텍스트 확인
        const allLinks = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return links
            .filter(
              (link) =>
                link.textContent.includes('가격비교') ||
                link.textContent.includes('더보기') ||
                link.href.includes('search.shopping.naver.com')
            )
            .map((link) => ({
              text: link.textContent.trim(),
              href: link.href,
              className: link.className,
            }))
            .slice(0, 10);
        });

        this.logger.logInfo('발견된 관련 링크들:');
        allLinks.forEach((link, index) => {
          console.log(
            `${index + 1}. ${link.text} -> ${link.href} (class: ${
              link.className
            })`
          );
        });

        // 가격비교가 포함된 링크 시도
        moreLinkElement = await this.page.$(
          'a[href*="search.shopping.naver.com"]'
        );
        if (!moreLinkElement) {
          throw new Error('네이버 가격비교 더보기 링크를 찾을 수 없습니다');
        }
      }

      // 더보기 링크가 보이도록 스크롤
      await moreLinkElement.evaluate((el) =>
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
      await this.randomWait(1000, 2000);

      // 새 탭에서 열릴 예정이므로 현재 페이지 수 확인
      const initialPages = await this.browser.pages();
      const initialPageCount = initialPages.length;

      // 더보기 링크 클릭
      await moreLinkElement.click();
      this.logger.logSuccess('네이버 가격비교 더보기 클릭 완료');

      await this.randomWait(1000, 2000);

      // 4단계: 새 탭 전환
      this.logger.logInfo('새 탭 전환 중...');
      const newPages = await this.browser.pages();

      let shoppingPage = null;
      for (const page of newPages) {
        const url = page.url();
        if (
          url.includes('search.shopping.naver.com') &&
          !url.includes('home')
        ) {
          shoppingPage = page;
          this.logger.logSuccess(`🎯 쇼핑 검색 페이지 탭 발견: ${url}`);
          break;
        }
      }

      if (shoppingPage && shoppingPage !== this.page) {
        this.page = shoppingPage;
        this.logger.logSuccess('✅ 쇼핑 페이지 탭으로 전환');
      } else {
        this.logger.logInfo('⚠️ 새 탭을 찾지 못함, 현재 탭에서 계속 진행');
      }

      // 캡차 자동 처리
      const captchaResult = await this.handleCaptchaAutomatically(this.page);

      if (captchaResult.isCaptcha && !captchaResult.autoSolved) {
        new Error('캡차 실패입니다.');
      }

      // 페이지 로딩 완료 대기
      await this.randomWait(1500, 3000);

      // 4-1단계: productId가 포함된 상품 찾기 (최대 10페이지)
      this.logger.logInfo(
        `상품 ID "${productId}"가 포함된 상품 찾는 중... (최대 10페이지 검색)`
      );

      let productFound = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!productFound && currentPage <= maxPages) {
        this.logger.logInfo(`페이지 ${currentPage}에서 상품 검색 중...`);

        // 스크롤하면서 상품 찾기
        const productSelectors = [
          `[data-i="${productId}"]`, // 정확한 data-i 매칭
          `[data-shp-contents-id="${productId}"]`, // 정확한 contents-id 매칭
          `[data-i*="${productId}"]`, // 부분 매칭 백업
          `[data-shp-contents-id*="${productId}"]`, // 부분 매칭 백업
          `a[href*="nvMid=${productId}"]`, // URL 파라미터 매칭
          `a[href*="catalog/${productId}"]`, // 카탈로그 URL 매칭
        ];

        let productElement = null;
        let foundProductSelector = '';
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 20; // 최대 스크롤 시도 횟수

        // 페이지 맨 위로 이동
        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.randomWait(1000, 1500);

        this.logger.logInfo(
          `페이지 ${currentPage}에서 스크롤하며 상품 검색 시작...`
        );

        // 연속적이고 자연스러운 스크롤로 상품 찾기
        let lastScrollTime = Date.now();
        let noNewContentCount = 0;

        while (scrollAttempts < maxScrollAttempts && !productFound) {
          scrollAttempts++;

          // 매 5번째 스크롤마다 진행상황 로그
          if (scrollAttempts % 5 === 1) {
            this.logger.logInfo(
              `페이지 ${currentPage} - 스크롤 진행중... (${scrollAttempts}/${maxScrollAttempts})`
            );
          }

          // 현재 위치에서 상품 찾기
          for (const selector of productSelectors) {
            try {
              productElement = await this.page.$(selector);
              if (productElement) {
                foundProductSelector = selector;
                this.logger.logSuccess(
                  `✅ 상품 발견: ${selector} (페이지 ${currentPage}, 스크롤 ${scrollAttempts})`
                );
                productFound = true;
                break;
              }
            } catch (error) {
              continue;
            }
          }

          if (productFound) {
            // 상품이 보이도록 부드럽게 스크롤
            this.logger.logInfo('상품을 화면 중앙으로 이동시키는 중...');
            await productElement.evaluate((el) =>
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            );
            await this.randomWait(500, 1000); // 스크롤 완료 대기

            // 상품 클릭
            this.logger.logInfo('상품 클릭 중...');
            try {
              await productElement.click();
            } catch (clickError) {
              this.logger.logInfo('일반 클릭 실패 - 강제 클릭 시도...');
              await this.page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (element) {
                  element.click();
                }
              }, foundProductSelector);
            }
            this.logger.logSuccess('상품 클릭 완료');
            break;
          }

          // 현재 페이지 높이 확인
          const currentHeight = await this.page.evaluate(
            () => document.body.scrollHeight
          );

          // 부드러운 스크롤 애니메이션 (여러 단계로 나누어서)
          const scrollAmount = 1000 + Math.random() * 400; // 1000~1400px
          const steps = 32; // 32단계로 나누어서 부드럽게
          const stepSize = scrollAmount / steps;

          for (let step = 0; step < steps; step++) {
            await this.page.evaluate((stepSize) => {
              window.scrollBy(0, stepSize);
            }, stepSize);
            await new Promise((resolve) => setTimeout(resolve, 5)); // 5ms씩 대기
          }

          // 짧은 대기 시간 (스크롤 완료 후)
          await this.randomWait(100, 200); // 0.1~0.2초 대기

          // 새로운 높이 확인
          const newHeight = await this.page.evaluate(
            () => document.body.scrollHeight
          );

          // 페이지 끝 도달 감지 (더 정확하게)
          if (newHeight === previousHeight) {
            noNewContentCount++;
            // 연속으로 2번 높이가 같으면 페이지 끝으로 판단
            if (noNewContentCount >= 2) {
              this.logger.logInfo(
                `페이지 ${currentPage} 끝에 도달 - 상품을 찾지 못함`
              );
              break;
            }
          } else {
            noNewContentCount = 0; // 새 콘텐츠가 로드되면 카운트 리셋
          }

          previousHeight = newHeight;
        }

        if (!productFound) {
          // 다음 페이지로 이동
          if (currentPage < maxPages) {
            this.logger.logInfo(
              `페이지 ${currentPage}에서 상품을 찾지 못함, 다음 페이지로 이동 중...`
            );

            const nextButtonSelectors = [
              'a.pagination_next__kh_cw',
              'a[class*="pagination_next"]',
              'a:has(text()[contains(., "다음")])',
              'a[aria-label="다음"]',
              '.pagination a:last-child',
            ];

            let nextButton = null;
            for (const selector of nextButtonSelectors) {
              try {
                nextButton = await this.page.$(selector);
                if (nextButton) {
                  const isDisabled = await nextButton.evaluate(
                    (btn) =>
                      btn.classList.contains('disabled') ||
                      btn.getAttribute('aria-disabled') === 'true' ||
                      btn.style.pointerEvents === 'none'
                  );

                  if (!isDisabled) {
                    this.logger.logInfo(`다음 페이지 버튼 발견: ${selector}`);
                    break;
                  } else {
                    nextButton = null;
                  }
                }
              } catch (error) {
                continue;
              }
            }

            if (nextButton) {
              await nextButton.click();
              await this.randomWait(2000, 4000);
            } else {
              this.logger.logInfo(
                '다음 페이지 버튼을 찾을 수 없거나 비활성화됨 - 검색 종료'
              );
              break;
            }
          }

          // 페이지 번호 증가 (다음 버튼이 있든 없든)
          currentPage++;
        }
      }

      if (!productFound) {
        throw new Error(
          `상품 ID "${productId}"를 포함한 상품을 ${maxPages}페이지에서 찾을 수 없습니다`
        );
      }

      // 6단계: 새 탭에서 상품 상세 페이지 열림 대기 및 전환
      this.logger.logInfo('상품 상세 페이지 새 탭 대기 중...');
      await this.randomWait(2000, 4000);

      // 모든 페이지 확인하여 상품 상세 페이지 찾기
      const allPages = await this.browser.pages();
      let productDetailPage = null;

      for (const page of allPages) {
        const url = page.url();
        if (
          url.includes(`catalog/${productId}`) ||
          (url.includes(`/catalog/`) && url.includes(productId))
        ) {
          productDetailPage = page;
          this.logger.logSuccess(`🎯 상품 상세 페이지 발견: ${url}`);
          break;
        }
      }

      if (productDetailPage && productDetailPage !== this.page) {
        this.page = productDetailPage;
        this.logger.logSuccess('✅ 상품 상세 페이지 탭으로 전환');
      } else {
        this.logger.logInfo('⚠️ 새로운 상품 상세 페이지 탭을 찾지 못함');
      }

      // 페이지 로딩 완료 대기
      await this.randomWait(2000, 4000);

      const finalUrl = this.page.url();
      this.logger.logInfo(`최종 URL: ${finalUrl}`);

      // 7단계: 상품 페이지 HTML 저장 및 데이터 파싱
      this.logger.logSuccess('상품 상세 페이지 HTML 저장 및 데이터 파싱 중...');

      try {
        const htmlContent = await this.page.content();

        // HTML 파일 저장
        const savedPath = await this.saveProductHtml(htmlContent, productId);
        this.logger.logInfo(`📁 HTML 파일 저장됨: ${savedPath}`);
        this.logger.logInfo(
          `📊 HTML 길이: ${htmlContent.length.toLocaleString()}자`
        );

        // __NEXT_DATA__ JSON 데이터 파싱
        this.logger.logInfo('🔍 __NEXT_DATA__ JSON 데이터 파싱 시작...');

        try {
          // 파서를 사용하여 모든 데이터 파싱
          const parseResult = this.dataParser.parseAllDataFromHtml(
            htmlContent,
            productId
          );

          if (parseResult.success) {
            // 파싱된 데이터를 JSON 파일로 저장
            const dataFilePath = await this.saveProductData(
              parseResult.data,
              productId
            );
            this.logger.logInfo(`📄 데이터 JSON 파일 저장됨: ${dataFilePath}`);
            this.logger.logSuccess('🎉 데이터 파싱 및 저장 완료!');
          } else {
            throw new Error(parseResult.error);
          }
        } catch (parseError) {
          this.logger.logError(`데이터 파싱 실패: ${parseError.message}`);
          this.logger.logInfo(
            '⚠️ HTML은 저장되었으나 데이터 파싱에 실패했습니다'
          );
        }

        this.logger.logSuccess('시나리오 완료 - 상품 상세 페이지에서 대기 중');

        // 무한 대기 (사용자 조작 허용)
        // this.logger.logInfo('사용자 조작을 위해 무한 대기 중... (Ctrl+C로 종료)');
        // while (true) {
        //   await this.randomWait(10000, 15000);
        //   this.logger.logInfo('대기 중...');
        // }
      } catch (saveError) {
        this.logger.logError(`HTML 저장 실패: ${saveError.message}`);
        this.logger.logInfo('HTML 저장에 실패했지만 계속 진행합니다...');

        this.logger.logSuccess('시나리오 완료 - 상품 상세 페이지에서 대기 중');

        // 무한 대기 (사용자 조작 허용)
        this.logger.logInfo(
          '사용자 조작을 위해 무한 대기 중... (Ctrl+C로 종료)'
        );
        while (true) {
          await this.randomWait(10000, 15000);
          this.logger.logInfo('대기 중...');
        }
      }
    } catch (error) {
      this.logger.logError(`시나리오 실행 실패: ${error.message}`);

      // 에러 시 스크린샷 저장
      if (this.page) {
        try {
          fs.mkdir('error-page', { recursive: true });
          await this.page.screenshot({
            path: `error-page/error-scenario-${Date.now()}.png`,
            fullPage: true,
          });
          this.logger.logInfo('에러 스크린샷 저장됨');
        } catch (screenshotError) {
          this.logger.logError(
            `스크린샷 저장 실패: ${screenshotError.message}`
          );
        }
      }

      throw error;
    }
  }

  /**
   * 파싱된 데이터를 JSON 파일로 저장 (간소화됨)
   */
  async saveProductData(productData, productId = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const productIdStr = productId ? `_${productId}` : '';
      const filename = `result/naver-product-data${productIdStr}_${timestamp}.json`;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
        this.logger.logInfo('📁 result 디렉토리 생성됨');
      }

      await fsPromises.writeFile(
        filename,
        JSON.stringify(productData, null, 2),
        'utf8'
      );
      this.logger.logSuccess(`상품 데이터 JSON 파일 저장 완료: ${filename}`);

      // 파일 크기 정보 출력
      const stats = await fsPromises.stat(filename);
      this.logger.logInfo(
        `📊 저장된 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`
      );

      // 간단한 요약 정보 출력 (파서의 summary 사용)
      if (productData.summary) {
        this.logger.logInfo('=== 추출된 데이터 요약 ===');
        this.logger.logInfo(
          `📦 상품 정보: ${
            productData.summary.productInfoAvailable ? '✅ 추출됨' : '❌ 없음'
          }`
        );
        this.logger.logInfo(
          `📂 카테고리 정보: ${
            productData.summary.categoryInfoAvailable ? '✅ 추출됨' : '❌ 없음'
          }`
        );
        this.logger.logInfo(
          `🏪 판매처별 상품: ${
            productData.summary.catalogProductsCount > 0
              ? `✅ ${productData.summary.catalogProductsCount}개`
              : '❌ 없음'
          }`
        );
      }

      return filename;
    } catch (error) {
      this.logger.logError(`상품 데이터 저장 실패: ${error.message}`);
      throw error;
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
        this.logger.logInfo('📁 result 디렉토리 생성됨');
      }

      // 파서를 사용하여 HTML 메타데이터 추가
      const htmlWithMeta = this.dataParser.addHtmlMetadata(
        htmlContent,
        productId
      );

      await fsPromises.writeFile(filename, htmlWithMeta, 'utf8');
      this.logger.logSuccess(`상품 HTML 파일 저장 완료: ${filename}`);

      // 파일 크기 정보 출력
      const stats = await fsPromises.stat(filename);
      this.logger.logInfo(
        `📊 저장된 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
      );

      return filename;
    } catch (error) {
      this.logger.logError(`상품 HTML 파일 저장 실패: ${error.message}`);
      throw error;
    }
  }

  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      // puppeteer-real-browser에서는 context를 별도로 관리하지 않음
      if (this.browser) {
        // CDP 연결만 해제, 브라우저는 종료하지 않음
        await this.browser.close();
        this.browser = null;
      }
      this.logger.logSuccess(
        '브라우저 연결 해제 완료 (브라우저는 계속 실행 중)'
      );
    } catch (error) {
      this.logger.logError(`Playwright 브라우저 종료 실패: ${error.message}`);
    }
  }
}

export default NaverShoppingRealBrowserScraper;
