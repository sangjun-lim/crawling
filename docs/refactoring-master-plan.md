# 🏗️ 멀티 스크래퍼 리팩토링 마스터 플랜

## 📋 프로젝트 개요
- **현재 상태**: 3개의 거대한 단일 클래스 (NaverShoppingRealBrowserScraper 1848라인 등)
- **목표**: 모듈화된 확장 가능한 멀티 스크래퍼 아키텍처
- **예상 기간**: 3-4주 (단계별 진행)
- **위험도**: 중간 (기존 기능 유지하면서 점진적 리팩토링)

## 🎯 핵심 목표
1. **단일 책임 원칙** 적용으로 유지보수성 향상
2. **코드 재사용성** 극대화 (공통 모듈 분리)
3. **테스트 가능성** 향상 (모킹 및 단위 테스트)
4. **확장성** 확보 (새로운 스크래퍼 쉽게 추가)
5. **성능 최적화** (중복 코드 제거, 효율적인 구조)

## 📊 현재 상태 분석

### 3개 스크래퍼 현황
| 스크래퍼 | 파일 | 라인 수 | 주요 기능 | 복잡도 |
|---------|------|---------|----------|-------|
| NaverShopping | NaverShoppingRealBrowserScraper.js | 1,848 | 영수증 캡차, 가격비교 | 매우 높음 |
| SmartStore | (추정) SmartStoreScraper.js | ~800 | 상품 상세 정보 | 높음 |
| NaverMap | (추정) NaverMapScraper.js | ~600 | 지도 검색, 업체 정보 | 중간 |

### 공통 기능 분석
- ✅ **브라우저 조작**: 페이지 이동, 요소 찾기, 클릭, 입력
- ✅ **대기 로직**: 랜덤 대기, 요소 로딩 대기, 네비게이션 대기
- ✅ **에러 처리**: 타임아웃, 네트워크 오류, 요소 찾기 실패
- ✅ **파일 저장**: HTML, JSON, 이미지 저장
- ✅ **로깅**: 정보, 에러, 성공 메시지

### 개별 기능 분석
- 🔶 **캡차 처리**: NaverShopping만 복잡한 영수증 캡차
- 🔶 **데이터 파싱**: 각각 다른 구조 (JSON, HTML, API 응답)
- 🔶 **네비게이션 로직**: 서로 다른 페이지 플로우
- 🔶 **저장 형식**: 각각 다른 데이터 구조

## 🏗️ 목표 아키텍처

```
src/
├── common/                           # 공통 모듈 (모든 스크래퍼가 사용)
│   ├── base/
│   │   ├── BaseScraper.js            # 모든 스크래퍼의 베이스 클래스
│   │   ├── BaseHandler.js            # 모든 핸들러의 베이스 클래스
│   │   └── interfaces/               # TypeScript 인터페이스 (향후)
│   ├── handlers/
│   │   ├── BrowserHandler.js         # 공통 브라우저 조작
│   │   ├── NetworkMonitor.js         # 공통 네트워크 모니터링
│   │   ├── SecurityHandler.js        # 공통 보안 처리
│   │   └── FileHandler.js            # 공통 파일 처리
│   ├── utils/
│   │   ├── ElementFinder.js          # 요소 찾기 유틸리티
│   │   ├── WaitUtils.js              # 대기 관련 유틸리티
│   │   ├── RandomUtils.js            # 랜덤 생성 유틸리티
│   │   └── ValidationUtils.js        # 유효성 검사 유틸리티
│   ├── errors/
│   │   ├── ScrapingError.js          # 기본 스크래핑 에러
│   │   ├── NavigationError.js        # 네비게이션 관련 에러
│   │   ├── TimeoutError.js           # 타임아웃 관련 에러
│   │   └── ValidationError.js        # 유효성 검사 에러
│   └── config/
│       ├── CommonConstants.js        # 공통 상수
│       └── CommonSelectors.js        # 공통 셀렉터
│
├── scrapers/                         # 개별 스크래퍼들
│   ├── naver-shopping/
│   │   ├── NaverShoppingRealBrowserScraper.js  # 메인 클래스
│   │   ├── handlers/
│   │   │   ├── NaverShoppingCaptchaHandler.js
│   │   │   ├── NaverShoppingNavigationHandler.js
│   │   │   ├── NaverShoppingDataParser.js
│   │   │   └── NaverShoppingSecurityHandler.js
│   │   ├── config/
│   │   │   ├── constants.js
│   │   │   └── selectors.js
│   │   └── errors/
│   │       └── NaverShoppingError.js
│   │
│   ├── smart-store/
│   │   ├── SmartStoreScraper.js
│   │   ├── handlers/
│   │   │   ├── SmartStoreNavigationHandler.js
│   │   │   ├── SmartStoreDataParser.js
│   │   │   └── SmartStoreCaptchaHandler.js
│   │   ├── config/
│   │   │   ├── constants.js
│   │   │   └── selectors.js
│   │   └── errors/
│   │       └── SmartStoreError.js
│   │
│   └── naver-map/
│       ├── NaverMapScraper.js
│       ├── handlers/
│       │   ├── NaverMapNavigationHandler.js
│       │   └── NaverMapDataParser.js
│       ├── config/
│       │   ├── constants.js
│       │   └── selectors.js
│       └── errors/
│           └── NaverMapError.js
│
└── tests/                            # 테스트 파일들
    ├── common/                       # 공통 모듈 테스트
    ├── scrapers/                     # 개별 스크래퍼 테스트
    └── integration/                  # 통합 테스트
```

## 📅 단계별 실행 계획

### Phase 1: 분석 및 준비 (1주차)
- [ ] **1.1** 기존 코드 상세 분석
  - [ ] 3개 스크래퍼의 정확한 기능 및 차이점 파악
  - [ ] 공통 로직과 개별 로직 구분
  - [ ] 의존성 관계 분석
  - [ ] 현재 테스트 커버리지 확인

- [ ] **1.2** 공통 모듈 설계
  - [ ] BaseScraper 인터페이스 설계
  - [ ] BaseHandler 추상 클래스 설계  
  - [ ] 공통 유틸리티 함수 목록 작성
  - [ ] 에러 계층 구조 설계

- [ ] **1.3** 디렉토리 구조 생성
  - [ ] 새로운 폴더 구조 생성
  - [ ] 기본 파일들 생성 (빈 클래스)
  - [ ] package.json 스크립트 업데이트

### Phase 2: 공통 모듈 구현 (2주차)
- [ ] **2.1** 기본 클래스들 구현
  - [ ] BaseScraper 클래스 구현
  - [ ] BaseHandler 추상 클래스 구현
  - [ ] 공통 에러 클래스들 구현

- [ ] **2.2** 공통 핸들러 구현
  - [ ] BrowserHandler (브라우저 조작)
  - [ ] NetworkMonitor (네트워크 모니터링)
  - [ ] FileHandler (파일 저장/로드)
  - [ ] SecurityHandler (기본 보안 처리)

- [ ] **2.3** 공통 유틸리티 구현
  - [ ] ElementFinder (요소 찾기)
  - [ ] WaitUtils (대기 로직)
  - [ ] RandomUtils (랜덤 값 생성)
  - [ ] ValidationUtils (유효성 검사)

- [ ] **2.4** 공통 모듈 테스트 작성
  - [ ] 단위 테스트 작성
  - [ ] 모킹 전략 수립
  - [ ] 테스트 실행 환경 구성

### Phase 3: NaverShopping 리팩토링 (3주차)
- [ ] **3.1** NaverShopping 핸들러 분리
  - [ ] CaptchaHandler 분리 (가장 복잡한 부분)
  - [ ] NavigationHandler 분리
  - [ ] DataParser 분리
  - [ ] SecurityHandler 분리

- [ ] **3.2** 메인 클래스 리팩토링
  - [ ] Orchestrator 패턴 적용
  - [ ] 의존성 주입 구현
  - [ ] 큰 메서드들 분해
  - [ ] 설정 파일 분리

- [ ] **3.3** 테스트 및 검증
  - [ ] 기존 기능 테스트
  - [ ] 새로운 단위 테스트 작성
  - [ ] 통합 테스트 실행
  - [ ] 성능 비교

### Phase 4: 나머지 스크래퍼 리팩토링 (4주차)
- [ ] **4.1** SmartStore 리팩토링
  - [ ] 기존 코드 분석 및 핸들러 분리
  - [ ] 공통 모듈 활용
  - [ ] 개별 특성 반영

- [ ] **4.2** NaverMap 리팩토링
  - [ ] 기존 코드 분석 및 핸들러 분리
  - [ ] 공통 모듈 활용
  - [ ] 개별 특성 반영

- [ ] **4.3** 최종 통합 및 최적화
  - [ ] 모든 스크래퍼 통합 테스트
  - [ ] 성능 최적화
  - [ ] 문서화 완료
  - [ ] 코드 리뷰 및 정리

## ⚠️ 위험 요소 및 대응 방안

### 위험 요소
1. **기존 기능 손상**: 리팩토링 과정에서 기존 기능이 깨질 수 있음
2. **복잡한 의존성**: 코드 간 의존성이 복잡하여 분리가 어려울 수 있음
3. **테스트 부족**: 현재 테스트가 부족하여 리팩토링 검증이 어려움
4. **시간 오버**: 예상보다 복잡하여 시간이 오래 걸릴 수 있음

### 대응 방안
1. **점진적 리팩토링**: 한 번에 모든 것을 바꾸지 않고 단계별 진행
2. **백업 및 버전 관리**: 각 단계별로 브랜치 생성, 롤백 가능하게 관리
3. **테스트 우선**: 리팩토링 전에 기존 기능에 대한 테스트부터 작성
4. **병렬 개발**: 기존 코드를 유지하면서 새로운 구조 병렬 개발

## 🎯 성공 지표

### 정량적 지표
- **코드 라인 수**: 총 3,000+ → 2,000 이하 (중복 제거)
- **파일 수**: 3개 거대 파일 → 30+ 작은 모듈
- **순환 복잡도**: 평균 20+ → 10 이하
- **테스트 커버리지**: 0% → 80% 이상
- **성능**: 기존 대비 동일하거나 향상

### 정성적 지표
- **가독성**: 새로운 개발자가 쉽게 이해할 수 있는 구조
- **확장성**: 새로운 스크래퍼 추가 시 2-3일 내 개발 가능
- **유지보수성**: 버그 수정이나 기능 추가가 쉬워짐
- **안정성**: 리팩토링 후에도 기존 기능 100% 동작

## 🚀 시작 전 체크리스트

- [ ] 현재 스크래퍼들의 모든 기능 테스트
- [ ] 테스트 데이터 및 시나리오 준비
- [ ] 백업 브랜치 생성
- [ ] 개발 환경 설정
- [ ] 진행 상황 추적 도구 준비

---

**다음 단계**: Phase 1.1 기존 코드 상세 분석부터 시작

*이 문서는 리팩토링 진행에 따라 지속적으로 업데이트됩니다.*