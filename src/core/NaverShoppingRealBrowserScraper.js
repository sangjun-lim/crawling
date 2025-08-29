import BaseScraper from './BaseScraper.js';
import { connect } from 'puppeteer-real-browser';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

class NaverShoppingRealBrowserScraper extends BaseScraper {
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
    this.page = null;
  }

  async init() {
    try {
      // 부모 클래스 초기화 (프록시 테스트 포함)
      await super.init();
      this.logInfo('puppeteer-real-browser를 사용하여 브라우저 연결 중...');

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

      // 네트워크 요청/응답 로깅 설정
      this.page.on('request', async (request) => {
        const url = request.url();
        if (url.includes('shopping.naver.com') || url.includes('search')) {
          this.logInfo(`🔵 REQUEST: ${request.method()} ${url}`);
          this.logInfo(
            `📤 Headers: ${JSON.stringify(request.headers(), null, 2)}`
          );

          // 쿠키 정보도 로깅
          const cookies = await this.page.cookies(url);
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

      this.logSuccess('puppeteer-real-browser 연결 완료');
      return true;
    } catch (error) {
      this.logError(`puppeteer-real-browser 연결 실패: ${error.message}`);
      this.logError(`에러 스택: ${error.stack}`);
      return false;
    }
  }

  /**
   * 랜덤 대기 시간 생성 (자연스러운 사용자 행동 시뮬레이션)
   */
  async randomWait(min = 800, max = 2500) {
    const waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  /**
   * 보안 확인 페이지 처리 - 사용자가 수동으로 해결할 때까지 대기
   */
  async waitForSecurityCheck() {
    this.logInfo('🛡️ waitForSecurityCheck 함수 시작');
    try {
      // 페이지 네비게이션 완료 대기
      await this.page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 })
        .catch(() => {});

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
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
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
        const cookies = await this.page.cookies();
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
   * 특정 상품 ID가 포함된 상품 클릭하는 시나리오
   */
  async scrapeProductPriceComparison(searchKeyword, productId) {
    if (!this.page) {
      await this.init();
    }

    try {
      // 1단계: 네이버 메인 페이지 접속
      this.logInfo('네이버 메인 페이지 접속 중...');
      await this.page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      await this.randomWait(1000, 1500);
      this.logSuccess('네이버 메인 페이지 접속 완료');

      // 2단계: 네이버 메인 페이지에서 검색
      this.logInfo(`네이버 메인에서 "${searchKeyword}" 검색 중...`);

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
          this.logInfo(`메인 검색창 선택자 시도: ${selector}`);
          mainSearchInput = await this.page.waitForSelector(selector, {
            timeout: 3000,
          });
          if (mainSearchInput) {
            this.logSuccess(`✅ 메인 검색창 발견: ${selector}`);
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
      await this.randomWait(2000, 4000);

      this.logSuccess(`"${searchKeyword}" 통합검색 완료`);

      // 3단계: 네이버 가격비교 더보기 클릭
      this.logInfo('네이버 가격비교 더보기 버튼 찾는 중...');

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
            this.logInfo(`더보기 링크 선택자 시도: ${selector}`);
            moreLinkElement = await this.page.$(selector);
            if (moreLinkElement) {
              this.logSuccess(`✅ 더보기 링크 발견: ${selector}`);
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (moreLinkElement) break;

        // 페이지 스크롤
        this.logInfo(
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

        this.logInfo('발견된 관련 링크들:');
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
      this.logSuccess('네이버 가격비교 더보기 클릭 완료');

      await this.randomWait(2000, 3000);

      // 4단계: 새 탭 전환
      this.logInfo('새 탭 전환 중...');
      const newPages = await this.browser.pages();

      let shoppingPage = null;
      for (const page of newPages) {
        const url = page.url();
        if (
          url.includes('search.shopping.naver.com') &&
          !url.includes('home')
        ) {
          shoppingPage = page;
          this.logSuccess(`🎯 쇼핑 검색 페이지 탭 발견: ${url}`);
          break;
        }
      }

      if (shoppingPage && shoppingPage !== this.page) {
        this.page = shoppingPage;
        this.logSuccess('✅ 쇼핑 페이지 탭으로 전환');
      } else {
        this.logInfo('⚠️ 새 탭을 찾지 못함, 현재 탭에서 계속 진행');
      }

      // 페이지 로딩 완료 대기
      await this.randomWait(3000, 5000);

      // 보안 확인 페이지 처리
      await this.waitForSecurityCheck();

      // 4-1단계: productId가 포함된 상품 찾기 (최대 10페이지)
      this.logInfo(
        `상품 ID "${productId}"가 포함된 상품 찾는 중... (최대 10페이지 검색)`
      );

      let productFound = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!productFound && currentPage <= maxPages) {
        this.logInfo(`페이지 ${currentPage}에서 상품 검색 중...`);

        // 현재 페이지에서 상품 찾기
        const productSelectors = [
          `[href*="${productId}"]`,
          `[data-nclick*="${productId}"]`,
          `[onclick*="${productId}"]`,
          `[data-product-id*="${productId}"]`,
          `[data-i*="${productId}"]`,
          `[data-id*="${productId}"]`,
        ];

        let productElement = null;
        let foundProductSelector = '';

        for (const selector of productSelectors) {
          try {
            productElement = await this.page.$(selector);
            if (productElement) {
              foundProductSelector = selector;
              this.logSuccess(
                `✅ 상품 발견: ${selector} (페이지 ${currentPage})`
              );
              productFound = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (productFound) {
          // 상품이 보이도록 스크롤
          await productElement.evaluate((el) =>
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          );
          await this.randomWait(1000, 2000);

          // 5단계: 상품 클릭
          this.logInfo('상품 클릭 중...');
          try {
            await productElement.click();
          } catch (clickError) {
            this.logInfo('일반 클릭 실패 - 강제 클릭 시도...');
            await this.page.evaluate((selector) => {
              const element = document.querySelector(selector);
              if (element) {
                element.click();
              }
            }, foundProductSelector);
          }

          this.logSuccess('상품 클릭 완료');
          break;
        } else {
          // 다음 페이지로 이동
          if (currentPage < maxPages) {
            this.logInfo(
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
                    this.logInfo(`다음 페이지 버튼 발견: ${selector}`);
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
              currentPage++;
            } else {
              this.logInfo('다음 페이지 버튼을 찾을 수 없거나 비활성화됨');
              break;
            }
          }
        }
      }

      if (!productFound) {
        throw new Error(
          `상품 ID "${productId}"를 포함한 상품을 ${maxPages}페이지에서 찾을 수 없습니다`
        );
      }

      // 6단계: 새 탭에서 상품 상세 페이지 열림 대기 및 전환
      this.logInfo('상품 상세 페이지 새 탭 대기 중...');
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
          this.logSuccess(`🎯 상품 상세 페이지 발견: ${url}`);
          break;
        }
      }

      if (productDetailPage && productDetailPage !== this.page) {
        this.page = productDetailPage;
        this.logSuccess('✅ 상품 상세 페이지 탭으로 전환');
      } else {
        this.logInfo('⚠️ 새로운 상품 상세 페이지 탭을 찾지 못함');
      }

      // 페이지 로딩 완료 대기
      await this.randomWait(2000, 4000);

      // 보안 확인 페이지 처리
      await this.waitForSecurityCheck();

      const finalUrl = this.page.url();
      this.logInfo(`최종 URL: ${finalUrl}`);

      // 7단계: 상품 페이지 HTML 저장 및 데이터 파싱
      this.logSuccess('상품 상세 페이지 HTML 저장 및 데이터 파싱 중...');

      try {
        const htmlContent = await this.page.content();

        // HTML 파일 저장
        const savedPath = await this.saveProductHtml(htmlContent, productId);
        this.logInfo(`📁 HTML 파일 저장됨: ${savedPath}`);
        this.logInfo(`📊 HTML 길이: ${htmlContent.length.toLocaleString()}자`);

        // __NEXT_DATA__ JSON 데이터 파싱
        this.logInfo('🔍 __NEXT_DATA__ JSON 데이터 파싱 시작...');

        try {
          // 1. JSON 데이터 추출
          const nextData = this.extractNextDataFromHtml(htmlContent);

          // 2. 상품 정보 파싱
          const productInfo = this.parseProductInfo(nextData);

          // 3. 카테고리 정보 파싱
          const categoryInfo = this.parseCategoryInfo(nextData);

          // 4. 판매처별 상품 정보 파싱
          const catalogProducts = this.parseCatalogProducts(nextData);

          // 5. 파싱된 데이터를 JSON 파일로 저장
          const dataFilePath = await this.saveProductData(
            productInfo,
            categoryInfo,
            catalogProducts,
            productId
          );
          this.logInfo(`📄 데이터 JSON 파일 저장됨: ${dataFilePath}`);

          this.logSuccess('🎉 데이터 파싱 및 저장 완료!');
        } catch (parseError) {
          this.logError(`데이터 파싱 실패: ${parseError.message}`);
          this.logInfo('⚠️ HTML은 저장되었으나 데이터 파싱에 실패했습니다');
        }

        this.logSuccess('시나리오 완료 - 상품 상세 페이지에서 대기 중');

        // 무한 대기 (사용자 조작 허용)
        // this.logInfo('사용자 조작을 위해 무한 대기 중... (Ctrl+C로 종료)');
        // while (true) {
        //   await this.randomWait(10000, 15000);
        //   this.logInfo('대기 중...');
        // }
      } catch (saveError) {
        this.logError(`HTML 저장 실패: ${saveError.message}`);
        this.logInfo('HTML 저장에 실패했지만 계속 진행합니다...');

        this.logSuccess('시나리오 완료 - 상품 상세 페이지에서 대기 중');

        // 무한 대기 (사용자 조작 허용)
        this.logInfo('사용자 조작을 위해 무한 대기 중... (Ctrl+C로 종료)');
        while (true) {
          await this.randomWait(10000, 15000);
          this.logInfo('대기 중...');
        }
      }
    } catch (error) {
      this.logError(`시나리오 실행 실패: ${error.message}`);

      // 에러 시 스크린샷 저장
      if (this.page) {
        try {
          await this.page.screenshot({
            path: `error-scenario-${Date.now()}.png`,
            fullPage: true,
          });
          this.logInfo('에러 스크린샷 저장됨');
        } catch (screenshotError) {
          this.logError(`스크린샷 저장 실패: ${screenshotError.message}`);
        }
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
   * HTML에서 __NEXT_DATA__ JSON 데이터 추출
   */
  extractNextDataFromHtml(htmlContent) {
    try {
      // <script id="__NEXT_DATA__" type="application/json"> 태그 찾기
      const scriptRegex =
        /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s;
      const match = htmlContent.match(scriptRegex);

      if (!match || !match[1]) {
        throw new Error('__NEXT_DATA__ script 태그를 찾을 수 없습니다');
      }

      const jsonString = match[1].trim();
      const nextData = JSON.parse(jsonString);

      this.logSuccess('__NEXT_DATA__ JSON 데이터 추출 완료');
      return nextData;
    } catch (error) {
      this.logError(`__NEXT_DATA__ 추출 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 상품 정보 파싱
   */
  parseProductInfo(nextData) {
    try {
      const productInfo =
        nextData.props?.pageProps?.initialState?.catalog?.info;

      if (!productInfo) {
        throw new Error(
          '상품 정보를 찾을 수 없습니다 (props.pageProps.initialState.info)'
        );
      }

      this.logSuccess('상품 정보 파싱 완료');
      return productInfo;
    } catch (error) {
      this.logError(`상품 정보 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 카테고리 정보 파싱
   */
  parseCategoryInfo(nextData) {
    try {
      const categoryInfo =
        nextData.props?.pageProps?.initialState?.catalog?.category;

      if (!categoryInfo) {
        throw new Error(
          '카테고리 정보를 찾을 수 없습니다 (props.pageProps.initialState.category)'
        );
      }

      this.logSuccess('카테고리 정보 파싱 완료');
      return categoryInfo;
    } catch (error) {
      this.logError(`카테고리 정보 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 판매처별 상품 및 가격 정보 파싱
   */
  parseCatalogProducts(nextData) {
    try {
      const queries = nextData.props?.pageProps?.dehydratedState?.queries;

      if (!queries || !Array.isArray(queries)) {
        throw new Error('queries 배열을 찾을 수 없습니다');
      }

      // queryKey 배열의 첫번째 값이 "CatalogProducts"인 객체 찾기
      const catalogQuery = queries.find((query) => {
        return (
          query.queryKey &&
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'CatalogProducts'
        );
      });

      if (!catalogQuery) {
        throw new Error(
          'CatalogProducts queryKey를 가진 객체를 찾을 수 없습니다'
        );
      }

      const products = catalogQuery.state?.data?.Catalog_Products?.products;

      if (!products || !Array.isArray(products)) {
        throw new Error(
          '상품 목록을 찾을 수 없습니다 (state.data.Catalog_Products.products)'
        );
      }

      this.logSuccess(
        `판매처별 상품 정보 파싱 완료 (${products.length}개 상품)`
      );
      return products;
    } catch (error) {
      this.logError(`판매처별 상품 정보 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 파싱된 데이터를 JSON 파일로 저장
   */
  async saveProductData(
    productInfo,
    categoryInfo,
    catalogProducts,
    productId = null
  ) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const productIdStr = productId ? `_${productId}` : '';
      const filename = `result/naver-product-data${productIdStr}_${timestamp}.json`;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
        this.logInfo('📁 result 디렉토리 생성됨');
      }

      const productData = {
        metadata: {
          productId: productId || 'Unknown',
          extractedAt: new Date().toISOString(),
          extractor: 'NaverShoppingRealBrowserScraper',
        },
        productInfo: productInfo,
        categoryInfo: categoryInfo,
        catalogProducts: catalogProducts,
        summary: {
          productInfoAvailable: !!productInfo,
          categoryInfoAvailable: !!categoryInfo,
          catalogProductsCount: catalogProducts ? catalogProducts.length : 0,
        },
      };

      await fsPromises.writeFile(
        filename,
        JSON.stringify(productData, null, 2),
        'utf8'
      );
      this.logSuccess(`상품 데이터 JSON 파일 저장 완료: ${filename}`);

      // 파일 크기 정보 출력
      const stats = await fsPromises.stat(filename);
      this.logInfo(`📊 저장된 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

      // 간단한 요약 정보 출력
      this.logInfo('=== 추출된 데이터 요약 ===');
      this.logInfo(`📦 상품 정보: ${productInfo ? '✅ 추출됨' : '❌ 없음'}`);
      this.logInfo(
        `📂 카테고리 정보: ${categoryInfo ? '✅ 추출됨' : '❌ 없음'}`
      );
      this.logInfo(
        `🏪 판매처별 상품: ${
          catalogProducts ? `✅ ${catalogProducts.length}개` : '❌ 없음'
        }`
      );

      return filename;
    } catch (error) {
      this.logError(`상품 데이터 저장 실패: ${error.message}`);
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
        this.logInfo('📁 result 디렉토리 생성됨');
      }

      // HTML 내용에 메타데이터 추가
      const metaComment = `<!--
=== 네이버 상품 페이지 HTML ===
상품 ID: ${productId || 'Unknown'}
수집 시간: ${new Date().toISOString()}
파일 크기: ${htmlContent.length.toLocaleString()} 문자
수집 도구: NaverShoppingScraper
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
      // puppeteer-real-browser에서는 context를 별도로 관리하지 않음
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

export default NaverShoppingRealBrowserScraper;
