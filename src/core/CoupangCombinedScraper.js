import HttpClient from './HttpClient.js';
import LogUtils from '../utils/LogUtils.js';

class CoupangCombinedScraper {
  constructor(options = {}) {
    this.httpClient = new HttpClient({
      timeout: 30000,
      enableCookies: true,
      ...options,
    });
    this.logUtils = new LogUtils(options);

    // Rate limiting: 벤더당 2번 요청이므로 200ms 간격 (300 requests per minute)
    this.rateLimitDelay = 200; // milliseconds
    this.lastRequestTime = 0;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  async getVendorInfo(storeId = 0, vendorId, urlName = '') {
    try {
      await this.waitForRateLimit();

      let url = `https://shop.coupang.com/api/v1/store/getStoreReview?storeId=${storeId}&vendorId=${vendorId}`;
      if (urlName) {
        url += `&urlName=${urlName}`;
      }

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        Referer: 'https://shop.coupang.com/',
        Origin: 'https://shop.coupang.com',
      };

      const response = await this.httpClient.get(url, {}, headers);

      return {
        success: true,
        storeId,
        vendorId,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logUtils.logError(error, `combined_vendor_error_${vendorId}`);

      return {
        success: false,
        storeId,
        vendorId,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getProductList(params) {
    try {
      await this.waitForRateLimit();

      const url = 'https://shop.coupang.com/api/v1/listing';

      const defaultParams = {
        storeId: params.storeId || 0,
        brandId: params.brandId || 0,
        vendorId: params.vendorId,
        sourceProductId: params.sourceProductId || 0,
        sourceVendorItemId: params.sourceVendorItemId || 0,
        source: params.source || 'brandstore_sdp_atf',
        enableAdultItemDisplay: params.enableAdultItemDisplay !== false,
        nextPageKey: params.nextPageKey || 0,
        filter: params.filter || 'SORT_KEY:',
      };

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        Referer: 'https://shop.coupang.com/',
        Origin: 'https://shop.coupang.com',
      };

      const response = await this.httpClient.post(url, defaultParams, headers);

      return {
        success: true,
        vendorId: params.vendorId,
        storeId: defaultParams.storeId,
        data: response.data,
        timestamp: new Date().toISOString(),
        requestParams: defaultParams,
      };
    } catch (error) {
      this.logUtils.logError(
        error,
        `combined_product_error_${params.vendorId}`
      );

      return {
        success: false,
        vendorId: params.vendorId,
        storeId: params.storeId,
        error: error.message,
        timestamp: new Date().toISOString(),
        requestParams: params,
      };
    }
  }

  async getAllProducts(vendorId, storeId = 0, maxProducts = 10000000) {
    const allProducts = [];
    let nextPageKey = 0;
    let currentPage = 1;

    console.log(`${vendorId} 상품 수집 시작 (최대 ${maxProducts}개)`);

    while (allProducts.length < maxProducts) {
      console.log(
        `페이지 ${currentPage} 수집 중... (nextPageKey: ${nextPageKey})`
      );

      const result = await this.getProductList({
        vendorId,
        storeId,
        nextPageKey,
      });

      if (!result.success) {
        console.log(`❌ 페이지 ${currentPage} 수집 실패: ${result.error}`);
        break;
      }

      const products = result.data?.data?.products || [];
      if (products.length === 0) {
        console.log(`페이지 ${currentPage}에서 상품이 없음. 수집 종료.`);
        break;
      }

      // 필요한 만큼만 추가하고 수집시간 추가
      const remainingNeeded = maxProducts - allProducts.length;
      const productsToAdd = products
        .slice(0, remainingNeeded)
        .map((product) => ({
          ...product,
          collectedAt: new Date().toISOString(),
        }));

      allProducts.push(...productsToAdd);
      console.log(
        `페이지 ${currentPage}: ${productsToAdd.length}개 상품 수집 (총 ${allProducts.length}개)`
      );

      // 목표 개수에 도달하면 종료
      if (allProducts.length >= maxProducts) {
        console.log(`목표 상품 수 ${maxProducts}개 달성. 수집 종료.`);
        break;
      }

      // 다음 페이지는 nextPageKey를 1씩 증가
      nextPageKey++;
      currentPage++;
    }

    return allProducts;
  }

  async collectCombinedData(vendorIds, storeId = 0, maxProductsPerVendor = 5) {
    const results = [];

    console.log(`쿠팡 통합 데이터 수집 시작: ${vendorIds.length}개 벤더`);
    
    // 프록시 통계 초기화 로깅
    if (this.httpClient.proxies.length > 0) {
      console.log(`📡 프록시 ${this.httpClient.proxies.length}개 사용 중`);
    }

    for (const vendorId of vendorIds) {
      console.log(`\n=== 처리 중: vendorId ${vendorId} ===`);

      // 1. 벤더 정보 수집
      const vendorResult = await this.getVendorInfo(storeId, vendorId);

      if (!vendorResult.success) {
        console.log(`❌ 벤더 정보 실패: ${vendorId} - ${vendorResult.error}`);
        continue;
      }

      // 벤더 데이터 유효성 검사 (null name이나 빈 vendorId 제외)
      const vendorData = vendorResult.data;
      if (
        !vendorData ||
        vendorData.name === null ||
        !vendorData.vendorId ||
        vendorData.vendorId.trim() === ''
      ) {
        console.log(`❌ 벤더 데이터 유효하지 않음: ${vendorId}`);
        continue;
      }

      console.log(`✅ 벤더 정보 성공: ${vendorId} - ${vendorData.name}`);

      // 2. 상품 정보 수집
      const products = await this.getAllProducts(
        vendorId,
        storeId,
        maxProductsPerVendor
      );

      if (products.length === 0) {
        console.log(`⚠️  상품 없음: ${vendorId} - 벤더 정보만 저장`);
        // 상품이 없어도 벤더 정보는 저장 (상품 컬럼은 빈값)
        results.push({
          ...vendorData,
          vendorId,
          storeId: vendorResult.storeId,
          수집시간: vendorResult.timestamp,
          상품명: '',
          상품링크: '',
          상품ID: '',
          상품수집시간: '',
        });
      } else {
        console.log(`✅ 상품 수집 성공: ${vendorId} - ${products.length}개`);

        // 3. 벤더 정보와 상품 정보 결합 (상품 개수만큼 벤더 정보 중복)
        products.forEach((product) => {
          results.push({
            ...vendorData, // 벤더 정보 전체
            vendorId,
            storeId: vendorResult.storeId,
            수집시간: vendorResult.timestamp,
            상품명: product.imageAndTitleArea?.title || '',
            상품링크: product.link || '',
            상품ID: product.productId || '',
            상품수집시간: product.collectedAt || '',
          });
        });
      }
    }

    console.log(`\n통합 데이터 수집 완료: 총 ${results.length}행`);
    
    // 프록시 통계 출력
    if (this.httpClient.proxies.length > 0) {
      this.httpClient.logProxyStats();
    }
    
    return results;
  }

  async collectCombinedByRange(
    startVendorId = 1,
    endVendorId = 100,
    storeId = 0,
    maxProductsPerVendor = 5
  ) {
    const vendorIds = [];

    for (
      let vendorIdNum = startVendorId;
      vendorIdNum <= endVendorId;
      vendorIdNum++
    ) {
      const vendorId = `A${String(vendorIdNum).padStart(8, '0')}`;
      vendorIds.push(vendorId);
    }

    return await this.collectCombinedData(
      vendorIds,
      storeId,
      maxProductsPerVendor
    );
  }
}

export default CoupangCombinedScraper;
