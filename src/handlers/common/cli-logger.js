export function logAppStart(env) {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`🚀 프로그램 시작 - ${timestamp}`);
  console.log(`🔧 실행 환경: ${env}`);
}

export function logAppEnd(startTime) {
  const timestamp = new Date().toLocaleString('ko-KR');
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🏁 프로그램 종료 - ${timestamp} (실행시간: ${duration}초)`);
}

export function logError(message, error) {
  console.error(`❌ ${message}:`, error?.message || error);
}

export function logProxy(proxy) {
  if (proxy) {
    console.log(`🔗 프록시: ${proxy}`);
  }
}

export function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

export function logSuccess(message) {
  console.log(`✅ ${message}`);
}

export function logWarn(message) {
  console.warn(`⚠️  ${message}`);
}