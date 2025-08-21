# 네이버 지도 매장 스크래퍼 코드 구조 분석

## 프로젝트 개요
네이버 지도 API를 활용하여 특정 키워드로 매장 정보를 검색하고 순위를 추출하는 웹 스크래핑 도구

## 파일 구조

### 1. index.js (메인 엔트리 포인트)
**역할**: 애플리케이션의 진입점 및 실행 제어

**주요 기능**:
- `NaverStoreScraper` 클래스 인스턴스 생성
- 커맨드라인 인수에서 검색 키워드 수집 (기본값: '치킨')
- 검색 실행 및 결과 처리
- CSV 파일로 결과 저장
- 에러 핸들링

**코드 플로우**:
```
1. 스크래퍼 인스턴스 생성
2. 키워드 검색 실행 (scraper.searchStores)
3. 결과 출력 (scraper.displayResults)
4. CSV 파일 저장 (scraper.saveToCsv)
```

### 2. naverScraper.js (핵심 스크래핑 로직)
**역할**: 네이버 지도 GraphQL API와의 통신 및 데이터 처리

#### 클래스 구조: NaverStoreScraper

**생성자 설정**:
- 기본 좌표 설정 (서울 중심)
- 페이지네이션 설정 (최대 5페이지, 페이지당 70개)
- HTTP 세션 구성
- 타임아웃 및 리다이렉트 설정

**주요 메서드**:

1. **createHttpSession()**
   - axios 인스턴스 생성
   - User-Agent 및 헤더 설정
   - 브라우저 환경 시뮬레이션

2. **setupInterceptors()**
   - 응답 인터셉터 설정
   - 리다이렉트 감지 및 로깅

3. **searchStores(keyword, maxResults)**
   - 메인 검색 인터페이스
   - 결과 제한 및 순위 매기기

4. **fetchStoresFromNaverMap(keyword)**
   - 네이버 지도 GraphQL API 호출
   - 다중 페이지 처리
   - Rate limiting (500ms 간격)
   - 에러 처리 및 로깅

5. **buildGraphQLPayload(keyword, display, start, adStart)**
   - GraphQL 쿼리 페이로드 생성
   - 두 개의 동시 쿼리:
     - `getRestaurants`: 일반 매장 검색
     - `getAdBusinessList`: 광고 매장 검색

6. **buildWtmGraphqlHeader(keyword)**
   - 네이버 API 인증 헤더 생성
   - Base64 인코딩된 메타데이터

7. **parseStoresFromGraphQLResponse(responseData, page)**
   - GraphQL 응답 파싱
   - 일반 매장과 광고 매장 구분
   - 데이터 정규화

8. **normalizeStoreData(restaurant)**
   - 매장 데이터 표준화
   - 다양한 필드명 통합 처리

9. **saveToCsv(data, filename)**
   - CSV 파일 생성
   - 한글 헤더 및 UTF-8 인코딩

10. **displayResults(data)**
    - 콘솔 결과 출력
    - 광고/일반 매장 구분 표시

## API 통신 구조

### GraphQL 엔드포인트
- URL: `https://pcmap-api.place.naver.com/graphql`
- 두 개의 동시 쿼리 실행

### 인증 및 헤더
- `x-wtm-graphql`: Base64 인코딩된 검색 메타데이터
- `User-Agent`: Chrome 브라우저 시뮬레이션
- CORS 및 보안 헤더 설정

### 데이터 구조
**입력 매개변수**:
- 검색 키워드
- 좌표 정보 (x, y, bounds)
- 페이지네이션 (start, display)
- 디바이스 타입 (pcmap)

**출력 데이터**:
- 매장명, 카테고리, 주소
- 전화번호, 평점, 리뷰수
- 거리, 저장수
- 광고 여부 및 광고 ID

## 주요 특징

1. **안정성**:
   - 에러 핸들링 및 로깅
   - Rate limiting으로 차단 방지
   - 응답 데이터 파일 저장

2. **확장성**:
   - 설정 가능한 페이지 수
   - 다양한 출력 형식 지원
   - 모듈화된 구조

3. **데이터 품질**:
   - 광고/일반 매장 구분
   - 순위 정보 제공
   - 데이터 정규화

## 사용 예시

```bash
node index.js 치킨    # 치킨 매장 검색
node index.js 카페    # 카페 검색
node index.js        # 기본값(치킨) 검색
```

## 출력 파일
- CSV: `naver_stores_{keyword}_{timestamp}.csv`
- 응답 로그: `response_{keyword}_page{N}_{timestamp}.json`
- 에러 로그: `error_response_{keyword}_{timestamp}.json`