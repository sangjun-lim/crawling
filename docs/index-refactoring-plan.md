# index.js 리팩토링 계획 (일관된 CLI 구조)

## 프로젝트 이해

**각종 사이트 스크래핑 프로젝트**
- **네이버** (3개 모드): map, shopping, smartstore
- **쿠팡** (6개 모드): vendor, product, combined, combined-safe, resume, complete

## 현재 문제점

- **일관성 없는 CLI**: 네이버는 `node index.js map`, 쿠팡은 `node index.js coupang vendor`
- **확장성 부족**: 새 사이트 추가시 main() 함수 수정 필요
- **거대한 main() 함수**: 모든 사이트/모드 로직이 한 곳에 집중 (400+ 줄)

## 리팩토링 목표

**CLI 일관성**: 모든 사이트를 `node index.js [site] [mode] [args]` 형식으로 통일
**사이트별 분리**: 각 사이트별 핸들러로 독립적 관리
**확장성**: 새 사이트 추가시 기존 코드 수정 없이 추가 가능
**단순함**: 과도한 추상화 지양, 함수 기반 접근

## 새로운 CLI 구조

### 통일된 명령어 형식

```bash
# 네이버 (새로운 형식)
node index.js naver map "치킨" 10
node index.js naver shopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"
node index.js naver smartstore "https://smartstore.naver.com/wodnr7762/products/8464846750"

# 쿠팡 (기존과 동일)
node index.js coupang vendor 1039646-1039649
node index.js coupang product 1039646,1039649 5
node index.js coupang combined 1039646-1039649 3
node index.js coupang combined-safe 1-2000000 3
node index.js coupang resume session_id
node index.js coupang complete session_id

# 미래 확장 예시
node index.js 11st product "검색어" 10
node index.js gmarket seller 12345-67890
```

### 하위 호환성 유지

기존 사용자를 위한 경고 메시지와 함께 동작:
```bash
# 기존 명령어도 동작 (경고 메시지와 함께)
node index.js map "치킨" 10
# ⚠️  구버전 명령어입니다. 새 형식을 사용하세요: node index.js naver map "치킨" 10
```

## 디렉토리 구조

```
src/handlers/
├── naver/
│   ├── naver-handler.js      # 네이버 총괄 핸들러
│   ├── map-handler.js        # 지도 스크래핑
│   ├── shopping-handler.js   # 쇼핑 스크래핑
│   └── smartstore-handler.js # 스마트스토어 스크래핑
├── coupang/
│   ├── coupang-handler.js    # 쿠팡 총괄 핸들러
│   ├── vendor-handler.js     # 벤더 스크래핑
│   ├── product-handler.js    # 상품리스트 스크래핑
│   ├── combined-handler.js   # 벤더+상품 통합 스크래핑
│   └── session-handler.js    # resume/complete 세션 관리
└── common/
    ├── config-loader.js      # 공통 설정 로딩
    ├── url-parsers.js        # URL 파싱 유틸리티
    ├── usage-helper.js       # 사용법 표시
    └── cli-logger.js         # CLI 로그 유틸리티
```

## 새로운 index.js (간결화)

```javascript
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
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
```

## 각 핸들러 구현

### naver-handler.js

```javascript
import { runMapMode } from './map-handler.js';
import { runShoppingMode } from './shopping-handler.js';
import { runSmartstoreMode } from './smartstore-handler.js';

export async function handleNaver(mode, args, config) {
  switch (mode) {
    case 'map':
      await runMapMode(args, config);
      break;
    case 'shopping':
      await runShoppingMode(args, config);
      break;
    case 'smartstore':
      await runSmartstoreMode(args, config);
      break;
    default:
      showNaverUsage();
  }
}

function showNaverUsage() {
  console.log('📖 네이버 사용법:');
  console.log('  • 지도 검색: node index.js naver map "키워드" [결과수]');
  console.log('  • 스마트스토어: node index.js naver smartstore "상품URL"');
  console.log('  • 쇼핑 상품: node index.js naver shopping "카탈로그URL"');
}
```

### coupang-handler.js

```javascript
import { runVendorMode } from './vendor-handler.js';
import { runProductMode } from './product-handler.js';
import { runCombinedMode } from './combined-handler.js';
import { runSessionMode } from './session-handler.js';

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

function showCoupangUsage() {
  console.log('📖 쿠팡 사용법:');
  console.log('  🔸 기본 모드:');
  console.log('    • 벤더 정보: node index.js coupang vendor 39646-39650');
  console.log('    • 상품 리스트: node index.js coupang product 39646-39650 5');
  console.log('    • 통합 수집: node index.js coupang combined 1039646-1039649 3');
  console.log('  🛡️  안전 모드 (대량수집):');
  console.log('    • 안전 수집: node index.js coupang combined-safe 1-2000000 3');
  console.log('    • 세션 재개: node index.js coupang resume session_id');
  console.log('    • 세션 완료: node index.js coupang complete session_id');
}
```

### 개별 모드 핸들러 예시 (map-handler.js)

```javascript
import NaverMapScraper from '../../scrapers/naver/naver-map-scraper.js';

export async function runMapMode(args, config) {
  const [keyword = '치킨', maxResults = 5] = args;
  
  console.log(`=== 네이버 지도 매장 순위 추출 ===`);
  console.log(`검색 키워드: ${keyword}`);
  console.log(`최대 결과 수: ${maxResults}`);
  
  if (config.scraperOptions.proxy) {
    console.log(`🔗 프록시: ${config.scraperOptions.proxy}`);
  }
  console.log();

  const scraper = new NaverMapScraper(config.scraperOptions);
  const results = await scraper.searchStores(keyword, parseInt(maxResults));

  if (results.stores.length > 0) {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/:/g, '-');
    await scraper.saveToCsv(
      results,
      `naver_stores_${keyword}_${timestamp}.csv`
    );
  }
}
```

### shopping-handler.js (복잡한 URL 파싱 포함)

```javascript
import NaverShoppingRealBrowserScraper from '../../scrapers/naver/naver-shopping-real-browser-scraper.js';
import { parseNaverShoppingUrl } from '../common/url-parsers.js';

export async function runShoppingMode(args, config) {
  const [urlInput] = args;
  
  console.log(`=== 네이버 쇼핑 상품 클릭 스크래핑 ===`);
  
  if (!urlInput) {
    console.error('❌ 네이버 쇼핑 URL이 필요합니다');
    console.log('📖 사용법: node index.js naver shopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"');
    return;
  }

  try {
    // URL 파싱 (기존 인라인 로직을 분리)
    const { productId, searchKeyword } = parseNaverShoppingUrl(urlInput);
    
    if (config.scraperOptions.proxy) {
      console.log(`🔗 프록시: ${config.scraperOptions.proxy}`);
    }
    console.log();

    const shoppingScraper = new NaverShoppingRealBrowserScraper({
      ...config.scraperOptions,
      headless: false,
      timeout: 30000,
      slowMo: 100,
    });

    console.log('🚀 네이버 쇼핑 상품 클릭 시나리오 시작...');
    await shoppingScraper.scrapeProductPriceComparison(searchKeyword, productId);
    console.log(`✅ 시나리오 완료`);

  } catch (error) {
    console.error('❌ 스크래핑 중 오류:', error.message);
  } finally {
    try {
      await shoppingScraper.close();
    } catch (closeError) {
      console.error('연결 해제 중 오류:', closeError.message);
    }
  }
}
```

## 공통 모듈

### usage-helper.js

```javascript
export function showUsage() {
  console.log('❌ 지원되지 않는 사이트입니다.');
  console.log('📖 사용법:');
  console.log('');
  console.log('🔹 네이버:');
  console.log('  • 지도 검색: node index.js naver map "키워드" [결과수]');
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
  console.log('  node index.js naver map "강남 맛집" 10');
  console.log('  node index.js naver shopping "https://search.shopping.naver.com/catalog/51449387077?query=의자"');
  console.log('  node index.js coupang combined 1039646-1039649 3');
}
```

### cli-logger.js

```javascript
export function logAppStart(env) {
  const timestamp = new Date().toLocaleString('ko-KR');
  console.log(`🚀 프로그램 시작 - ${timestamp}`);
  console.log(`🔧 실행 환경: ${env}`);
}

export function logAppEnd(startTime) {
  const timestamp = new Date().toLocaleString('ko-KR');
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`🏁 프로그램 종료 - ${timestamp} (실행시간: ${duration}초)`);
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
```

### url-parsers.js

```javascript
export function parseNaverShoppingUrl(urlInput) {
  if (!urlInput.includes('search.shopping.naver.com/catalog/')) {
    throw new Error('올바른 네이버 쇼핑 catalog URL을 입력해주세요');
  }

  try {
    const url = new URL(urlInput);
    
    // 상품 ID 추출 (catalog/ 다음 숫자)
    const pathMatch = url.pathname.match(/\\/catalog\\/(\\d+)/);
    if (!pathMatch) {
      throw new Error('URL에서 상품 ID를 추출할 수 없습니다');
    }
    const productId = pathMatch[1];

    // 검색어 추출 (query 파라미터)
    const queryParam = url.searchParams.get('query');
    if (!queryParam) {
      throw new Error('URL에서 검색어를 추출할 수 없습니다');
    }
    const searchKeyword = decodeURIComponent(queryParam);

    console.log(`📄 URL 파싱 결과:`);
    console.log(`  - 검색어: "${searchKeyword}"`);
    console.log(`  - 상품 ID: "${productId}"`);

    return { productId, searchKeyword };
    
  } catch (parseError) {
    throw new Error('URL 파싱 실패: ' + parseError.message);
  }
}

export function parseCoupangVendorId(idInput) {
  let vendorId = String(idInput).trim();
  if (!vendorId.startsWith('A')) {
    vendorId = `A${vendorId.padStart(8, '0')}`;
  }
  return vendorId;
}
```

## 리팩토링 단계

### Phase 1: 공통 모듈 생성
1. `src/handlers/common/` 디렉토리 생성
2. `config-loader.js`, `url-parsers.js`, `usage-helper.js`, `cli-logger.js` 구현
3. 기존 복잡한 로직들을 공통 모듈로 추출

### Phase 2: 네이버 핸들러 분리
1. `src/handlers/naver/` 디렉토리 생성
2. `naver-handler.js` 및 각 모드별 핸들러 구현
3. 기존 main() 함수의 네이버 로직을 각 핸들러로 이동

### Phase 3: 쿠팡 핸들러 분리  
1. `src/handlers/coupang/` 디렉토리 생성
2. `coupang-handler.js` 및 각 모드별 핸들러 구현
3. 복잡한 쿠팡 서브모드 로직을 각 핸들러로 분리

### Phase 4: index.js 간소화
1. 새로운 구조로 index.js 교체 (400줄 → 60줄)
2. 일관된 CLI 형식 적용
3. 하위 호환성 처리 추가

### Phase 5: 검증 및 마무리
1. 모든 기존 기능 동작 확인
2. 새로운 CLI 형식 테스트
3. 문서 및 사용법 업데이트

## 기대 효과

### CLI 일관성
- **통일된 형식**: `node index.js [site] [mode] [args]`
- **직관적 구조**: 사이트별로 명확한 분리
- **확장성**: 새 사이트 추가시 동일한 패턴 적용

### 코드 구조 개선
- **index.js**: 400줄 → 60줄 (85% 감소)
- **모듈화**: 각 핸들러 100줄 이내
- **재사용성**: 공통 로직의 모듈화

### 개발 생산성
- **새 사이트 추가**: 기존 코드 수정 없이 핸들러만 추가
- **독립적 개발**: 사이트별 팀이 독립적으로 작업 가능
- **디버깅 용이**: 문제 발생시 해당 핸들러만 확인

### 사용자 경험
- **일관성**: 모든 사이트에서 동일한 명령어 패턴
- **직관성**: `naver map`, `coupang vendor` 등 의미가 명확
- **호환성**: 기존 명령어도 경고 메시지와 함께 동작

## 마이그레이션 가이드

### 기존 사용자를 위한 명령어 변경

```bash
# 기존 → 새로운 형식
node index.js map "치킨" 10 
→ node index.js naver map "치킨" 10

node index.js smartstore "URL" 
→ node index.js naver smartstore "URL"

node index.js navershopping "URL" 
→ node index.js naver shopping "URL"

# 쿠팡은 변경 없음
node index.js coupang vendor 39646-39650 (동일)
```

기존 명령어는 당분간 지원하되, 새로운 형식 사용을 권장하는 경고 메시지를 표시합니다.

이 구조는 프로젝트의 확장성과 일관성을 크게 개선하며, 새로운 스크래핑 사이트 추가시에도 동일한 패턴을 따를 수 있습니다.