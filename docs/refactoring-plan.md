# Node.js 스크래핑 프로젝트 리팩토링 계획

## 목표

현재 스크래핑 프로젝트를 체계적인 구조로 리팩토링하여 관심사 분리, 확장성, 유지보수성을 개선합니다.

## 현재 문제점

- HTTP 클라이언트와 브라우저 클라이언트가 명확히 분리되지 않음
- 스크래퍼들이 `core/` 폴더에 HTTP 클라이언트와 섞여 있음
- 서비스 레이어(저장, 로깅)가 `utils/`에 포함되어 있음
- 브라우저별 특화 설정과 도구 선택이 체계적이지 않음

## 새로운 디렉토리 구조

```
src/
├── clients/              # 통신 레이어 (HTTP, 브라우저)
├── scrapers/             # 스크래핑 비즈니스 로직
│   └── naver/           # 네이버 관련 스크래퍼들
│   └── coupang/         # 쿠팡 관련 스크래퍼들
├── services/             # 서비스 레이어 (저장, 로깅)
├── config/               # 설정 파일 (기존 유지)
├── graphql/              # GraphQL 관련 (기존 유지)
├── parsers/              # 파싱 로직 (기존 유지)
├── utils/                # 순수 유틸리티 (기존에서 축소)
└── index.js              # 메인 오케스트레이터
```

## 파일 이동 계획

### 1. clients/ 디렉토리 생성

**HTTP 클라이언트:**

- `src/core/HttpClient.js` → `src/clients/httpClient.js`
- `src/core/CurlHttpClient.js` → `src/clients/curlHttpClient.js`

**브라우저 클라이언트:**

- `src/clients/browserClientFactory.js` (신규 생성)
- `src/clients/puppeteerRealBrowserClient.js` (신규 생성)
- `src/clients/puppeteerClient.js` (신규 생성)
- `src/clients/playwrightClient.js` (신규 생성)

### 2. scrapers/ 디렉토리 통합

**네이버 스크래퍼들:**

- `src/core/NaverStoreScraper.js` → `src/scrapers/naver/naverStoreScraper.js`
- `src/core/NaverSmartStoreScraper.js` → `src/scrapers/naver/naverSmartStoreScraper.js`
- `src/core/NaverShoppingScraper.js` → `src/scrapers/naver/naverShoppingScraper.js`
- `src/core/NaverShoppingRealBrowserScraper.js` → `src/scrapers/naver/naverShoppingBrowserScraper.js`

**쿠팡 스크래퍼들:**

- `src/core/CoupangVendorScraper.js` → `src/scrapers/coupang/vendorScraper.js`
- `src/core/CoupangProductListScraper.js` → `src/scrapers/coupang/productListScraper.js`
- `src/core/CoupangCombinedScraper.js` → `src/scrapers/coupang/combinedScraper.js`

### 3. services/ 디렉토리 생성

**통합 저장 서비스:**

- `src/utils/FileUtils.js` + `src/core/CoupangDataStorage.js` → `src/services/storageService.js`
- 범용 저장(CSV/JSON)과 도메인 특화 저장을 하나의 서비스로 통합

**독립 로깅 서비스:**

- `src/utils/LogUtils.js` → `src/services/loggerService.js`

**공통 유틸리티:**

- `src/services/serviceUtils.js` (신규 생성 - 디렉토리 생성, 파일명 생성 등)

### 4. utils/ 디렉토리 정리

**유지할 파일들 (순수 유틸리티):**

- `src/utils/CoordinateUtils.js`
- `src/utils/AntiDetectionUtils.js`
- `src/utils/ProxyManager.js`

**이동할 파일들:**

- 저장 관련 → `services/`로 이동
- 로깅 관련 → `services/`로 이동

## 브라우저 클라이언트 설계

### 팩토리 패턴 적용

각 스크래퍼가 필요한 브라우저 도구와 설정을 선택할 수 있도록 팩토리 패턴을 적용합니다.

**지원할 브라우저 타입:**

- `puppeteer-real`: puppeteer-real-browser (안티 디텍션)
- `puppeteer`: 일반 Puppeteer
- `playwright`: Playwright
- `selenium`: Selenium (필요시)

### 스크래퍼별 브라우저 선택

**네이버 쇼핑:** puppeteer-real-browser (Gemini AI 캡차 해결, 전역 네트워크 모니터링)
**네이버 스마트스토어:** Playwright (API 응답 인터셉션, HTML 폴백)
**쿠팡:** HTTP-Only (브라우저 불필요, 순수 API 호출)
**일반적인 사이트:** Playwright 기본 권장

### 공통 설정 패턴

**안티 디텍션 설정:**

- Chrome 인수: `--disable-blink-features=AutomationControlled`
- 한국 로케일: `ko-KR`, `Asia/Seoul`
- 표준 뷰포트: 1920x1080 (데스크톱), 375x667 (모바일)

**공통 기능:**

- 프록시 지원, 자연스러운 지연시간 (800-2500ms)
- 인간 같은 타이핑, 마우스 움직임 시뮬레이션
- 세션 관리, 쿠키 처리, 에러 복구 (스크린샷)

## 코드 수정 범위

### 1. Import 경로 수정

모든 파일의 import 구문을 새로운 디렉토리 구조에 맞게 수정해야 합니다.

### 2. 브라우저 클라이언트 분리

기존 스크래퍼들에서 브라우저 관련 로직을 분리하여 클라이언트로 이동합니다.

### 3. 서비스 레이어 통합

저장과 로깅 로직을 서비스 레이어로 통합하여 일관된 인터페이스를 제공합니다.

### 4. 설정 파일 업데이트

새로운 구조에 맞춰 설정 파일들을 업데이트합니다.

## 실행 순서

### Phase 1: 준비 작업

1. 백업 생성
2. 새 브랜치 생성 (`git checkout -b refactor/structure`)
3. 새 디렉토리 구조 생성

### Phase 2: 기존 코드 분석 및 설계

1. **기존 파일들의 의존성 관계 매핑** ✅

   - 6단계 의존성 레벨 분석 완료
   - 고영향 파일 (constants.js, LogUtils.js, BaseScraper.js) 식별

2. **브라우저 클라이언트 팩토리 설계 분석** ✅

   - 3가지 브라우저 도구 패턴 분석: puppeteer-real, playwright, http-only
   - 공통 설정 및 사이트별 요구사항 매핑
   - 팩토리 패턴 설계 구조 정의

3. **서비스 인터페이스 설계 및 명세** ✅

   - 현재 서비스 패턴 분석: 저장(FileUtils, CoupangDataStorage), 로깅(LogUtils)
   - 공통 설정 패턴 식별: 생성자 기반 옵션, 환경변수 통합
   - 단순한 서비스 설계: BaseService 없이 독립적 서비스 + 공통 유틸리티

4. 이동 순서 계획 수립 (의존성 기반)
   - /docs/migration-plan.md 생성 완료.

### Phase 3: 병렬 구현 (복사 방식 - 안전함)

1. 기존 파일을 새 위치에 **복사** (이동하지 않음)
2. 복사된 파일들의 import 경로를 새 구조에 맞게 수정
3. 새로운 팩토리 클래스들 구현
4. 새 구조 파일들이 독립적으로 작동하는지 확인

### Phase 4: 의존성 순서대로 점진적 전환

**의존성 분석 결과 기반 6단계 전환:**

1. **Level 0 - 기반 파일들** (12개 파일)

   - `config/categories.js`, `config/constants.js`
   - GraphQL 쿼리 파일들 (`CommonQueries.js`, `RestaurantQueries.js` 등)
   - 독립적 유틸리티 (`AntiDetectionUtils.js`, `ProxyManager.js`)

2. **Level 1 - Config 의존 유틸리티** (7개 파일)

   - `utils/LogUtils.js` → `services/loggerService.js`
   - `utils/FileUtils.js` → `services/storageService.js`
   - `CoordinateUtils.js`, `CategoryDetector.js`, `BaseScraper.js` 등

3. **Level 2 - 클라이언트 레이어** (7개 파일)

   - `core/HttpClient.js` → `clients/httpClient.js`
   - `core/CurlHttpClient.js` → `clients/curlHttpClient.js`
   - GraphQL 페이로드 빌더들

4. **Level 3 - 중간 컴포넌트** (3개 파일)

   - `GraphQLBuilder.js`, `ResponseParser.js`
   - 특화 스크래퍼들 (`CoupangVendorScraper.js` 등)

5. **Level 4 - 복잡한 스크래퍼들** (6개 파일)

   - `core/CoupangCombinedScraper.js` → `scrapers/coupang/combinedScraper.js`
   - 네이버 스크래퍼들 → `scrapers/naver/`

6. **Level 5-6 - 최종 컴포넌트** (2개 파일)
   - `core/NaverStoreScraper.js` → `scrapers/naver/naverStoreScraper.js`
   - 메인 `index.js` 업데이트

**각 파일별 프로세스**: 복사 → import 수정 → 즉시 테스트 → git commit (체크포인트)

### Phase 5: 기존 파일 정리 및 통합

1. 모든 전환 완료 후 기존 `core/` 디렉토리 파일들 삭제
2. 중복 제거 및 코드 정리
3. 메인 `index.js`에서 새 구조 사용 확인
4. 사용하지 않는 파일들 제거

### Phase 6: 통합 테스트 및 문서 업데이트

1. 전체 시스템 통합 테스트
2. 각 모드별 동작 테스트 (map, smartstore, navershopping, coupang)
3. 에러 처리 및 성능 검증
4. CLAUDE.md 업데이트
5. README.md 업데이트
6. 새로운 구조 가이드 작성

### 위험 요소 및 안전 장치

**안전 장치:**

- 복사 방식 사용으로 기존 코드 보호
- 각 단계별 git commit으로 롤백 지점 확보
- 파일 단위 점진적 전환으로 문제 발생 지점 특정 용이
- 각 단계별 즉시 테스트로 빠른 피드백

**체크포인트:**

- Phase 3 완료 후: 새 구조 파일들이 독립적으로 작동하는지 확인
- Phase 4 각 Level 완료 후: 해당 레이어 정상 동작 확인
- Phase 5 완료 후: 전체 시스템 정상 동작 확인

**고영향 파일 우선 처리:**

- `config/constants.js` (8+ 파일이 의존) → Level 0에서 최우선 처리
- `utils/LogUtils.js` (4+ 파일이 의존) → Level 1에서 최우선 처리
- `BaseScraper.js` (4+ 스크래퍼가 상속) → Level 1에서 우선 처리

## 기대 효과

### 관심사 분리

- 데이터 통신 vs 비즈니스 로직 vs 서비스 레이어 명확 구분
- 각 레이어별 독립적인 테스트 가능

### 확장성

- 새 스크래핑 사이트 추가시 `scrapers/` 폴더에만 추가
- 새 브라우저 도구 지원시 `clients/`에만 추가

### 재사용성

- HTTP/브라우저 클라이언트를 여러 스크래퍼에서 공유
- 저장/로깅 서비스의 공통 사용

### 유지보수성

- 특정 사이트 변경시 해당 스크래퍼만 수정
- 브라우저 도구 변경시 클라이언트만 수정
- 저장 방식 변경시 서비스만 수정

## 위험 요소 및 대응

### 위험 요소

- Import 경로 수정 중 누락 가능성
- 기존 동작 방식 변경으로 인한 버그
- 브라우저 클라이언트 분리 중 설정 누락

### 대응 방안

- 단계적 이동 및 테스트
- 각 단계별 백업 생성
- 기존 동작과 새 구조 동시 테스트
- 상세한 테스트 케이스 작성

## 성공 기준

1. 모든 기존 기능이 새 구조에서도 정상 동작
2. 코드 가독성 및 유지보수성 향상
3. 새로운 스크래퍼 추가가 용이해짐
4. 브라우저 도구 변경이 용이해짐
5. 테스트 코드 작성이 용이해짐
