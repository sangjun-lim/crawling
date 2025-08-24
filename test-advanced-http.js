import CurlHttpClient from './src/core/CurlHttpClient.js';
import fs from 'fs';

class AdvancedNaverSmartStoreTest {
    constructor() {
        this.storeId = 'wodnr7762';
        this.productId = '7588460081';
        this.channelId = '2sWDxR7klq0gCXmcpWBd4';
        this.baseUrl = 'https://smartstore.naver.com';
        this.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    }

    async testAdvancedCurlApproach() {
        console.log('🚀 고급 CurlHttpClient 테스트 시작...');
        console.log('   - TLS 핑거프린트 우회');
        console.log('   - 쿠키 세션 관리');
        console.log('   - 자연스러운 사용자 패턴 시뮬레이션');
        
        const client = new CurlHttpClient({
            timeout: 45000,
            enableCookies: true
        });

        try {
            // Step 1: 메인 페이지 접근 (자연스러운 사용자 패턴)
            console.log('\n📂 1단계: 네이버 스마트스토어 메인 페이지');
            await client.get('https://smartstore.naver.com');
            await this.delay(2000); // 2초 대기
            
            // Step 2: 스토어 메인 페이지 접근
            console.log('🏪 2단계: 상점 메인 페이지');
            const storeResponse = await client.get(`${this.baseUrl}/${this.storeId}`);
            console.log(`   Status: ${storeResponse.status}`);
            await this.delay(3000); // 3초 대기 (페이지 로딩 시뮬레이션)

            // Step 3: 상품 페이지 직접 접근
            console.log('📦 3단계: 상품 페이지 접근');
            const productPageUrl = `${this.baseUrl}/${this.storeId}/products/${this.productId}`;
            const productPageResponse = await client.get(productPageUrl);
            console.log(`   Status: ${productPageResponse.status}`);
            await this.delay(2000); // 2초 대기
            
            // Step 4: API 호출 (브라우저가 실제로 호출하는 방식)
            console.log('🔌 4단계: 제품 API 호출');
            const apiUrl = `${this.baseUrl}/i/v2/channels/${this.channelId}/products/${this.productId}`;
            
            const apiHeaders = {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': productPageUrl,
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            };

            const apiResponse = await client.get(apiUrl, { withWindow: 'false' }, apiHeaders);
            
            if (apiResponse.status === 200) {
                console.log('✅ API 호출 성공!');
                return this.processApiResponse(apiResponse.data);
            } else {
                console.log(`❌ API 호출 실패: ${apiResponse.status}`);
                return { success: false, status: apiResponse.status };
            }

        } catch (error) {
            console.log(`❌ 테스트 실패: ${error.message}`);
            
            if (error.response) {
                console.log(`   HTTP Status: ${error.response.status}`);
                
                // 429 에러인 경우 더 긴 대기 시간으로 재시도
                if (error.response.status === 429) {
                    console.log('⏳ Rate limit 감지 - 30초 후 재시도...');
                    await this.delay(30000);
                    return await this.retryWithLongerDelay(client);
                }
            }
            
            return { success: false, error: error.message };
        }
    }

    async retryWithLongerDelay(client) {
        console.log('🔄 재시도 시작 (더 긴 대기 시간)...');
        
        try {
            // 더 긴 대기 시간으로 재시도
            console.log('📂 스토어 페이지 재접근...');
            await client.get(`${this.baseUrl}/${this.storeId}`);
            await this.delay(10000); // 10초 대기

            const productPageUrl = `${this.baseUrl}/${this.storeId}/products/${this.productId}`;
            console.log('📦 상품 페이지 재접근...');
            await client.get(productPageUrl);
            await this.delay(10000); // 10초 대기

            console.log('🔌 API 재호출...');
            const apiUrl = `${this.baseUrl}/i/v2/channels/${this.channelId}/products/${this.productId}?withWindow=false`;
            
            const apiHeaders = {
                'Accept': 'application/json, text/plain, */*',
                'Referer': productPageUrl,
                'X-Requested-With': 'XMLHttpRequest'
            };

            const apiResponse = await client.get(apiUrl, {}, apiHeaders);
            
            if (apiResponse.status === 200) {
                console.log('✅ 재시도 성공!');
                return this.processApiResponse(apiResponse.data);
            } else {
                console.log(`❌ 재시도 실패: ${apiResponse.status}`);
                return { success: false, status: apiResponse.status, retried: true };
            }

        } catch (retryError) {
            console.log(`❌ 재시도 실패: ${retryError.message}`);
            return { success: false, error: retryError.message, retried: true };
        }
    }

    processApiResponse(data) {
        try {
            let productData;
            if (typeof data === 'string') {
                productData = JSON.parse(data);
            } else {
                productData = data;
            }

            const product = productData.product || productData;
            const images = product.images || product.productImages || [];
            const options = product.optionCombinations || product.options || [];

            const result = {
                success: true,
                method: 'Advanced CurlHttpClient',
                productInfo: {
                    name: product.name || product.productName || 'Unknown',
                    salePrice: product.salePrice || product.price || 0,
                    originalPrice: product.originalPrice || product.regularPrice || 0,
                    discountRate: product.discountRate || 0,
                    brand: product.brandName || product.brand || '',
                    manufacturer: product.manufacturer || '',
                    stockQuantity: product.stockQuantity || 0,
                    category: product.categoryName || product.category || '',
                    imageCount: images.length,
                    optionCount: options.length,
                    images: images.slice(0, 5).map(img => ({
                        url: img.url || img.src || img,
                        type: img.type || 'product',
                        order: img.order || 0
                    })),
                    extractedAt: new Date().toISOString()
                },
                rawDataSize: JSON.stringify(productData).length
            };

            console.log('\n📊 추출된 상품 정보:');
            console.log(`   상품명: ${result.productInfo.name}`);
            console.log(`   판매가: ${result.productInfo.salePrice.toLocaleString()}원`);
            console.log(`   정가: ${result.productInfo.originalPrice.toLocaleString()}원`);
            console.log(`   할인율: ${result.productInfo.discountRate}%`);
            console.log(`   브랜드: ${result.productInfo.brand}`);
            console.log(`   재고: ${result.productInfo.stockQuantity}`);
            console.log(`   이미지: ${result.productInfo.imageCount}개`);
            console.log(`   옵션: ${result.productInfo.optionCount}개`);
            console.log(`   데이터 크기: ${result.rawDataSize.toLocaleString()} bytes`);

            return result;

        } catch (error) {
            console.log(`❌ 데이터 처리 실패: ${error.message}`);
            return {
                success: false,
                error: `Data processing failed: ${error.message}`,
                rawData: data
            };
        }
    }

    async runAdvancedTest() {
        console.log('🧪 고급 네이버 스마트스토어 HTTP 테스트');
        console.log(`📦 대상 상품: ${this.baseUrl}/${this.storeId}/products/${this.productId}`);
        console.log('🎯 목표: 자연스러운 사용자 패턴으로 봇 탐지 우회\n');

        const startTime = Date.now();
        const result = await this.testAdvancedCurlApproach();
        const endTime = Date.now();
        const duration = endTime - startTime;

        const testSummary = {
            testDate: new Date().toISOString(),
            targetProduct: `${this.storeId}/${this.productId}`,
            method: 'Advanced CurlHttpClient with Natural User Pattern',
            duration: `${(duration / 1000).toFixed(2)}초`,
            result: result,
            conclusion: this.getConclusion(result)
        };

        // 결과 저장
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultFile = `advanced-http-test-${timestamp}.json`;
        fs.writeFileSync(resultFile, JSON.stringify(testSummary, null, 2));

        console.log('\n📋 테스트 요약:');
        console.log(`   소요 시간: ${testSummary.duration}`);
        console.log(`   성공 여부: ${result.success ? '✅' : '❌'}`);
        console.log(`   결론: ${testSummary.conclusion}`);
        console.log(`   결과 파일: ${resultFile}`);

        return testSummary;
    }

    getConclusion(result) {
        if (result.success) {
            return 'HTTP 클라이언트만으로도 데이터 추출 가능 (자연스러운 패턴 필요)';
        } else if (result.retried) {
            return 'Rate limiting으로 인해 실패 - 더 긴 대기 시간 또는 브라우저 필요';
        } else {
            return '봇 탐지로 인해 실패 - 브라우저 자동화 권장';
        }
    }
}

// 테스트 실행
const tester = new AdvancedNaverSmartStoreTest();
tester.runAdvancedTest().catch(console.error);