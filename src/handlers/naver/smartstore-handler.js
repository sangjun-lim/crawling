import NaverSmartStoreScraper from '../../scrapers/naver/naver-smart-store-scraper.js';
import { logProxy } from '../common/cli-logger.js';

export async function runSmartstoreMode(args, config) {
  const [url] = args;
  
  console.log(`=== 네이버 스마트스토어 상품 정보 추출 ===`);
  console.log(`상품 URL: ${url}`);
  
  logProxy(config.scraperOptions.proxy);
  console.log();

  const smartStoreScraper = new NaverSmartStoreScraper(config.scraperOptions);
  await smartStoreScraper.scrapeProductsBySearch(url);
}