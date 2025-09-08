import NaverShoppingScraper from '../src/core/NaverShoppingScraper.js';

async function testProductClick() {
  const scraper = new NaverShoppingScraper({
    headless: false,
    timeout: 30000,
    slowMo: 100,
    saveData: true, // HTML 저장 활성화
  });

  try {
    console.log('네이버 쇼핑 상품 클릭 시나리오 시작...');

    // 의자를 검색하고 특정 상품 ID (51449387077)가 포함된 상품 클릭
    await scraper.findAndClickProduct('의자', '51449387077');
  } catch (error) {
    console.error('시나리오 실행 중 오류:', error);
  } finally {
    // 에러가 발생해도 연결은 유지 (CDP 연결이므로 브라우저는 계속 실행)
    try {
      await scraper.close();
    } catch (closeError) {
      console.error('연결 해제 중 오류:', closeError);
    }
  }
}

// Ctrl+C 처리
process.on('SIGINT', async () => {
  console.log('\n종료 신호 감지...');
  process.exit(0);
});

// 테스트 시작
testProductClick();
