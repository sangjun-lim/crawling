import { connect } from 'puppeteer-real-browser';
import LoggerService from '../../services/loggerService.js';
import ProxyService from '../../services/proxyService.js';
import StorageService from '../../services/storageService.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

class NaverShoppingRealBrowserScraper {
  constructor(options = {}) {
    // 서비스 조합 (Composition 패턴)
    this.logger = new LoggerService(options);
    this.proxyService = new ProxyService(options);
    this.storageService = new StorageService(options);
    
    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 100,
      saveData: options.saveData ?? true,
      enableLogging: options.enableLogging ?? true,
      ...options,
    };

    this.browser = null;
    this.page = null;

    // 영수증 CAPTCHA 데이터 대기용 Promise 관리
    this.waitingForReceiptData = false;
    this.receiptDataPromise = null;
    this.resolveReceiptData = null;
  }

  async init() {
    try {
      // 부모 클래스 초기화 (프록시 테스트 포함)
      await super.init();
      this.logInfo('puppeteer-real-browser를 사용하여 브라우저 연결 중...');

      // puppeteer-real-browser 연결 설정
      const { browser, page } = await connect({
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=ChromeWhatsNewUI,ChromeTips,SidePanel',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-fre',
          '--password-store=basic',
          '--disable-crash-reporter',
        ],
        connectOption: {
          defaultViewport: null,
          ignoreHTTPSErrors: true,
          ignoreDefaultArgs: false,
        },
        ignoreAllFlags: true,
      });

      this.browser = browser;
      this.page = page;

      // 브라우저의 모든 탭 모니터링 설정
      this.setupGlobalNetworkMonitoring();

      // 초기 페이지의 네트워크 모니터링 설정
      this.setupPageNetworkMonitoring(this.page);

      this.logSuccess('puppeteer-real-browser 연결 완료');
      return true;
    } catch (error) {
      this.logError(`puppeteer-real-browser 연결 실패: ${error.message}`);
      this.logError(`에러 스택: ${error.stack}`);
      return false;
    }
  }

  /**
   * 모든 탭에서 발생하는 새로운 탭 생성 이벤트를 모니터링하고 네트워크 리스너를 자동 설정
   */
  setupGlobalNetworkMonitoring() {
    this.logInfo('🌐 전역 네트워크 모니터링 설정 중...');

    this.browser.on('targetcreated', async (target) => {
      try {
        // 새로 생성된 대상이 페이지인지 확인
        if (target.type() === 'page') {
          const page = await target.page();
          if (page) {
            const url = page.url();
            this.logInfo(`🆕 새 탭 생성 감지: ${url}`);

            // 새 페이지에 네트워크 모니터링 설정
            this.setupPageNetworkMonitoring(page);
          }
        }
      } catch (error) {
        this.logError(`새 탭 모니터링 설정 실패: ${error.message}`);
      }
    });
  }

  /**
   * 특정 페이지에 대한 네트워크 모니터링 설정
   */
  setupPageNetworkMonitoring(page) {
    try {
      const pageUrl = page.url();
      this.logInfo(`🔧 페이지 네트워크 모니터링 설정: ${pageUrl}`);

      // request 이벤트 리스너 설정
      page.on('request', async (request) => {
        const url = request.url();

        // 영수증 captcha API 요청 감지
        if (
          url.includes('ncpt.naver.com/v1/wcpt/m/challenge/receipt/question')
        ) {
          this.logInfo('🧐🧐🧐 영수증 CAPTCHA API 요청 감지! 🧐🧐🧐');
          this.logInfo(`📍 API URL: ${url}`);
          this.logInfo(`🔗 Referrer: ${request.headers().referer || 'None'}`);
          this.logInfo(
            `🍪 User-Agent: ${request.headers()['user-agent'] || 'None'}`
          );

          // URL에서 key 파라미터 추출
          try {
            const urlParams = new URL(url).searchParams;
            const captchaKey = urlParams.get('key');
            if (captchaKey) {
              this.logInfo(`🔑 CAPTCHA Key: ${captchaKey}`);
            }
          } catch (urlError) {
            this.logInfo(`URL 파라미터 추출 실패: ${urlError.message}`);
          }

          return; // 영수증 API는 별도 처리하므로 일반 로깅 생략
        }
      });

      // response 이벤트 리스너 설정
      page.on('response', async (response) => {});
    } catch (error) {
      this.logError(`페이지 네트워크 모니터링 설정 실패: ${error.message}`);
    }
  }

  /**
   * 랜덤 대기 시간 생성 (자연스러운 사용자 행동 시뮬레이션)
   */
  async randomWait(min = 800, max = 2500) {
    const waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  // ==================== Phase 1: 기본 감지 및 추출 함수들 ====================

  /**
   * 캡차 페이지인지 확인
   * @param {import('puppeteer').Page} page 검사할 페이지 객체
   * @returns {Promise<boolean>} 캡차 페이지 여부
   */
  async isCaptchaPage(page) {
    try {
      // 캡차 관련 요소들 확인
      const captchaElements = await page.evaluate(() => {
        const imgElement = document.querySelector('#rcpt_img');
        const infoElement = document.querySelector('#rcpt_info');
        const answerElement = document.querySelector(
          '#rcpt_answer, input[name="rcpt_answer"]'
        );

        return {
          hasImage: !!imgElement,
          hasInfo: !!infoElement,
          hasAnswer: !!answerElement,
        };
      });

      // 모든 요소가 존재해야 캡차 페이지로 판단
      return (
        captchaElements.hasImage &&
        captchaElements.hasInfo &&
        captchaElements.hasAnswer
      );
    } catch (error) {
      this.logError(`캡차 페이지 확인 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 캡차 이미지 URL 추출
   * @param {import('puppeteer').Page} page 검사할 페이지 객체
   * @returns {Promise<string|null>} 이미지 URL
   */
  async getCaptchaImageUrl(page) {
    try {
      const imageUrl = await page.$eval('#rcpt_img', (img) => img.src);
      // this.logInfo(`✅ 캡차 이미지 URL 추출: ${imageUrl}`);
      return imageUrl;
    } catch (error) {
      this.logError(`캡차 이미지 URL 추출 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 캡차 질문 텍스트 추출
   * @param {import('puppeteer').Page} page 검사할 페이지 객체
   * @returns {Promise<string|null>} 질문 텍스트
   */
  async getCaptchaQuestionText(page) {
    try {
      const questionText = await page.$eval('#rcpt_info', (p) =>
        p.textContent.trim()
      );
      this.logInfo(`✅ 캡차 질문 텍스트 추출: ${questionText}`);
      return questionText;
    } catch (error) {
      this.logError(`캡차 질문 텍스트 추출 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 이미지 URL을 Base64로 변환
   * @param {import('puppeteer').Page} page 페이지 객체
   * @param {string} imageUrl 이미지 URL
   * @returns {Promise<string|null>} Base64 인코딩된 이미지 데이터
   */
  async convertImageToBase64(page, imageUrl) {
    try {
      const base64Data = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url);
          const blob = await response.blob();

          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              // data:image/png;base64, 부분 제거하고 순수 base64만 반환
              const base64 = reader.result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          throw new Error(`이미지 로드 실패: ${error.message}`);
        }
      }, imageUrl);

      this.logInfo(
        `✅ 이미지 Base64 변환 완료 (크기: ${base64Data.length} 문자)`
      );
      return base64Data;
    } catch (error) {
      this.logError(`이미지 Base64 변환 실패: ${error.message}`);
      return null;
    }
  }

  // ==================== Phase 2: Gemini API 관련 함수들 ====================

  /**
   * Gemini API 클라이언트 초기화
   * @returns {GoogleGenerativeAI|null} Gemini 클라이언트 객체
   */
  initGeminiClient() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      this.logInfo('✅ Gemini API 클라이언트 초기화 완료');
      return genAI;
    } catch (error) {
      this.logError(`Gemini API 클라이언트 초기화 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 캡차 해결 프롬프트 생성
   * @param {string} questionText 캡차 질문 텍스트
   * @returns {string} 완성된 프롬프트
   */
  createCaptchaPrompt(questionText) {
    const prompt = `
### 역할 (Persona)
당신은 한국 네이버 쇼핑의 영수증 이미지 보안문제를 해결하는 OCR 및 Q&A 전문가입니다. 당신의 임무는 왜곡된 영수증 이미지에서 정보를 정확히 추출하고, 주어진 '실제 질문'에 완벽하게 단답형으로만 대답하는 것입니다.

### 핵심 지시사항 (Core Instructions)
주어진 이미지 속 영수증과 질문을 분석하여, 질문에 대한 정답을 숫자 또는 단어 하나로만 출력해야 합니다. 아래의 처리 과정과 출력 규칙을 반드시 준수하세요.

### 처리 과정 (Step-by-Step Process)
1.  **이미지 구조 분석:** 이미지 안에서 \`영수증 영역\`과 \`질문 영역\`을 식별합니다. 영수증이 여러 조각처럼 보여도, 이는 **하나의 영수증이 나뉘어 표시된 것**이므로 전체를 하나로 합쳐서 분석합니다.

2.  **정확한 정보 추출 (OCR):**
    * 영수증의 모든 텍스트(상품명, 수량, 가격, 합계, 전화번호 등)를 최대한 정확하게 추출합니다.
    * 문맥을 활용하여 흐릿하거나 불분명한 글자를 추론합니다.
    * 전화번호는 주로 \`xxx-xxxx\` 또는 \`xxxx-xxxx\` 형태임을 인지합니다.

3.  **질문 해결 및 계산:**
    * 질문의 의도를 명확히 파악하고, 아래 **공식**을 우선적으로 적용하여 정답을 찾습니다.
    * **"총 몇 개?" 질문:** \`'수량'\`, \`'개수'\` 열의 모든 숫자를 더해서 계산합니다.
    * **"OOO 한 개당 가격?" 질문:** 해당 상품명 옆의 \`'가격'\` 또는 \`'단가'\` 열의 숫자를 찾습니다.
    * **"모든 물건의 총 구매 금액?" 질문:** \`'합계'\`, \`'총합'\` 금액을 찾거나, 각 품목의 가격을 모두 더합니다.

### 최종 답변 출력 규칙 (Final Output Rules)
* **[가장 중요]** 설명, 문장, 단위(원, 개)를 모두 제외하고 **오직 정답(한 단어 또는 한 숫자)**만 출력합니다.
* 답변에 **특수문자**나 **영어**는 절대 포함되지 않습니다.
* 정보에 단위가 포함된 경우 **숫자만** 사용합니다. (예: \`2kg\` → \`2\`)
* 답변이 **소수점**(예: \`0.5\`)이 되는 경우는 없습니다.

**[예시]**
* 질문: 총 금액은 얼마입니까? → \`36400\`
* 질문: 전화번호 끝자리는? → \`3\`
---
* '실제 질문': ${questionText}`;

    this.logInfo('✅ 캡차 해결 프롬프트 생성 완료');
    return prompt;
  }

  /**
   * Gemini API로 이미지 분석
   * @param {GoogleGenerativeAI} client Gemini 클라이언트
   * @param {string} base64Image Base64 인코딩된 이미지
   * @param {string} prompt 분석 프롬프트
   * @returns {Promise<string|null>} AI 답변
   */
  async analyzeImageWithGemini(client, base64Image, prompt) {
    try {
      this.logInfo('🤖 Gemini API로 이미지 분석 시작...');

      const model = client.getGenerativeModel({ model: 'gemini-2.5-flash' });

      // 30초 타임아웃 설정
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Gemini API 호출 타임아웃 (30초)'));
        }, 30000);
      });

      const analysisPromise = model.generateContent([
        {
          inlineData: {
            data: base64Image,
            mimeType: 'image/png',
          },
        },
        prompt,
      ]);

      // Promise.race로 타임아웃과 API 호출 중 먼저 완료되는 것 반환
      const result = await Promise.race([analysisPromise, timeoutPromise]);

      const response = result.response;
      const answer = response.text().trim();

      this.logInfo(`🎯 Gemini API 분석 완료: "${answer}"`);
      return answer;
    } catch (error) {
      this.logError(`Gemini API 이미지 분석 실패: ${error.message}`);
      return null;
    }
  }

  // ==================== Phase 3: 캡차 입력 및 제출 함수들 ====================

  /**
   * 캡차 답변 입력 필드 찾기
   * @param {import('puppeteer').Page} page 페이지 객체
   * @returns {Promise<import('puppeteer').ElementHandle|null>} 입력 필드 요소
   */
  async findCaptchaInputField(page) {
    try {
      const selectors = [
        '#rcpt_answer',
        'input[name="rcpt_answer"]',
        'input[placeholder*="답"]',
        'input[type="text"]',
      ];

      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            this.logInfo(`✅ 캡차 입력 필드 발견: ${selector}`);
            return element;
          }
        } catch (error) {
          continue;
        }
      }

      throw new Error('캡차 입력 필드를 찾을 수 없습니다');
    } catch (error) {
      this.logError(`캡차 입력 필드 찾기 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 캡차 답변 입력
   * @param {import('puppeteer').Page} page 페이지 객체
   * @param {import('puppeteer').ElementHandle} inputElement 입력 필드 요소
   * @param {string} answer 답변
   * @returns {Promise<boolean>} 입력 성공 여부
   */
  async inputCaptchaAnswer(page, inputElement, answer) {
    try {
      this.logInfo(`📝 캡차 답변 입력 중: "${answer}"`);

      // 기존 값 지우기
      await inputElement.evaluate((input) => (input.value = ''));
      await this.randomWait(300, 500);

      // 답변 입력
      await inputElement.type(answer, { delay: 50 });
      await this.randomWait(300, 500);

      // 입력된 값 확인
      const inputValue = await inputElement.evaluate((input) => input.value);
      if (inputValue === answer) {
        this.logSuccess(`✅ 캡차 답변 입력 완료: "${inputValue}"`);
        return true;
      } else {
        throw new Error(
          `입력값 불일치: 예상="${answer}", 실제="${inputValue}"`
        );
      }
    } catch (error) {
      this.logError(`캡차 답변 입력 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 캡차 제출 버튼 찾기
   * @param {import('puppeteer').Page} page 페이지 객체
   * @returns {Promise<import('puppeteer').ElementHandle|null>} 제출 버튼 요소
   */
  async findCaptchaSubmitButton(page) {
    try {
      // 정확한 캡차 확인 버튼 셀렉터 우선 시도
      const primarySelector = '#cpt_confirm';
      const element = await page.$(primarySelector);
      if (element) {
        this.logInfo(`✅ 캡차 제출 버튼 발견: ${primarySelector}`);
        return element;
      }

      // 백업 셀렉터들
      const backupSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:contains("확인")',
        'button:contains("제출")',
        '.btn_confirm',
        '.btn_submit',
        '.btn_login',
      ];

      for (const selector of backupSelectors) {
        try {
          const backupElement = await page.$(selector);
          if (backupElement) {
            this.logInfo(`✅ 백업 캡차 제출 버튼 발견: ${selector}`);
            return backupElement;
          }
        } catch (error) {
          continue;
        }
      }

      throw new Error('캡차 제출 버튼을 찾을 수 없습니다');
    } catch (error) {
      this.logError(`캡차 제출 버튼 찾기 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 캡차 제출 (단순 클릭만)
   * @param {import('puppeteer').Page} page 페이지 객체
   * @param {import('puppeteer').ElementHandle} submitButton 제출 버튼 요소
   * @returns {Promise<{success: boolean}>} 제출 결과
   */
  async submitCaptcha(page, submitButton) {
    try {
      this.logInfo('🚀 캡차 제출 중...');

      // 버튼 클릭
      await submitButton.click();

      // 클릭 후 약간의 대기
      await this.randomWait(500, 1000);

      this.logSuccess('✅ 캡차 제출 완료');
      return { success: true };
    } catch (error) {
      this.logError(`캡차 제출 실패: ${error.message}`);
      return { success: false };
    }
  }

  // ==================== Phase 4: 검증 및 조합 함수들 ====================

  /**
   * 캡차 해결 성공 확인 (페이지 상태 기반)
   * @param {import('puppeteer').Page} page 페이지 객체
   * @param {any} _ API 응답 객체 (사용하지 않음, 호환성을 위해 유지)
   * @returns {Promise<boolean>} 해결 성공 여부
   */
  async isCaptchaSolved(page, _ = null) {
    try {
      // 답변 제출 후 약간의 대기 (서버 처리 시간 고려)
      await this.randomWait(2000, 3000);

      // 1. 오류 메시지 확인 (가장 우선)
      const errorMessage = await page.evaluate(() => {
        // rcpt_error_message 요소 확인 (가장 정확한 오류 표시)
        const rcptErrorElement = document.getElementById('rcpt_error_message');
        if (rcptErrorElement) {
          const style = window.getComputedStyle(rcptErrorElement);
          const isVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0';

          if (
            isVisible &&
            rcptErrorElement.textContent &&
            rcptErrorElement.textContent.trim()
          ) {
            return rcptErrorElement.textContent.trim();
          }
        }

        // 기타 오류 메시지 텍스트 확인
        const bodyText = document.body.textContent || '';
        if (
          bodyText.includes('잘못 입력했습니다. 5초후 다음 문제로 변경됩니다.')
        ) {
          return '잘못 입력했습니다. 5초후 다음 문제로 변경됩니다.';
        }

        if (bodyText.includes('입력형식이 잘못되었습니다')) {
          return '입력형식이 잘못되었습니다';
        }

        if (
          bodyText.includes(
            '형식에 맞지 않는 문자가 입력되었습니다. 다시 입력해주세요.'
          )
        ) {
          return '형식에 맞지 않는 문자가 입력되었습니다. 다시 입력해주세요.';
        }

        // 일반적인 오류 요소 확인
        const errorElements = document.querySelectorAll(
          '.error, .err, [class*="error"], [class*="fail"], .msg_error, .error_message'
        );
        for (const element of errorElements) {
          const style = window.getComputedStyle(element);
          const isVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0';
          if (isVisible && element.textContent && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
        return null;
      });

      // 오류 메시지가 있으면 처리
      if (errorMessage) {
        this.logError(`❌ 오류 메시지 감지: ${errorMessage}`);

        // 형식 오류인 경우 새로고침 버튼 클릭
        if (errorMessage.includes('형식에 맞지 않는 문자가 입력되었습니다')) {
          this.logInfo('🔄 형식 오류 감지 - 캡차 새로고침 시도');

          try {
            // 새로고침 버튼 찾기
            const reloadButton = await page.$('#rcpt_reload');
            if (reloadButton) {
              this.logInfo('✅ 캡차 새로고침 버튼 발견 - 클릭 중...');
              await reloadButton.click();

              // 새로고침 후 대기
              await this.randomWait(2000, 3000);

              this.logSuccess(
                '🔄 캡차 새로고침 완료 - 새로운 캡차로 다시 시도'
              );
              // 새로고침했으므로 실패로 반환하여 다시 시도하게 함
              return false;
            } else {
              this.logError('⚠️ 캡차 새로고침 버튼을 찾을 수 없음');
            }
          } catch (reloadError) {
            this.logError(`캡차 새로고침 실패: ${reloadError.message}`);
          }
        }

        return false;
      }

      // 2. 캡차 페이지 상태 확인
      const stillCaptchaPage = await this.isCaptchaPage(page);

      if (!stillCaptchaPage) {
        this.logSuccess('🎉 캡차 해결 성공! (캡차 페이지를 벗어남)');
        return true;
      } else {
        this.logInfo(
          '⚠️ 여전히 캡차 페이지에 머물러 있음 - 답변이 틀렸거나 처리 중'
        );

        // 추가 대기 후 한번 더 확인 (서버 응답이 늦을 수 있음)
        await this.randomWait(3000, 5000);

        const finalCheck = await this.isCaptchaPage(page);
        if (!finalCheck) {
          this.logSuccess('🎉 캡차 해결 성공! (추가 대기 후 확인)');
          return true;
        } else {
          this.logError('❌ 캡차 해결 실패 - 여전히 캡차 페이지에 머물러 있음');
          return false;
        }
      }
    } catch (error) {
      this.logError(`캡차 해결 확인 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 단일 캡차 해결 시도
   * @param {import('puppeteer').Page} page 페이지 객체
   * @returns {Promise<boolean>} 시도 성공 여부
   */
  async attemptCaptchaSolve(page) {
    try {
      this.logInfo('🎯 캡차 해결 시도 시작...');

      // 1. 캡차 페이지 확인
      const isCaptcha = await this.isCaptchaPage(page);
      if (!isCaptcha) {
        this.logInfo('ℹ️ 캡차 페이지가 아닙니다');
        return true;
      }

      // 2. 이미지 URL과 질문 추출
      const imageUrl = await this.getCaptchaImageUrl(page);
      const questionText = await this.getCaptchaQuestionText(page);

      if (!imageUrl || !questionText) {
        throw new Error('이미지 URL 또는 질문 텍스트 추출 실패');
      }

      // 3. 이미지를 Base64로 변환
      const base64Image = await this.convertImageToBase64(page, imageUrl);
      if (!base64Image) {
        throw new Error('이미지 Base64 변환 실패');
      }

      // 4. Gemini API로 분석
      const geminiClient = this.initGeminiClient();
      if (!geminiClient) {
        throw new Error('Gemini API 클라이언트 초기화 실패');
      }

      const prompt = this.createCaptchaPrompt(questionText);
      const answer = await this.analyzeImageWithGemini(
        geminiClient,
        base64Image,
        prompt
      );

      if (!answer) {
        throw new Error('Gemini API 분석 실패');
      }

      // 5. 답변 입력
      const inputField = await this.findCaptchaInputField(page);
      if (!inputField) {
        throw new Error('입력 필드 찾기 실패');
      }

      const inputSuccess = await this.inputCaptchaAnswer(
        page,
        inputField,
        answer
      );
      if (!inputSuccess) {
        throw new Error('답변 입력 실패');
      }

      // 6. 제출
      const submitButton = await this.findCaptchaSubmitButton(page);
      if (!submitButton) {
        throw new Error('제출 버튼 찾기 실패');
      }

      const submitResult = await this.submitCaptcha(page, submitButton);
      if (!submitResult.success) {
        throw new Error('캡차 제출 실패');
      }

      // 7. 해결 확인 (페이지 상태 기반)
      const solved = await this.isCaptchaSolved(page);
      return solved;
    } catch (error) {
      this.logError(`캡차 해결 시도 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 캡차 자동 해결 (재시도 포함)
   * @param {import('puppeteer').Page} page 페이지 객체
   * @param {number} maxAttempts 최대 시도 횟수
   * @param {number} delayMs 재시도 간격 (밀리초)
   * @returns {Promise<boolean>} 최종 해결 성공 여부
   */
  async solveCaptchaWithRetry(page, maxAttempts = 5, delayMs = 5200) {
    this.logInfo(`🎲 캡차 자동 해결 시작 (최대 ${maxAttempts}회 시도)`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logInfo(`📍 시도 ${attempt}/${maxAttempts}`);

      try {
        const success = await this.attemptCaptchaSolve(page);

        if (success) {
          this.logSuccess(`🎉 캡차 해결 성공! (${attempt}회 시도)`);
          return true;
        } else {
          this.logInfo(`❌ 시도 ${attempt} 실패`);

          if (attempt < maxAttempts) {
            this.logInfo(`⏳ ${delayMs / 1000}초 대기 후 재시도...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      } catch (error) {
        this.logError(`시도 ${attempt} 에러: ${error.message}`);

        if (attempt < maxAttempts) {
          this.logInfo(`⏳ ${delayMs / 1000}초 대기 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logError(`💥 캡차 해결 실패 (${maxAttempts}회 모든 시도 실패)`);
    return false;
  }

  /**
   * 캡차 페이지를 자동으로 처리합니다. 캡차가 감지되면 Gemini API를 사용해 자동으로 해결합니다.
   * @param {import('puppeteer').Page} page 검사할 페이지 객체
   * @returns {Promise<{isCaptcha: boolean, autoSolved: boolean, imageUrl: string|null, question: string|null, error?: string}>} 캡챠 처리 결과
   */
  async handleCaptchaAutomatically(page) {
    this.logInfo(`[Captcha Auto-Solve] 캡차 자동 감지 및 해결을 시작합니다...`);

    // 캡챠 페이지 확인 (한 번만)
    const isCaptcha = await this.isCaptchaPage(page);

    if (isCaptcha) {
      this.logInfo('✅ 캡챠 페이지 감지 성공!');

      // 🚀 자동 해결 시도 (최대 5번, 각각 새로운 이미지/질문)
      this.logInfo('🤖 캡차 자동 해결을 시도합니다...');
      const autoSolved = await this.solveCaptchaWithRetry(page, 5, 5200);

      if (autoSolved) {
        this.logSuccess('🎉 캡차 자동 해결 성공!');
        return {
          isCaptcha: true,
          autoSolved: true,
          imageUrl: null, // 해결 성공 시 세부 정보는 불필요
          question: null,
        };
      } else {
        this.logError('❌ 캡차 자동 해결 실패, 수동 처리 필요');
        return {
          isCaptcha: true,
          autoSolved: false,
          imageUrl: null,
          question: null,
          error: '5번 시도 모두 실패',
        };
      }
    } else {
      this.logInfo('ℹ️ 캡챠 페이지가 아닙니다');
      return {
        isCaptcha: false,
        autoSolved: false,
        imageUrl: null,
        question: null,
      };
    }
  }

  /**
   * 특정 상품 ID가 포함된 상품 클릭하는 시나리오
   */
  async scrapeProductPriceComparison(searchKeyword, productId) {
    if (!this.page) {
      await this.init();
    }

    try {
      // 1단계: 네이버 메인 페이지 접속
      this.logInfo('네이버 메인 페이지 접속 중...');
      await this.page.goto('https://www.naver.com', {
        waitUntil: 'domcontentloaded',
        timeout: this.options.timeout,
      });

      await this.randomWait(1000, 1500);
      this.logSuccess('네이버 메인 페이지 접속 완료');

      // 2단계: 네이버 메인 페이지에서 검색
      this.logInfo(`네이버 메인에서 "${searchKeyword}" 검색 중...`);

      // 메인 페이지 검색창 찾기
      const mainSearchSelectors = [
        'input#query',
        'input[name="query"]',
        'input[placeholder*="검색"]',
        'input[data-module="SearchBox"]',
        'input.search_input',
        'input[type="text"]',
      ];

      let mainSearchInput = null;
      for (const selector of mainSearchSelectors) {
        try {
          this.logInfo(`메인 검색창 선택자 시도: ${selector}`);
          mainSearchInput = await this.page.waitForSelector(selector, {
            timeout: 3000,
          });
          if (mainSearchInput) {
            this.logSuccess(`✅ 메인 검색창 발견: ${selector}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!mainSearchInput) {
        throw new Error('네이버 메인 검색창을 찾을 수 없습니다');
      }

      // 검색어 입력 및 실행
      await mainSearchInput.click();
      await this.randomWait(500, 600);
      await mainSearchInput.evaluate((input) => (input.value = ''));
      await mainSearchInput.type(searchKeyword);
      await this.randomWait(500, 600);
      await mainSearchInput.press('Enter');

      // 통합검색 결과 페이지 로딩 대기
      await this.page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
        .catch(() => {});
      await this.randomWait(1500, 3000);

      this.logSuccess(`"${searchKeyword}" 통합검색 완료`);

      // 3단계: 네이버 가격비교 더보기 클릭
      this.logInfo('네이버 가격비교 더보기 버튼 찾는 중...');

      const moreLinkSelectors = [
        'a[class*="storeMoreLink"]',
        'a:has(text()[contains(., "네이버 가격비교 더보기")])',
        'a[href*="search.shopping.naver.com"]',
        'a[class*="more"][href*="shopping"]',
        '.storeMoreLink-pc-module__link___OCNh8',
      ];

      let moreLinkElement = null;

      // 스크롤하면서 더보기 링크 찾기
      for (let scrollAttempt = 0; scrollAttempt < 3; scrollAttempt++) {
        for (const selector of moreLinkSelectors) {
          try {
            this.logInfo(`더보기 링크 선택자 시도: ${selector}`);
            moreLinkElement = await this.page.$(selector);
            if (moreLinkElement) {
              this.logSuccess(`✅ 더보기 링크 발견: ${selector}`);
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (moreLinkElement) break;

        // 페이지 스크롤
        this.logInfo(
          `더보기 링크를 찾기 위해 스크롤 (${scrollAttempt + 1}/3)...`
        );
        await this.page.evaluate(() => window.scrollBy(0, 800));
        await this.randomWait(1000, 2000);
      }

      if (!moreLinkElement) {
        // 모든 링크 텍스트 확인
        const allLinks = await this.page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          return links
            .filter(
              (link) =>
                link.textContent.includes('가격비교') ||
                link.textContent.includes('더보기') ||
                link.href.includes('search.shopping.naver.com')
            )
            .map((link) => ({
              text: link.textContent.trim(),
              href: link.href,
              className: link.className,
            }))
            .slice(0, 10);
        });

        this.logInfo('발견된 관련 링크들:');
        allLinks.forEach((link, index) => {
          console.log(
            `${index + 1}. ${link.text} -> ${link.href} (class: ${
              link.className
            })`
          );
        });

        // 가격비교가 포함된 링크 시도
        moreLinkElement = await this.page.$(
          'a[href*="search.shopping.naver.com"]'
        );
        if (!moreLinkElement) {
          throw new Error('네이버 가격비교 더보기 링크를 찾을 수 없습니다');
        }
      }

      // 더보기 링크가 보이도록 스크롤
      await moreLinkElement.evaluate((el) =>
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      );
      await this.randomWait(1000, 2000);

      // 새 탭에서 열릴 예정이므로 현재 페이지 수 확인
      const initialPages = await this.browser.pages();
      const initialPageCount = initialPages.length;

      // 더보기 링크 클릭
      await moreLinkElement.click();
      this.logSuccess('네이버 가격비교 더보기 클릭 완료');

      await this.randomWait(1000, 2000);

      // 4단계: 새 탭 전환
      this.logInfo('새 탭 전환 중...');
      const newPages = await this.browser.pages();

      let shoppingPage = null;
      for (const page of newPages) {
        const url = page.url();
        if (
          url.includes('search.shopping.naver.com') &&
          !url.includes('home')
        ) {
          shoppingPage = page;
          this.logSuccess(`🎯 쇼핑 검색 페이지 탭 발견: ${url}`);
          break;
        }
      }

      if (shoppingPage && shoppingPage !== this.page) {
        this.page = shoppingPage;
        this.logSuccess('✅ 쇼핑 페이지 탭으로 전환');
      } else {
        this.logInfo('⚠️ 새 탭을 찾지 못함, 현재 탭에서 계속 진행');
      }

      // 캡차 자동 처리
      const captchaResult = await this.handleCaptchaAutomatically(this.page);

      if (captchaResult.isCaptcha && !captchaResult.autoSolved) {
        new Error('캡차 실패입니다.');
      }

      // 페이지 로딩 완료 대기
      await this.randomWait(1500, 3000);

      // 4-1단계: productId가 포함된 상품 찾기 (최대 10페이지)
      this.logInfo(
        `상품 ID "${productId}"가 포함된 상품 찾는 중... (최대 10페이지 검색)`
      );

      let productFound = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!productFound && currentPage <= maxPages) {
        this.logInfo(`페이지 ${currentPage}에서 상품 검색 중...`);

        // 스크롤하면서 상품 찾기
        const productSelectors = [
          `[data-i="${productId}"]`, // 정확한 data-i 매칭
          `[data-shp-contents-id="${productId}"]`, // 정확한 contents-id 매칭
          `[data-i*="${productId}"]`, // 부분 매칭 백업
          `[data-shp-contents-id*="${productId}"]`, // 부분 매칭 백업
          `a[href*="nvMid=${productId}"]`, // URL 파라미터 매칭
          `a[href*="catalog/${productId}"]`, // 카탈로그 URL 매칭
        ];

        let productElement = null;
        let foundProductSelector = '';
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 20; // 최대 스크롤 시도 횟수

        // 페이지 맨 위로 이동
        await this.page.evaluate(() => window.scrollTo(0, 0));
        await this.randomWait(1000, 1500);

        this.logInfo(`페이지 ${currentPage}에서 스크롤하며 상품 검색 시작...`);

        // 연속적이고 자연스러운 스크롤로 상품 찾기
        let lastScrollTime = Date.now();
        let noNewContentCount = 0;

        while (scrollAttempts < maxScrollAttempts && !productFound) {
          scrollAttempts++;

          // 매 5번째 스크롤마다 진행상황 로그
          if (scrollAttempts % 5 === 1) {
            this.logInfo(
              `페이지 ${currentPage} - 스크롤 진행중... (${scrollAttempts}/${maxScrollAttempts})`
            );
          }

          // 현재 위치에서 상품 찾기
          for (const selector of productSelectors) {
            try {
              productElement = await this.page.$(selector);
              if (productElement) {
                foundProductSelector = selector;
                this.logSuccess(
                  `✅ 상품 발견: ${selector} (페이지 ${currentPage}, 스크롤 ${scrollAttempts})`
                );
                productFound = true;
                break;
              }
            } catch (error) {
              continue;
            }
          }

          if (productFound) {
            // 상품이 보이도록 부드럽게 스크롤
            this.logInfo('상품을 화면 중앙으로 이동시키는 중...');
            await productElement.evaluate((el) =>
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            );
            await this.randomWait(500, 1000); // 스크롤 완료 대기

            // 상품 클릭
            this.logInfo('상품 클릭 중...');
            try {
              await productElement.click();
            } catch (clickError) {
              this.logInfo('일반 클릭 실패 - 강제 클릭 시도...');
              await this.page.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (element) {
                  element.click();
                }
              }, foundProductSelector);
            }
            this.logSuccess('상품 클릭 완료');
            break;
          }

          // 현재 페이지 높이 확인
          const currentHeight = await this.page.evaluate(
            () => document.body.scrollHeight
          );

          // 부드러운 스크롤 애니메이션 (여러 단계로 나누어서)
          const scrollAmount = 1000 + Math.random() * 400; // 1000~1400px
          const steps = 32; // 32단계로 나누어서 부드럽게
          const stepSize = scrollAmount / steps;

          for (let step = 0; step < steps; step++) {
            await this.page.evaluate((stepSize) => {
              window.scrollBy(0, stepSize);
            }, stepSize);
            await new Promise((resolve) => setTimeout(resolve, 5)); // 5ms씩 대기
          }

          // 짧은 대기 시간 (스크롤 완료 후)
          await this.randomWait(100, 200); // 0.1~0.2초 대기

          // 새로운 높이 확인
          const newHeight = await this.page.evaluate(
            () => document.body.scrollHeight
          );

          // 페이지 끝 도달 감지 (더 정확하게)
          if (newHeight === previousHeight) {
            noNewContentCount++;
            // 연속으로 2번 높이가 같으면 페이지 끝으로 판단
            if (noNewContentCount >= 2) {
              this.logInfo(
                `페이지 ${currentPage} 끝에 도달 - 상품을 찾지 못함`
              );
              break;
            }
          } else {
            noNewContentCount = 0; // 새 콘텐츠가 로드되면 카운트 리셋
          }

          previousHeight = newHeight;
        }

        if (!productFound) {
          // 다음 페이지로 이동
          if (currentPage < maxPages) {
            this.logInfo(
              `페이지 ${currentPage}에서 상품을 찾지 못함, 다음 페이지로 이동 중...`
            );

            const nextButtonSelectors = [
              'a.pagination_next__kh_cw',
              'a[class*="pagination_next"]',
              'a:has(text()[contains(., "다음")])',
              'a[aria-label="다음"]',
              '.pagination a:last-child',
            ];

            let nextButton = null;
            for (const selector of nextButtonSelectors) {
              try {
                nextButton = await this.page.$(selector);
                if (nextButton) {
                  const isDisabled = await nextButton.evaluate(
                    (btn) =>
                      btn.classList.contains('disabled') ||
                      btn.getAttribute('aria-disabled') === 'true' ||
                      btn.style.pointerEvents === 'none'
                  );

                  if (!isDisabled) {
                    this.logInfo(`다음 페이지 버튼 발견: ${selector}`);
                    break;
                  } else {
                    nextButton = null;
                  }
                }
              } catch (error) {
                continue;
              }
            }

            if (nextButton) {
              await nextButton.click();
              await this.randomWait(2000, 4000);
            } else {
              this.logInfo(
                '다음 페이지 버튼을 찾을 수 없거나 비활성화됨 - 검색 종료'
              );
              break;
            }
          }

          // 페이지 번호 증가 (다음 버튼이 있든 없든)
          currentPage++;
        }
      }

      if (!productFound) {
        throw new Error(
          `상품 ID "${productId}"를 포함한 상품을 ${maxPages}페이지에서 찾을 수 없습니다`
        );
      }

      // 6단계: 새 탭에서 상품 상세 페이지 열림 대기 및 전환
      this.logInfo('상품 상세 페이지 새 탭 대기 중...');
      await this.randomWait(2000, 4000);

      // 모든 페이지 확인하여 상품 상세 페이지 찾기
      const allPages = await this.browser.pages();
      let productDetailPage = null;

      for (const page of allPages) {
        const url = page.url();
        if (
          url.includes(`catalog/${productId}`) ||
          (url.includes(`/catalog/`) && url.includes(productId))
        ) {
          productDetailPage = page;
          this.logSuccess(`🎯 상품 상세 페이지 발견: ${url}`);
          break;
        }
      }

      if (productDetailPage && productDetailPage !== this.page) {
        this.page = productDetailPage;
        this.logSuccess('✅ 상품 상세 페이지 탭으로 전환');
      } else {
        this.logInfo('⚠️ 새로운 상품 상세 페이지 탭을 찾지 못함');
      }

      // 페이지 로딩 완료 대기
      await this.randomWait(2000, 4000);

      const finalUrl = this.page.url();
      this.logInfo(`최종 URL: ${finalUrl}`);

      // 7단계: 상품 페이지 HTML 저장 및 데이터 파싱
      this.logSuccess('상품 상세 페이지 HTML 저장 및 데이터 파싱 중...');

      try {
        const htmlContent = await this.page.content();

        // HTML 파일 저장
        const savedPath = await this.saveProductHtml(htmlContent, productId);
        this.logInfo(`📁 HTML 파일 저장됨: ${savedPath}`);
        this.logInfo(`📊 HTML 길이: ${htmlContent.length.toLocaleString()}자`);

        // __NEXT_DATA__ JSON 데이터 파싱
        this.logInfo('🔍 __NEXT_DATA__ JSON 데이터 파싱 시작...');

        try {
          // 1. JSON 데이터 추출
          const nextData = this.extractNextDataFromHtml(htmlContent);

          // 2. 상품 정보 파싱
          const productInfo = this.parseProductInfo(nextData);

          // 3. 카테고리 정보 파싱
          const categoryInfo = this.parseCategoryInfo(nextData);

          // 4. 판매처별 상품 정보 파싱
          const catalogProducts = this.parseCatalogProducts(nextData);

          // 5. 파싱된 데이터를 JSON 파일로 저장
          const dataFilePath = await this.saveProductData(
            productInfo,
            categoryInfo,
            catalogProducts,
            productId
          );
          this.logInfo(`📄 데이터 JSON 파일 저장됨: ${dataFilePath}`);

          this.logSuccess('🎉 데이터 파싱 및 저장 완료!');
        } catch (parseError) {
          this.logError(`데이터 파싱 실패: ${parseError.message}`);
          this.logInfo('⚠️ HTML은 저장되었으나 데이터 파싱에 실패했습니다');
        }

        this.logSuccess('시나리오 완료 - 상품 상세 페이지에서 대기 중');

        // 무한 대기 (사용자 조작 허용)
        // this.logInfo('사용자 조작을 위해 무한 대기 중... (Ctrl+C로 종료)');
        // while (true) {
        //   await this.randomWait(10000, 15000);
        //   this.logInfo('대기 중...');
        // }
      } catch (saveError) {
        this.logError(`HTML 저장 실패: ${saveError.message}`);
        this.logInfo('HTML 저장에 실패했지만 계속 진행합니다...');

        this.logSuccess('시나리오 완료 - 상품 상세 페이지에서 대기 중');

        // 무한 대기 (사용자 조작 허용)
        this.logInfo('사용자 조작을 위해 무한 대기 중... (Ctrl+C로 종료)');
        while (true) {
          await this.randomWait(10000, 15000);
          this.logInfo('대기 중...');
        }
      }
    } catch (error) {
      this.logError(`시나리오 실행 실패: ${error.message}`);

      // 에러 시 스크린샷 저장
      if (this.page) {
        try {
          await this.page.screenshot({
            path: `error-scenario-${Date.now()}.png`,
            fullPage: true,
          });
          this.logInfo('에러 스크린샷 저장됨');
        } catch (screenshotError) {
          this.logError(`스크린샷 저장 실패: ${screenshotError.message}`);
        }
      }

      throw error;
    }
  }

  /**
   * HTML에서 __NEXT_DATA__ JSON 데이터 추출
   */
  extractNextDataFromHtml(htmlContent) {
    try {
      // <script id="__NEXT_DATA__" type="application/json"> 태그 찾기
      const scriptRegex =
        /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s;
      const match = htmlContent.match(scriptRegex);

      if (!match || !match[1]) {
        throw new Error('__NEXT_DATA__ script 태그를 찾을 수 없습니다');
      }

      const jsonString = match[1].trim();
      const nextData = JSON.parse(jsonString);

      this.logSuccess('__NEXT_DATA__ JSON 데이터 추출 완료');
      return nextData;
    } catch (error) {
      this.logError(`__NEXT_DATA__ 추출 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 상품 정보 파싱
   */
  parseProductInfo(nextData) {
    try {
      const productInfo =
        nextData.props?.pageProps?.initialState?.catalog?.info;

      if (!productInfo) {
        throw new Error(
          '상품 정보를 찾을 수 없습니다 (props.pageProps.initialState.info)'
        );
      }

      this.logSuccess('상품 정보 파싱 완료');
      return productInfo;
    } catch (error) {
      this.logError(`상품 정보 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 카테고리 정보 파싱
   */
  parseCategoryInfo(nextData) {
    try {
      const categoryInfo =
        nextData.props?.pageProps?.initialState?.catalog?.category;

      if (!categoryInfo) {
        throw new Error(
          '카테고리 정보를 찾을 수 없습니다 (props.pageProps.initialState.category)'
        );
      }

      this.logSuccess('카테고리 정보 파싱 완료');
      return categoryInfo;
    } catch (error) {
      this.logError(`카테고리 정보 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 판매처별 상품 및 가격 정보 파싱
   */
  parseCatalogProducts(nextData) {
    try {
      const queries = nextData.props?.pageProps?.dehydratedState?.queries;

      if (!queries || !Array.isArray(queries)) {
        throw new Error('queries 배열을 찾을 수 없습니다');
      }

      // queryKey 배열의 첫번째 값이 "CatalogProducts"인 객체 찾기
      const catalogQuery = queries.find((query) => {
        return (
          query.queryKey &&
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'CatalogProducts'
        );
      });

      if (!catalogQuery) {
        throw new Error(
          'CatalogProducts queryKey를 가진 객체를 찾을 수 없습니다'
        );
      }

      const products = catalogQuery.state?.data?.Catalog_Products?.products;

      if (!products || !Array.isArray(products)) {
        throw new Error(
          '상품 목록을 찾을 수 없습니다 (state.data.Catalog_Products.products)'
        );
      }

      this.logSuccess(
        `판매처별 상품 정보 파싱 완료 (${products.length}개 상품)`
      );
      return products;
    } catch (error) {
      this.logError(`판매처별 상품 정보 파싱 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 파싱된 데이터를 JSON 파일로 저장
   */
  async saveProductData(
    productInfo,
    categoryInfo,
    catalogProducts,
    productId = null
  ) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const productIdStr = productId ? `_${productId}` : '';
      const filename = `result/naver-product-data${productIdStr}_${timestamp}.json`;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
        this.logInfo('📁 result 디렉토리 생성됨');
      }

      const productData = {
        metadata: {
          productId: productId || 'Unknown',
          extractedAt: new Date().toISOString(),
          extractor: 'NaverShoppingRealBrowserScraper',
        },
        productInfo: productInfo,
        categoryInfo: categoryInfo,
        catalogProducts: catalogProducts,
        summary: {
          productInfoAvailable: !!productInfo,
          categoryInfoAvailable: !!categoryInfo,
          catalogProductsCount: catalogProducts ? catalogProducts.length : 0,
        },
      };

      await fsPromises.writeFile(
        filename,
        JSON.stringify(productData, null, 2),
        'utf8'
      );
      this.logSuccess(`상품 데이터 JSON 파일 저장 완료: ${filename}`);

      // 파일 크기 정보 출력
      const stats = await fsPromises.stat(filename);
      this.logInfo(`📊 저장된 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);

      // 간단한 요약 정보 출력
      this.logInfo('=== 추출된 데이터 요약 ===');
      this.logInfo(`📦 상품 정보: ${productInfo ? '✅ 추출됨' : '❌ 없음'}`);
      this.logInfo(
        `📂 카테고리 정보: ${categoryInfo ? '✅ 추출됨' : '❌ 없음'}`
      );
      this.logInfo(
        `🏪 판매처별 상품: ${
          catalogProducts ? `✅ ${catalogProducts.length}개` : '❌ 없음'
        }`
      );

      return filename;
    } catch (error) {
      this.logError(`상품 데이터 저장 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 상품 페이지 HTML을 파일로 저장
   */
  async saveProductHtml(htmlContent, productId = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const productIdStr = productId ? `_${productId}` : '';
      const filename = `result/naver-product${productIdStr}_${timestamp}.html`;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
        this.logInfo('📁 result 디렉토리 생성됨');
      }

      // HTML 내용에 메타데이터 추가
      const metaComment = `<!--
=== 네이버 상품 페이지 HTML ===
상품 ID: ${productId || 'Unknown'}
수집 시간: ${new Date().toISOString()}
파일 크기: ${htmlContent.length.toLocaleString()} 문자
수집 도구: NaverShoppingScraper
-->
`;

      const htmlWithMeta = metaComment + htmlContent;

      await fsPromises.writeFile(filename, htmlWithMeta, 'utf8');
      this.logSuccess(`상품 HTML 파일 저장 완료: ${filename}`);

      // 파일 크기 정보 출력
      const stats = await fsPromises.stat(filename);
      this.logInfo(
        `📊 저장된 파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`
      );

      return filename;
    } catch (error) {
      this.logError(`상품 HTML 파일 저장 실패: ${error.message}`);
      throw error;
    }
  }

  async close() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      // puppeteer-real-browser에서는 context를 별도로 관리하지 않음
      if (this.browser) {
        // CDP 연결만 해제, 브라우저는 종료하지 않음
        await this.browser.close();
        this.browser = null;
      }
      this.logSuccess('브라우저 연결 해제 완료 (브라우저는 계속 실행 중)');

      // 부모 클래스 정리 호출
      await super.close();
    } catch (error) {
      this.logError(`Playwright 브라우저 종료 실패: ${error.message}`);
    }
  }
}

export default NaverShoppingRealBrowserScraper;
