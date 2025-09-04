import HttpClient from './HttpClient.js';
import LogUtils from '../utils/LogUtils.js';

class CoupangVendorScraper {
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

  async getVendorInfo(storeId = '', vendorId, urlName = '') {
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

      // 응답 헤더 로그 출력
      console.log(
        `[RESPONSE HEADERS] ${vendorId}:`,
        JSON.stringify(response.headers, null, 2)
      );

      return {
        success: true,
        storeId,
        vendorId,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logUtils.logError(error, `vendor_scraping_error_${vendorId}`);

      return {
        success: false,
        storeId,
        vendorId,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async collectVendorData(startVendorId = 1, endVendorId = 100, storeId = 0) {
    const results = [];

    console.log(`쿠팡 벤더 정보 수집 시작: ${startVendorId} ~ ${endVendorId}`);

    for (
      let vendorIdNum = startVendorId;
      vendorIdNum <= endVendorId;
      vendorIdNum++
    ) {
      const vendorId = `A${String(vendorIdNum).padStart(8, '0')}`;

      console.log(
        `처리 중: vendorId ${vendorId} (${vendorIdNum}/${endVendorId})`
      );

      const result = await this.getVendorInfo(storeId, vendorId);
      results.push(result);

      if (result.success) {
        console.log(`✅ 성공: ${vendorId} - ${result.data?.name || 'Unknown'}`);
      } else {
        console.log(`❌ 실패: ${vendorId} - ${result.error}`);
      }
    }

    return results;
  }

  async collectVendorDataByIds(vendorIds, storeId = 0) {
    const results = [];

    console.log(`지정된 벤더 ID 수집 시작: ${vendorIds.length}개`);

    for (const vendorId of vendorIds) {
      console.log(`처리 중: vendorId ${vendorId}`);

      const result = await this.getVendorInfo(storeId, vendorId);
      results.push(result);

      if (result.success) {
        console.log(`✅ 성공: ${vendorId} - ${result.data?.name || 'Unknown'}`);
      } else {
        console.log(`❌ 실패: ${vendorId} - ${result.error}`);
      }
    }

    return results;
  }
}

export default CoupangVendorScraper;
