import { loadConfiguration } from './src/handlers/common/config-loader.js';
import { handleNaver } from './src/handlers/naver/naver-handler.js';
import { handleCoupang } from './src/handlers/coupang/coupang-handler.js';
import { showUsage } from './src/handlers/common/usage-helper.js';
import { logAppStart, logAppEnd, logError } from './src/handlers/common/cli-logger.js';

async function main() {
  const startTime = Date.now();
  
  try {
    const config = loadConfiguration();
    logAppStart(config.env);
    
    const [site, mode, ...args] = process.argv.slice(2);

    // 하위 호환성 처리 (기존 네이버 명령어)
    if (['map', 'smartstore', 'navershopping'].includes(site)) {
      console.warn(`⚠️  구버전 명령어입니다. 새 형식을 사용하세요: node index.js naver ${site === 'navershopping' ? 'shopping' : site}`);
      const oldMode = site === 'navershopping' ? 'shopping' : site;
      await handleNaver(oldMode, [mode, ...args], config);
      return;
    }

    // 새로운 일관된 구조
    switch(site) {
      case 'naver':
        await handleNaver(mode, args, config);
        break;
      case 'coupang':
        await handleCoupang(mode, args, config);
        break;
      default:
        showUsage();
    }

  } catch (error) {
    logError('프로그램 실행 중 오류 발생', error);
  } finally {
    logAppEnd(startTime);
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