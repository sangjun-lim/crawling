// 환경별 .env 파일 로딩
import dotenv from 'dotenv';
import NaverStoreScraper from './src/scrapers/naver/naver-store-scraper.js';
import NaverSmartStoreScraper from './src/scrapers/naver/naver-smart-store-scraper.js';
import CoupangVendorScraper from './src/scrapers/coupang/vendor-scraper.js';
import CoupangProductListScraper from './src/scrapers/coupang/product-list-scraper.js';
import CoupangCombinedScraper from './src/scrapers/coupang/combined-scraper.js';
import CoupangStorageService from './src/services/coupang-storage-service.js';

const env = process.env.NODE_ENV || 'development';

// 환경별 파일 로딩 (우선순위: 환경별 → 로컬 → 기본)
dotenv.config({ path: `.env.${env}` });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

console.log(`🔧 실행 환경: ${env}`);

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

    // gemini
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  };

  try {
    const mode = process.argv[2] || 'map'; // 'map', 'smartstore', 'navershopping', 'coupang'
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
        console.log(
          '📖 올바른 형식: https://search.shopping.naver.com/catalog/51449387077?query=의자'
        );
        return;
      }

      if (scraperOptions.proxy) {
        console.log(`🔗 프록시: ${scraperOptions.proxy}`);
      }

      console.log();

      const shoppingScraper = new NaverShoppingRealBrowserScraper({
        ...scraperOptions,
        headless: false,
        timeout: 30000,
        slowMo: 100,
      });

      try {
        console.log('🚀 네이버 쇼핑 상품 클릭 시나리오 시작...');

        // 추출된 검색어와 상품 ID로 시나리오 실행
        await shoppingScraper.scrapeProductPriceComparison(
          searchKeyword,
          productId
        );

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
    } else if (mode === 'coupang') {
      console.log(`=== 쿠팡 데이터 수집 ===`);

      // 쿠팡 요청/응답 로그 끄기
      scraperOptions.enableLogging = false;

      // 사용법: node index.js coupang vendor 39646-39650
      // 사용법: node index.js coupang product 39646,39649 5
      // 사용법: node index.js coupang combined 39646-39649 3
      // 사용법: node index.js coupang combined-safe 1-2000000 3
      // 사용법: node index.js coupang resume session_id
      // 사용법: node index.js coupang complete session_id
      const subMode = process.argv[3] || 'vendor'; // 'vendor', 'product', 'combined', 'combined-safe', 'resume', 'complete'
      const range = process.argv[4] || '0-0'; // 범위 또는 ID 목록
      const maxPages = parseInt(process.argv[5]) || 5; // 상품용 페이지 수
      const storeId = 0; // 항상 0으로 고정

      const storage = new CoupangStorageService({ storageType: 'csv' });

      if (subMode === 'vendor') {
        console.log(`벤더 정보 수집 모드`);
        console.log(`범위/ID: ${range}`);
        console.log(`스토어 ID: ${storeId}`);

        const vendorScraper = new CoupangVendorScraper(scraperOptions);
        let results;

        if (range.includes('-')) {
          // 범위로 수집
          const [start, end] = range.split('-').map(Number);
          results = await vendorScraper.collectVendorData(start, end, storeId);
        } else if (range.includes(',')) {
          // 특정 ID들로 수집
          const vendorIds = range
            .split(',')
            .map((id) => `A${String(id.trim()).padStart(8, '0')}`);
          results = await vendorScraper.collectVendorDataByIds(
            vendorIds,
            storeId
          );
        } else {
          // 단일 ID
          const vendorId = `A${String(range).padStart(8, '0')}`;
          const result = await vendorScraper.getVendorInfo(storeId, vendorId);
          results = [result];
        }

        await storage.save(
          results,
          'vendor',
          `coupang_vendors_${range}_${Date.now()}`
        );
      } else if (subMode === 'product') {
        console.log(`상품 리스트 수집 모드`);
        console.log(`범위/ID: ${range}`);
        console.log(`스토어 ID: ${storeId}`);

        const productScraper = new CoupangProductListScraper(scraperOptions);
        let results;

        if (range.includes('-')) {
          // 범위로 수집
          const [start, end] = range.split('-').map(Number);
          results = await productScraper.collectProductsByVendorRange(
            start,
            end,
            storeId,
            maxPages
          );
        } else if (range.includes(',')) {
          // 특정 ID들로 수집
          const vendorIds = range.split(',').map((id) => {
            let vendorId = String(id.trim());
            if (!vendorId.startsWith('A')) {
              vendorId = `A${vendorId.padStart(8, '0')}`;
            }
            return vendorId;
          });
          results = await productScraper.collectProductsByVendorIds(
            vendorIds,
            storeId,
            maxPages
          );
        } else {
          // 단일 ID
          let vendorId = String(range);
          if (!vendorId.startsWith('A')) {
            vendorId = `A${vendorId.padStart(8, '0')}`;
          }
          const result = await productScraper.getAllProducts(
            vendorId,
            storeId,
            maxPages
          );
          results = [result];
        }

        await storage.save(
          results,
          'product',
          `coupang_products_${range}_${Date.now()}`
        );
      } else if (subMode === 'combined') {
        console.log(`벤더+상품 통합 수집 모드`);
        console.log(`범위/ID: ${range}`);
        console.log(`스토어 ID: ${storeId}`);
        console.log(`상품수 (벤더당): ${maxPages}`);

        const combinedScraper = new CoupangCombinedScraper(scraperOptions);
        let results;

        if (range.includes('-')) {
          // 범위로 수집
          const [start, end] = range.split('-').map(Number);
          results = await combinedScraper.collectCombinedByRange(
            start,
            end,
            storeId,
            maxPages
          );
        } else if (range.includes(',')) {
          // 특정 ID들로 수집
          const vendorIds = range.split(',').map((id) => {
            let vendorId = String(id.trim());
            if (!vendorId.startsWith('A')) {
              vendorId = `A${vendorId.padStart(8, '0')}`;
            }
            return vendorId;
          });
          results = await combinedScraper.collectCombinedData(
            vendorIds,
            storeId,
            maxPages
          );
        } else {
          // 단일 ID
          let vendorId = String(range);
          if (!vendorId.startsWith('A')) {
            vendorId = `A${vendorId.padStart(8, '0')}`;
          }
          results = await combinedScraper.collectCombinedData(
            [vendorId],
            storeId,
            maxPages
          );
        }

        await storage.save(
          results,
          'combined',
          `coupang_combined_${range}_${Date.now()}`
        );
      } else if (subMode === 'combined-safe') {
        console.log(`벤더+상품 안전 수집 모드 (대량)`);
        console.log(`범위/ID: ${range}`);
        console.log(`스토어 ID: ${storeId}`);
        console.log(`상품수 (벤더당): ${maxPages}`);

        // 프록시 설정
        // scraperOptions.proxies = ['http://172.30.1.55:9090'];

        const combinedScraper = new CoupangCombinedScraper({
          ...scraperOptions,
          batchSize: 100, // 배치 크기 기본값
        });

        let result;
        if (range.includes('-')) {
          // 범위로 수집
          const [start, end] = range.split('-').map(Number);
          result = await combinedScraper.collectCombinedByRangeSafe(
            start,
            end,
            storeId,
            maxPages
          );
        } else if (range.includes(',')) {
          // 특정 ID들로 수집
          const vendorIds = range.split(',').map((id) => {
            let vendorId = String(id.trim());
            if (!vendorId.startsWith('A')) {
              vendorId = `A${vendorId.padStart(8, '0')}`;
            }
            return vendorId;
          });
          result = await combinedScraper.collectCombinedSafe(
            vendorIds,
            storeId,
            maxPages
          );
        } else {
          // 단일 ID
          let vendorId = String(range);
          if (!vendorId.startsWith('A')) {
            vendorId = `A${vendorId.padStart(8, '0')}`;
          }
          result = await combinedScraper.collectCombinedSafe(
            [vendorId],
            storeId,
            maxPages
          );
        }

        console.log(`\n🎯 안전 수집 결과:`);
        console.log(`   세션 ID: ${result.sessionId}`);
        console.log(`   처리된 벤더: ${result.processedVendors}개`);
        console.log(`   저장된 배치: ${result.batchCount}개`);
        console.log(`\n📝 다음 명령어로 완료하세요:`);
        console.log(`   node index.js coupang complete ${result.sessionId}`);
      } else if (subMode === 'resume') {
        console.log(`세션 재개 모드`);
        const sessionId = range; // range 파라미터를 sessionId로 사용
        console.log(`세션 ID: ${sessionId}`);

        const combinedScraper = new CoupangCombinedScraper(scraperOptions);
        const result = await combinedScraper.resumeSession(sessionId);

        console.log(`\n🎯 세션 재개 결과:`);
        console.log(`   세션 ID: ${result.sessionId}`);
        console.log(`   처리된 벤더: ${result.processedVendors}개`);
        console.log(`   저장된 배치: ${result.batchCount}개`);
        console.log(`\n📝 다음 명령어로 완료하세요:`);
        console.log(`   node index.js coupang complete ${result.sessionId}`);
      } else if (subMode === 'complete') {
        console.log(`세션 완료 모드`);
        const sessionId = range; // range 파라미터를 sessionId로 사용
        console.log(`세션 ID: ${sessionId}`);

        const combinedScraper = new CoupangCombinedScraper(scraperOptions);
        const finalFile = await combinedScraper.completeSession(sessionId);

        console.log(`\n🎯 세션 완료!`);
        console.log(`   최종 파일: ${finalFile}`);
      } else {
        console.log(
          '❌ 지원되지 않는 서브모드입니다. "vendor", "product", "combined", "combined-safe", "resume", "complete"를 사용하세요.'
        );
        console.log('📖 쿠팡 사용법:');
        console.log('  🔸 기본 모드:');
        console.log(
          '    • 벤더 정보: node index.js coupang vendor 39646-39650'
        );
        console.log(
          '    • 벤더 정보 (특정): node index.js coupang vendor 39646,39649'
        );
        console.log(
          '    • 상품 리스트: node index.js coupang product 39646-39650 5'
        );
        console.log(
          '    • 상품 리스트 (특정): node index.js coupang product 39646,39649 3'
        );
        console.log(
          '    • 통합 수집: node index.js coupang combined 1039646-1039649 2'
        );
        console.log(
          '    • 통합 수집 (특정): node index.js coupang combined 1039646,1039649 3'
        );
        console.log('  🛡️  안전 모드 (대량수집):');
        console.log(
          '    • 안전 수집: node index.js coupang combined-safe 1-2000000 3'
        );
        console.log(
          '    • 세션 재개: node index.js coupang resume session_2025-09-04T15-30-45_abc123'
        );
        console.log(
          '    • 세션 완료: node index.js coupang complete session_2025-09-04T15-30-45_abc123'
        );
      }
    } else {
      console.log(
        '❌ 지원되지 않는 모드입니다. "map", "smartstore", "navershopping", "coupang"을 사용하세요.'
      );
      console.log('📖 사용법:');
      console.log('  • 지도 검색: node index.js map "키워드" [결과수]');
      console.log('  • 스마트스토어: node index.js smartstore "상품URL"');
      console.log(
        '  • 쇼핑 상품 클릭: node index.js navershopping "카탈로그URL"'
      );
      console.log('  • 쿠팡 벤더: node index.js coupang vendor "39646-39650"');
      console.log(
        '  • 쿠팡 상품: node index.js coupang product "39646,39649" [페이지수]'
      );
      console.log(
        '  • 쿠팡 통합: node index.js coupang combined "1039646-1039649" [상품수]'
      );
      console.log(
        '  • 쿠팡 안전수집: node index.js coupang combined-safe "1-2000000" [상품수]'
      );
      console.log('');
      console.log('📄 네이버 쇼핑 예시:');
      console.log(
        '  node index.js navershopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"'
      );
      console.log('');
      console.log('📄 쿠팡 예시:');
      console.log('  node index.js coupang vendor 39646-39650');
      console.log('  node index.js coupang product 39646,39649 5');
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
import NaverShoppingRealBrowserScraper from './src/scrapers/naver/naver-shopping-real-browser-scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 스크립트가 직접 실행되었는지 확인
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
