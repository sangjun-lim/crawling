import 'dotenv/config';
import NaverStoreScraper from './src/core/NaverStoreScraper.js';
import NaverSmartStoreScraper from './src/core/NaverSmartStoreScraper.js';

async function main() {
  const startTime = Date.now();
  console.log(`🚀 프로그램 시작: ${new Date().toLocaleString()}`);
  
  // .env 파일에서 설정값 읽어오기
  const loggingOptions = {
    enableLogging: process.env.ENABLE_LOGGING !== 'false', // 기본 활성화
    logRequests: process.env.LOG_REQUESTS !== 'false',
    logResponses: process.env.LOG_RESPONSES !== 'false', 
    logErrors: process.env.LOG_ERRORS !== 'false',
    logDirectory: process.env.LOG_DIRECTORY || 'log',
    // 스크래핑 옵션도 .env에서 가져오기
    maxPages: parseInt(process.env.MAX_PAGES) || 5,
    timeout: parseInt(process.env.TIMEOUT) || 30000,
    maxRedirects: parseInt(process.env.MAX_REDIRECTS) || 5
  };

  try {
    const keyword = process.argv[2] || '치킨';
    const maxResults = parseInt(process.argv[3]) || 5;
    const mode = process.argv[4] || 'map'; // 'map' 또는 'smartstore'
    
    if (mode === 'smartstore') {
      console.log(`=== 네이버 스마트스토어 상품 정보 추출 ===`);
      console.log(`상품 URL: ${keyword}`);
      
      const smartStoreScraper = new NaverSmartStoreScraper(loggingOptions);
      // await smartStoreScraper.scrapeProducts(keyword, maxResults);
      await smartStoreScraper.scrapeProductsBySearch(keyword);
      
    } else {
      console.log(`=== 네이버 지도 매장 순위 추출 ===`);
      console.log(`검색 키워드: ${keyword}\n`);
      
      const scraper = new NaverStoreScraper(loggingOptions);
      const results = await scraper.searchStores(keyword, maxResults);
      
      if (results.stores.length > 0) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        await scraper.saveToCsv(results, `naver_stores_${keyword}_${timestamp}.csv`);
      }
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