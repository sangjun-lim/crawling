import CoupangCombinedScraper from '../../scrapers/coupang/combined-scraper.js';
import CoupangStorageService from '../../services/coupang-storage-service.js';
import { parseCoupangVendorIds } from '../common/url-parsers.js';

export async function runCombinedMode(args, config, isSafeMode = false) {
  const [range = '0-0', maxProducts] = args;
  const finalMaxProducts = parseInt(maxProducts) || config.scraperOptions.maxProducts;
  const storeId = 0; // 항상 0으로 고정
  
  if (isSafeMode) {
    console.log(`벤더+상품 안전 수집 모드 (대량)`);
  } else {
    console.log(`벤더+상품 통합 수집 모드`);
  }
  console.log(`범위/ID: ${range}`);
  console.log(`스토어 ID: ${storeId}`);
  console.log(`상품수 (벤더당): ${finalMaxProducts}`);

  const combinedScraper = new CoupangCombinedScraper({
    ...config.scraperOptions,
    batchSize: isSafeMode ? config.scraperOptions.batchSize : undefined, // 안전 모드에서만 배치 크기 설정
  });

  const parsedRange = parseCoupangVendorIds(range);
  let result;

  if (isSafeMode) {
    // 안전 모드 (대량 수집)
    switch (parsedRange.type) {
      case 'range':
        result = await combinedScraper.collectCombinedByRangeSafe(
          parsedRange.start,
          parsedRange.end,
          storeId,
          finalMaxProducts
        );
        break;
      
      case 'list':
        result = await combinedScraper.collectCombinedSafe(
          parsedRange.vendorIds,
          storeId,
          finalMaxProducts
        );
        break;
      
      case 'single':
        result = await combinedScraper.collectCombinedSafe(
          [parsedRange.vendorId],
          storeId,
          finalMaxProducts
        );
        break;
    }

    console.log(`\n🎯 안전 수집 결과:`);
    console.log(`   세션 ID: ${result.sessionId}`);
    console.log(`   처리된 벤더: ${result.processedVendors}개`);
    console.log(`   저장된 배치: ${result.batchCount}개`);
    console.log(`\n📝 다음 명령어로 완료하세요:`);
    console.log(`   node index.js coupang complete ${result.sessionId}`);

  } else {
    // 일반 모드
    const storage = new CoupangStorageService({ storageType: 'csv' });
    let results;

    switch (parsedRange.type) {
      case 'range':
        results = await combinedScraper.collectCombinedByRange(
          parsedRange.start,
          parsedRange.end,
          storeId,
          finalMaxProducts
        );
        break;
      
      case 'list':
      case 'single':
        const vendorIds = parsedRange.type === 'list' 
          ? parsedRange.vendorIds 
          : [parsedRange.vendorId];
        
        results = await combinedScraper.collectCombinedData(
          vendorIds,
          storeId,
          finalMaxProducts
        );
        break;
    }

    await storage.save(
      results,
      'combined',
      `coupang_combined_${range}_${Date.now()}`
    );
  }
}