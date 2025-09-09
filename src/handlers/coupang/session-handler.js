import CoupangCombinedScraper from '../../scrapers/coupang/combined-scraper.js';

export async function runSessionMode(mode, args, config) {
  const [sessionId] = args;
  
  if (!sessionId) {
    console.error('❌ 세션 ID가 필요합니다');
    console.log('📖 사용법:');
    console.log('  • 세션 재개: node index.js coupang resume session_id');
    console.log('  • 세션 완료: node index.js coupang complete session_id');
    return;
  }

  const combinedScraper = new CoupangCombinedScraper(config.scraperOptions);

  if (mode === 'resume') {
    console.log(`세션 재개 모드`);
    console.log(`세션 ID: ${sessionId}`);

    const result = await combinedScraper.resumeSession(sessionId);

    console.log(`\n🎯 세션 재개 결과:`);
    console.log(`   세션 ID: ${result.sessionId}`);
    console.log(`   처리된 벤더: ${result.processedVendors}개`);
    console.log(`   저장된 배치: ${result.batchCount}개`);
    console.log(`\n📝 다음 명령어로 완료하세요:`);
    console.log(`   node index.js coupang complete ${result.sessionId}`);

  } else if (mode === 'complete') {
    console.log(`세션 완료 모드`);
    console.log(`세션 ID: ${sessionId}`);

    const finalFile = await combinedScraper.completeSession(sessionId);

    console.log(`\n🎯 세션 완료!`);
    console.log(`   최종 파일: ${finalFile}`);
  }
}