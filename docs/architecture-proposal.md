# 멀티 사이트 스크래핑 플랫폼 아키텍처 제안서

## 📋 목차
- [개요](#개요)
- [현재 구조의 한계](#현재-구조의-한계)
- [제안 아키텍처](#제안-아키텍처)
- [폴더 구조](#폴더-구조)
- [핵심 컴포넌트](#핵심-컴포넌트)
- [모듈 개발 가이드](#모듈-개발-가이드)
- [사용 예시](#사용-예시)
- [마이그레이션 계획](#마이그레이션-계획)
- [확장 시나리오](#확장-시나리오)

---

## 개요

현재 네이버 지도 매장 순위 추출에 특화된 구조를 **다중 사이트 × 다중 기능**을 지원하는 확장 가능한 플러그인 기반 모듈 시스템으로 발전시키는 아키텍처 제안입니다.

### 지원 예상 사이트 및 기능

| 사이트 | 순위추출 | 상세추출 | 분석기능 | 기타 |
|--------|----------|----------|----------|------|
| 네이버지도 | ✅ 매장순위 | ✅ 매장상세 | ✅ 리뷰분석 | 위치분석 |
| 네이버스토어 | ✅ 상품순위 | ✅ 상품상세 | ✅ 판매분석 | 판매자정보 |
| 쿠팡 | ✅ 키워드순위 | ✅ 상품상세 | ✅ 가격추이 | 할인분석 |
| 11번가 | ✅ 상품순위 | ✅ 상품상세 | ✅ 경쟁분석 | - |

---

## 현재 구조의 한계

### ❌ 문제점
1. **사이트 종속성**: NaverStoreScraper가 네이버에 하드코딩됨
2. **기능 중복**: 새 사이트마다 HTTP, 파싱, 저장 로직 재작성 필요
3. **확장 어려움**: 새 기능 추가 시 기존 코드 수정 불가피
4. **유지보수 복잡**: 사이트별 변경사항이 전체 코드에 영향

### ✅ 개선 목표
- **모듈화**: 사이트별/기능별 독립적 개발
- **재사용성**: 공통 로직의 최대 재활용
- **확장성**: 플러그인 방식으로 무제한 확장
- **유지보수성**: 격리된 모듈로 안전한 업데이트

---

## 제안 아키텍처

### 🎯 핵심 설계 원칙

#### 1. **플러그인 기반 모듈 시스템**
- 각 사이트는 독립적인 모듈
- 런타임에 필요한 모듈만 동적 로딩
- 모듈 간 의존성 최소화

#### 2. **계층화된 추상화**
```
Application Layer    (index.js, CLI)
    ↓
Engine Layer        (ScraperEngine, TaskManager)
    ↓
Module Layer        (naver-map, coupang, etc.)
    ↓
Shared Layer        (HttpClient, FileManager)
```

#### 3. **설정 기반 확장**
- 코드 변경 없이 설정 파일로 기능 확장
- 모듈별 독립적인 설정 관리
- 중앙화된 레지스트리 시스템

---

## 폴더 구조

```
src/
├── core/                           # 핵심 엔진
│   ├── ScraperEngine.js           # 중앙 실행 엔진
│   ├── ModuleLoader.js            # 동적 모듈 로더
│   ├── TaskManager.js             # 작업 스케줄링/관리
│   └── ModuleRegistry.js          # 모듈 등록/탐색
├── shared/                         # 공통 유틸리티
│   ├── http/
│   │   ├── HttpClient.js          # 통합 HTTP 클라이언트
│   │   ├── RequestBuilder.js      # 요청 빌더
│   │   └── ResponseHandler.js     # 응답 처리기
│   ├── data/
│   │   ├── DataProcessor.js       # 데이터 변환/정규화
│   │   ├── DataValidator.js       # 데이터 검증
│   │   └── SchemaManager.js       # 스키마 관리
│   ├── storage/
│   │   ├── FileManager.js         # 파일 저장/로드
│   │   ├── CacheManager.js        # 캐시 관리
│   │   └── DatabaseManager.js     # DB 연동 (향후)
│   └── utils/
│       ├── Logger.js              # 통합 로깅
│       ├── ConfigLoader.js        # 설정 로더
│       └── ErrorHandler.js        # 에러 처리
├── modules/                        # 사이트별 모듈
│   ├── naver-map/
│   │   ├── module.config.js       # 모듈 메타데이터
│   │   ├── ranking/               # 순위 추출 기능
│   │   │   ├── RankingExtractor.js
│   │   │   ├── RankingParser.js
│   │   │   └── ranking.config.js
│   │   ├── detail/                # 상세 정보 추출
│   │   │   ├── DetailExtractor.js
│   │   │   ├── DetailParser.js
│   │   │   └── detail.config.js
│   │   ├── review/                # 리뷰 분석
│   │   │   ├── ReviewExtractor.js
│   │   │   ├── ReviewAnalyzer.js
│   │   │   └── review.config.js
│   │   └── shared/                # 네이버지도 공통
│   │       ├── NaverMapClient.js
│   │       ├── NaverMapAuth.js
│   │       └── NaverMapUtils.js
│   ├── naver-store/
│   │   ├── module.config.js
│   │   ├── ranking/
│   │   │   ├── ProductRankingExtractor.js
│   │   │   └── ranking.config.js
│   │   ├── detail/
│   │   │   ├── ProductDetailExtractor.js
│   │   │   └── detail.config.js
│   │   ├── seller/                # 판매자 정보
│   │   │   ├── SellerExtractor.js
│   │   │   └── seller.config.js
│   │   └── shared/
│   │       ├── NaverStoreClient.js
│   │       └── NaverStoreParser.js
│   ├── coupang/
│   │   ├── module.config.js
│   │   ├── ranking/
│   │   ├── detail/
│   │   ├── price/                 # 가격 추이 분석
│   │   └── shared/
│   └── 11st/                      # 향후 확장
│       └── ...
├── interfaces/                     # 인터페이스 정의
│   ├── IExtractor.js              # 추출기 인터페이스
│   ├── IParser.js                 # 파서 인터페이스
│   ├── IModule.js                 # 모듈 인터페이스
│   ├── IDataFormatter.js          # 포맷터 인터페이스
│   └── IValidator.js              # 검증기 인터페이스
├── config/                         # 전역 설정
│   ├── global.config.js           # 전역 설정
│   ├── modules.registry.js        # 모듈 레지스트리
│   ├── data-schemas/              # 데이터 스키마
│   │   ├── store.schema.js
│   │   ├── product.schema.js
│   │   └── review.schema.js
│   └── environments/              # 환경별 설정
│       ├── development.js
│       ├── production.js
│       └── test.js
└── cli/                           # CLI 인터페이스
    ├── commands/
    │   ├── scrape.js              # 스크래핑 명령
    │   ├── analyze.js             # 분석 명령
    │   └── module.js              # 모듈 관리
    ├── interactive.js             # 대화형 CLI
    └── batch.js                   # 배치 실행
```

---

## 핵심 컴포넌트

### 1. ScraperEngine (중앙 엔진)

```javascript
// src/core/ScraperEngine.js
class ScraperEngine {
  constructor(config = {}) {
    this.moduleLoader = new ModuleLoader();
    this.taskManager = new TaskManager();
    this.registry = new ModuleRegistry();
    this.config = config;
  }

  /**
   * 단일 작업 실행
   * @param {string} siteName - 사이트명 (naver-map, coupang 등)
   * @param {string} feature - 기능명 (ranking, detail 등)
   * @param {Object} params - 실행 파라미터
   */
  async execute(siteName, feature, params = {}) {
    const module = await this.moduleLoader.load(siteName);
    const extractor = module.getFeature(feature);
    
    return await this.taskManager.execute({
      extractor,
      params,
      config: this.mergeConfig(siteName, feature, params)
    });
  }

  /**
   * 배치 작업 실행
   * @param {Array} tasks - 작업 배열
   * @param {Object} options - 실행 옵션 (병렬, 순차 등)
   */
  async executeBatch(tasks, options = {}) {
    return await this.taskManager.executeBatch(tasks, options);
  }

  /**
   * 사용 가능한 모듈 조회
   */
  getAvailableModules() {
    return this.registry.getAllModules();
  }

  /**
   * 모듈별 기능 조회
   */
  getModuleFeatures(siteName) {
    return this.registry.getModuleFeatures(siteName);
  }
}
```

### 2. ModuleLoader (동적 모듈 로더)

```javascript
// src/core/ModuleLoader.js
class ModuleLoader {
  constructor() {
    this.loadedModules = new Map();
    this.registry = new ModuleRegistry();
  }

  /**
   * 모듈 동적 로딩
   */
  async load(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      return this.loadedModules.get(moduleName);
    }

    const moduleConfig = this.registry.getModuleConfig(moduleName);
    
    // 의존성 먼저 로드
    await this.loadDependencies(moduleConfig.dependencies);
    
    // 모듈 로드
    const ModuleClass = await import(`../modules/${moduleName}/index.js`);
    const moduleInstance = new ModuleClass.default(moduleConfig);
    
    this.loadedModules.set(moduleName, moduleInstance);
    return moduleInstance;
  }

  /**
   * 의존성 로드
   */
  async loadDependencies(dependencies = []) {
    for (const dep of dependencies) {
      if (!this.loadedModules.has(dep)) {
        await this.load(dep);
      }
    }
  }

  /**
   * 모듈 언로드 (메모리 정리)
   */
  unload(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      this.loadedModules.delete(moduleName);
    }
  }
}
```

### 3. BaseModule (모듈 기본 클래스)

```javascript
// src/interfaces/BaseModule.js
class BaseModule {
  constructor(config) {
    this.config = config;
    this.features = new Map();
    this.httpClient = new HttpClient(config.httpConfig);
    this.logger = new Logger(config.name);
    
    this.initialize();
  }

  /**
   * 모듈 초기화 (하위 클래스에서 구현)
   */
  initialize() {
    throw new Error('initialize() method must be implemented');
  }

  /**
   * 기능 등록
   */
  registerFeature(name, extractor) {
    this.features.set(name, extractor);
  }

  /**
   * 기능 조회
   */
  getFeature(name) {
    if (!this.features.has(name)) {
      throw new Error(`Feature '${name}' not found in module '${this.config.name}'`);
    }
    return this.features.get(name);
  }

  /**
   * 사용 가능한 기능 목록
   */
  getAvailableFeatures() {
    return Array.from(this.features.keys());
  }

  /**
   * 모듈 정리
   */
  cleanup() {
    this.features.clear();
    this.httpClient.cleanup();
  }
}
```

---

## 모듈 개발 가이드

### 1. 새 모듈 생성 단계

#### Step 1: 모듈 설정 파일 생성
```javascript
// modules/new-site/module.config.js
export default {
  name: 'new-site',
  version: '1.0.0',
  description: '새 사이트 스크래핑 모듈',
  
  // 지원 기능 목록
  features: ['ranking', 'detail', 'custom-feature'],
  
  // 의존성 모듈
  dependencies: ['shared/HttpClient', 'shared/DataProcessor'],
  
  // 엔드포인트 설정
  endpoints: {
    ranking: 'https://api.newsite.com/search',
    detail: 'https://api.newsite.com/detail',
    auth: 'https://api.newsite.com/auth'
  },
  
  // HTTP 설정
  httpConfig: {
    timeout: 30000,
    retries: 3,
    rateLimit: {
      requests: 10,
      per: 'second'
    }
  },
  
  // 데이터 스키마
  dataSchema: {
    ranking: 'product.schema.js',
    detail: 'productDetail.schema.js'
  },
  
  // 모듈별 특별 설정
  moduleSpecific: {
    apiKey: process.env.NEW_SITE_API_KEY,
    userAgent: 'NewSite Scraper 1.0'
  }
};
```

#### Step 2: 메인 모듈 클래스 생성
```javascript
// modules/new-site/index.js
import BaseModule from '../../interfaces/BaseModule.js';
import RankingExtractor from './ranking/RankingExtractor.js';
import DetailExtractor from './detail/DetailExtractor.js';

class NewSiteModule extends BaseModule {
  initialize() {
    // 기능별 추출기 등록
    this.registerFeature('ranking', new RankingExtractor(this.config, this.httpClient));
    this.registerFeature('detail', new DetailExtractor(this.config, this.httpClient));
    
    // 모듈 특화 초기화
    this.setupAuthentication();
    this.setupRateLimiting();
  }

  async setupAuthentication() {
    if (this.config.moduleSpecific.apiKey) {
      this.httpClient.setDefaultHeader('X-API-Key', this.config.moduleSpecific.apiKey);
    }
  }

  setupRateLimiting() {
    this.httpClient.setRateLimit(this.config.httpConfig.rateLimit);
  }
}

export default NewSiteModule;
```

#### Step 3: 기능별 추출기 구현
```javascript
// modules/new-site/ranking/RankingExtractor.js
import BaseExtractor from '../../../interfaces/BaseExtractor.js';

class RankingExtractor extends BaseExtractor {
  async extract(params) {
    const { keyword, maxResults = 100 } = params;
    
    try {
      // 1. 요청 빌드
      const request = this.buildRequest(keyword, maxResults);
      
      // 2. API 호출
      const response = await this.httpClient.post(
        this.config.endpoints.ranking,
        request
      );
      
      // 3. 응답 파싱
      const parsedData = this.parseResponse(response.data);
      
      // 4. 데이터 정규화
      const normalizedData = this.normalizeData(parsedData);
      
      // 5. 검증
      this.validateData(normalizedData);
      
      return {
        success: true,
        data: normalizedData,
        metadata: {
          keyword,
          totalResults: normalizedData.length,
          extractedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      this.logger.error('Ranking extraction failed', error);
      throw new ExtractionError(`Failed to extract ranking for "${keyword}": ${error.message}`);
    }
  }

  buildRequest(keyword, maxResults) {
    return {
      query: keyword,
      limit: maxResults,
      sort: 'relevance',
      apiKey: this.config.moduleSpecific.apiKey
    };
  }

  parseResponse(rawData) {
    // 사이트별 응답 구조에 맞게 파싱
    return rawData.items.map(item => ({
      rank: item.position,
      title: item.name,
      url: item.link,
      price: item.price,
      rating: item.rating,
      reviewCount: item.reviewCount
    }));
  }

  normalizeData(data) {
    // 공통 데이터 형식으로 정규화
    return data.map((item, index) => ({
      rank: index + 1,
      name: item.title,
      url: item.url,
      price: this.parsePrice(item.price),
      rating: this.parseRating(item.rating),
      reviewCount: parseInt(item.reviewCount) || 0,
      extractedFrom: 'new-site'
    }));
  }
}

export default RankingExtractor;
```

### 2. 모듈 등록

```javascript
// config/modules.registry.js
export const moduleRegistry = {
  'naver-map': {
    path: './modules/naver-map',
    features: ['ranking', 'detail', 'review'],
    status: 'active'
  },
  'naver-store': {
    path: './modules/naver-store', 
    features: ['ranking', 'detail', 'seller'],
    status: 'active'
  },
  'coupang': {
    path: './modules/coupang',
    features: ['ranking', 'detail', 'price'],
    status: 'beta'
  },
  'new-site': {
    path: './modules/new-site',
    features: ['ranking', 'detail'],
    status: 'development'
  }
};
```

---

## 사용 예시

### 1. 기본 사용법

```javascript
// 새로운 index.js
import ScraperEngine from './src/core/ScraperEngine.js';

const engine = new ScraperEngine();

// 단일 작업 실행
const result = await engine.execute('naver-map', 'ranking', {
  keyword: '강남 맛집',
  maxResults: 100,
  location: '강남구'
});

console.log(`추출된 매장 수: ${result.data.length}`);
```

### 2. 배치 작업

```javascript
// 여러 사이트에서 동시 추출
const batchTasks = [
  {
    site: 'naver-map',
    feature: 'ranking', 
    params: { keyword: '치킨', maxResults: 50 }
  },
  {
    site: 'coupang',
    feature: 'ranking',
    params: { keyword: '치킨', maxResults: 50 }
  },
  {
    site: 'naver-store',
    feature: 'ranking',
    params: { keyword: '치킨', maxResults: 50 }
  }
];

const results = await engine.executeBatch(batchTasks, {
  parallel: true,
  maxConcurrency: 3
});

// 결과 통합 분석
const allProducts = results.flatMap(r => r.data);
console.log(`전체 추출 상품 수: ${allProducts.length}`);
```

### 3. CLI 사용법

```bash
# 단일 사이트 스크래핑
node cli/scrape.js naver-map ranking --keyword="강남 맛집" --max-results=100

# 배치 스크래핑
node cli/batch.js --config=batch-config.json

# 모듈 정보 조회
node cli/module.js list
node cli/module.js info naver-map

# 대화형 모드
node cli/interactive.js
```

### 4. 프로그래매틱 사용

```javascript
// 고급 사용 예시
import ScraperEngine from './src/core/ScraperEngine.js';
import DataAnalyzer from './src/shared/DataAnalyzer.js';

const engine = new ScraperEngine({
  storage: {
    type: 'file',
    location: './results'
  },
  cache: {
    enabled: true,
    ttl: 3600 // 1시간
  }
});

// 경쟁 분석 워크플로우
async function competitorAnalysis(keyword) {
  // 1. 여러 사이트에서 데이터 수집
  const tasks = [
    { site: 'naver-map', feature: 'ranking', params: { keyword } },
    { site: 'coupang', feature: 'ranking', params: { keyword } },
    { site: 'naver-store', feature: 'ranking', params: { keyword } }
  ];
  
  const results = await engine.executeBatch(tasks);
  
  // 2. 데이터 통합 및 분석
  const analyzer = new DataAnalyzer();
  const analysis = analyzer.compareAcrossSites(results);
  
  // 3. 결과 저장
  await engine.save(analysis, {
    format: 'json',
    filename: `competitor-analysis-${keyword}-${Date.now()}.json`
  });
  
  return analysis;
}

// 실행
const analysis = await competitorAnalysis('치킨');
console.log('경쟁 분석 완료:', analysis.summary);
```

---

## 마이그레이션 계획

### Phase 1: 기반 구조 구축 (2주)
1. **핵심 엔진 개발**
   - ScraperEngine, ModuleLoader, TaskManager 구현
   - 인터페이스 정의 (IExtractor, IModule 등)
   - 공통 유틸리티 (HttpClient, Logger 등) 리팩토링

2. **설정 시스템 구축**
   - 전역 설정 관리
   - 모듈 레지스트리 시스템
   - 환경별 설정 분리

### Phase 2: 기존 코드 모듈화 (1주)
1. **네이버 지도 모듈 생성**
   - 기존 NaverStoreScraper를 NaverMapModule로 변환
   - ranking 기능으로 분리
   - 새 구조에 맞게 리팩토링

2. **호환성 유지**
   - 기존 index.js API 유지
   - 점진적 마이그레이션 지원

### Phase 3: 새 모듈 추가 (각 1주)
1. **네이버 스토어 모듈 개발**
2. **쿠팡 모듈 개발** 
3. **CLI 개선**

### Phase 4: 고도화 (2주)
1. **배치 처리 시스템**
2. **데이터 분석 기능**
3. **모니터링 및 대시보드**

---

## 확장 시나리오

### 1. 새 사이트 추가 시나리오

**예시: 11번가 모듈 추가**

```bash
# 1. 모듈 폴더 생성
mkdir -p src/modules/11st/{ranking,detail,shared}

# 2. 설정 파일 작성
# src/modules/11st/module.config.js

# 3. 추출기 구현
# src/modules/11st/ranking/RankingExtractor.js
# src/modules/11st/detail/DetailExtractor.js

# 4. 레지스트리 등록
# config/modules.registry.js에 추가

# 5. 즉시 사용 가능
node cli/scrape.js 11st ranking --keyword="치킨"
```

### 2. 새 기능 추가 시나리오

**예시: 리뷰 감정 분석 기능 추가**

```javascript
// 기존 모듈에 새 기능 추가
// modules/naver-map/sentiment/SentimentAnalyzer.js

class SentimentAnalyzer extends BaseExtractor {
  async extract(params) {
    const { storeId, reviewCount = 100 } = params;
    
    // 1. 리뷰 데이터 수집
    const reviews = await this.collectReviews(storeId, reviewCount);
    
    // 2. 감정 분석 수행
    const sentiment = await this.analyzeSentiment(reviews);
    
    return {
      storeId,
      totalReviews: reviews.length,
      sentiment: {
        positive: sentiment.positive,
        negative: sentiment.negative,
        neutral: sentiment.neutral
      },
      keywords: sentiment.keywords
    };
  }
}

// 사용법
const sentiment = await engine.execute('naver-map', 'sentiment', {
  storeId: 'store123',
  reviewCount: 200
});
```

### 3. 통합 분석 시나리오

**예시: 크로스 플랫폼 가격 비교**

```javascript
// 통합 분석 워크플로우
async function priceComparison(productKeyword) {
  const sites = ['coupang', 'naver-store', '11st'];
  
  // 모든 사이트에서 상품 검색
  const searchTasks = sites.map(site => ({
    site,
    feature: 'ranking',
    params: { keyword: productKeyword, maxResults: 20 }
  }));
  
  const searchResults = await engine.executeBatch(searchTasks);
  
  // 유사 상품 매칭 및 가격 비교
  const matcher = new ProductMatcher();
  const comparison = matcher.compareAcrossSites(searchResults);
  
  return {
    keyword: productKeyword,
    totalProducts: comparison.matchedProducts.length,
    priceRange: comparison.priceRange,
    bestDeals: comparison.bestDeals,
    siteComparison: comparison.siteStats
  };
}
```

---

## 기대 효과

### 1. 개발 효율성
- **신규 사이트 추가**: 2-3일 → 1일
- **새 기능 개발**: 1주 → 2-3일  
- **유지보수**: 전체 코드 수정 → 해당 모듈만 수정

### 2. 코드 품질
- **재사용성**: 공통 로직 80% 재사용
- **테스트**: 모듈별 독립 테스트 가능
- **안정성**: 모듈 격리로 장애 전파 방지

### 3. 확장성
- **수평 확장**: 무제한 사이트/기능 추가
- **수직 확장**: 분산 처리, 클러스터링 가능
- **플러그인 생태계**: 커뮤니티 기여 가능

---

## 결론

제안된 플러그인 기반 모듈 시스템은 현재의 네이버 지도 특화 구조를 **범용 스크래핑 플랫폼**으로 발전시킬 수 있는 확장 가능한 아키텍처입니다.

단계적 마이그레이션을 통해 기존 기능을 유지하면서도 새로운 사이트와 기능을 쉽게 추가할 수 있으며, 장기적으로는 강력한 데이터 수집 및 분석 플랫폼으로 성장할 수 있습니다.

---

*문서 작성일: 2025-08-20*  
*작성자: Claude*  
*버전: 1.0*