import NaverSmartStoreScraper from './src/core/NaverSmartStoreScraper.js';

async function testScraper() {
  const scraper = new NaverSmartStoreScraper({
    headless: false,
    slowMo: 1000,
    saveData: true
  });

  try {
    // 테스트 상품 URL (바른체어)
    const productUrl = 'https://smartstore.naver.com/wodnr7762/products/7588460081';
    
    console.log('스크래퍼 테스트 시작...');
    const result = await scraper.scrapeProducts(productUrl);
    
    console.log('\n🎉 테스트 완료!');
    console.log(`결과: ${result.length}개 상품 수집`);
    
    if (result.length > 0) {
      const product = result[0];
      console.log(`\n수집된 상품 정보:`);
      console.log(`- 상품명: ${product.name || product.title || 'N/A'}`);
      console.log(`- 가격: ${product.salePrice || product.price || 'N/A'}`);
      console.log(`- 브랜드: ${product.brand || 'N/A'}`);
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.message);
  } finally {
    await scraper.close();
  }
}

testScraper();