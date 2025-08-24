import PlaywrightCookieExtractor from './src/core/PlaywrightCookieExtractor.js';
import CurlHttpClient from './src/core/CurlHttpClient.js';
import fs from 'fs';

class CookieBasedCrawlerTest {
    constructor() {
        this.storeId = 'wodnr7762';
        this.productId = '7588460081';
        this.channelId = '2sWDxR7klq0gCXmcpWBd4'; // 이전 분석에서 얻은 값
        
        this.baseUrl = 'https://smartstore.naver.com';
        this.targetUrl = `${this.baseUrl}/${this.storeId}/products/${this.productId}`;
    }

    async extractCookiesWithPlaywright() {
        console.log('🍪 Playwright로 실제 브라우저 세션 쿠키 추출...');
        
        const extractor = new PlaywrightCookieExtractor({
            headless: true, // 빠른 테스트를 위해 headless
            slowMo: 1000
        });

        try {
            const result = await extractor.extractCookiesFromStore(
                `${this.baseUrl}/${this.storeId}`,
                this.targetUrl
            );

            if (result && result.cookies) {
                console.log(`✅ 쿠키 추출 성공: ${result.cookies.length}개`);
                
                // 쿠키를 HTTP 헤더 형식으로 변환
                const cookieString = result.cookies
                    .map(cookie => `${cookie.name}=${cookie.value}`)
                    .join('; ');

                return {
                    success: true,
                    cookies: result.cookies,
                    cookieString: cookieString,
                    userAgent: result.userAgent,
                    channelUid: result.channelUid,
                    headers: result.headers
                };
            } else {
                throw new Error('쿠키 추출 실패');
            }

        } catch (error) {
            console.log(`❌ Playwright 쿠키 추출 실패: ${error.message}`);
            return { success: false, error: error.message };
        } finally {
            await extractor.close();
        }
    }

    async testWithExtractedCookies(cookieData) {
        console.log('\n🚀 추출된 쿠키로 CurlHttpClient 테스트...');
        
        const client = new CurlHttpClient({
            timeout: 45000,
            enableCookies: true
        });

        try {
            // 1단계: 추출된 쿠키를 사용해서 스토어 페이지 접근
            console.log('1️⃣ 쿠키와 함께 스토어 페이지 접근');
            const storeHeaders = {
                ...cookieData.headers,
                'Cookie': cookieData.cookieString,
                'User-Agent': cookieData.userAgent
            };

            const storeResponse = await client.get(`${this.baseUrl}/${this.storeId}`, {}, storeHeaders);
            console.log(`   스토어 페이지: ${storeResponse.status}`);

            if (storeResponse.status !== 200) {
                throw new Error(`스토어 페이지 접근 실패: ${storeResponse.status}`);
            }

            await this.delay(2000);

            // 2단계: 상품 페이지 접근
            console.log('2️⃣ 쿠키와 함께 상품 페이지 접근');
            const productPageHeaders = {
                ...storeHeaders,
                'Referer': `${this.baseUrl}/${this.storeId}`
            };

            const productResponse = await client.get(this.targetUrl, {}, productPageHeaders);
            console.log(`   상품 페이지: ${productResponse.status}`);

            if (productResponse.status !== 200) {
                throw new Error(`상품 페이지 접근 실패: ${productResponse.status}`);
            }

            await this.delay(2000);

            // 3단계: 핵심 API 호출
            console.log('3️⃣ 상품 정보 API 호출');
            const apiUrl = `${this.baseUrl}/i/v2/channels/${this.channelId}/products/${this.productId}`;
            const apiHeaders = {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': this.targetUrl,
                'User-Agent': cookieData.userAgent,
                'Cookie': cookieData.cookieString,
                'X-Requested-With': 'XMLHttpRequest',
                'Sec-Ch-Ua': '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            };

            const apiResponse = await client.get(apiUrl, { withWindow: 'false' }, apiHeaders);
            console.log(`   API 응답: ${apiResponse.status}`);

            if (apiResponse.status === 200) {
                console.log('✅ API 호출 성공! 상품 데이터 추출 중...');
                return this.extractProductInfo(apiResponse.data);
            } else {
                throw new Error(`API 호출 실패: ${apiResponse.status}`);
            }

        } catch (error) {
            console.log(`❌ CurlHttpClient 테스트 실패: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    extractProductInfo(apiData) {
        try {
            let productData;
            if (typeof apiData === 'string') {
                productData = JSON.parse(apiData);
            } else {
                productData = apiData;
            }

            const product = productData.product || productData;
            
            if (!product) {
                throw new Error('상품 데이터가 API 응답에 없습니다');
            }

            const result = {
                success: true,
                method: 'CurlHttpClient with Extracted Playwright Cookies',
                productInfo: {
                    name: product.name || 'Unknown',
                    salePrice: product.salePrice || 0,
                    originalPrice: product.originalPrice || product.salePrice || 0,
                    discountRate: product.discountRate || 0,
                    brand: product.brandName || '',
                    stockQuantity: product.stockQuantity || 0,
                    images: (product.images || []).slice(0, 5).map(img => ({
                        url: img.url || img.src || img,
                        type: img.type || 'product',
                        order: img.order || 0
                    })),
                    options: (product.optionCombinations || product.options || []).slice(0, 10).map(opt => ({
                        name: opt.optionName || opt.name || '',
                        value: opt.optionValue || opt.value || '',
                        price: opt.price || 0
                    })),
                    extractedAt: new Date().toISOString()
                },
                apiResponseSize: JSON.stringify(productData).length
            };

            console.log('\n📊 추출된 상품 정보:');
            console.log(`   상품명: ${result.productInfo.name}`);
            console.log(`   판매가: ${result.productInfo.salePrice.toLocaleString()}원`);
            console.log(`   정가: ${result.productInfo.originalPrice.toLocaleString()}원`);
            console.log(`   할인율: ${result.productInfo.discountRate}%`);
            console.log(`   브랜드: ${result.productInfo.brand}`);
            console.log(`   재고: ${result.productInfo.stockQuantity}개`);
            console.log(`   이미지: ${result.productInfo.images.length}개`);
            console.log(`   옵션: ${result.productInfo.options.length}개`);

            return result;

        } catch (error) {
            console.log(`❌ 상품 정보 추출 실패: ${error.message}`);
            return {
                success: false,
                error: `상품 정보 추출 실패: ${error.message}`,
                rawData: apiData
            };
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async runCompleteTest() {
        console.log('🧪 하이브리드 크롤링 테스트 (Playwright 쿠키 + CurlHttpClient)');
        console.log(`📦 대상 상품: ${this.targetUrl}`);

        const startTime = Date.now();

        // Step 1: Playwright로 쿠키 추출
        const cookieData = await this.extractCookiesWithPlaywright();
        
        if (!cookieData.success) {
            const failResult = {
                success: false,
                phase: 'cookie-extraction',
                error: cookieData.error,
                duration: `${((Date.now() - startTime) / 1000).toFixed(2)}초`
            };
            this.saveResults(failResult);
            return failResult;
        }

        // Step 2: 추출된 쿠키로 CurlHttpClient 테스트
        const crawlResult = await this.testWithExtractedCookies(cookieData);

        const endTime = Date.now();
        const duration = endTime - startTime;

        const finalResult = {
            testDate: new Date().toISOString(),
            approach: 'Hybrid: Playwright Cookie Extraction + CurlHttpClient',
            targetUrl: this.targetUrl,
            duration: `${(duration / 1000).toFixed(2)}초`,
            cookieExtractionSuccess: cookieData.success,
            extractedCookieCount: cookieData.cookies?.length || 0,
            crawlResult: crawlResult,
            conclusion: this.getConclusion(cookieData.success, crawlResult.success)
        };

        this.saveResults(finalResult);
        this.printSummary(finalResult);

        return finalResult;
    }

    getConclusion(cookieSuccess, crawlSuccess) {
        if (cookieSuccess && crawlSuccess) {
            return '성공! 하이브리드 접근법으로 봇 탐지 우회 가능';
        } else if (!cookieSuccess) {
            return '실패: Playwright 쿠키 추출 단계에서 실패';
        } else if (!crawlSuccess) {
            return '부분 성공: 쿠키는 추출했으나 CurlHttpClient로 접근 실패';
        } else {
            return '알 수 없는 상태';
        }
    }

    saveResults(result) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `hybrid-crawler-test-${timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(result, null, 2));
        console.log(`\n💾 결과 저장: ${filename}`);
    }

    printSummary(result) {
        console.log('\n📋 테스트 결과 요약:');
        console.log(`   접근 방식: ${result.approach}`);
        console.log(`   총 소요시간: ${result.duration}`);
        console.log(`   쿠키 추출: ${result.cookieExtractionSuccess ? '✅' : '❌'} (${result.extractedCookieCount}개)`);
        console.log(`   데이터 크롤링: ${result.crawlResult.success ? '✅' : '❌'}`);
        console.log(`   최종 결론: ${result.conclusion}`);
    }
}

// 테스트 실행
const tester = new CookieBasedCrawlerTest();
tester.runCompleteTest().catch(console.error);