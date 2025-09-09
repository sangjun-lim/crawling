import CoupangProductListScraper from '../../scrapers/coupang/product-list-scraper.js';
import CoupangStorageService from '../../services/coupang-storage-service.js';
import { parseCoupangVendorIds } from '../common/url-parsers.js';

export async function runProductMode(args, config) {
  const [range = '0-0', maxPages] = args;
  const finalMaxPages = parseInt(maxPages) || config.scraperOptions.maxPages;
  const storeId = 0; // 항상 0으로 고정
  
  console.log(`상품 리스트 수집 모드`);
  console.log(`범위/ID: ${range}`);
  console.log(`스토어 ID: ${storeId}`);
  console.log(`최대 페이지: ${finalMaxPages}`);

  const storage = new CoupangStorageService({ storageType: 'csv' });
  const productScraper = new CoupangProductListScraper(config.scraperOptions);
  
  let results;
  const parsedRange = parseCoupangVendorIds(range);

  switch (parsedRange.type) {
    case 'range':
      // 범위로 수집: "39646-39650"
      results = await productScraper.collectProductsByVendorRange(
        parsedRange.start,
        parsedRange.end,
        storeId,
        finalMaxPages
      );
      break;
    
    case 'list':
      // 특정 ID들로 수집: "39646,39649,39651"
      results = await productScraper.collectProductsByVendorIds(
        parsedRange.vendorIds,
        storeId,
        finalMaxPages
      );
      break;
    
    case 'single':
      // 단일 ID: "39646"
      const result = await productScraper.getAllProducts(
        parsedRange.vendorId,
        storeId,
        finalMaxPages
      );
      results = [result];
      break;
  }

  await storage.save(
    results,
    'product',
    `coupang_products_${range}_${Date.now()}`
  );
}