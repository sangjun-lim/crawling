import { chromium } from 'playwright';

class PlaywrightCookieExtractor {
  constructor(options = {}) {
    this.options = {
      headless: false, // 브라우저 창 보이도록 기본값 변경
      timeout: 30000,
      slowMo: 1000, // 각 동작 사이에 1초 대기
      ...options,
    };
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async init() {
    try {
      console.log('Playwright 브라우저 초기화 중 (Chrome 116 호환)...');

      this.browser = await chromium.launch({
        headless: this.options.headless,
        slowMo: this.options.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        ],
      });

      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        extraHTTPHeaders: {
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          DNT: '1',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'sec-ch-ua':
            '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
      });

      this.page = await this.context.newPage();
      console.log('Playwright 초기화 완료');

      return true;
    } catch (error) {
      console.error('Playwright 초기화 실패:', error.message);
      return false;
    }
  }

  async extractCookiesFromStore(storeUrl, originalProductUrl = null) {
    try {
      if (!this.page) {
        const initialized = await this.init();
        if (!initialized) {
          throw new Error('Playwright 초기화 실패');
        }
      }

      console.log(`Playwright로 스토어 접속: ${storeUrl}`);
      console.log(`원본 상품 URL: ${originalProductUrl}`);
      
      // 실제 스토어 페이지 방문
      console.log(`타겟 스토어 페이지 방문: ${storeUrl}`);
      await this.page.goto(storeUrl, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout,
      });

      // 페이지 로딩 대기
      await this.page.waitForTimeout(5000);

      // 모든 쿠키 수집
      const cookies = await this.context.cookies();
      console.log(`총 ${cookies.length}개 쿠키 수집 완료`);

      // 쿠키 상세 정보 출력
      this.logCookieDetails(cookies);

      // channelUid 추출
      const channelUid = await this.extractChannelUid();

      // 추가: 상품 클릭 테스트 (원본 URL에서 상품 ID 추출)
      const productId = this.extractProductIdFromUrl(originalProductUrl || storeUrl);
      await this.testProductClick(productId);

      return {
        cookies: cookies,
        channelUid: channelUid,
        userAgent: await this.page.evaluate(() => navigator.userAgent),
        headers: this.getBrowserHeaders(storeUrl),
      };
    } catch (error) {
      console.error('Playwright 쿠키 추출 실패:', error.message);
      return null;
    }
  }

  async extractChannelUid() {
    try {
      // 페이지에서 channelUid 추출
      const channelUid = await this.page.evaluate(() => {
        const scripts = document.querySelectorAll('script');
        for (let script of scripts) {
          const content = script.textContent;
          const match = content.match(/"channelUid":"([^"]+)"/);
          if (match) {
            return match[1];
          }
        }
        return null;
      });

      if (channelUid) {
        console.log(`channelUid 추출 완료: ${channelUid}`);
        return channelUid;
      } else {
        console.log('channelUid를 찾을 수 없습니다');
        return null;
      }
    } catch (error) {
      console.error('channelUid 추출 실패:', error.message);
      return null;
    }
  }

  async testProductClick(targetProductId = null) {
    try {
      console.log('\n=== 상품 클릭 테스트 시작 ===');
      
      if (targetProductId) {
        console.log(`타겟 상품 ID: ${targetProductId}`);
        
        // 1단계: 스토어 검색창에 상품 ID 검색
        console.log('스토어 검색창에서 상품 ID 검색 중...');
        
        try {
          // 검색창 찾기 (여러 셀렉터 시도)
          const searchSelectors = [
            'input[data-shp-area-id="search"]',
            'input[placeholder*="검색"]',
            'input[placeholder*="상품"]',
            '.search_input input',
            '.search_area input',
            '[data-testid="search-input"]',
            'input[type="search"]',
            'input[name*="search"]',
            'input[id*="search"]'
          ];
          
          console.log('현재 페이지의 모든 input 태그 확인 중...');
          const allInputs = await this.page.locator('input').all();
          for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
            try {
              const placeholder = await allInputs[i].getAttribute('placeholder');
              const dataAttrs = await allInputs[i].getAttribute('data-shp-area-id');
              const inputType = await allInputs[i].getAttribute('type');
              const name = await allInputs[i].getAttribute('name');
              const id = await allInputs[i].getAttribute('id');
              console.log(`  Input ${i + 1}: placeholder="${placeholder}", data-shp-area-id="${dataAttrs}", type="${inputType}", name="${name}", id="${id}"`);
            } catch (e) {
              console.log(`  Input ${i + 1}: 속성 읽기 실패`);
            }
          }
          
          let searchInput = null;
          for (const selector of searchSelectors) {
            try {
              const element = this.page.locator(selector);
              if (await element.isVisible()) {
                searchInput = element;
                console.log(`검색창 발견: ${selector}`);
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          if (searchInput) {
            // 검색창에 상품 ID 입력
            await searchInput.fill(targetProductId);
            console.log(`상품 ID "${targetProductId}" 입력 완료`);
            
            // Enter 키 또는 검색 버튼 클릭
            await this.page.waitForTimeout(1000);
            await searchInput.press('Enter');
            
            // 검색 결과 로딩 대기
            console.log('검색 결과 로딩 대기 중...');
            await this.page.waitForTimeout(3000);
            
            // 2단계: 검색 결과에서 해당 상품 링크 찾아서 클릭
            const targetProductLink = this.page.locator(`a[href*="/products/${targetProductId}"]`);
            
            if (await targetProductLink.count() > 0) {
              console.log(`타겟 상품 링크 발견: /products/${targetProductId}`);
              
              // 상품 클릭
              console.log('타겟 상품 클릭 중...');
              await targetProductLink.first().click();
              
              // 페이지 로딩 대기
              await this.page.waitForTimeout(3000);
              
              console.log(`현재 URL: ${this.page.url()}`);
              
              // 상품 상세 정보 추출 시도
              try {
                const productTitle = await this.page.locator('h1, .prod_name, .product_title, ._2QCa1fzapQGz5T8GU_CNV3').first().textContent();
                console.log(`상품 상세 페이지 제목: ${productTitle}`);
              } catch (e) {
                console.log('상품 상세 정보를 가져올 수 없습니다.');
              }
              
              console.log('타겟 상품 클릭 테스트 완료');
              
            } else {
              console.log(`타겟 상품 링크를 찾을 수 없습니다: /products/${targetProductId}`);
              console.log('페이지의 모든 상품 링크 확인 중...');
              
              const allProductLinks = await this.page.locator('a[href*="/products/"]').all();
              for (let i = 0; i < Math.min(allProductLinks.length, 5); i++) {
                const href = await allProductLinks[i].getAttribute('href');
                console.log(`  발견된 링크 ${i + 1}: ${href}`);
              }
            }
            
          } else {
            console.log('검색창을 찾을 수 없습니다. 첫 번째 상품으로 대체합니다.');
            await this.fallbackToFirstProduct();
          }
          
        } catch (error) {
          console.log('검색 과정에서 오류 발생:', error.message);
          console.log('첫 번째 상품으로 대체합니다.');
          await this.fallbackToFirstProduct();
        }
        
      } else {
        // 상품 ID가 없는 경우 첫 번째 상품 클릭
        await this.fallbackToFirstProduct();
      }
      
      console.log('\n=== 상품 클릭 테스트 완료 ===\n');
      
    } catch (error) {
      console.error('상품 클릭 테스트 실패:', error.message);
    }
  }

  async fallbackToFirstProduct() {
    console.log('첫 번째 상품 클릭 방식으로 진행...');
    
    const productLinks = await this.page.locator('a[href*="/products/"]').all();
    console.log(`발견된 상품 링크: ${productLinks.length}개`);
    
    if (productLinks.length > 0) {
      const firstProduct = productLinks[0];
      const productUrl = await firstProduct.getAttribute('href');
      console.log(`클릭할 상품 URL: ${productUrl}`);
      
      await firstProduct.click();
      await this.page.waitForTimeout(3000);
      
      console.log(`현재 URL: ${this.page.url()}`);
      
      try {
        const productTitle = await this.page.locator('h1, .prod_name, .product_title, ._2QCa1fzapQGz5T8GU_CNV3').first().textContent();
        console.log(`상품 제목: ${productTitle}`);
      } catch (e) {
        console.log('상품 제목을 가져올 수 없습니다.');
      }
    } else {
      console.log('클릭할 상품을 찾을 수 없습니다.');
    }
  }

  getBrowserHeaders(referer = '') {
    return {
      Host: 'smartstore.naver.com',
      Connection: 'keep-alive',
      'sec-ch-ua':
        '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-User': '?1',
      'Sec-Fetch-Dest': 'document',
      Referer: referer,
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    };
  }

  getApiHeaders(referer = '') {
    return {
      Accept: 'application/json, text/plain, */*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      Connection: 'keep-alive',
      Host: 'smartstore.naver.com',
      Referer: referer,
      'sec-ch-ua':
        '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
      'x-client-version': '20250820143019',
    };
  }

  logCookieDetails(cookies) {
    console.log('\n=== 수집된 쿠키 상세 정보 ===');

    // 도메인별 쿠키 분류
    const cookiesByDomain = {};
    cookies.forEach((cookie) => {
      const domain = cookie.domain;
      if (!cookiesByDomain[domain]) {
        cookiesByDomain[domain] = [];
      }
      cookiesByDomain[domain].push(cookie);
    });

    // 도메인별로 출력
    Object.keys(cookiesByDomain).forEach((domain) => {
      console.log(`\n📍 도메인: ${domain}`);
      cookiesByDomain[domain].forEach((cookie) => {
        console.log(
          `  🍪 ${cookie.name}: ${cookie.value.substring(0, 50)}${
            cookie.value.length > 50 ? '...' : ''
          }`
        );
        console.log(`     - Path: ${cookie.path}`);
        console.log(
          `     - Secure: ${cookie.secure}, HttpOnly: ${cookie.httpOnly}`
        );
        if (cookie.expires && cookie.expires > 0) {
          console.log(
            `     - Expires: ${new Date(cookie.expires * 1000).toISOString()}`
          );
        }
      });
    });

    // 쿠키 문자열 형태로도 출력
    const cookieString = this.formatCookiesForHttpClient(cookies);
    console.log(
      `\n📋 HttpClient용 쿠키 문자열 (길이: ${cookieString.length}자):`
    );
    console.log(cookieString);

    console.log('\n=== 쿠키 정보 끝 ===\n');
  }

  extractProductIdFromUrl(storeUrl) {
    try {
      // NaverSmartStoreScraper에서 전달받는 전체 상품 URL에서 상품 ID 추출
      // 예: https://smartstore.naver.com/wodnr7762/products/7588460081 → 7588460081
      const match = storeUrl.match(/\/products\/(\d+)/);
      if (match) {
        const productId = match[1];
        console.log(`URL에서 상품 ID 추출: ${productId}`);
        return productId;
      }
      
      console.log('URL에서 상품 ID를 추출할 수 없습니다.');
      return null;
    } catch (error) {
      console.error('상품 ID 추출 실패:', error.message);
      return null;
    }
  }

  formatCookiesForHttpClient(cookies) {
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
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
      console.log('Playwright 브라우저 종료 완료');
    } catch (error) {
      console.error('Playwright 브라우저 종료 실패:', error.message);
    }
  }
}

export default PlaywrightCookieExtractor;
