import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

async function checkTLSFingerprint(testName, options) {
  console.log(`\n=== ${testName} TLS Fingerprint 확인 ===`);
  
  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    // TLS fingerprint 확인 사이트 방문
    await driver.get('https://browserleaks.com/ssl');
    await driver.sleep(5000);
    
    // TLS 정보 추출 (페이지에서 표시되는 정보)
    const pageSource = await driver.getPageSource();
    const tlsMatch = pageSource.match(/TLS.*?(\d\.\d)/);
    const tls = tlsMatch ? tlsMatch[0] : 'TLS info not found';
    
    console.log(`TLS Info: ${tls}`);
    
    // User Agent 확인
    const userAgent = await driver.executeScript('return navigator.userAgent');
    console.log(`User Agent: ${userAgent}`);
    
    return { tls, userAgent };
  } catch (error) {
    console.error(`오류: ${error.message}`);
  } finally {
    await driver.quit();
  }
}

async function compareTLSFingerprints() {
  console.log('TLS Fingerprint 비교 테스트 시작...');
  
  // 1. 일반 Chrome (자동화)
  const normalOptions = new chrome.Options();
  normalOptions.excludeSwitches(['enable-automation']);
  await checkTLSFingerprint('일반 자동화 Chrome', normalOptions);
  
  // 2. Stealth 모드 Chrome
  const stealthOptions = new chrome.Options();
  stealthOptions.addArguments([
    '--disable-blink-features=AutomationControlled',
    '--disable-features=VizDisplayCompositor',
  ]);
  stealthOptions.excludeSwitches(['enable-automation']);
  await checkTLSFingerprint('Stealth Chrome', stealthOptions);
  
  // 3. 실제 프로필 사용
  const profileOptions = new chrome.Options();
  profileOptions.addArguments([
    '--user-data-dir=/Users/sjlim/Library/Application Support/Google/Chrome',
    '--profile-directory=Default',
  ]);
  profileOptions.excludeSwitches(['enable-automation']);
  await checkTLSFingerprint('실제 Chrome 프로필', profileOptions);
  
  console.log('\n비교 완료! TLS 정보가 다르면 fingerprint가 다른 것입니다.');
}

compareTLSFingerprints();