import NaverMapScraper from '../../scrapers/naver/naver-map-scraper.js';
import { logProxy } from '../common/cli-logger.js';

export async function runMapMode(args, config) {
  const [keyword = '치킨'] = args;
  
  console.log(`=== 네이버 지도 매장 순위 추출 ===`);
  console.log(`검색 키워드: ${keyword}`);
  
  logProxy(config.scraperOptions.proxy);
  console.log();

  const scraper = new NaverMapScraper(config.scraperOptions);
  const results = await scraper.searchStores(keyword);

  if (results.stores.length > 0) {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, '-');
    await scraper.saveToCsv(
      results,
      `naver_stores_${keyword}_${timestamp}.csv`
    );
  }
}