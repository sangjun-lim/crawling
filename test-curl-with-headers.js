import CurlHttpClient from './src/core/CurlHttpClient.js';
import fs from 'fs';

class SmartStoreCurlTest {
    constructor() {
        this.storeId = 'wodnr7762';
        this.productId = '7588460081';
        this.channelId = '2sWDxR7klq0gCXmcpWBd4';
        
        this.baseUrl = 'https://smartstore.naver.com';
        this.apiUrl = 'https://smartstore.naver.com/i/v2';
        
        // 수집된 요청 헤더 로드
        this.requestHeaders = this.loadRequestHeaders();
    }

    loadRequestHeaders() {
        try {
            const headerData = JSON.parse(fs.readFileSync('request-headers-2025-08-23T11-36-09-898Z.json', 'utf8'));
            console.log(`📋 요청 헤더 데이터 로드: ${headerData.length}개`);
            return headerData;
        } catch (error) {
            console.log(`⚠️ 요청 헤더 로드 실패: ${error.message}`);
            return [];
        }
    }

    getBrowserHeaders() {
        // 실제 브라우저에서 사용된 헤더를 기반으로 생성
        const mainPageHeaders = this.requestHeaders.find(h => h.url === `${this.baseUrl}/${this.storeId}`);
        
        if (mainPageHeaders) {
            return {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': mainPageHeaders.acceptLanguage || 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'max-age=0',
                'Sec-Ch-Ua': mainPageHeaders.headers['sec-ch-ua'] || '"Not=A?Brand";v="24", "Chromium";v="140"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent': mainPageHeaders.userAgent || mainPageHeaders.headers['user-agent'] || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
        }

        return {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br'
        };
    }

    getApiHeaders(refererUrl) {
        // API 요청용 헤더 (실제 브라우저에서 사용된 것과 동일하게)
        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': refererUrl,
            'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-Requested-With': 'XMLHttpRequest'
        };
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async testRealisticFlow() {
        console.log('🚀 브라우저 헤더 기반 CurlHttpClient 테스트 시작...');
        
        const client = new CurlHttpClient({
            timeout: 45000,
            enableCookies: true
        });

        try {
            // 1단계: 네이버 스마트스토어 메인 접근 (세션 초기화)
            console.log('\n1️⃣ 네이버 스마트스토어 메인 접근');
            const mainResponse = await client.get('https://smartstore.naver.com', {}, this.getBrowserHeaders());
            console.log(`   상태: ${mainResponse.status}`);
            await this.delay(2000);

            // 2단계: 상점 메인 페이지 접근
            console.log('🏪 2️⃣ 상점 메인 페이지 접근');
            const storeHeaders = {
                ...this.getBrowserHeaders(),
                'Referer': 'https://smartstore.naver.com/'
            };
            const storeResponse = await client.get(`${this.baseUrl}/${this.storeId}`, {}, storeHeaders);
            console.log(`   상태: ${storeResponse.status}`);
            
            if (storeResponse.status !== 200) {
                throw new Error(`스토어 페이지 접근 실패: ${storeResponse.status}`);
            }
            
            await this.delay(3000);

            // 3단계: 상품 페이지 직접 접근
            console.log('📦 3️⃣ 상품 페이지 접근');
            const productPageUrl = `${this.baseUrl}/${this.storeId}/products/${this.productId}`;
            const productPageHeaders = {
                ...this.getBrowserHeaders(),
                'Referer': `${this.baseUrl}/${this.storeId}`
            };
            
            const productPageResponse = await client.get(productPageUrl, {}, productPageHeaders);
            console.log(`   상태: ${productPageResponse.status}`);
            
            if (productPageResponse.status !== 200) {
                throw new Error(`상품 페이지 접근 실패: ${productPageResponse.status}`);
            }
            
            await this.delay(2000);

            // 4단계: 핵심 API 호출 (상품 상세 정보)
            console.log('🔌 4️⃣ 상품 API 호출');
            const apiUrl = `${this.baseUrl}/i/v2/channels/${this.channelId}/products/${this.productId}`;
            const apiHeaders = this.getApiHeaders(productPageUrl);
            
            const apiResponse = await client.get(apiUrl, { withWindow: 'false' }, apiHeaders);
            console.log(`   상태: ${apiResponse.status}`);
            
            if (apiResponse.status === 200) {
                console.log('✅ API 호출 성공! 데이터 추출 중...');
                return this.extractProductData(apiResponse.data);
            } else {
                console.log(`❌ API 호출 실패: ${apiResponse.status}`);
                return { success: false, status: apiResponse.status, message: 'API 호출 실패' };
            }

        } catch (error) {
            console.log(`❌ 테스트 실패: ${error.message}`);
            return { 
                success: false, 
                error: error.message,
                stack: error.stack 
            };
        }
    }

    extractProductData(apiData) {
        try {
            let productData;
            if (typeof apiData === 'string') {
                productData = JSON.parse(apiData);
            } else {
                productData = apiData;
            }

            const product = productData.product || productData;
            
            if (!product) {
                throw new Error('Product data not found in API response');
            }

            const result = {
                success: true,
                method: 'CurlHttpClient with Browser Headers',
                productInfo: {
                    name: product.name || 'Unknown',
                    salePrice: product.salePrice || 0,
                    originalPrice: product.originalPrice || product.salePrice || 0,
                    discountRate: product.discountRate || 0,
                    brand: product.brandName || '',
                    manufacturer: product.manufacturer || '',
                    stockQuantity: product.stockQuantity || 0,
                    category: product.categoryName || '',
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
            console.log(`   응답 크기: ${result.apiResponseSize.toLocaleString()} bytes`);

            return result;

        } catch (error) {
            console.log(`❌ 데이터 추출 실패: ${error.message}`);
            return {
                success: false,
                error: `Data extraction failed: ${error.message}`,
                rawData: apiData
            };
        }
    }

    async runTest() {
        console.log('🧪 브라우저 헤더 기반 스마트스토어 테스트');
        console.log(`📦 대상: ${this.baseUrl}/${this.storeId}/products/${this.productId}`);
        console.log(`🔑 사용된 헤더: ${this.requestHeaders.length}개 실제 브라우저 헤더`);

        const startTime = Date.now();
        const result = await this.testRealisticFlow();
        const endTime = Date.now();
        const duration = endTime - startTime;

        const testSummary = {
            testDate: new Date().toISOString(),
            targetProduct: `${this.storeId}/${this.productId}`,
            method: 'CurlHttpClient with Real Browser Headers',
            duration: `${(duration / 1000).toFixed(2)}초`,
            result: result,
            headerCount: this.requestHeaders.length,
            conclusion: this.getConclusion(result)
        };

        // 결과 저장
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultFile = `curl-with-headers-test-${timestamp}.json`;
        fs.writeFileSync(resultFile, JSON.stringify(testSummary, null, 2));

        console.log('\n📋 테스트 결과:');
        console.log(`   소요시간: ${testSummary.duration}`);
        console.log(`   성공여부: ${result.success ? '✅' : '❌'}`);
        console.log(`   결론: ${testSummary.conclusion}`);
        console.log(`   결과파일: ${resultFile}`);

        return testSummary;
    }

    getConclusion(result) {
        if (result.success) {
            return '성공! 실제 브라우저 헤더로 봇 탐지 우회 가능';
        } else if (result.status === 429) {
            return 'Rate limiting으로 실패 - 더 정교한 세션 관리 필요';
        } else if (result.status >= 400) {
            return `HTTP ${result.status} 오류 - 인증 또는 권한 문제`;
        } else {
            return '알 수 없는 오류 - 추가 분석 필요';
        }
    }
}

// 테스트 실행
const tester = new SmartStoreCurlTest();
tester.runTest().catch(console.error);