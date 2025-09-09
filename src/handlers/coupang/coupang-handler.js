import { runVendorMode } from './vendor-handler.js';
import { runProductMode } from './product-handler.js';
import { runCombinedMode } from './combined-handler.js';
import { runSessionMode } from './session-handler.js';
import { showCoupangUsage } from '../common/usage-helper.js';

export async function handleCoupang(subMode, args, config) {
  console.log(`=== 쿠팡 데이터 수집 ===`);
  
  // 쿠팡 요청/응답 로그 끄기
  config.scraperOptions.enableLogging = false;

  switch (subMode) {
    case 'vendor':
      await runVendorMode(args, config);
      break;
    case 'product':
      await runProductMode(args, config);
      break;
    case 'combined':
      await runCombinedMode(args, config, false); // 일반 모드
      break;
    case 'combined-safe':
      await runCombinedMode(args, config, true); // 안전 모드
      break;
    case 'resume':
      await runSessionMode('resume', args, config);
      break;
    case 'complete':
      await runSessionMode('complete', args, config);
      break;
    default:
      showCoupangUsage();
  }
}