const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * 네이버 스마트스토어 봇 탐지 우회 테스트
 * 자연스러운 사용자 흐름으로 상품 페이지에 접근
 * HTML 및 API 응답 데이터 수집
 */
async function testSmartStoreCrawling() {
    const browser = await chromium.launch({ 
        headless: false,  // 디버깅을 위해 브라우저 표시
        slowMo: 1000     // 액션 간 1초 지연
    });
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'ko-KR'
    });
    
    const page = await context.newPage();
    
    // 네트워크 요청/응답 수집을 위한 배열
    const networkRequests = [];
    const apiResponses = [];
    const cookieData = [];
    const requestHeaders = [];
    
    // 네트워크 모니터링 설정
    page.on('request', request => {
        const headers = request.headers();
        networkRequests.push({
            url: request.url(),
            method: request.method(),
            headers: headers,
            postData: request.postData(),
            timestamp: new Date().toISOString()
        });

        // 쿠키가 포함된 요청 헤더 별도 수집
        if (headers.cookie) {
            cookieData.push({
                url: request.url(),
                cookie: headers.cookie,
                timestamp: new Date().toISOString(),
                type: 'request'
            });
        }

        // 중요한 요청 헤더들 별도 수집 (스마트스토어 관련)
        if (request.url().includes('smartstore.naver.com')) {
            requestHeaders.push({
                url: request.url(),
                method: request.method(),
                headers: headers,
                userAgent: headers['user-agent'],
                referer: headers.referer,
                origin: headers.origin,
                accept: headers.accept,
                acceptLanguage: headers['accept-language'],
                acceptEncoding: headers['accept-encoding'],
                cookie: headers.cookie,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    page.on('response', async response => {
        const url = response.url();
        const responseHeaders = response.headers();
        
        // Set-Cookie 헤더 별도 수집
        if (responseHeaders['set-cookie']) {
            cookieData.push({
                url: url,
                setCookie: responseHeaders['set-cookie'],
                timestamp: new Date().toISOString(),
                type: 'response',
                status: response.status()
            });
        }

        // API 응답으로 보이는 요청들만 필터링
        if (url.includes('api') || url.includes('ajax') || url.includes('graphql') || 
            url.includes('product') || url.includes('detail') || url.includes('smartstore') ||
            url.includes('channels') || url.includes('/i/v2/')) {
            try {
                const responseBody = await response.text();
                apiResponses.push({
                    url: url,
                    status: response.status(),
                    headers: responseHeaders,
                    body: responseBody,
                    timestamp: new Date().toISOString()
                });
                console.log(`📡 API 응답 수집: ${url} (${response.status()})`);
            } catch (e) {
                console.log(`API 응답 수집 실패: ${url} - ${e.message}`);
            }
        }
    });
    
    try {
        console.log('1단계: 스토어 메인페이지 접속');
        await page.goto('https://smartstore.naver.com/wodnr7762', { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // 페이지 로딩 완료 대기
        await page.waitForTimeout(3000);
        
        console.log('2단계: 메인페이지 HTML 저장');
        const mainPageHtml = await page.content();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(`smartstore-main-${timestamp}.html`, mainPageHtml, 'utf8');
        console.log(`✅ 메인페이지 HTML 저장: smartstore-main-${timestamp}.html`);
        
        console.log('3단계: 베스트 상품 목록에서 타겟 상품 찾기');
        // 상품 ID 7588460081이 포함된 링크 찾기
        const productSelectors = [
            'a[href*="7588460081"]',
            'a[href*="/products/7588460081"]'
        ];
        
        let productLink = null;
        for (const selector of productSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    productLink = elements[0];
                    console.log(`✅ 타겟 상품 링크 발견: ${selector}`);
                    break;
                }
            } catch (e) {
                console.log(`선택자 ${selector} 실패: ${e.message}`);
            }
        }
        
        if (!productLink) {
            console.log('❌ 타겟 상품을 찾을 수 없습니다. 페이지에서 모든 상품 링크 확인');
            const allProductLinks = await page.$$('a[href*="/products/"]');
            console.log(`총 ${allProductLinks.length}개의 상품 링크 발견`);
            
            for (let i = 0; i < Math.min(allProductLinks.length, 10); i++) {
                const href = await allProductLinks[i].getAttribute('href');
                console.log(`상품 링크 ${i}: ${href}`);
            }
            return;
        }
        
        console.log('4단계: 상품 페이지로 이동');
        await productLink.click();
        console.log('상품 페이지로 이동 중...');
        
        // 상품 페이지 로딩 대기
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000);
        
        console.log('5단계: 최종 URL 확인');
        const finalUrl = page.url();
        console.log(`최종 접근 URL: ${finalUrl}`);
        
        // 상품 페이지 HTML 저장
        console.log('5-1단계: 상품 페이지 HTML 저장');
        const productPageHtml = await page.content();
        fs.writeFileSync(`smartstore-product-page-${timestamp}.html`, productPageHtml, 'utf8');
        console.log(`✅ 상품 페이지 HTML 저장: smartstore-product-page-${timestamp}.html`);
        
        if (finalUrl.includes('7588460081')) {
            console.log('✅ 성공: 타겟 상품 페이지에 접근했습니다!');
            
            console.log('7단계: 상품 정보 추출 테스트');
            try {
                // 다양한 선택자로 상품 정보 추출 시도
                const titleSelectors = ['h1', '.product-title', '[data-testid*="title"]', '.product_title', '.prod_buy_header h3'];
                const priceSelectors = ['.price', '.product-price', '[data-testid*="price"]', '.price_area', '.total_price'];
                
                let productTitle = null;
                let productPrice = null;
                
                for (const selector of titleSelectors) {
                    try {
                        const element = await page.$(selector);
                        if (element) {
                            productTitle = await element.textContent();
                            if (productTitle && productTitle.trim()) {
                                console.log(`✅ 상품명 추출 성공 (${selector}): ${productTitle.trim()}`);
                                break;
                            }
                        }
                    } catch (e) {}
                }
                
                for (const selector of priceSelectors) {
                    try {
                        const element = await page.$(selector);
                        if (element) {
                            productPrice = await element.textContent();
                            if (productPrice && productPrice.trim()) {
                                console.log(`✅ 가격 추출 성공 (${selector}): ${productPrice.trim()}`);
                                break;
                            }
                        }
                    } catch (e) {}
                }
                
                // 상품 정보를 파일로 저장
                const productInfo = {
                    url: finalUrl,
                    title: productTitle?.trim() || '추출 실패',
                    price: productPrice?.trim() || '추출 실패',
                    extractedAt: new Date().toISOString()
                };
                
                fs.writeFileSync(`smartstore-product-info-${timestamp}.json`, JSON.stringify(productInfo, null, 2), 'utf8');
                console.log(`✅ 상품 정보 저장: smartstore-product-info-${timestamp}.json`);
                
            } catch (e) {
                console.log('❌ 상품 정보 추출 실패:', e.message);
            }
        } else {
            console.log('❌ 실패: 타겟 상품 페이지에 접근하지 못했습니다.');
        }
        
    } catch (error) {
        console.error('에러 발생:', error.message);
        
        // 현재 페이지 정보 출력
        console.log('현재 URL:', page.url());
        console.log('페이지 제목:', await page.title());
        
        // 스크린샷 저장
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        console.log('에러 스크린샷 저장: error-screenshot.png');
        
    } finally {
        console.log('8단계: 수집된 데이터 저장');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // 네트워크 요청 저장
        if (networkRequests.length > 0) {
            fs.writeFileSync(`network-requests-${timestamp}.json`, JSON.stringify(networkRequests, null, 2), 'utf8');
            console.log(`✅ 네트워크 요청 저장: network-requests-${timestamp}.json (${networkRequests.length}개)`);
        }
        
        // API 응답 저장
        if (apiResponses.length > 0) {
            fs.writeFileSync(`api-responses-${timestamp}.json`, JSON.stringify(apiResponses, null, 2), 'utf8');
            console.log(`✅ API 응답 저장: api-responses-${timestamp}.json (${apiResponses.length}개)`);
            
            // 각 API 응답을 개별 파일로도 저장
            apiResponses.forEach((response, index) => {
                const filename = `api-response-${index}-${timestamp}.json`;
                fs.writeFileSync(filename, JSON.stringify(response, null, 2), 'utf8');
            });
            console.log(`✅ 개별 API 응답 파일 ${apiResponses.length}개 저장 완료`);
        }

        // 쿠키 데이터 저장
        if (cookieData.length > 0) {
            fs.writeFileSync(`cookie-data-${timestamp}.json`, JSON.stringify(cookieData, null, 2), 'utf8');
            console.log(`✅ 쿠키 데이터 저장: cookie-data-${timestamp}.json (${cookieData.length}개)`);
        }

        // 요청 헤더 저장
        if (requestHeaders.length > 0) {
            fs.writeFileSync(`request-headers-${timestamp}.json`, JSON.stringify(requestHeaders, null, 2), 'utf8');
            console.log(`✅ 요청 헤더 저장: request-headers-${timestamp}.json (${requestHeaders.length}개)`);
        }
        
        console.log('9단계: 브라우저 종료');
        await browser.close();
        
        console.log('\n📊 수집 완료 요약:');
        console.log(`- 네트워크 요청: ${networkRequests.length}개`);
        console.log(`- API 응답: ${apiResponses.length}개`);
        console.log(`- 쿠키 데이터: ${cookieData.length}개`);
        console.log(`- 요청 헤더: ${requestHeaders.length}개`);
        console.log('- HTML 파일: 2개 (메인페이지, 상품페이지)');
        console.log('- 상품 정보 JSON: 1개');
    }
}

// 실행
testSmartStoreCrawling().catch(console.error);