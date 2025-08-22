# Playwright + HttpClient 하이브리드 방식 설계서

## 개요

네이버 스마트스토어 스크래핑에서 JavaScript로 동적 생성되는 상품 링크 문제를 해결하기 위한 하이브리드 접근법 (Playwright Stealth 모드 적용)

## 문제 분석

### 현재 문제점
- 네이버 검색 결과에서 상품 링크가 JavaScript로 동적 생성됨
- HTML 응답에는 실제 상품 URL이 포함되지 않음
- 브라우저에서만 실행되는 JavaScript가 리다이렉트 URL을 생성
- 예시: `https://search.naver.com/p/crd/rd?...&u=실제URL`

### 기존 방식의 한계
1. **HTML 파싱만으로는 불가능**: 동적 생성 링크는 HTML에 없음
2. **Pure HttpClient 방식**: JavaScript 실행 불가
3. **JSDOM 방식**: 네이버 복잡한 JS 실행 환경 시뮬레이션 어려움
4. **봇 탐지 우회 필요**: 네이버의 고도화된 봇 탐지 시스템 대응

## 해결 방안: 하이브리드 아키텍처

### 핵심 아이디어
1. **Playwright with Stealth**: 동적 링크 생성 + 실제 브라우저 쿠키 획득 + 봇 탐지 우회
2. **HttpClient**: 빠른 HTTP 요청 + 기존 파싱 로직 재사용
3. **최소한의 브라우저 사용**: 검색 단계에서만 Playwright 활용
4. **Stealth 모드**: navigator.webdriver 제거, 사용자 에이전트 정규화, 자동화 흔적 은폐

## 상세 설계

### 1. 전체 프로세스 플로우

```
[시작] 
  ↓
[Playwright로 네이버 검색]
  ↓
[JavaScript 실행 대기]
  ↓
[동적 생성된 상품 링크 추출]
  ↓
[브라우저 쿠키 추출]
  ↓
[Playwright 종료]
  ↓
[HttpClient에 쿠키 전달]
  ↓
[HttpClient로 상품 페이지 요청]
  ↓
[기존 파싱 로직으로 데이터 추출]
  ↓
[결과 반환]
```

### 2. 클래스 구조 변경

```javascript
class NaverSmartStoreScraper {
  constructor(options = {}) {
    this.options = {
      ...options,
      enableCookies: true,
      timeout: 30000,
      usePlaywright: options.usePlaywright !== false, // 기본값: true
      stealthMode: options.stealthMode !== false // 기본값: true (stealth 모드 활성화)
    };
    
    this.httpClient = new HttpClient(this.options);
    this.browser = null;
    this.page = null;
    this.playwright = null;
  }

  // 메인 스크래핑 메서드
  async scrapeProducts(keyword, maxResults = 5)
  
  // Playwright 관련 메서드들
  async initializeBrowser()
  async extractLinksWithPlaywright(keyword)
  async closeBrowser()
  
  // 쿠키 전달 메서드
  async transferCookiesToHttpClient(playwrightCookies)
  
  // 기존 HttpClient 활용 메서드들 (재사용)
  async scrapeProductInfo(productUrl)
  parseProductData(html, url)
  // ...기타 메서드들
}
```

### 3. 핵심 메서드 상세 설계

#### 3.1 extractLinksWithPlaywright(keyword)

```javascript
async extractLinksWithPlaywright(keyword) {
  try {
    // 브라우저 초기화 (Stealth 모드 포함)
    await this.initializeBrowser();
    
    // 1단계: 네이버 메인 페이지 방문 (쿠키 획득)
    await this.page.goto('https://www.naver.com', { waitUntil: 'networkidle' });
    
    // 2단계: 검색 수행
    const searchUrl = `https://search.naver.com/search.naver`;
    await this.page.goto(searchUrl + '?' + new URLSearchParams({
      where: 'nexearch',
      sm: 'top_hty',
      fbm: '0',
      ie: 'utf8',
      query: keyword,
      ackey: '779nr34o'
    }), { waitUntil: 'networkidle' });
    
    // 3단계: JavaScript 실행 완료까지 대기
    await this.page.waitForSelector('.price_compare_section', { timeout: 10000 });
    
    // 4단계: 동적 생성된 상품 링크 추출
    const links = await this.page.evaluate(() => {
      // 브라우저 환경에서 실행되는 코드
      const linkElements = document.querySelectorAll('.product_link');
      return Array.from(linkElements).map(el => el.href);
    });
    
    // 5단계: 쿠키 추출
    const cookies = await this.page.context().cookies();
    
    return { links, cookies };
    
  } catch (error) {
    console.error('Playwright 링크 추출 실패:', error.message);
    throw error;
  }
}
```

#### 3.2 transferCookiesToHttpClient(playwrightCookies)

```javascript
async transferCookiesToHttpClient(playwrightCookies) {
  try {
    // Playwright 쿠키를 tough-cookie 형식으로 변환
    for (const cookie of playwrightCookies) {
      let cookieString = `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`;
      
      if (cookie.expires && cookie.expires !== -1) {
        cookieString += `; Expires=${new Date(cookie.expires * 1000).toUTCString()}`;
      }
      
      if (cookie.httpOnly) {
        cookieString += '; HttpOnly';
      }
      
      if (cookie.secure) {
        cookieString += '; Secure';
      }
      
      if (cookie.sameSite) {
        cookieString += `; SameSite=${cookie.sameSite}`;
      }
      
      // HttpClient의 쿠키저장소에 추가
      await this.httpClient.cookieJar.setCookie(cookieString, cookie.domain);
    }
    
    console.log(`${playwrightCookies.length}개 쿠키를 HttpClient에 전달 완료`);
    
  } catch (error) {
    console.error('쿠키 전달 실패:', error.message);
    throw error;
  }
}
```

#### 3.3 수정된 scrapeProducts 메서드

```javascript
async scrapeProducts(keyword, maxResults = 5) {
  try {
    console.log(`네이버 스마트스토어 상품 수집 시작: ${keyword}`);
    
    // 1단계: Playwright로 동적 링크와 쿠키 추출
    const { links, cookies } = await this.extractLinksWithPlaywright(keyword);
    
    if (links.length === 0) {
      console.log('상품 링크를 찾을 수 없습니다.');
      return [];
    }
    
    // 2단계: 브라우저 종료 (리소스 절약)
    await this.closeBrowser();
    
    // 3단계: 쿠키를 HttpClient에 전달
    await this.transferCookiesToHttpClient(cookies);
    
    // 4단계: 첫 번째 상품 정보만 HttpClient로 수집
    const products = [];
    const firstLink = links[0];
    
    console.log(`[1/1] 첫 번째 상품 수집 중: ${firstLink}`);
    
    const productInfo = await this.scrapeProductInfo(firstLink);
    if (productInfo) {
      products.push(productInfo);
    }
    
    // 5단계: 결과 저장
    if (products.length > 0) {
      await this.saveResults(products, keyword);
    }
    
    console.log(`수집 완료: 총 ${products.length}개 상품`);
    return products;
    
  } catch (error) {
    console.error('스크래핑 실패:', error.message);
    await this.closeBrowser(); // 에러 시에도 브라우저 정리
    return [];
  }
}
```

### 4. 브라우저 관리

#### 4.1 브라우저 초기화

```javascript
async initializeBrowser() {
  if (!this.playwright) {
    if (this.options.stealthMode) {
      const { chromium } = require('playwright-extra');
      const stealth = require('playwright-extra-plugin-stealth');
      chromium.use(stealth());
      this.playwright = chromium;
    } else {
      const { chromium } = require('playwright');
      this.playwright = chromium;
    }
    
    this.browser = await this.playwright.launch({
      headless: true, // 백그라운드 실행
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ]
    });
  }
  
  if (!this.page) {
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul'
    });
    
    this.page = await context.newPage();
    
    // 추가 Stealth 설정
    if (this.options.stealthMode) {
      await this.page.addInitScript(() => {
        // navigator.webdriver 제거
        delete Object.getPrototypeOf(navigator).webdriver;
        
        // chrome 객체 추가 (정상 브라우저처럼 보이게)
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        
        // 언어 설정
        Object.defineProperty(navigator, 'languages', {
          get: () => ['ko-KR', 'ko', 'en-US', 'en']
        });
      });
    }
  }
}
```

#### 4.2 브라우저 정리

```javascript
async closeBrowser() {
  try {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    this.playwright = null;
  } catch (error) {
    console.error('브라우저 종료 실패:', error.message);
  }
}
```

### 5. 에러 핸들링 및 폴백

#### 5.1 폴백 메커니즘

```javascript
async scrapeProducts(keyword, maxResults = 5) {
  try {
    // Playwright 방식 시도
    if (this.options.usePlaywright) {
      return await this.scrapeWithPlaywright(keyword, maxResults);
    }
  } catch (playwrightError) {
    console.warn('Playwright 방식 실패, HttpClient 방식으로 폴백:', playwrightError.message);
  }
  
  // 기존 HttpClient 방식으로 폴백
  return await this.scrapeWithHttpClient(keyword, maxResults);
}
```

#### 5.2 타임아웃 및 재시도

```javascript
// Playwright 작업에 타임아웃 설정
const PLAYWRIGHT_TIMEOUT = 30000; // 30초

async extractLinksWithPlaywright(keyword) {
  return Promise.race([
    this._extractLinksWithPlaywright(keyword),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Playwright 타임아웃')), PLAYWRIGHT_TIMEOUT)
    )
  ]);
}
```

### 6. 성능 최적화

#### 6.1 브라우저 재사용
- 동일 세션에서 여러 검색 시 브라우저 재사용
- 검색 완료 후 페이지만 새로고침

#### 6.2 리소스 차단
```javascript
await this.page.route('**/*', (route) => {
  const resourceType = route.request().resourceType();
  // 불필요한 리소스 차단으로 속도 향상
  if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
    route.abort();
  } else {
    route.continue();
  }
});
```

### 7. 설정 옵션

```javascript
const scraperOptions = {
  // HttpClient 옵션들
  enableCookies: true,
  timeout: 30000,
  
  // Playwright 옵션들
  usePlaywright: true,
  stealthMode: true,
  headless: true,
  playwrightTimeout: 30000,
  
  // 폴백 옵션
  fallbackToHttpClient: true
};
```

## 구현 단계

### Phase 1: 기본 구조 구현
1. Playwright 및 playwright-extra 의존성 추가
   ```bash
   npm install playwright playwright-extra playwright-extra-plugin-stealth
   ```
2. 브라우저 관리 메서드 구현 (Stealth 모드 포함)
3. 기본 링크 추출 로직 구현

### Phase 2: 쿠키 전달 구현
1. Playwright 쿠키 추출
2. tough-cookie 형식 변환
3. HttpClient 쿠키저장소 연동

### Phase 3: 통합 및 테스트
1. 전체 플로우 통합
2. 에러 핸들링 및 폴백 구현
3. 성능 최적화 적용

### Phase 4: 개선 및 안정화
1. 재시도 로직 구현
2. 로깅 개선
3. 메모리 누수 방지

## 예상 효과

### 장점
1. **확실한 동적 링크 추출**: 실제 브라우저 환경에서 JavaScript 실행
2. **정확한 쿠키 관리**: 브라우저에서 생성된 실제 쿠키 활용
3. **기존 코드 재사용**: HttpClient와 파싱 로직 그대로 활용
4. **성능 효율성**: 최소한의 브라우저 사용 (검색 단계만)
5. **강화된 봇 탐지 우회**: Stealth 모드로 navigator.webdriver 제거, 자동화 흔적 은폐
6. **Playwright의 안정성**: Puppeteer 대비 더 안정적이고 빠른 브라우저 자동화

### 단점
1. **추가 의존성**: Playwright 및 stealth 플러그인 패키지 필요
2. **메모리 사용량 증가**: 브라우저 프로세스 실행
3. **복잡성 증가**: 두 가지 HTTP 클라이언트 관리
4. **Stealth 모드 한계**: 고도화된 봇 탐지 시스템에는 완전하지 않음

### 성능 비교
- **기존 방식**: 빠르지만 동적 링크 추출 불가
- **Pure Playwright**: 모든 요청을 브라우저로 처리 (느림)
- **하이브리드 방식**: 검색만 브라우저, 나머지는 HttpClient (균형)
- **Stealth 모드**: 약간의 성능 오버헤드 있지만 탐지 우회 효과 크게 향상

## 결론

Playwright + HttpClient 하이브리드 방식은 네이버 스마트스토어의 동적 링크 생성 문제를 효과적으로 해결하면서도, Stealth 모드를 통한 봇 탐지 우회와 기존 코드 자산을 최대한 활용할 수 있는 실용적인 솔루션입니다. Playwright의 안정성과 playwright-extra-plugin-stealth의 탐지 우회 기능을 조합하여 네이버의 고도화된 봇 방어 시스템에 대응할 수 있습니다.