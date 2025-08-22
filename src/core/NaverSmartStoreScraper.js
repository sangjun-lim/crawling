import HttpClient from './HttpClient.js';
import LogUtils from '../utils/LogUtils.js';
import FileUtils from '../utils/FileUtils.js';

class NaverSmartStoreScraper {
  constructor(options = {}) {
    this.options = {
      ...options,
      enableCookies: true, // 스마트스토어 스크래핑은 쿠키 필수
      timeout: 30000
    };
    
    this.logUtils = new LogUtils(this.options);
    this.httpClient = new CurlHttpClient(this.options);
    this.lastSearchUrl = null;
  }

  // HttpClient 방식으로 네이버 쇼핑 검색
  async searchNaverShopping(keyword) {
    try {
      console.log(`HttpClient 방식으로 네이버 검색: ${keyword}`);
      
      // 1단계: 네이버 메인 페이지 방문 (쿠키 획득)
      await this.httpClient.get('https://www.naver.com');
      console.log('네이버 메인 페이지 방문 완료');
      
      // 2단계: 네이버 통합검색 (실제 브라우저 헤더 사용)
      const searchUrl = `https://search.naver.com/search.naver`;
      const searchParams = {
        where: 'nexearch',
        sm: 'top_hty',
        fbm: '0',
        ie: 'utf8',
        query: keyword,
        ackey: '779nr34o'
      };
      
      const response = await this.httpClient.get(searchUrl, searchParams, {
        'Host': 'search.naver.com',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
        'Referer': 'https://www.naver.com/',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      });

      // 검색 결과 URL 저장 (referer로 사용)
      this.lastSearchUrl = response.request.res.responseUrl || `${searchUrl}?${new URLSearchParams(searchParams).toString()}`;
      
      return this.extractSmartStoreLinks(response.data);
    } catch (error) {
      console.error('HttpClient 검색 실패:', error.message);
      return [];
    }
  }

  extractSmartStoreLinks(html) {
    const links = [];
    
    try {
      console.log(`HTML 길이: ${html.length} 문자`);
      
      // "네이버 가격비교</h2>"와 "네이버 가격비교 더보기" 사이 섹션 찾기
      let priceCompare = html.split('네이버 가격비교<\/h2>')[1]?.split('배송지 설정')[1]?.split('네이버 가격비교 더보기')[0];
      
      if (!priceCompare) {
        console.log('네이버 가격비교 섹션을 찾을 수 없습니다.');
        return [];
      }

      if(!priceCompare.includes('<img')) {
        console.log('네이버 가격비교 섹션에서 이미지를 찾을 수 없습니다.');
        return [];
      }

      priceCompare.split('<img').slice(1).forEach((item) => {
        try {
          const link = item.split('<a href="')[1]?.split('"')[0];
          if (link) {
            links.push(link);
          }
        } catch (e) {
          // 개별 링크 추출 실패는 무시
        }
      });

      console.log(`총 ${links.length}개 상품 링크 추출 완료`);
      console.log(links);
      return links;
      
    } catch (error) {
      console.error('링크 추출 실패:', error.message);
      return [];
    }
  }

  async scrapeProductInfo(productUrl, capturedHeaders = null) {
    try {
      console.log(`상품 정보 수집: ${productUrl}`);
      
      // URL에서 스토어 ID와 상품 ID 추출
      const linkUrl = new URL(productUrl);
      const pathParts = linkUrl.pathname.split('/');
      const storeId = pathParts[1]; // /storeId/products/productId 형태에서 storeId 추출
      const productId = pathParts[3]; // productId 추출
      const storeUrl = `https://smartstore.naver.com/${storeId}`;
      
      console.log(`먼저 스토어 페이지 방문하여 channelUid 추출: ${storeUrl}`);
      
      // 1단계: 네이버 메인 페이지 먼저 방문
      await this.httpClient.get('https://www.naver.com');
      console.log('네이버 메인 페이지 방문 완료');
      
      await this.delay(500);
      
      // 2단계: 스토어 메인 페이지 방문하여 channelUid 추출
      let headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': 'https://www.naver.com/'
      };
      
      const storeResponse = await this.httpClient.get(storeUrl, {}, headers);
      console.log('스토어 페이지 방문 완료');
      
      // channelUid 추출
      const channelUidMatch = storeResponse.data.match(/"channelUid":"([^"]+)"/);
      if (!channelUidMatch) {
        throw new Error('channelUid를 찾을 수 없습니다');
      }
      
      const channelUid = channelUidMatch[1];
      console.log(`channelUid 추출 완료: ${channelUid}`);
      
      await this.delay(1000);
      
      // 3단계: API 엔드포인트로 상품 정보 요청
      const apiUrl = `https://smartstore.naver.com/i/v2/channels/${channelUid}/products/${productId}?withWindow=false`;
      console.log(`API 요청: ${apiUrl}`);
      
      headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': storeUrl
      };
      
      const apiResponse = await this.httpClient.get(apiUrl, {}, headers);

      if (apiResponse.status !== 200) {
        throw new Error(`HTTP ${apiResponse.status}: ${apiResponse.statusText}`);
      }

      return this.parseApiProductData(JSON.parse(apiResponse.data), productUrl);
      
    } catch (error) {
      console.error(`상품 정보 수집 실패 (${productUrl}):`, error.message);
      return null;
    }
  }

  parseProductData(html, url) {
    try {
      const product = {
        url: url,
        title: '',
        price: '',
        originalPrice: '',
        discountRate: '',
        seller: '',
        images: [],
        rating: '',
        reviewCount: '',
        deliveryInfo: '',
        extractedAt: new Date().toISOString()
      };

      // 상품명 추출
      const titlePatterns = [
        /<meta property="og:title" content="([^"]+)"/,
        /<title>([^<]+)<\/title>/,
        /"productName"\s*:\s*"([^"]+)"/
      ];
      
      for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match) {
          product.title = match[1].trim();
          break;
        }
      }

      // 가격 정보 추출
      const pricePatterns = [
        /"salePrice"\s*:\s*(\d+)/,
        /"price"\s*:\s*(\d+)/,
        /data-price="(\d+)"/,
        /판매가[^0-9]*(\d+(?:,\d{3})*)/
      ];
      
      for (const pattern of pricePatterns) {
        const match = html.match(pattern);
        if (match) {
          product.price = this.formatPrice(match[1]);
          break;
        }
      }

      // 판매자 정보 추출
      const sellerPatterns = [
        /"sellerName"\s*:\s*"([^"]+)"/,
        /"storeName"\s*:\s*"([^"]+)"/,
        /판매자[^>]*>([^<]+)</
      ];
      
      for (const pattern of sellerPatterns) {
        const match = html.match(pattern);
        if (match) {
          product.seller = match[1].trim();
          break;
        }
      }

      // 이미지 URL 추출
      const imagePattern = /"imageUrl"\s*:\s*"([^"]+)"/g;
      let imageMatch;
      while ((imageMatch = imagePattern.exec(html)) !== null) {
        product.images.push(imageMatch[1]);
      }

      console.log(`상품 정보 추출 완료: ${product.title}`);
      return product;
      
    } catch (error) {
      console.error('상품 데이터 파싱 실패:', error.message);
      return null;
    }
  }

  formatPrice(priceStr) {
    const price = priceStr.replace(/,/g, '');
    return parseInt(price).toLocaleString() + '원';
  }

  async scrapeProducts(productUrl, maxResults = 5) {
    try {
      console.log(`네이버 스마트스토어 상품 수집 시작: ${productUrl}`);
      
      // URL 유효성 검사
      if (!productUrl || !productUrl.includes('smartstore.naver.com')) {
        throw new Error('유효한 스마트스토어 URL이 아닙니다');
      }
      
      // 상품 정보 수집
      const products = [];
      
      console.log(`[1/1] HttpClient로 상품 수집 중: ${productUrl}`);
      const productInfo = await this.scrapeProductInfo(productUrl);
      if (productInfo) {
        products.push(productInfo);
      }

      // 결과 저장
      if (products.length > 0) {
        const urlParts = productUrl.split('/');
        const productId = urlParts[urlParts.length - 1] || 'unknown';
        await this.saveResults(products, productId);
      }

      console.log(`수집 완료: 총 ${products.length}개 상품`);
      return products;
      
    } catch (error) {
      console.error('스크래핑 실패:', error.message);
      return [];
    }
  }

  async saveResults(products, keyword) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `smartstore_${keyword}_${timestamp}.csv`;
      
      const csvHeaders = [
        '상품명', '가격', '판매자', '상품URL', '이미지URL', '수집시간'
      ];
      
      const csvData = products.map(product => [
        product.title,
        product.price,
        product.seller,
        product.url,
        product.images[0] || '',
        product.extractedAt
      ]);
      
      await FileUtils.saveToCsv({stores: csvData}, filename);
      console.log(`결과 저장 완료: result/${filename}`);
      
    } catch (error) {
      console.error('결과 저장 실패:', error.message);
    }
  }

  parseApiProductData(apiData, url) {
    try {
      const product = {
        url: url,
        title: '',
        price: '',
        originalPrice: '',
        discountRate: '',
        seller: '',
        images: [],
        rating: '',
        reviewCount: '',
        deliveryInfo: '',
        extractedAt: new Date().toISOString()
      };

      // API 응답에서 상품 정보 추출
      if (apiData && apiData.product) {
        const productData = apiData.product;
        
        // 상품명
        product.title = productData.name || '';
        
        // 가격 정보
        if (productData.salePrice) {
          product.price = this.formatPrice(productData.salePrice.toString());
        }
        
        if (productData.originalPrice) {
          product.originalPrice = this.formatPrice(productData.originalPrice.toString());
        }
        
        // 할인율
        if (productData.discountRate) {
          product.discountRate = productData.discountRate + '%';
        }
        
        // 판매자 정보
        if (apiData.channel) {
          product.seller = apiData.channel.name || '';
        }
        
        // 이미지 정보
        if (productData.images && productData.images.length > 0) {
          product.images = productData.images.map(img => img.url || img);
        }
        
        // 리뷰 정보
        if (productData.reviewCount) {
          product.reviewCount = productData.reviewCount.toString();
        }
        
        if (productData.rating) {
          product.rating = productData.rating.toString();
        }
      }

      console.log(`API 상품 정보 추출 완료: ${product.title}`);
      return product;
      
    } catch (error) {
      console.error('API 상품 데이터 파싱 실패:', error.message);
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default NaverSmartStoreScraper;