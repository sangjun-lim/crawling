import CoupangVendorScraper from '../../scrapers/coupang/vendor-scraper.js';
import CoupangStorageService from '../../services/coupang-storage-service.js';
import { parseCoupangVendorIds } from '../common/url-parsers.js';

export async function runVendorMode(args, config) {
  const [range = '0-0'] = args;
  const storeId = 0; // 항상 0으로 고정
  
  console.log(`벤더 정보 수집 모드`);
  console.log(`범위/ID: ${range}`);
  console.log(`스토어 ID: ${storeId}`);

  const storage = new CoupangStorageService({ storageType: 'csv' });
  const vendorScraper = new CoupangVendorScraper(config.scraperOptions);
  
  let results;
  const parsedRange = parseCoupangVendorIds(range);

  switch (parsedRange.type) {
    case 'range':
      // 범위로 수집: "39646-39650"
      results = await vendorScraper.collectVendorData(
        parsedRange.start, 
        parsedRange.end, 
        storeId
      );
      break;
    
    case 'list':
      // 특정 ID들로 수집: "39646,39649,39651"
      results = await vendorScraper.collectVendorDataByIds(
        parsedRange.vendorIds,
        storeId
      );
      break;
    
    case 'single':
      // 단일 ID: "39646"
      const result = await vendorScraper.getVendorInfo(storeId, parsedRange.vendorId);
      results = [result];
      break;
  }

  await storage.save(
    results,
    'vendor',
    `coupang_vendors_${range}_${Date.now()}`
  );
}