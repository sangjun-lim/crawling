# 네이버 스마트스토어 크롤링 방법 비교 분석

## 개요

본 문서는 네이버 스마트스토어 크롤링에서 Playwright(브라우저 자동화)와 CurlHttpClient(HTTP 클라이언트) 접근법을 비교 분석한 결과를 정리합니다.

## 테스트 환경

- **대상 상품**: 바른체어 사무용 메쉬 의자 (wodnr7762/7588460081)
- **테스트 일시**: 2025-08-23
- **네트워크 로그**: 193개 네트워크 요청, 112개 API 응답, 65개 요청 헤더 분석

## 방법별 비교 분석

### 1. Playwright (브라우저 자동화)

#### ✅ 장점
- **봇 탐지 우회 성공**: 실제 브라우저 환경으로 자연스러운 사용자 패턴 구현
- **완전한 JavaScript 실행**: SPA 및 동적 콘텐츠 처리 가능
- **자동 쿠키 관리**: 브라우저의 자동 쿠키 관리로 세션 유지
- **네트워크 모니터링**: 모든 요청/응답을 자동으로 캡처
- **데이터 수집 성공**: 상품 API에서 완전한 JSON 데이터 획득

#### ❌ 단점
- **높은 리소스 사용**: 브라우저 인스턴스 실행으로 메모리/CPU 집약적
- **상대적으로 느린 속도**: 페이지 로딩 및 렌더링 시간 포함
- **복잡한 환경 구성**: Chromium 설치 및 의존성 관리 필요
- **스케일링 제한**: 다중 브라우저 인스턴스 관리 복잡도

#### 📊 성능 지표
- **성공률**: 100% (봇 탐지 우회 성공)
- **데이터 품질**: 완전한 구조화된 JSON (455.8KB API 응답)
- **속도**: ~30-45초 (전체 브라우저 플로우)
- **리소스**: 높음 (브라우저 + 렌더링)

### 2. CurlHttpClient (HTTP 패턴 분석)

#### ✅ 장점
- **낮은 리소스 사용**: 순수 HTTP 요청으로 경량화
- **빠른 실행 속도**: 브라우저 오버헤드 없이 직접 API 호출
- **스케일링 용이**: 다중 동시 요청 처리 가능
- **패턴 학습 성공**: channelUid 동적 추출 구현
- **정확한 헤더 복제**: Playwright 분석 기반 요청 패턴 재현

#### ❌ 단점
- **봇 탐지 감지**: 429 Too Many Requests 오류 발생
- **쿠키/세션 복잡성**: 수동 쿠키 관리의 한계
- **JavaScript 미실행**: 동적 콘텐츠 처리 불가
- **패턴 의존성**: 사이트 변경 시 패턴 업데이트 필요

#### 📊 성능 지표
- **성공률**: 50% (channelUid 추출 성공, API 호출 실패)
- **데이터 품질**: channelUid 추출 성공, 최종 데이터 수집 실패
- **속도**: ~3-5초 (HTTP 요청만)
- **리소스**: 낮음 (순수 HTTP)

## 핵심 발견 사항

### 1. channelUid 동적 추출
```javascript
// 성공한 추출 패턴들
const extractionPatterns = [
    /"channelUid":"([a-zA-Z0-9]+)"/,
    /'channelUid':'([a-zA-Z0-9]+)'/,
    /channelUid:\s*["']([a-zA-Z0-9]+)["']/,
    /channels\/([a-zA-Z0-9]+)\/products/
];
```

### 2. 핵심 API 엔드포인트
```
https://smartstore.naver.com/i/v2/channels/{channelUid}/products/{productId}?withWindow=false
```

### 3. 필수 헤더 패턴
```javascript
const criticalHeaders = {
    'X-Client-Version': '20250820143019',  // 핵심 헤더
    'Referer': productUrl,
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...'
};
```

## 권장사항

### 개발/테스트 환경
- **Playwright 사용 권장**
- 안정적인 데이터 수집
- 완전한 디버깅 가능
- 네트워크 패턴 분석 용이

### 프로덕션 환경

#### 소량 크롤링 (1-100개/일)
- **Playwright 사용 권장**
- 높은 성공률 보장
- 안정적인 운영

#### 대량 크롤링 (1000개 이상/일)
- **하이브리드 접근법 권장**
  1. Playwright로 세션/쿠키 획득
  2. CurlHttpClient로 대량 데이터 수집
  3. 주기적으로 Playwright 세션 갱신

## 개선 방안

### CurlHttpClient 최적화
1. **세션 재사용**: Playwright에서 추출한 쿠키를 CurlHttpClient에 주입
2. **요청 간격 조정**: 429 오류 방지를 위한 지능형 지연
3. **User-Agent 로테이션**: 다양한 브라우저 시그니처 사용
4. **프록시 로테이션**: IP 분산을 통한 rate limit 우회

### 하이브리드 구조
```javascript
// 권장 하이브리드 패턴
class HybridScraper {
    async initialize() {
        // Playwright로 초기 세션 생성
        const session = await playwright.createSession();
        const cookies = await session.getCookies();
        
        // CurlHttpClient에 세션 정보 주입
        this.curlClient.injectCookies(domain, cookies);
        this.curlClient.setHeaders(session.getHeaders());
    }
    
    async crawlProducts(productIds) {
        // 대량 데이터는 CurlHttpClient로 처리
        return Promise.all(
            productIds.map(id => this.curlClient.crawl(id))
        );
    }
}
```

## 결론

1. **Playwright**: 봇 탐지 우회에서 뛰어난 성능, 개발/소량 크롤링에 최적
2. **CurlHttpClient**: 성능은 우수하나 봇 탐지에 취약, 패턴 분석을 통한 개선 가능
3. **하이브리드 접근**: 두 방법의 장점을 결합한 최적화된 솔루션

**최종 권장**: 현재 상황에서는 Playwright를 기본으로 사용하되, 대량 처리가 필요한 경우 하이브리드 접근법을 고려하는 것이 적절합니다.