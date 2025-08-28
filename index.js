import 'dotenv/config';
import NaverStoreScraper from './src/core/NaverStoreScraper.js';
import NaverSmartStoreScraper from './src/core/NaverSmartStoreScraper.js';
import NaverShoppingScraper from './src/core/NaverShoppingScraper.js';

async function main() {
  const startTime = Date.now();
  console.log(`🚀 프로그램 시작: ${new Date().toLocaleString()}`);

  // .env 파일에서 설정값 읽어오기
  const scraperOptions = {
    // 로깅 옵션
    enableLogging: process.env.ENABLE_LOGGING !== 'false', // 기본 활성화
    logRequests: process.env.LOG_REQUESTS !== 'false',
    logResponses: process.env.LOG_RESPONSES !== 'false',
    logErrors: process.env.LOG_ERRORS !== 'false',
    logDirectory: process.env.LOG_DIRECTORY || 'log',

    // 스크래핑 옵션
    maxPages: parseInt(process.env.MAX_PAGES) || 5,
    timeout: parseInt(process.env.TIMEOUT) || 30000,
    maxRedirects: parseInt(process.env.MAX_REDIRECTS) || 5,

    // 프록시 옵션
    proxy: process.env.PROXY_SERVER || null,
  };

  try {
    const mode = process.argv[2] || 'map'; // 'map' 또는 'smartstore'
    const keywordOrUrl = process.argv[3] || '치킨';
    const maxResults = parseInt(process.argv[4]) || 5;

    if (mode === 'smartstore') {
      console.log(`=== 네이버 스마트스토어 상품 정보 추출 ===`);
      console.log(`상품 URL: ${keywordOrUrl}`);
      if (scraperOptions.proxy) {
        console.log(`🔗 프록시: ${scraperOptions.proxy}`);
      }

      const smartStoreScraper = new NaverSmartStoreScraper(scraperOptions);
      await smartStoreScraper.scrapeProductsBySearch(keywordOrUrl);
    } else if (mode === 'map') {
      console.log(`=== 네이버 지도 매장 순위 추출 ===`);
      console.log(`검색 키워드: ${keywordOrUrl}`);
      console.log(`최대 결과 수: ${maxResults}`);
      if (scraperOptions.proxy) {
        console.log(`🔗 프록시: ${scraperOptions.proxy}`);
      }
      console.log();

      const scraper = new NaverStoreScraper(scraperOptions);
      const results = await scraper.searchStores(keywordOrUrl, maxResults);

      if (results.stores.length > 0) {
        const timestamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/:/g, '-');
        await scraper.saveToCsv(
          results,
          `naver_stores_${keywordOrUrl}_${timestamp}.csv`
        );
      }
    } else if (mode === 'navershopping') {
      console.log(`=== 네이버 쇼핑 고급 스크래핑 ===`);
      if (scraperOptions.proxy) {
        console.log(`🔗 프록시: ${scraperOptions.proxy}`);
      }

      // 모바일 모드 체크
      const mobile = process.argv.includes('--mobile');
      if (mobile) {
        console.log(`📱 모바일 모드 활성화`);
        scraperOptions.mobile = true;
      }

      console.log();

      const shoppingScraper = new NaverShoppingScraper(scraperOptions);
      const result = await shoppingScraper.scrapeProduct();

      console.log(`✅ 고급 스크래핑 완료:`);
      console.log(`  - HTML 길이: ${result.html.length.toLocaleString()}자`);
      console.log(`  - 저장 경로: ${result.savedPath}`);
      console.log(`  - URL: ${result.url}`);
      console.log(`  - 크롤링 통계:`);
      console.log(`    * 총 크롤링 횟수: ${result.stats.crawlCount}`);
      console.log(
        `    * 다음 세션 리셋: ${result.stats.nextSessionReset}번 후`
      );
      console.log(`    * TLS 버전: ${result.stats.tlsSupport}`);
    } else {
      console.log(
        '❌ 지원되지 않는 모드입니다. "map", "smartstore", "navershopping"을 사용하세요.'
      );
      console.log(
        '📖 사용법: node index.js [map|smartstore|navershopping] [keyword|url] [maxResults]'
      );
      console.log(
        '📱 모바일 모드: node index.js navershopping "검색어" --mobile'
      );
    }
  } catch (error) {
    console.error('프로그램 실행 중 오류 발생:', error.message);
  } finally {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(`\n⏱️  총 실행시간: ${(executionTime / 1000).toFixed(2)}초`);
    console.log(`🏁 프로그램 종료: ${new Date().toLocaleString()}`);
  }
}

// ES 모듈에서 직접 실행 확인
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 스크립트가 직접 실행되었는지 확인
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
