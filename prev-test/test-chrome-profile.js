import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

class ChromeProfileTest {
  constructor() {
    this.driver = null;
  }

  async init() {
    try {
      console.log('실제 Chrome 프로필로 초기화 중...');

      const options = new chrome.Options();
      
      // 실제 Chrome 사용자 프로필 사용 (기존에 네이버를 사용한 프로필)
      // macOS Chrome 프로필 경로
      options.addArguments([
        '--user-data-dir=/Users/sjlim/Library/Application Support/Google/Chrome',
        '--profile-directory=Default', // 또는 Profile 1, Profile 2 등
      ]);

      // 최소한의 탐지 방지 설정만 적용
      options.addArguments([
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
      ]);

      // automation 관련 플래그 제거
      options.excludeSwitches(['enable-automation']);

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      // 최소한의 JavaScript 수정만 적용
      await this.driver.executeScript(`
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      `);

      console.log('✅ 실제 Chrome 프로필 초기화 완료');
      console.log('🌐 기존 Chrome 프로필 사용 (쿠키, 세션 유지)');
      console.log('🔧 Ctrl+C를 눌러 종료하세요');

      return true;
    } catch (error) {
      console.error(`Chrome 프로필 초기화 실패: ${error.message}`);
      console.log('💡 Chrome이 이미 실행 중이면 종료 후 다시 시도하세요');
      return false;
    }
  }

  async navigateToNaver() {
    try {
      console.log('네이버 메인 페이지로 이동 중...');
      await this.driver.get('https://www.naver.com');
      await this.driver.sleep(2000);
      console.log('✅ 네이버 메인 페이지 로딩 완료');
    } catch (error) {
      console.error(`네이버 접속 실패: ${error.message}`);
    }
  }

  async navigateToNaverShopping() {
    try {
      console.log('네이버 쇼핑 페이지로 이동 중...');
      await this.driver.get('https://search.shopping.naver.com/home');
      await this.driver.sleep(3000);
      console.log('✅ 네이버 쇼핑 페이지 로딩 완료');
    } catch (error) {
      console.error(`네이버 쇼핑 접속 실패: ${error.message}`);
    }
  }

  async close() {
    try {
      if (this.driver) {
        await this.driver.quit();
        this.driver = null;
      }
      console.log('✅ 브라우저 종료 완료');
    } catch (error) {
      console.error(`브라우저 종료 실패: ${error.message}`);
    }
  }
}

// 테스트 실행
async function runTest() {
  const test = new ChromeProfileTest();
  
  try {
    const initialized = await test.init();
    if (!initialized) {
      process.exit(1);
    }

    // 네이버 메인 페이지로 이동
    await test.navigateToNaver();
    
    // 5초 대기 후 쇼핑 페이지로 이동
    setTimeout(async () => {
      await test.navigateToNaverShopping();
    }, 5000);

    // Ctrl+C 처리
    process.on('SIGINT', async () => {
      console.log('\n종료 신호 감지...');
      await test.close();
      process.exit(0);
    });

    // 무한 대기
    console.log('\n=== Chrome 프로필 테스트 시작 ===');
    console.log('브라우저에서 직접 조작해보세요!');
    console.log('종료하려면 Ctrl+C를 누르세요.');
    
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error('테스트 실행 중 오류:', error);
    await test.close();
    process.exit(1);
  }
}

runTest();