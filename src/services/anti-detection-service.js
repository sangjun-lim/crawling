class AntiDetectionService {
  constructor() {
    this.userAgents = [
      // Chrome - 다양한 버전
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      
      // Safari
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
      
      // Edge
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
      
      // Mobile Chrome
      'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
    ];
    
    this.mobileUserAgents = [
      'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 11; SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 12; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
    ];
    
    this.currentUserAgent = this.userAgents[0];
    this.crawlCount = 0;
    this.sessionResetInterval = 100; // 100번마다 세션 리셋
    this.lastUserAgentChange = Date.now();
    this.userAgentChangeInterval = 30 * 60 * 1000; // 30분마다 변경
  }

  /**
   * 랜덤 User-Agent 선택
   */
  getRandomUserAgent(mobile = false) {
    const agents = mobile ? this.mobileUserAgents : this.userAgents;
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * 현재 User-Agent 반환 (간헐적 변경 체크)
   */
  getCurrentUserAgent(mobile = false) {
    const now = Date.now();
    
    // 30분마다 또는 랜덤하게 User-Agent 변경
    if (now - this.lastUserAgentChange > this.userAgentChangeInterval || 
        Math.random() < 0.05) { // 5% 확률로 즉시 변경
      
      this.currentUserAgent = this.getRandomUserAgent(mobile);
      this.lastUserAgentChange = now;
      console.log(`🔄 User-Agent 변경: ${this.currentUserAgent.substring(0, 50)}...`);
    }
    
    return this.currentUserAgent;
  }

  /**
   * 크롤링 카운터 증가 및 세션 리셋 체크
   */
  incrementCrawlCount() {
    this.crawlCount++;
    console.log(`📊 크롤링 카운트: ${this.crawlCount}`);
    
    return this.crawlCount % this.sessionResetInterval === 0;
  }

  /**
   * 세션 리셋 필요 여부 확인
   */
  shouldResetSession() {
    return this.crawlCount % this.sessionResetInterval === 0;
  }

  /**
   * 랜덤 딜레이 생성 (자연스러운 크롤링 패턴)
   */
  getRandomDelay(min = 1000, max = 5000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 마우스 움직임을 자연스럽게 시뮬레이션
   * @param {Page} page - Playwright page 인스턴스
   * @param {Object} from - 시작 좌표 {x, y}
   * @param {Object} to - 끝 좌표 {x, y}
   * @param {number} steps - 중간 스텝 수 (기본값: 10)
   */
  static async naturalMouseMovement(page, from, to, steps = 10) {
    const stepX = (to.x - from.x) / steps;
    const stepY = (to.y - from.y) / steps;
    
    for (let i = 0; i <= steps; i++) {
      const x = from.x + (stepX * i) + (Math.random() - 0.5) * 2;
      const y = from.y + (stepY * i) + (Math.random() - 0.5) * 2;
      
      await page.mouse.move(x, y);
      await this.randomDelayAsync(50, 100);
    }
  }

  /**
   * 자연스러운 타이핑 시뮬레이션
   * @param {Locator} element - 입력할 요소
   * @param {string} text - 입력할 텍스트
   */
  static async humanTypeText(element, text) {
    await element.clear();
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await element.type(char);
      
      // 한국어 입력 시 더 자연스러운 딜레이
      const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(char);
      const baseDelay = isKorean ? 150 : 80;
      await this.randomDelayAsync(baseDelay, baseDelay + 100);
    }
  }

  /**
   * 비동기 랜덤 딜레이 (static 메소드)
   * @param {number} min - 최소 대기 시간 (ms)
   * @param {number} max - 최대 대기 시간 (ms)
   */
  static async randomDelayAsync(min = 100, max = 500) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 페이지 로딩 완료까지 자연스럽게 대기
   * @param {Page} page - Playwright page 인스턴스
   * @param {number} timeout - 최대 대기 시간 (ms)
   */
  static async waitForStableLoad(page, timeout = 30000) {
    try {
      // DOM 로딩 대기
      await page.waitForLoadState('domcontentloaded', { timeout: timeout / 2 });
      
      // 추가 자연스러운 대기
      await this.randomDelayAsync(1000, 3000);
      
      // 네트워크가 안정될 때까지 대기
      await page.waitForLoadState('networkidle', { timeout: timeout / 2 });
      
      // 마지막 안전 대기
      await this.randomDelayAsync(500, 1500);
      
    } catch (error) {
      console.log('페이지 로딩 대기 중 타임아웃:', error.message);
      // 타임아웃이 발생해도 계속 진행
    }
  }

  /**
   * 랜덤 스크롤 패턴 생성
   */
  getRandomScrollPattern() {
    const patterns = [
      { direction: 'down', distance: Math.floor(Math.random() * 500) + 200 },
      { direction: 'up', distance: Math.floor(Math.random() * 300) + 100 },
      { direction: 'down', distance: Math.floor(Math.random() * 800) + 300 }
    ];
    
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  /**
   * 모바일 뷰포트 설정
   */
  getMobileViewport() {
    const mobileViewports = [
      { width: 375, height: 667 }, // iPhone SE
      { width: 414, height: 736 }, // iPhone 8 Plus
      { width: 375, height: 812 }, // iPhone X
      { width: 360, height: 640 }, // Galaxy S5
      { width: 412, height: 915 }  // Pixel 5
    ];
    
    return mobileViewports[Math.floor(Math.random() * mobileViewports.length)];
  }

  /**
   * 데스크톱 뷰포트 설정
   */
  getDesktopViewport() {
    const desktopViewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 }
    ];
    
    return desktopViewports[Math.floor(Math.random() * desktopViewports.length)];
  }

  /**
   * 랜덤 마우스 움직임 패턴
   */
  getRandomMousePattern() {
    return {
      moves: Math.floor(Math.random() * 3) + 2, // 2-4번 움직임
      delay: Math.floor(Math.random() * 100) + 50 // 50-150ms 딜레이
    };
  }

  /**
   * Referer 헤더 생성
   */
  getRefererHeader(currentUrl) {
    try {
      const url = new URL(currentUrl);
      const domain = url.hostname;
      
      // 네이버 도메인별 적절한 referer 설정
      if (domain.includes('naver.com')) {
        return 'https://www.naver.com/';
      } else if (domain.includes('shopping.naver.com')) {
        return 'https://www.naver.com/';
      } else if (domain.includes('map.naver.com')) {
        return 'https://www.naver.com/';
      }
      
      return `${url.protocol}//${url.hostname}/`;
    } catch (error) {
      return 'https://www.google.com/';
    }
  }

  /**
   * 자연스러운 타이핑 지연시간
   */
  getTypingDelay() {
    return Math.floor(Math.random() * 150) + 50; // 50-200ms
  }

  /**
   * TLS 1.3 지원 확인
   */
  supportsTLS13() {
    // Node.js 버전에 따른 TLS 1.3 지원 확인
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);
    return majorVersion >= 12;
  }

  /**
   * 통계 정보 반환
   */
  getStats() {
    return {
      crawlCount: this.crawlCount,
      currentUserAgent: this.currentUserAgent.substring(0, 50) + '...',
      lastUserAgentChange: new Date(this.lastUserAgentChange).toLocaleString(),
      nextSessionReset: this.sessionResetInterval - (this.crawlCount % this.sessionResetInterval),
      tlsSupport: this.supportsTLS13() ? 'TLS 1.3' : 'TLS 1.2'
    };
  }

  /**
   * 세션 리셋
   */
  resetSession() {
    console.log(`🔄 세션 리셋 실행 (크롤링 ${this.crawlCount}회 완료)`);
    this.currentUserAgent = this.getRandomUserAgent();
    this.lastUserAgentChange = Date.now();
    console.log(`✅ 새 User-Agent: ${this.currentUserAgent.substring(0, 50)}...`);
  }
}

export default AntiDetectionService;