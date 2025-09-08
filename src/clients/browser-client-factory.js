class BrowserClientFactory {
  /**
   * 브라우저 클라이언트 팩토리
   * 스크래퍼별 요구사항에 맞는 브라우저 도구를 선택
   */
  static createClient(type, options = {}) {
    switch (type) {
      case 'puppeteer-real':
        return this.createPuppeteerRealClient(options);
      case 'puppeteer':
        return this.createPuppeteerClient(options);
      case 'playwright':
        return this.createPlaywrightClient(options);
      default:
        throw new Error(`Unsupported browser client type: ${type}`);
    }
  }

  static createPuppeteerRealClient(options = {}) {
    const PuppeteerRealBrowserClient = require('./puppeteerRealBrowserClient.js');
    return new PuppeteerRealBrowserClient({
      antiDetection: true,
      geminiIntegration: true,
      networkMonitoring: true,
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      viewport: { width: 1920, height: 1080 },
      ...options
    });
  }

  static createPuppeteerClient(options = {}) {
    const PuppeteerClient = require('./puppeteerClient.js');
    return new PuppeteerClient({
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      viewport: { width: 1920, height: 1080 },
      ...options
    });
  }

  static createPlaywrightClient(options = {}) {
    const PlaywrightClient = require('./playwrightClient.js');
    return new PlaywrightClient({
      browser: 'chromium',
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      viewport: { width: 1920, height: 1080 },
      interceptRequests: true,
      ...options
    });
  }

  /**
   * 스크래퍼별 권장 브라우저 타입 반환
   */
  static getRecommendedType(scraperName) {
    const recommendations = {
      'naverShopping': 'puppeteer-real', // Gemini AI 캡차 해결
      'naverSmartStore': 'playwright',   // API 응답 인터셉션
      'coupang': null,                   // HTTP-only
      'default': 'playwright'
    };
    
    return recommendations[scraperName] || recommendations.default;
  }
}

export default BrowserClientFactory;