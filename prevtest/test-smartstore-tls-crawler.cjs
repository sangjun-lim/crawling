const { Session, ClientIdentifier, initTLS, destroyTLS } = require('node-tls-client');
const fs = require('fs');

/**
 * 네이버 스마트스토어 크롤러 (node-tls-client 버전)
 * TLS 핑거프린팅을 통한 봇 탐지 우회
 */
class NaverSmartStoreTLSCrawler {
    constructor(options = {}) {
        this.options = {
            headless: options.headless ?? true,
            timeout: options.timeout ?? 30000,
            saveData: options.saveData ?? true,
            proxy: options.proxy ?? null,
            ...options
        };
        this.session = null;
        this.apiResponses = [];
    }

    async initialize() {
        console.log('🚀 TLS 클라이언트 초기화 중...');
        
        await initTLS();

        const sessionOptions = {
            clientIdentifier: ClientIdentifier.chrome_120,
            timeout: this.options.timeout,
            insecureSkipVerify: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        };

        // 프록시 설정 추가
        if (this.options.proxy) {
            sessionOptions.proxy = this.options.proxy;
            console.log(`🔗 프록시 설정: ${this.options.proxy}`);
        }

        this.session = new Session(sessionOptions);

        console.log('✅ TLS 클라이언트 초기화 완료');
    }

    /**
     * 스토어 메인페이지를 통해 특정 상품에 접근
     */
    async crawlProduct(storeId, productId) {
        if (!this.session) {
            await this.initialize();
        }

        console.log(`🎯 상품 크롤링 시작: ${storeId}/${productId}`);

        try {
            // 1단계: 네이버 메인 페이지 방문 (더 자연스러운 흐름)
            console.log('1️⃣ 네이버 메인 페이지 접속 중...');
            await this.session.get('https://www.naver.com', {
                followRedirects: true
            });
            
            // 잠시 대기
            await this.sleep(2000);

            // 2단계: 스토어 메인페이지 접속
            console.log('2️⃣ 스토어 메인페이지 접속 중...');
            const storeUrl = `https://smartstore.naver.com/${storeId}`;
            
            const storeResponse = await this.session.get(storeUrl, {
                followRedirects: true,
                headers: {
                    'Referer': 'https://www.naver.com/'
                }
            });

            console.log(`✅ 메인페이지 응답: ${storeResponse.status}`);

            if (storeResponse.status === 429) {
                console.log('⏳ Rate limit 감지, 대기 후 재시도...');
                return;
                await this.sleep(5000);
                return this.crawlProduct(storeId, productId);
            }

            // 쿠키 확인
            const cookies = await this.session.cookies();
            console.log(`🍪 쿠키 수: ${cookies.length}개`);

            // 추가 대기
            await this.sleep(3000);

            // 3단계: 상품 페이지로 직접 이동
            console.log('3️⃣ 상품 페이지 접근 중...');
            const productUrl = `https://smartstore.naver.com/${storeId}/products/${productId}`;
            
            const productResponse = await this.session.get(productUrl, {
                followRedirects: true,
                headers: {
                    'Referer': storeUrl,
                    'Cache-Control': 'max-age=0'
                }
            });

            console.log(`🔗 상품 페이지 응답: ${productResponse.status}`);

            if (productResponse.status === 429) {
                console.log('⏳ Rate limit 감지, 더 긴 대기 후 재시도...');
                return;
                await this.sleep(10000);
                return this.crawlProduct(storeId, productId);
            }

            if (productResponse.status !== 200) {
                throw new Error(`상품 페이지 접근 실패: ${productResponse.status}`);
            }

            const productHtml = await productResponse.text();
            console.log(`📄 HTML 크기: ${productHtml.length} bytes`);

            // 4단계: HTML에서 상품 데이터 추출
            console.log('4️⃣ 상품 데이터 추출 중...');
            const productData = this.extractProductDataFromHTML(productHtml);

            // 5단계: API 호출로 추가 데이터 수집
            console.log('5️⃣ API 데이터 수집 중...');
            await this.sleep(2000); // API 호출 전 대기
            const apiData = await this.fetchProductAPI(storeId, productId);

            // 최종 데이터 조합
            const finalData = {
                ...productData,
                ...apiData,
                crawledAt: new Date().toISOString(),
                url: productUrl,
                method: 'node-tls-client'
            };

            // 데이터 저장
            if (this.options.saveData) {
                await this.saveData(finalData, productId);
            }

            console.log('🎉 크롤링 완료!');
            return finalData;

        } catch (error) {
            console.error(`❌ 크롤링 실패: ${error.message}`);
            throw error;
        }
    }

    /**
     * 대기 함수
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * HTML에서 상품 데이터 추출
     */
    extractProductDataFromHTML(html) {
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
            // 상품명 추출 (여러 패턴 시도)
            const titlePatterns = [
                /<h1[^>]*>([^<]+)<\/h1>/,
                /"productName"\s*:\s*"([^"]+)"/,
                /<title>([^<]*?) : 네이버 쇼핑<\/title>/,
                /"name"\s*:\s*"([^"]+)"/
            ];

            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    data.title = match[1].trim().replace(/\\"/g, '"').replace(/\\n/g, ' ');
                    console.log(`✅ 상품명 추출: ${data.title}`);
                    break;
                }
            }

            // 가격 정보 추출
            const pricePatterns = [
                /"salePrice"\s*:\s*(\d+)/,
                /"price"\s*:\s*(\d+)/,
                /class="[^"]*price[^"]*"[^>]*>[\s\S]*?([0-9,]+)원/,
                /"productPrice"\s*:\s*(\d+)/
            ];

            for (const pattern of pricePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    data.price = parseInt(match[1].replace(/,/g, ''));
                    console.log(`💰 가격 추출: ${data.price.toLocaleString()}원`);
                    break;
                }
            }

            // 원래 가격 추출
            const originalPricePattern = /"originalPrice"\s*:\s*(\d+)/;
            const originalMatch = html.match(originalPricePattern);
            if (originalMatch) {
                data.originalPrice = parseInt(originalMatch[1]);
                if (data.price && data.originalPrice > data.price) {
                    data.discount = Math.round(((data.originalPrice - data.price) / data.originalPrice) * 100);
                }
            }

            // 브랜드/판매자 정보 추출
            const brandPatterns = [
                /"brandName"\s*:\s*"([^"]+)"/,
                /"channelName"\s*:\s*"([^"]+)"/,
                /"storeName"\s*:\s*"([^"]+)"/
            ];

            for (const pattern of brandPatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    data.brand = match[1].trim().replace(/\\"/g, '"');
                    console.log(`🏷️ 브랜드 추출: ${data.brand}`);
                    break;
                }
            }

            // 이미지 URL 추출
            const imagePattern = /"url"\s*:\s*"([^"]*(?:jpg|jpeg|png|webp)[^"]*)"/g;
            let imageMatch;
            const imageSet = new Set();
            
            while ((imageMatch = imagePattern.exec(html)) !== null) {
                const imageUrl = imageMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
                if (imageUrl.startsWith('http') && !imageSet.has(imageUrl)) {
                    imageSet.add(imageUrl);
                    data.images.push({
                        url: imageUrl,
                        type: 'product'
                    });
                }
            }

            console.log(`🖼️ 이미지 ${data.images.length}개 추출`);

        } catch (error) {
            console.log(`⚠️ HTML 파싱 중 오류: ${error.message}`);
        }

        return data;
    }

    /**
     * API 호출로 상품 정보 가져오기
     */
    async fetchProductAPI(storeId, productId) {
        console.log('🔍 API 데이터 수집 중...');
        
        try {
            // 상품 상세 정보 API 호출
            const apiUrl = `https://smartstore.naver.com/i/v1/channel/${storeId}/products/${productId}?withWindow=false`;
            
            const apiResponse = await this.session.get(apiUrl, {
                followRedirects: true,
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': `https://smartstore.naver.com/${storeId}/products/${productId}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            console.log(`📡 API 응답 상태: ${apiResponse.status}`);

            if (apiResponse.status === 200) {
                const apiText = await apiResponse.text();
                const apiData = JSON.parse(apiText);

                if (apiData && apiData.id) {
                    console.log('✅ API 데이터 파싱 성공');
                    
                    return {
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
                }
            }

        } catch (error) {
            console.log(`⚠️ API 호출 실패: ${error.message}`);
        }

        return {};
    }

    /**
     * 크롤링 결과 저장
     */
    async saveData(data, productId) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `smartstore-tls-${productId}-${timestamp}.json`;
        
        try {
            fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
            console.log(`💾 데이터 저장: ${filename}`);
            
            // 요약 정보 출력
            console.log('\n📋 수집 데이터 요약:');
            console.log(`상품명: ${data.name || data.title || 'N/A'}`);
            console.log(`가격: ${data.salePrice ? data.salePrice.toLocaleString() : (data.price ? data.price.toLocaleString() : 'N/A')}원`);
            if (data.discount || data.discountRate) {
                console.log(`할인율: ${data.discountRate || data.discount || 'N/A'}%`);
            }
            console.log(`브랜드: ${data.brand || 'N/A'}`);
            console.log(`옵션 수: ${data.options?.length || 0}개`);
            console.log(`이미지 수: ${data.images?.length || 0}개`);
            console.log(`수집 방식: ${data.method}`);
            
        } catch (error) {
            console.log(`❌ 데이터 저장 실패: ${error.message}`);
        }
    }

    /**
     * 세션 종료
     */
    async close() {
        if (this.session) {
            await this.session.close();
            console.log('🔒 TLS 세션 종료');
        }
        await destroyTLS();
        console.log('🔒 TLS 클라이언트 종료');
    }
}

/**
 * 사용 예시
 */
async function main() {
    const crawler = new NaverSmartStoreTLSCrawler({
        timeout: 30000,
        saveData: true,
        // 프록시 설정 예시
        proxy: 'http://211.45.182.138:54812'
        // proxy: 'socks5://127.0.0.1:1080'
    });

    try {
        // 예시: 바른체어 상품 크롤링
        const result = await crawler.crawlProduct('wodnr7762', '7588460081');
        
        console.log('\n🎊 크롤링 성공!');
        console.log(`상품명: ${result.name || result.title}`);
        console.log(`가격: ${result.salePrice?.toLocaleString() || result.price?.toLocaleString()}원`);
        if (result.discountRate || result.discount) {
            console.log(`할인율: ${result.discountRate || result.discount}%`);
        }
        
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

module.exports = NaverSmartStoreTLSCrawler;