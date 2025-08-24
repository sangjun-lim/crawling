import HttpClient from './src/core/HttpClient.js';
import CurlHttpClient from './src/core/CurlHttpClient.js';
import fs from 'fs';
import path from 'path';

class NaverSmartStoreHttpTest {
    constructor() {
        this.storeId = 'wodnr7762';
        this.productId = '7588460081';
        this.channelId = '2sWDxR7klq0gCXmcpWBd4'; // From MCP analysis
        
        this.baseUrl = 'https://smartstore.naver.com';
        this.apiUrl = 'https://smartstore.naver.com/i/v2';
    }

    async testHttpClient() {
        console.log('\n🔧 Testing HttpClient (axios-based)...');
        const client = new HttpClient({
            timeout: 30000,
            enableCookies: true
        });

        try {
            // Step 1: Access main store page to establish session
            console.log('📂 Accessing main store page...');
            const storeResponse = await client.get(`${this.baseUrl}/${this.storeId}`);
            console.log(`   Status: ${storeResponse.status}`);
            console.log(`   Content-Length: ${storeResponse.headers['content-length'] || 'unknown'}`);

            // Step 2: Try to access product API directly
            console.log('🔍 Attempting direct API access...');
            const productApiUrl = `${this.apiUrl}/channels/${this.channelId}/products/${this.productId}?withWindow=false`;
            
            const apiHeaders = {
                'Accept': 'application/json, text/plain, */*',
                'Referer': `${this.baseUrl}/${this.storeId}/products/${this.productId}`,
                'X-Requested-With': 'XMLHttpRequest'
            };

            const productResponse = await client.get(productApiUrl, {}, apiHeaders);
            
            if (productResponse.data && typeof productResponse.data === 'string') {
                const productData = JSON.parse(productResponse.data);
                return this.extractProductInfo(productData, 'HttpClient');
            } else {
                return this.extractProductInfo(productResponse.data, 'HttpClient');
            }

        } catch (error) {
            console.log(`❌ HttpClient failed: ${error.message}`);
            if (error.response) {
                console.log(`   Response status: ${error.response.status}`);
                console.log(`   Response body: ${error.response.data?.substring(0, 200)}...`);
            }
            return { success: false, client: 'HttpClient', error: error.message };
        }
    }

    async testCurlHttpClient() {
        console.log('\n🚀 Testing CurlHttpClient (TLS fingerprint evasion)...');
        const client = new CurlHttpClient({
            timeout: 30000,
            enableCookies: true
        });

        try {
            // Step 1: Access main store page
            console.log('📂 Accessing main store page...');
            const storeResponse = await client.get(`${this.baseUrl}/${this.storeId}`);
            console.log(`   Status: ${storeResponse.status}`);
            console.log(`   Content-Length: ${storeResponse.headers['content-length'] || 'unknown'}`);

            // Step 2: Try to access product API directly
            console.log('🔍 Attempting direct API access...');
            const productApiUrl = `${this.apiUrl}/channels/${this.channelId}/products/${this.productId}?withWindow=false`;
            
            const apiHeaders = {
                'Accept': 'application/json, text/plain, */*',
                'Referer': `${this.baseUrl}/${this.storeId}/products/${this.productId}`,
                'X-Requested-With': 'XMLHttpRequest'
            };

            const productResponse = await client.get(productApiUrl, {}, apiHeaders);
            
            let productData;
            if (typeof productResponse.data === 'string') {
                productData = JSON.parse(productResponse.data);
            } else {
                productData = productResponse.data;
            }

            return this.extractProductInfo(productData, 'CurlHttpClient');

        } catch (error) {
            console.log(`❌ CurlHttpClient failed: ${error.message}`);
            if (error.response) {
                console.log(`   Response status: ${error.response.status}`);
                console.log(`   Response body: ${error.response.data?.substring(0, 200)}...`);
            }
            return { success: false, client: 'CurlHttpClient', error: error.message };
        }
    }

    extractProductInfo(data, clientType) {
        try {
            console.log(`✅ ${clientType} succeeded!`);
            
            // Extract key product information
            const product = data.product || data;
            const productName = product.name || product.productName || 'Unknown';
            const price = product.salePrice || product.price || 0;
            const originalPrice = product.originalPrice || product.regularPrice || price;
            const images = product.images || product.productImages || [];
            const options = product.optionCombinations || product.options || [];

            const result = {
                success: true,
                client: clientType,
                productInfo: {
                    name: productName,
                    salePrice: price,
                    originalPrice: originalPrice,
                    imageCount: images.length,
                    optionCount: options.length,
                    images: images.slice(0, 5).map(img => img.url || img.src || img),
                    extractedAt: new Date().toISOString()
                },
                rawDataSize: JSON.stringify(data).length
            };

            console.log(`   상품명: ${productName}`);
            console.log(`   판매가: ${price.toLocaleString()}원`);
            console.log(`   정가: ${originalPrice.toLocaleString()}원`);
            console.log(`   이미지 수: ${images.length}`);
            console.log(`   옵션 수: ${options.length}`);
            console.log(`   데이터 크기: ${result.rawDataSize} bytes`);

            return result;

        } catch (extractError) {
            console.log(`❌ Data extraction failed: ${extractError.message}`);
            return {
                success: false,
                client: clientType,
                error: `Extraction failed: ${extractError.message}`,
                rawData: data
            };
        }
    }

    async runTests() {
        console.log('🧪 네이버 스마트스토어 HTTP 클라이언트 테스트 시작');
        console.log(`📦 대상 상품: ${this.baseUrl}/${this.storeId}/products/${this.productId}`);
        console.log(`🔌 API 엔드포인트: ${this.apiUrl}/channels/${this.channelId}/products/${this.productId}`);

        const results = [];

        // Test both clients
        results.push(await this.testHttpClient());
        results.push(await this.testCurlHttpClient());

        // Save results
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultFile = `http-client-test-results-${timestamp}.json`;
        
        const testSummary = {
            testDate: new Date().toISOString(),
            targetProduct: `${this.storeId}/${this.productId}`,
            results: results,
            summary: {
                httpClientSuccess: results[0]?.success || false,
                curlHttpClientSuccess: results[1]?.success || false,
                recommendedClient: this.getRecommendation(results)
            }
        };

        fs.writeFileSync(resultFile, JSON.stringify(testSummary, null, 2));
        
        console.log('\n📊 테스트 결과 요약:');
        console.log(`   HttpClient 성공: ${testSummary.summary.httpClientSuccess ? '✅' : '❌'}`);
        console.log(`   CurlHttpClient 성공: ${testSummary.summary.curlHttpClientSuccess ? '✅' : '❌'}`);
        console.log(`   추천 클라이언트: ${testSummary.summary.recommendedClient}`);
        console.log(`   결과 저장: ${resultFile}`);

        return testSummary;
    }

    getRecommendation(results) {
        const httpSuccess = results[0]?.success || false;
        const curlSuccess = results[1]?.success || false;

        if (curlSuccess && httpSuccess) {
            return 'CurlHttpClient (TLS 핑거프린트 우회 능력)';
        } else if (curlSuccess) {
            return 'CurlHttpClient (유일한 성공 옵션)';
        } else if (httpSuccess) {
            return 'HttpClient (기본 옵션으로 충분)';
        } else {
            return '브라우저 자동화 필요 (두 클라이언트 모두 실패)';
        }
    }
}

// Run tests
const tester = new NaverSmartStoreHttpTest();
tester.runTests().catch(console.error);