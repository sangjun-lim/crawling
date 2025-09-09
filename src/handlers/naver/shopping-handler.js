import NaverShoppingRealBrowserScraper from '../../scrapers/naver/naver-shopping-real-browser-scraper.js';
import { parseNaverShoppingUrl } from '../common/url-parsers.js';
import { logProxy, logError, logSuccess } from '../common/cli-logger.js';

export async function runShoppingMode(args, config) {
  const [urlInput] = args;
  
  console.log(`=== 네이버 쇼핑 상품 클릭 스크래핑 ===`);
  
  if (!urlInput) {
    console.error('❌ 네이버 쇼핑 URL이 필요합니다');
    console.log('📖 사용법: node index.js naver shopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"');
    return;
  }

  let shoppingScraper;

  try {
    // URL 파싱 (기존 인라인 로직을 분리)
    const { productId, searchKeyword } = parseNaverShoppingUrl(urlInput);
    
    logProxy(config.scraperOptions.proxy);
    console.log();

    shoppingScraper = new NaverShoppingRealBrowserScraper({
      ...config.scraperOptions,
      headless: false,
      timeout: 30000,
      slowMo: 100,
    });

    console.log('🚀 네이버 쇼핑 상품 클릭 시나리오 시작...');
    await shoppingScraper.scrapeProductPriceComparison(searchKeyword, productId);
    logSuccess('시나리오 완료');

  } catch (error) {
    logError('스크래핑 중 오류', error);
  } finally {
    // CDP 연결 해제 (브라우저는 계속 실행)
    if (shoppingScraper) {
      try {
        await shoppingScraper.close();
      } catch (closeError) {
        logError('연결 해제 중 오류', closeError);
      }
    }
  }
}