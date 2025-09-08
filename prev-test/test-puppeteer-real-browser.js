import NaverShoppingRealBrowserScraper from '../src/core/NaverShoppingRealBrowserScraper.js';

async function testPuppeteerRealBrowser() {
  console.log('🚀 네이버쇼핑 실제 크롤링 테스트 시작');

  const scraper = new NaverShoppingRealBrowserScraper({
    headless: false, // 브라우저 창 표시 (디버깅용)
    timeout: 30000,
    saveData: true, // HTML 파일 저장
  });

  try {
    // 스크래퍼 초기화
    console.log('📦 스크래퍼 초기화 중...');
    
    let initialized = false;
    try {
      initialized = await scraper.init();
      console.log('초기화 결과:', initialized);
    } catch (initError) {
      console.error('초기화 중 에러 발생:', initError.message);
      console.error('초기화 에러 상세:', initError.stack);
      throw initError;
    }

    if (!initialized) {
      throw new Error('스크래퍼 초기화 실패');
    }

    console.log('✅ 스크래퍼 초기화 성공');
    
    // 테스트 옵션 선택
    const testMode = process.argv[2] || 'search'; // 'search' 또는 'click'
    
    if (testMode === 'click') {
      // 특정 상품 클릭 테스트
      console.log('🎯 특정 상품 클릭 테스트 실행');
      await scraper.findAndClickProduct('의자', '51449387077');
      console.log('✅ 상품 클릭 테스트 완료 - 무한 대기 중 (Ctrl+C로 종료)');
      
    } else {
      // 일반 검색 크롤링 테스트
      const searchKeyword = process.argv[3] || '의자';
      console.log(`🔍 "${searchKeyword}" 검색 크롤링 시작...`);
      
      const result = await scraper.scrapeProduct(searchKeyword);
      
      console.log('✅ 크롤링 완료!');
      console.log(`📍 최종 URL: ${result.url}`);
      console.log(`📄 HTML 길이: ${result.html.length.toLocaleString()}자`);
      
      if (result.savedPath) {
        console.log(`💾 파일 저장됨: ${result.savedPath}`);
      }
      
      console.log('🔄 브라우저 종료 중...');
      await scraper.close();
      console.log('✅ 테스트 완료');
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
    console.error('📋 에러 상세:', error.stack);
    
    try {
      await scraper.close();
    } catch (closeError) {
      console.error('브라우저 종료 실패:', closeError.message);
    }
  }
}

// Ctrl+C 처리
process.on('SIGINT', async () => {
  console.log('\n종료 신호 감지...');
  process.exit(0);
});

// 사용법 안내
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🚀 네이버쇼핑 크롤링 테스트 사용법:

📍 기본 검색 크롤링:
  node prevtest/test-puppeteer-real-browser.js

📍 커스텀 키워드 검색:
  node prevtest/test-puppeteer-real-browser.js search "검색키워드"

📍 특정 상품 클릭 테스트:
  node prevtest/test-puppeteer-real-browser.js click

예시:
  node prevtest/test-puppeteer-real-browser.js search "게이밍 의자"
  node prevtest/test-puppeteer-real-browser.js click
  `);
  process.exit(0);
}

// 테스트 실행
testPuppeteerRealBrowser();
