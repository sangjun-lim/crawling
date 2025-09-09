export function showUsage() {
  console.log('❌ 지원되지 않는 사이트입니다.');
  console.log('📖 사용법:');
  console.log('');
  console.log('🔹 네이버:');
  console.log('  • 지도 검색: node index.js naver map "키워드"');
  console.log('  • 스마트스토어: node index.js naver smartstore "상품URL"');
  console.log('  • 쇼핑 상품: node index.js naver shopping "카탈로그URL"');
  console.log('');
  console.log('🔹 쿠팡:');
  console.log('  • 벤더 정보: node index.js coupang vendor 39646-39650');
  console.log('  • 상품 리스트: node index.js coupang product 39646-39650 5');
  console.log('  • 통합 수집: node index.js coupang combined 1039646-1039649 3');
  console.log('  • 안전 수집: node index.js coupang combined-safe 1-2000000 3');
  console.log('');
  console.log('📄 예시:');
  console.log('  node index.js naver map "강남 맛집"');
  console.log('  node index.js naver shopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"');
  console.log('  node index.js coupang combined 1039646-1039649 3');
}

export function showNaverUsage() {
  console.log('📖 네이버 사용법:');
  console.log('  • 지도 검색: node index.js naver map "키워드"');
  console.log('  • 스마트스토어: node index.js naver smartstore "상품URL"');
  console.log('  • 쇼핑 상품: node index.js naver shopping "카탈로그URL"');
}

export function showCoupangUsage() {
  console.log('📖 쿠팡 사용법:');
  console.log('  🔸 기본 모드:');
  console.log('    • 벤더 정보: node index.js coupang vendor 39646-39650');
  console.log('    • 벤더 정보 (특정): node index.js coupang vendor 39646,39649');
  console.log('    • 상품 리스트: node index.js coupang product 39646-39650 5');
  console.log('    • 상품 리스트 (특정): node index.js coupang product 39646,39649 3');
  console.log('    • 통합 수집: node index.js coupang combined 1039646-1039649 2');
  console.log('    • 통합 수집 (특정): node index.js coupang combined 1039646,1039649 3');
  console.log('  🛡️  안전 모드 (대량수집):');
  console.log('    • 안전 수집: node index.js coupang combined-safe 1-2000000 3');
  console.log('    • 세션 재개: node index.js coupang resume session_2025-09-04T15-30-45_abc123');
  console.log('    • 세션 완료: node index.js coupang complete session_2025-09-04T15-30-45_abc123');
}