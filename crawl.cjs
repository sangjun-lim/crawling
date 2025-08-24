#!/usr/bin/env node

/**
 * 네이버 스마트스토어 크롤러 실행 스크립트
 * 
 * 사용법:
 * node crawl.cjs https://smartstore.naver.com/wodnr7762/products/7588460081
 * node crawl.cjs [전체URL]
 */

const NaverSmartStoreCrawler = require('./smartstore-crawler.cjs');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('❌ 사용법: node crawl.cjs [URL]');
        console.log('예시: node crawl.cjs https://smartstore.naver.com/wodnr7762/products/7588460081');
        process.exit(1);
    }

    const url = args[0];
    
    // URL에서 스토어ID와 상품ID 추출
    const urlPattern = /smartstore\.naver\.com\/([^\/]+)\/products\/(\d+)/;
    const match = url.match(urlPattern);
    
    if (!match) {
        console.log('❌ 올바른 네이버 스마트스토어 상품 URL을 입력해주세요.');
        console.log('예시: https://smartstore.naver.com/wodnr7762/products/7588460081');
        process.exit(1);
    }
    
    const [, storeId, productId] = match;
    const headless = !args.includes('--show'); // --show 플래그가 있으면 브라우저 표시

    console.log('🎯 네이버 스마트스토어 크롤링 시작');
    console.log(`📍 스토어: ${storeId}`);
    console.log(`🛍️  상품: ${productId}`);
    console.log(`👀 헤드리스: ${headless ? '예' : '아니오'}`);
    console.log('=' * 50);

    const crawler = new NaverSmartStoreCrawler({
        headless: headless,
        slowMo: 500,
        saveData: true
    });

    try {
        const result = await crawler.crawlProduct(storeId, productId);
        
        console.log('\n🎉 크롤링 성공!');
        console.log('=' * 50);
        console.log('📊 수집된 데이터:');
        console.log(`상품명: ${result.name || 'N/A'}`);
        console.log(`가격: ${result.salePrice ? result.salePrice.toLocaleString() + '원' : 'N/A'}`);
        console.log(`원가: ${result.originalPrice ? result.originalPrice.toLocaleString() + '원' : 'N/A'}`);
        console.log(`할인율: ${result.discountRate || 0}%`);
        console.log(`브랜드: ${result.brand || 'N/A'}`);
        console.log(`제조사: ${result.manufacturer || 'N/A'}`);
        console.log(`카테고리: ${result.category?.fullPath || 'N/A'}`);
        console.log(`재고: ${result.stockQuantity ? result.stockQuantity.toLocaleString() + '개' : 'N/A'}`);
        console.log(`옵션 수: ${result.options?.length || 0}개`);
        console.log(`이미지 수: ${result.images?.length || 0}개`);
        console.log(`URL: ${result.url}`);
        console.log('=' * 50);
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n💥 크롤링 실패!');
        console.error(`오류: ${error.message}`);
        process.exit(1);
    } finally {
        await crawler.close();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('💥 예상치 못한 오류:', error);
        process.exit(1);
    });
}