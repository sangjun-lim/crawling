# Playwright 브라우저 자동화 우회 전략

Playwright를 실제 브라우저처럼 인식하게 만드는 전략 가이드입니다.

## 1. User-Agent 및 헤더 설정

### 실제 브라우저 User-Agent 사용

```javascript
const { chromium } = require('playwright');

// User-Agent를 실행 시 설정
const browser = await chromium.launch({
  args: [
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
});

// 또는 context 설정에서
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
});
```

### 추가 헤더 설정

```javascript
// HTTP 헤더 설정
await context.setExtraHTTPHeaders({
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
});
```

## 2. WebDriver 속성 숨기기

### Navigator 속성 조작

```javascript
// WebDriver 탐지 방지
await page.evaluateOnNewDocument(() => {
  // webdriver 속성 제거
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
  });

  // plugins 배열 추가
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // languages 설정
  Object.defineProperty(navigator, 'languages', {
    get: () => ['ko-KR', 'ko', 'en-US', 'en'],
  });

  // chrome 객체 추가 (Chrome 브라우저인 경우)
  window.chrome = {
    runtime: {},
  };

  // permissions API 수정
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: 'granted' });
    }
    return originalQuery(parameters);
  };
});
```

### 자동화 도구 탐지 스크립트 무력화

```javascript
await page.evaluateOnNewDocument(() => {
  // PhantomJS 탐지 방지
  delete window.callPhantom;
  delete window._phantom;

  // Selenium IDE 탐지 방지
  delete window.__webdriver_evaluate;
  delete window.__selenium_evaluate;
  delete window.__webdriver_script_function;
  delete window.__webdriver_script_func;
  delete window.__webdriver_script_fn;
  delete window.__fxdriver_evaluate;
  delete window.__driver_unwrapped;
  delete window.__webdriver_unwrapped;
  delete window.__driver_evaluate;
  delete window.__selenium_unwrapped;
  delete window.__fxdriver_unwrapped;

  // CDP 런타임 숨기기
  delete window.__playwright;
  delete window.__puppeteer;
});
```

## 3. 브라우저 설정 최적화

### Playwright Chromium 실행 옵션 설정

```javascript
const { chromium } = require('playwright');

const browser = await chromium.launch({
  headless: false, // 헤드리스 모드 비활성화 (탐지 방지)
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-extensions',
    '--disable-plugins',
    '--disable-default-apps',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-field-trial-config',
    '--disable-back-forward-cache',
    '--disable-ipc-flooding-protection',
    '--no-default-browser-check',
    '--no-pings',
    '--password-store=basic',
    '--use-mock-keychain',
  ],
  ignoreDefaultArgs: ['--enable-automation'], // 자동화 플래그 제거
});
```

## 4. 행동 패턴 모방

### 인간다운 동작 시뮬레이션

```javascript
// 랜덤 지연 시간
const randomDelay = () => Math.floor(Math.random() * 2000) + 1000;

// 마우스 움직임 시뮬레이션
const viewport = page.viewportSize();
await page.mouse.move(Math.random() * viewport.width, Math.random() * viewport.height);
await page.waitForTimeout(randomDelay());

// 자연스러운 스크롤 동작
await page.evaluate(async () => {
  const scrollHeight = document.body.scrollHeight;
  const viewportHeight = window.innerHeight;
  const scrollStep = viewportHeight / 4;
  
  for (let y = 0; y < scrollHeight; y += scrollStep) {
    window.scrollTo(0, y);
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
  }
});

// 페이지 간 이동시 지연
await page.waitForTimeout(randomDelay());

// 마우스 클릭 전 자연스러운 hover
await page.hover('selector');
await page.waitForTimeout(500 + Math.random() * 500);
await page.click('selector');
```

### 세션 관리

```javascript
// 쿠키 및 로컬 스토리지 유지
const context = await browser.newContext({
  storageState: './session/state.json', // 이전 세션 상태 로드
});

// 세션 종료시 상태 저장
await context.storageState({ path: './session/state.json' });

// 특정 쿠키 설정
await context.addCookies([
  {
    name: 'session_id',
    value: 'your_session_value',
    domain: '.naver.com',
    path: '/',
  }
]);
```

## 5. 프록시 및 IP 로테이션

### 프록시 설정

```javascript
const context = await browser.newContext({
  proxy: {
    server: 'http://proxy-server:port',
    username: 'username',
    password: 'password',
  },
});
```

### IP 로테이션 전략

```javascript
const proxies = [
  'http://proxy1:port',
  'http://proxy2:port',
  'http://proxy3:port',
];

let currentProxyIndex = 0;

const getNextProxy = () => {
  const proxy = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  return proxy;
};
```

## 6. 고급 탐지 방지 기법

### Canvas Fingerprinting 방지

```javascript
await page.evaluateOnNewDocument(() => {
  const getImageData = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (type) {
    if (type === 'image/png' && this.width === 220 && this.height === 30) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    }
    return getImageData.apply(this, arguments);
  };
});
```

### WebGL Fingerprinting 방지

```javascript
await page.evaluateOnNewDocument(() => {
  const getParameter = WebGLRenderingContext.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) {
      return 'Intel Inc.';
    }
    if (parameter === 37446) {
      return 'Intel Iris OpenGL Engine';
    }
    return getParameter(parameter);
  };
});
```

## 7. 모니터링 및 디버깅

### 탐지 여부 확인

```javascript
// 자동화 탐지 확인 페이지 방문
await page.goto('https://bot.sannysoft.com/');
await page.screenshot({ path: 'detection-test.png' });

// 콘솔 에러 모니터링
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    console.log('Console error:', msg.text());
  }
});

// 네트워크 요청 모니터링
page.on('response', (response) => {
  if (response.status() >= 400) {
    console.log(`HTTP Error: ${response.status()} - ${response.url()}`);
  }
});
```

## 8. 실전 적용 예시

### 네이버 크롤링용 최적화 설정

```javascript
const { chromium } = require('playwright');

async function createStealthBrowser() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 50, // 동작 속도 조절
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const context = await browser.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    }
  });

  // 탐지 방지 스크립트 주입
  await context.addInitScript(() => {
    // Navigator 속성 조작
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
    
    // Runtime 객체 제거
    delete window.__playwright;
    delete window.__puppeteer;
    
    // Chrome 객체 추가
    window.chrome = { runtime: {} };
    
    // 자동화 관련 속성 제거
    delete window.__webdriver_evaluate;
    delete window.__selenium_evaluate;
    delete window.__webdriver_script_function;
  });

  return { browser, context };
}

// 사용 예시
async function crawlNaver() {
  const { browser, context } = await createStealthBrowser();
  const page = await context.newPage();
  
  try {
    await page.goto('https://map.naver.com/', { waitUntil: 'networkidle' });
    // 크롤링 작업 수행
    
  } finally {
    await browser.close();
  }
}
```

## 9. 주의사항

1. **법적 준수**: 웹사이트의 robots.txt 및 이용약관을 준수하세요
2. **요청 빈도 제한**: 과도한 요청으로 서버에 부하를 주지 마세요
3. **데이터 사용**: 수집된 데이터의 사용 목적과 범위를 명확히 하세요
4. **업데이트 대응**: 탐지 시스템도 지속적으로 발전하므로 정기적인 업데이트가 필요합니다

## 10. Playwright 전용 도구 및 팁

### 추가 유용한 설정

```javascript
// Device 에뮬레이션 사용
const { devices } = require('playwright');
const iPhone = devices['iPhone 12'];

const context = await browser.newContext({
  ...iPhone,
  locale: 'ko-KR'
});

// 네트워크 조건 시뮬레이션
await context.route('**/*', route => {
  // 요청 지연 추가
  setTimeout(() => {
    route.continue();
  }, 100 + Math.random() * 200);
});

// 이미지 로딩 차단 (속도 향상)
await context.route('**/*.{png,jpg,jpeg,gif,svg}', route => {
  route.abort();
});
```

## 11. 참고 자료

- [Playwright 공식 문서](https://playwright.dev/)
- [Playwright Extra 플러그인](https://github.com/microsoft/playwright-extra)
- [Bot Detection 테스트 사이트](https://bot.sannysoft.com/)
- [브라우저 Fingerprinting 테스트](https://browserleaks.com/)
- [Playwright 한국어 가이드](https://playwright.dev/docs/intro)
