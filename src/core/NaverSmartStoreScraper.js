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
    this.httpClient = new HttpClient(this.options);
  }


  async searchNaverShopping(keyword) {
    try {
      console.log(`네이버 검색: ${keyword}`);
      
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
      console.error('네이버 검색 실패:', error.message);
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

  async scrapeProductInfo(productUrl) {
    try {
      console.log(`상품 정보 수집: ${productUrl}`);
      
      // 네이버 쇼핑을 통해 먼저 방문 (세션 유지)
      const refererUrl = 'https://search.shopping.naver.com/search/all';
      
      const response = await this.httpClient.get(productUrl, {}, {
        'Referer': refererUrl,
        'sec-fetch-site': 'same-origin'
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return this.parseProductData(response.data, productUrl);
      
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

  async scrapeProducts(keyword, maxResults = 5) {
    try {
      console.log(`네이버 스마트스토어 상품 수집 시작: ${keyword}`);
      
      // 1단계: 상품 링크 검색
      const productLinks = await this.searchNaverShopping(keyword);
      
      if (productLinks.length === 0) {
        console.log('상품 링크를 찾을 수 없습니다.');
        return [];
      }

      // 2단계: 첫 번째 상품 정보만 수집
      const products = [];
      
      if (productLinks.length > 0) {
        const firstLink = productLinks[0];
        console.log(`[1/1] 첫 번째 상품 수집 중...`);
        
        // URL에서 호스트 추출
        const linkUrl = new URL(firstLink);
        
        const productInfo = await this.httpClient.get(firstLink, {}, {
          'Host': linkUrl.host,
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Sec-Fetch-Site': 'same-site',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'Referer': this.lastSearchUrl || 'https://search.naver.com/',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'ko-KR,ko;q=0.9'
          // 쿠키는 HttpClient가 자동으로 관리
        });
        
        if (productInfo && productInfo.status === 200) {
          const parsedProduct = this.parseProductData(productInfo.data, firstLink);
          if (parsedProduct) {
            products.push(parsedProduct);
          }
        }
      }

      // 3단계: 결과 저장
      if (products.length > 0) {
        await this.saveResults(products, keyword);
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default NaverSmartStoreScraper;