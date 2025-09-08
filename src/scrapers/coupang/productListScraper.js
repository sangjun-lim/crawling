import HttpClient from '../../clients/httpClient.js';
import LogUtils from '../../services/loggerService.js';

class CoupangProductListScraper {
  constructor(options = {}) {
    this.httpClient = new HttpClient({
      timeout: 30000,
      enableCookies: true,
      ...options,
    });
    this.logUtils = new LogUtils(options);

    // Rate limiting: 600 requests per minute = 100ms interval
    this.rateLimitDelay = 100; // milliseconds
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
        `product_list_scraping_error_${params.vendorId}`
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

  async getAllProducts(vendorId, storeId = 0, maxProducts = 5) {
    const allProducts = [];
    let nextPageKey = 0;
    let currentPage = 1;

    console.log(
      `${vendorId} 상품 수집 시작 (최대 ${maxProducts}개)`
    );

    while (allProducts.length < maxProducts) {
      console.log(`페이지 ${currentPage} 수집 중... (nextPageKey: ${nextPageKey})`);

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
      const productsToAdd = products.slice(0, remainingNeeded).map(product => ({
        ...product,
        collectedAt: new Date().toISOString()
      }));
      
      allProducts.push(...productsToAdd);
      console.log(`페이지 ${currentPage}: ${productsToAdd.length}개 상품 수집 (총 ${allProducts.length}개)`);

      // 목표 개수에 도달하면 종료
      if (allProducts.length >= maxProducts) {
        console.log(`목표 상품 수 ${maxProducts}개 달성. 수집 종료.`);
        break;
      }

      // 다음 페이지는 nextPageKey를 1씩 증가
      nextPageKey++;
      currentPage++;
    }

    return {
      vendorId,
      storeId,
      totalProducts: allProducts.length,
      products: allProducts,
      pagesCollected: currentPage - 1,
    };
  }

  async collectProductsByVendorRange(
    startVendorId = 1,
    endVendorId = 100,
    storeId = 0,
    maxProductsPerVendor = 5
  ) {
    const results = [];

    console.log(
      `쿠팡 상품 리스트 수집 시작: ${startVendorId} ~ ${endVendorId}`
    );

    for (
      let vendorIdNum = startVendorId;
      vendorIdNum <= endVendorId;
      vendorIdNum++
    ) {
      const vendorId = `A${String(vendorIdNum).padStart(8, '0')}`;

      console.log(
        `\n=== 처리 중: vendorId ${vendorId} (${vendorIdNum}/${endVendorId}) ===`
      );

      const result = await this.getAllProducts(
        vendorId,
        storeId,
        maxProductsPerVendor
      );

      if (result.totalProducts > 0) {
        console.log(
          `✅ 성공: ${vendorId} - ${result.totalProducts}개 상품 (${result.pagesCollected}페이지)`
        );
      } else {
        console.log(`❌ 데이터 없음: ${vendorId}`);
      }

      results.push(result);
    }

    return results;
  }

  async collectProductsByVendorIds(
    vendorIds,
    storeId = 0,
    maxProductsPerVendor = 5
  ) {
    const results = [];

    console.log(`지정된 벤더 ID 상품 수집 시작: ${vendorIds.length}개`);

    for (const vendorId of vendorIds) {
      console.log(`\n=== 처리 중: vendorId ${vendorId} ===`);

      const result = await this.getAllProducts(
        vendorId,
        storeId,
        maxProductsPerVendor
      );

      if (result.totalProducts > 0) {
        console.log(
          `✅ 성공: ${vendorId} - ${result.totalProducts}개 상품 (${result.pagesCollected}페이지)`
        );
      } else {
        console.log(`❌ 데이터 없음: ${vendorId}`);
      }

      results.push(result);
    }

    return results;
  }
}

export default CoupangProductListScraper;
