const { Session, ClientIdentifier, initTLS, destroyTLS } = require('node-tls-client');
const fs = require('fs');

/**
 * 간단한 네이버 스마트스토어 테스터
 * 다양한 접근 방법을 테스트
 */
class NaverSmartStoreSimpleTester {
    constructor() {
        this.session = null;
    }

    async initialize() {
        console.log('🚀 TLS 클라이언트 초기화 중...');
        
        await initTLS();

        // 더 현실적인 설정
        this.session = new Session({
            clientIdentifier: ClientIdentifier.chrome_120,
            timeout: 60000, // 60초로 증가
            insecureSkipVerify: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        console.log('✅ TLS 클라이언트 초기화 완료');
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 단순 접근 테스트
     */
    async testDirectAccess(storeId, productId) {
        console.log('🧪 직접 접근 테스트');
        
        try {
            const productUrl = `https://smartstore.naver.com/${storeId}/products/${productId}`;
            console.log(`📋 URL: ${productUrl}`);
            
            const response = await this.session.get(productUrl, {
                followRedirects: true
            });

            console.log(`📊 상태: ${response.status}`);
            
            if (response.status === 200) {
                const html = await response.text();
                console.log(`📄 HTML 크기: ${html.length} bytes`);
                
                // 간단한 데이터 추출 테스트
                const titleMatch = html.match(/<title>([^<]*)<\/title>/);
                if (titleMatch) {
                    console.log(`📌 페이지 제목: ${titleMatch[1]}`);
                }
                
                return { success: true, html };
            } else {
                console.log(`❌ 직접 접근 실패: ${response.status}`);
                return { success: false, status: response.status };
            }
        } catch (error) {
            console.log(`❌ 오류: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * API 접근 테스트
     */
    async testAPIAccess(storeId, productId) {
        console.log('🧪 API 접근 테스트');
        
        try {
            const apiUrl = `https://smartstore.naver.com/i/v1/channel/${storeId}/products/${productId}`;
            console.log(`📋 API URL: ${apiUrl}`);
            
            const response = await this.session.get(apiUrl, {
                followRedirects: true,
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            console.log(`📊 상태: ${response.status}`);
            
            if (response.status === 200) {
                const text = await response.text();
                console.log(`📄 응답 크기: ${text.length} bytes`);
                
                try {
                    const data = JSON.parse(text);
                    console.log(`📌 상품명: ${data.name || 'N/A'}`);
                    console.log(`💰 가격: ${data.salePrice?.toLocaleString() || 'N/A'}원`);
                    return { success: true, data };
                } catch (parseError) {
                    console.log(`❌ JSON 파싱 실패`);
                    return { success: false, error: 'JSON 파싱 실패' };
                }
            } else {
                console.log(`❌ API 접근 실패: ${response.status}`);
                return { success: false, status: response.status };
            }
        } catch (error) {
            console.log(`❌ 오류: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * 점진적 접근 테스트
     */
    async testGradualAccess(storeId, productId) {
        console.log('🧪 점진적 접근 테스트');
        
        try {
            // 1단계: 네이버 메인
            console.log('1️⃣ 네이버 메인 접속...');
            let response = await this.session.get('https://www.naver.com');
            console.log(`   상태: ${response.status}`);
            if (response.status !== 200) return { success: false, step: 1 };
            
            await this.sleep(3000);

            // 2단계: 스마트스토어 메인
            console.log('2️⃣ 스마트스토어 메인 접속...');
            response = await this.session.get('https://smartstore.naver.com', {
                headers: { 'Referer': 'https://www.naver.com/' }
            });
            console.log(`   상태: ${response.status}`);
            if (response.status !== 200) return { success: false, step: 2 };
            
            await this.sleep(3000);

            // 3단계: 특정 스토어
            console.log('3️⃣ 특정 스토어 접속...');
            const storeUrl = `https://smartstore.naver.com/${storeId}`;
            response = await this.session.get(storeUrl, {
                headers: { 'Referer': 'https://smartstore.naver.com/' }
            });
            console.log(`   상태: ${response.status}`);
            if (response.status !== 200) return { success: false, step: 3 };
            
            await this.sleep(3000);

            // 4단계: 상품 페이지
            console.log('4️⃣ 상품 페이지 접속...');
            const productUrl = `https://smartstore.naver.com/${storeId}/products/${productId}`;
            response = await this.session.get(productUrl, {
                headers: { 'Referer': storeUrl }
            });
            console.log(`   상태: ${response.status}`);
            
            if (response.status === 200) {
                const html = await response.text();
                console.log(`📄 HTML 크기: ${html.length} bytes`);
                return { success: true, html };
            } else {
                return { success: false, step: 4, status: response.status };
            }

        } catch (error) {
            console.log(`❌ 오류: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async close() {
        if (this.session) {
            await this.session.close();
        }
        await destroyTLS();
        console.log('🔒 TLS 클라이언트 종료');
    }
}

/**
 * 테스트 실행
 */
async function runTests() {
    const tester = new NaverSmartStoreSimpleTester();
    
    try {
        await tester.initialize();
        
        const storeId = 'wodnr7762';
        const productId = '7588460081';
        
        console.log('🔬 네이버 스마트스토어 접근 테스트 시작\n');
        
        // 테스트 1: 직접 접근
        console.log('='.repeat(50));
        const result1 = await tester.testDirectAccess(storeId, productId);
        console.log('결과:', result1.success ? '✅ 성공' : '❌ 실패');
        if (!result1.success) {
            console.log('상세:', result1.status || result1.error);
        }
        
        await tester.sleep(5000);
        
        // 테스트 2: API 접근
        console.log('\n' + '='.repeat(50));
        const result2 = await tester.testAPIAccess(storeId, productId);
        console.log('결과:', result2.success ? '✅ 성공' : '❌ 실패');
        if (!result2.success) {
            console.log('상세:', result2.status || result2.error);
        }
        
        await tester.sleep(5000);
        
        // 테스트 3: 점진적 접근
        console.log('\n' + '='.repeat(50));
        const result3 = await tester.testGradualAccess(storeId, productId);
        console.log('결과:', result3.success ? '✅ 성공' : '❌ 실패');
        if (!result3.success) {
            console.log('상세:', `단계 ${result3.step} 실패`, result3.status || result3.error);
        }
        
        console.log('\n🏁 테스트 완료');
        console.log('직접 접근:', result1.success ? '✅' : '❌');
        console.log('API 접근:', result2.success ? '✅' : '❌');
        console.log('점진적 접근:', result3.success ? '✅' : '❌');
        
    } catch (error) {
        console.error('🔥 전체 테스트 실패:', error.message);
    } finally {
        await tester.close();
    }
}

// 직접 실행 시
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = NaverSmartStoreSimpleTester;