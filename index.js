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
      console.log(`=== 네이버 쇼핑 상품 클릭 스크래핑 ===`);
      
      // URL에서 검색어와 상품 ID 추출
      const urlInput = keywordOrUrl;
      let searchKeyword = '';
      let productId = '';

      try {
        if (urlInput.includes('search.shopping.naver.com/catalog/')) {
          // URL 파싱
          const url = new URL(urlInput);
          
          // 상품 ID 추출 (catalog/ 다음 숫자)
          const pathMatch = url.pathname.match(/\/catalog\/(\d+)/);
          if (pathMatch) {
            productId = pathMatch[1];
          }
          
          // 검색어 추출 (query 파라미터)
          const queryParam = url.searchParams.get('query');
          if (queryParam) {
            searchKeyword = decodeURIComponent(queryParam);
          }
          
          console.log(`📄 URL 파싱 결과:`);
          console.log(`  - 검색어: "${searchKeyword}"`);
          console.log(`  - 상품 ID: "${productId}"`);
          
          if (!searchKeyword || !productId) {
            throw new Error('URL에서 검색어 또는 상품 ID를 추출할 수 없습니다');
          }
        } else {
          throw new Error('올바른 네이버 쇼핑 catalog URL을 입력해주세요');
        }
      } catch (parseError) {
        console.error('❌ URL 파싱 실패:', parseError.message);
        console.log('📖 올바른 형식: https://search.shopping.naver.com/catalog/51449387077?query=의자');
        return;
      }

      if (scraperOptions.proxy) {
        console.log(`🔗 프록시: ${scraperOptions.proxy}`);
      }

      console.log();

      const shoppingScraper = new NaverShoppingScraper({
        ...scraperOptions,
        headless: false,
        timeout: 30000,
        slowMo: 100,
        saveData: true,  // HTML 저장 활성화
      });

      try {
        console.log('🚀 네이버 쇼핑 상품 클릭 시나리오 시작...');
        
        // 추출된 검색어와 상품 ID로 시나리오 실행
        await shoppingScraper.findAndClickProduct(searchKeyword, productId);
        
        console.log(`✅ 시나리오 완료`);
      } catch (scraperError) {
        console.error('❌ 스크래핑 중 오류:', scraperError.message);
      } finally {
        // CDP 연결 해제 (브라우저는 계속 실행)
        try {
          await shoppingScraper.close();
        } catch (closeError) {
          console.error('연결 해제 중 오류:', closeError.message);
        }
      }
    } else {
      console.log(
        '❌ 지원되지 않는 모드입니다. "map", "smartstore", "navershopping"을 사용하세요.'
      );
      console.log('📖 사용법:');
      console.log('  • 지도 검색: node index.js map "키워드" [결과수]');
      console.log('  • 스마트스토어: node index.js smartstore "상품URL"');
      console.log('  • 쇼핑 상품 클릭: node index.js navershopping "카탈로그URL"');
      console.log('');
      console.log('📄 네이버 쇼핑 예시:');
      console.log('  node index.js navershopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"');
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
