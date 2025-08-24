const { chromium } = require('playwright');
const fs = require('fs');

/**
 * 네이버 스마트스토어 크롤러
 * 봇 탐지 우회를 위해 자연스러운 사용자 흐름으로 데이터 수집
 */
class NaverSmartStoreCrawler {
    constructor(options = {}) {
        this.options = {
            headless: options.headless ?? true,
            slowMo: options.slowMo ?? 500,
            timeout: options.timeout ?? 30000,
            saveData: options.saveData ?? true,
            ...options
        };
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        console.log('🚀 브라우저 초기화 중...');
        
        this.browser = await chromium.launch({
            headless: this.options.headless,
            slowMo: this.options.slowMo,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ]
        });

        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'ko-KR',
            extraHTTPHeaders: {
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
            }
        });

        this.page = await context.newPage();
        
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

        console.log('✅ 브라우저 초기화 완료');
    }

    /**
     * 스토어 메인페이지를 통해 특정 상품에 접근
     */
    async crawlProduct(storeId, productId) {
        if (!this.page) {
            await this.initialize();
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
                throw new Error(`타겟 상품 ${productId}을 찾을 수 없습니다.`);
            }

            // 3단계: 상품 페이지 로딩 대기
            console.log('3️⃣ 상품 페이지 로딩 대기 중...');
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(3000);

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

            // 데이터 저장
            if (this.options.saveData) {
                await this.saveData(finalData, productId);
            }

            console.log('🎉 크롤링 완료!');
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
            // 상품명 추출
            const titleSelectors = [
                'h1',
                '.product_title',
                '[data-testid*="title"]',
                '.prod_buy_header h3'
            ];

            for (const selector of titleSelectors) {
                try {
                    const element = await this.page.$(selector);
                    if (element) {
                        const text = await element.textContent();
                        if (text && text.trim()) {
                            data.title = text.trim();
                            console.log(`✅ 상품명 추출: ${data.title}`);
                            break;
                        }
                    }
                } catch (e) {}
            }

            // 가격 정보 추출
            const priceSelectors = [
                '.price_area .price',
                '.total_price',
                '.product-price',
                '[data-testid*="price"]'
            ];

            for (const selector of priceSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (const element of elements) {
                        const text = await element.textContent();
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
                } catch (e) {}
            }

            // 브랜드/판매자 정보
            try {
                const brandElement = await this.page.$('.channel_name, .seller_name, h1');
                if (brandElement) {
                    data.brand = await brandElement.textContent();
                }
            } catch (e) {}

            console.log(`📊 HTML 추출 완료: ${JSON.stringify(data, null, 2)}`);

        } catch (error) {
            console.log(`⚠️ HTML 추출 중 오류: ${error.message}`);
        }

        return data;
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
     * 크롤링 결과 저장
     */
    async saveData(data, productId) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `smartstore-${productId}-${timestamp}.json`;
        
        try {
            fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
            console.log(`💾 데이터 저장: ${filename}`);
            
            // 요약 정보 출력
            console.log('\n📋 수집 데이터 요약:');
            console.log(`상품명: ${data.name || data.title || 'N/A'}`);
            console.log(`가격: ${data.salePrice ? data.salePrice.toLocaleString() : (data.price ? data.price.toLocaleString() : 'N/A')}원`);
            console.log(`할인율: ${data.discountRate || 'N/A'}%`);
            console.log(`브랜드: ${data.brand || 'N/A'}`);
            console.log(`옵션 수: ${data.options?.length || 0}개`);
            console.log(`이미지 수: ${data.images?.length || 0}개`);
            
        } catch (error) {
            console.log(`❌ 데이터 저장 실패: ${error.message}`);
        }
    }

    /**
     * 브라우저 종료
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 브라우저 종료');
        }
    }
}

/**
 * 사용 예시
 */
async function main() {
    const crawler = new NaverSmartStoreCrawler({
        headless: false, // 디버깅을 위해 브라우저 표시
        slowMo: 1000,   // 액션 간 1초 지연
        saveData: true  // 결과 저장
    });

    try {
        // 예시: 바른체어 상품 크롤링
        const result = await crawler.crawlProduct('wodnr7762', '7588460081');
        
        console.log('\n🎊 크롤링 성공!');
        console.log(`상품명: ${result.name}`);
        console.log(`가격: ${result.salePrice?.toLocaleString()}원`);
        console.log(`할인율: ${result.discountRate}%`);
        
    } catch (error) {
        console.error(`🔥 크롤링 실패: ${error.message}`);
    } finally {
        await crawler.close();
    }
}

// 직접 실행 시
if (require.main === module) {
    main().catch(console.error);
}

module.exports = NaverSmartStoreCrawler;