import { chromium } from 'playwright';

class NaverSmartStoreScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 500,
      saveData: options.saveData ?? true,
      ...options
    };
    
    this.browser = null;
    this.context = null;
    this.page = null;
    this.apiResponses = [];
  }

  async init() {
    try {
      console.log('Playwright 브라우저 초기화 중...');
      
      this.browser = await chromium.launch({
        headless: this.options.headless,
        slowMo: this.options.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
        ],
      });

      this.context = await this.browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        extraHTTPHeaders: {
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        },
      });

      this.page = await this.context.newPage();
      
      // 네트워크 모니터링 (API 응답 수집)
      this.apiResponses = [];
      this.page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('/products/') && url.includes('?withWindow=false')) {
          try {
            const responseBody = await response.text();
            this.apiResponses.push({
              url: url,
              status: response.status(),
              data: JSON.parse(responseBody),
              timestamp: new Date().toISOString()
            });
            console.log(`📡 상품 API 응답 수집: ${response.status()}`);
          } catch (e) {
            console.log(`❌ API 응답 파싱 실패: ${e.message}`);
          }
        }
      });
      
      // 자동화 감지 우회
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
      
      console.log('Playwright 초기화 완료');
      return true;
    } catch (error) {
      console.error('Playwright 초기화 실패:', error.message);
      return false;
    }
  }

  /**
   * 스토어 메인페이지를 통해 특정 상품에 접근
   */
  async crawlProduct(storeId, productId) {
    if (!this.page) {
      await this.init();
    }

    console.log(`🎯 상품 크롤링 시작: ${storeId}/${productId}`);

    try {
      // 1단계: 스토어 메인페이지 접속
      console.log('1️⃣ 스토어 메인페이지 접속 중...');
      const storeUrl = `https://smartstore.naver.com/${storeId}`;
      
      await this.page.goto(storeUrl, {
        waitUntil: 'networkidle',
        timeout: this.options.timeout
      });

      // 페이지 로딩 대기
      await this.page.waitForTimeout(2000);
      console.log('✅ 메인페이지 로딩 완료');

      // 2단계: 타겟 상품 찾기 및 클릭
      console.log('2️⃣ 타겟 상품 링크 찾는 중...');
      
      const productSelectors = [
        `a[href*="${productId}"]`,
        `a[href*="/products/${productId}"]`
      ];

      let productFound = false;
      for (const selector of productSelectors) {
        try {
          const elements = await this.page.$$(selector);
          if (elements.length > 0) {
            console.log(`✅ 타겟 상품 링크 발견: ${selector}`);
            await elements[0].click();
            productFound = true;
            break;
          }
        } catch (e) {
          console.log(`🔍 선택자 시도: ${selector} - 실패`);
        }
      }

      if (!productFound) {
        console.log('⚠️ 메인페이지에서 상품을 찾을 수 없음. 직접 접근을 시도합니다...');
        
        // 직접 상품 URL로 접근
        const directProductUrl = `https://smartstore.naver.com/${storeId}/products/${productId}`;
        console.log(`🔗 직접 접근 URL: ${directProductUrl}`);
        
        await this.page.goto(directProductUrl, {
          waitUntil: 'networkidle',
          timeout: this.options.timeout
        });
        
        await this.page.waitForTimeout(2000);
        
        // 직접 접근이 성공했는지 확인
        const currentUrl = this.page.url();
        if (!currentUrl.includes(productId)) {
          throw new Error(`직접 접근도 실패했습니다. URL: ${currentUrl}`);
        }
        
        console.log('✅ 직접 접근 성공');
      }

      // 3단계: 상품 페이지 로딩 대기
      console.log('3️⃣ 상품 페이지 로딩 대기 중...');
      await this.page.waitForLoadState('networkidle');
      await this.page.waitForTimeout(5000); // API 응답 대기 시간 증가

      const finalUrl = this.page.url();
      console.log(`🔗 최종 URL: ${finalUrl}`);

      if (!finalUrl.includes(productId)) {
        throw new Error(`상품 페이지 접근 실패: ${finalUrl}`);
      }

      // 4단계: 상품 데이터 추출
      console.log('4️⃣ 상품 데이터 추출 중...');
      const productData = await this.extractProductData();

      // 5단계: API 응답에서 추가 데이터 추출
      console.log('5️⃣ API 응답 데이터 처리 중...');
      const apiData = await this.processApiResponse(productId);

      // 최종 데이터 조합
      const finalData = {
        ...productData,
        ...apiData,
        crawledAt: new Date().toISOString(),
        url: finalUrl
      };

      return finalData;

    } catch (error) {
      console.error(`❌ 크롤링 실패: ${error.message}`);
      
      // 에러 시 스크린샷 저장
      if (this.page) {
        await this.page.screenshot({
          path: `error-${productId}-${Date.now()}.png`,
          fullPage: true
        });
      }
      
      throw error;
    }
  }

  /**
   * API 응답에서 상품 데이터 추출
   */
  async processApiResponse(productId) {
    console.log('🔍 API 응답 데이터 처리 중...');

    if (this.apiResponses.length === 0) {
      console.log('⚠️ API 응답 없음');
      return {};
    }

    try {
      // 상품 상세 API 응답 찾기
      const productApiResponse = this.apiResponses.find(response => 
        response.url.includes(`/products/${productId}`) && 
        response.url.includes('withWindow=false')
      );

      if (!productApiResponse) {
        console.log('⚠️ 상품 상세 API 응답 없음');
        return {};
      }

      const apiData = productApiResponse.data;
      console.log('✅ API 응답 데이터 찾음');

      // API 데이터에서 필요한 정보 추출
      const extractedData = {
        productId: apiData.id,
        productNo: apiData.productNo,
        name: apiData.name,
        salePrice: apiData.salePrice,
        originalPrice: apiData.dispSalePrice,
        discountedSalePrice: apiData.discountedSalePrice,
        discountedRatio: apiData.discountedRatio,
        stockQuantity: apiData.stockQuantity,
        brand: apiData.naverShoppingSearchInfo?.brandName,
        manufacturer: apiData.naverShoppingSearchInfo?.manufacturerName,
        modelName: apiData.naverShoppingSearchInfo?.modelName,
        category: {
          name: apiData.category?.categoryName,
          fullPath: apiData.category?.wholeCategoryName
        },
        options: apiData.optionCombinations?.map(option => ({
          id: option.id,
          name1: option.optionName1,
          name2: option.optionName2,
          name3: option.optionName3,
          price: option.price,
          stock: option.stockQuantity
        })) || [],
        images: apiData.productImages?.map(img => ({
          url: img.url,
          order: img.order,
          type: img.imageType
        })) || [],
        seller: {
          name: apiData.channel?.channelName,
          id: apiData.channel?.channelSiteUrl
        },
        attributes: apiData.productAttributes?.map(attr => ({
          name: attr.attributeName,
          value: attr.minAttributeValue
        })) || []
      };

      // 할인율 계산
      if (extractedData.originalPrice && extractedData.salePrice) {
        const discountAmount = extractedData.originalPrice - extractedData.salePrice;
        extractedData.discountRate = Math.round((discountAmount / extractedData.originalPrice) * 100);
        extractedData.discountAmount = discountAmount;
      }

      console.log(`📊 API 데이터 추출 완료`);
      return extractedData;

    } catch (error) {
      console.log(`⚠️ API 응답 처리 중 오류: ${error.message}`);
      return {};
    }
  }

  /**
   * HTML에서 상품 데이터 추출
   */
  async extractProductData() {
    console.log('📄 HTML에서 데이터 추출 중...');

    const data = {
      title: null,
      price: null,
      originalPrice: null,
      discount: null,
      description: null,
      images: [],
      options: [],
      brand: null,
      seller: null
    };

    try {
      // DOM에서 직접 데이터 추출
      const productInfo = await this.page.evaluate(() => {
        const data = {};
        
        // 상품명 추출 - 더 구체적인 선택자 사용
        const titleSelectors = [
          'h1',
          '[class*="prod_buy_header"] h3',
          '[class*="product"] h1',
          '.product_title'
        ];
        
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            data.title = element.textContent.trim();
            break;
          }
        }
        
        // 가격 정보 추출 - 더 정확한 선택자
        const priceSelectors = [
          '.price_area .price',
          '.total_price',
          '[class*="price"]:not([class*="original"])',
          '.sale_price'
        ];
        
        for (const selector of priceSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent;
            if (text && text.includes('원')) {
              const priceMatch = text.match(/[\d,]+/);
              if (priceMatch) {
                const price = parseInt(priceMatch[0].replace(/,/g, ''));
                if (!data.price || price < data.price) {
                  data.price = price;
                }
              }
            }
          }
          if (data.price) break;
        }
        
        // 브랜드/판매자 정보
        const brandSelectors = [
          '.channel_name',
          '.seller_name',
          '[class*="brand"]'
        ];
        
        for (const selector of brandSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            data.brand = element.textContent.trim();
            break;
          }
        }
        
        return data;
      });

      // 추출된 데이터 병합
      Object.assign(data, productInfo);
      
      console.log(`상품 정보 추출 완료: ${data.title || 'Unknown'}`);
      return data;
      
    } catch (error) {
      console.error('상품 데이터 추출 실패:', error.message);
      return data;
    }
  }

  /**
   * 상품 데이터 저장
   */
  async saveData(data, productId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `result/smartstore-${productId}-${timestamp}.json`;
    
    try {
      const fs = await import('fs');
      
      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true });
      }
      
      fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
      console.log(`💾 데이터 저장: ${filename}`);
      
      // 요약 정보 출력
      console.log('\n📋 수집 데이터 요약:');
      console.log(`상품명: ${data.name || data.title || 'N/A'}`);
      console.log(`판매가: ${data.salePrice ? data.salePrice.toLocaleString() : (data.price ? data.price.toLocaleString() : 'N/A')}원`);
      console.log(`정가: ${data.originalPrice ? data.originalPrice.toLocaleString() : 'N/A'}원`);
      console.log(`할인가: ${data.discountedSalePrice ? data.discountedSalePrice.toLocaleString() : 'N/A'}원`);
      console.log(`할인율: ${data.discountedRatio || data.discountRate || 'N/A'}%`);
      console.log(`브랜드: ${data.brand || 'N/A'}`);
      console.log(`옵션 수: ${data.options?.length || 0}개`);
      console.log(`이미지 수: ${data.images?.length || 0}개`);
      
    } catch (error) {
      console.log(`❌ 데이터 저장 실패: ${error.message}`);
    }
  }

  parseProductUrl(productUrl) {
    const url = new URL(productUrl);
    const pathParts = url.pathname.split('/');
    return {
      storeId: pathParts[1],
      productId: pathParts[3]
    };
  }

  async scrapeProducts(productUrl) {
    try {
      console.log(`네이버 스마트스토어 상품 수집 시작: ${productUrl}`);

      // URL 유효성 검사
      if (!productUrl || !productUrl.includes('smartstore.naver.com')) {
        throw new Error('유효한 스마트스토어 URL이 아닙니다');
      }

      // Playwright 초기화
      const initialized = await this.init();
      if (!initialized) {
        throw new Error('Playwright 초기화 실패');
      }

      // 상품 URL에서 storeId와 productId 추출
      const { storeId, productId } = this.parseProductUrl(productUrl);
      
      // 상품 크롤링 실행
      const productData = await this.crawlProduct(storeId, productId);

      // 결과 저장
      if (productData && this.options.saveData) {
        await this.saveData(productData, productId);
      }

      console.log(`수집 완료: ${productData ? '성공' : '실패'}`);
      return productData ? [productData] : [];
    } catch (error) {
      console.error('스크래핑 실패:', error.message);
      return [];
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
      console.log('Playwright 브라우저 종료 완료');
    } catch (error) {
      console.error('Playwright 브라우저 종료 실패:', error.message);
    }
  }
}

export default NaverSmartStoreScraper;