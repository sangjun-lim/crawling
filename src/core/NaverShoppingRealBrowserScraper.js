import BaseScraper from './BaseScraper.js';
import { connect } from 'puppeteer-real-browser';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

class NaverShoppingRealBrowserScraper extends BaseScraper {
  constructor(options = {}) {
    super(options);

    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      slowMo: options.slowMo ?? 100,
      saveData: options.saveData ?? true,
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
   * 영수증 CAPTCHA 데이터를 대기한 후 보안 확인 처리 시작
   */
  async waitForReceiptDataThenStartSecurityCheck() {
    try {
      this.logInfo('🕰️ 영수증 CAPTCHA 데이터 대기 시작... (최대 10초)');

      // 영수증 데이터 대기 Promise 설정
      this.waitingForReceiptData = true;
      this.receiptDataPromise = new Promise((resolve) => {
        this.resolveReceiptData = resolve;
      });

      // 10초 타임아웃과 함께 영수증 데이터 대기
      const receiptData = await Promise.race([
        this.receiptDataPromise,
        new Promise((resolve) => {
          setTimeout(() => {
            this.logInfo(
              '⏰ 영수증 데이터 대기 타임아웃 (10초) - 데이터 없이 진행'
            );
            resolve(null);
          }, 10000);
        }),
      ]);

      // Promise 정리
      this.waitingForReceiptData = false;
      this.receiptDataPromise = null;
      this.resolveReceiptData = null;

      // 보안 확인 처리 시작
      if (receiptData) {
        this.logInfo('✅ 영수증 데이터와 함께 보안 확인 처리 시작');
      } else {
        this.logInfo('⚠️ 영수증 데이터 없이 보안 확인 처리 시작');
      }

      await this.waitForSecurityCheck(receiptData);
    } catch (error) {
      this.logError(`영수증 데이터 대기 실패: ${error.message}`);
      // 에러 시에도 보안 확인 처리는 실행
      await this.waitForSecurityCheck(null);
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
    const prompt = `다음 이미지는 네이버 쇼핑 보안문제입니다.
이미지 안에는 질문 문장과 영수증 정보가 같이 담겨있습니다.
이미지를 분석해서 질문에 맞는 정답을 숫자 또는 단어 하나만 출력해주세요.
영수증은 무조건 1장입니다. 여러장으로 보인다면 그건 영수증이 찢어진겁니다.
찢어진 영수증은 합쳐서 분석하면 됩니다.
전화번호는 xxx-xxxx, 또는 xxxx-xxxx 숫자 형태입니다.
설명은 제외하고 정답만 주세요.
답변중에 특수문자는 없습니다.
답변 중에 영어는 없습니다.
예) 총 금액은 얼마입니까? → 36400
예) 구매한 물건 수는? → 7
예) 전화번호 끝자리는? → 3
예) 2kg → 2
예) 총 몇개는 (수량) 세로 열을 모두 더해서 계산하면 돼.
예) OOO의 한 개 당 가격은 얼마입니까? -> 해당 이름을 가진 상품의 (가격|단가) 열을 보면됨.
예) 모든 물건의 총 구매 금액은 얼마입니까? -> (총합|합|합계) 열을 모두 더해서 계산하면 돼.
예) 정답이 '0.5' 이런건 없습니다.
질문: ${questionText}`;

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
   * 캡차 검증 네트워크 응답 모니터링 설정
   * @param {import('puppeteer').Page} page 페이지 객체
   * @returns {Promise<{promise: Promise<any>, cleanup: Function}>} 응답 대기 Promise와 정리 함수
   */
  async setupCaptchaNetworkListener(page) {
    let responseResolve, responseReject;
    let responseTimeout;

    const responsePromise = new Promise((resolve, reject) => {
      responseResolve = resolve;
      responseReject = reject;
    });

    const responseHandler = async (response) => {
      const url = response.url();
      if (
        url.includes('/verify') &&
        url.includes('ncpt.naver.com') &&
        response.ok()
      ) {
        try {
          this.logInfo('responseHandler 호출');
          const responseText = await response.text();

          // '스테이크 접시(responseText)'가 있는지 확인합니다.
          if (responseText) {
            // 접시가 있으면, 맛있게 먹습니다 (데이터 처리).
            const data = JSON.parse(responseText);
            this.logInfo(`✅ 드디어 진짜 응답 도착: ${responseText}`);
            clearTimeout(responseTimeout);
            responseResolve(data);
          }
          // const data = await response.json();
          // this.logInfo(`🔍 캡차 검증 API 응답: ${JSON.stringify(data)}`);
          // clearTimeout(responseTimeout);
          // responseResolve(data);
        } catch (error) {
          this.logError(`캡차 검증 응답 파싱 실패: ${error}`);
        }
      }
    };

    page.on('response', responseHandler);

    // 10초 타임아웃 설정
    responseTimeout = setTimeout(() => {
      page.off('response', responseHandler);
      responseReject(new Error('캡차 검증 응답 대기 시간 초과'));
    }, 10000);

    const cleanup = () => {
      page.off('response', responseHandler);
      clearTimeout(responseTimeout);
    };

    return { promise: responsePromise, cleanup };
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
   * 보안 확인 페이지 처리 - 사용자가 수동으로 해결할 때까지 대기
   * @param {Object|null} receiptData - 영수증 CAPTCHA 데이터 (있는 경우)
   */
  async waitForSecurityCheck(receiptData = null) {
    this.logInfo(
      `🛡️ waitForSecurityCheck 함수 시작 (receiptData: ${
        receiptData ? '있음' : '없음'
      })`
    );

    // 영수증 데이터가 있으면 표시
    if (receiptData && receiptData.receiptData) {
      this.logInfo('');
      this.logInfo('🧐🧐🧐 영수증 CAPTCHA 데이터 수신됨 🧐🧐🧐');
      this.logInfo(`   • 질문: ${receiptData.receiptData.question}`);
      this.logInfo(
        `   • 이미지 있음: ${receiptData.receiptData.image ? '예' : '아니오'}`
      );
      if (receiptData.receiptData.image) {
        this.logInfo(
          `   • 이미지 크기: ${receiptData.receiptData.image.length} 문자`
        );
        this.logInfo(
          `   • 이미지 형식: ${receiptData.receiptData.image.substring(
            0,
            30
          )}...`
        );
      }
      this.logInfo('');
    }
    try {
      // 페이지 네비게이션 완료 대기
      await this.page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 })
        .catch(() => {});

      let pageContent;
      try {
        // 보안 확인 페이지 감지
        pageContent = await this.page.content();
      } catch (contentError) {
        this.logInfo('페이지 컨텐츠 가져오기 실패 - 잠시 후 재시도...');
        await this.randomWait(2000, 3000);
        pageContent = await this.page.content();
      }

      const currentUrl = this.page.url();
      const pageTitle = await this.page.title();

      // 다양한 보안 확인 패턴 감지
      const securityPatterns = [
        '보안 확인을 완료해 주세요',
        'captcha',
        'CAPTCHA',
        'WtmCaptcha',
        'rcpt_answer',
        '정답을 입력해주세요',
        '이 절차는 귀하가 실제 사용자임을 확인',
      ];

      // 디버깅: URL과 제목 항상 출력
      this.logInfo('🔍 보안 확인 페이지 검사 중...');
      this.logInfo('📍 현재 URL: ' + currentUrl);
      this.logInfo('📋 페이지 제목: ' + pageTitle);

      const isSecurityCheck = securityPatterns.some(
        (pattern) =>
          pageContent.includes(pattern) || pageTitle.includes(pattern)
      );

      // 디버깅: 패턴 매칭 결과
      const foundPatterns = securityPatterns.filter(
        (pattern) =>
          pageContent.includes(pattern) || pageTitle.includes(pattern)
      );
      this.logInfo(
        '🎯 매칭된 패턴: ' +
          (foundPatterns.length > 0 ? foundPatterns.join(', ') : '없음')
      );

      if (isSecurityCheck) {
        this.logInfo('🚨🚨🚨 보안 확인 페이지 감지됨! 🚨🚨🚨');
        this.logInfo('📍 현재 URL: ' + currentUrl);
        this.logInfo('📋 페이지 제목: ' + pageTitle);
        this.logInfo('🔍 감지된 보안 확인 유형을 분석 중...');

        // 감지된 패턴 출력
        const detectedPatterns = securityPatterns.filter(
          (pattern) =>
            pageContent.includes(pattern) || pageTitle.includes(pattern)
        );
        this.logInfo('🎯 감지된 패턴: ' + detectedPatterns.join(', '));

        this.logInfo('');
        this.logInfo(
          '┌─────────────────────────────────────────────────────────┐'
        );
        this.logInfo(
          '│                  🛡️ 보안 확인 필요 🛡️                    │'
        );
        this.logInfo(
          '├─────────────────────────────────────────────────────────┤'
        );
        this.logInfo(
          '│  👆 브라우저에서 직접 보안 확인을 완료해 주세요          │'
        );
        this.logInfo(
          '│  📝 영수증 캡차, 문자 입력, 이미지 선택 등을 해결하세요  │'
        );
        this.logInfo(
          '│  ⏰ 최대 15분간 대기합니다                              │'
        );
        this.logInfo(
          '│  🔄 완료 후 자동으로 다음 단계로 진행됩니다             │'
        );
        this.logInfo(
          '└─────────────────────────────────────────────────────────┘'
        );
        this.logInfo('');

        // 보안 확인이 완료될 때까지 대기 (최대 15분)
        const maxWaitTime = 15 * 60 * 1000; // 15분
        const checkInterval = 3000; // 3초마다 확인
        let waitedTime = 0;

        while (waitedTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, checkInterval));
          waitedTime += checkInterval;

          // 현재 페이지 내용 다시 확인
          let currentContent;
          let currentTitle;
          try {
            currentContent = await this.page.content();
            currentTitle = await this.page.title();
          } catch (contentError) {
            this.logInfo('⚠️ 페이지 컨텐츠 가져오기 실패 - 계속 대기...');
            continue;
          }

          const newUrl = this.page.url();

          // 보안 확인 패턴이 더 이상 없는지 확인
          const stillHasSecurityCheck = securityPatterns.some(
            (pattern) =>
              currentContent.includes(pattern) || currentTitle.includes(pattern)
          );

          // 보안 확인 페이지를 벗어났는지 확인
          if (
            !stillHasSecurityCheck &&
            (newUrl.includes('naver.com') || newUrl.includes('shopping'))
          ) {
            this.logSuccess('');
            this.logSuccess('🎉🎉🎉 보안 확인 완료 감지! 🎉🎉🎉');
            this.logSuccess('📍 새로운 URL: ' + newUrl);
            this.logSuccess('📋 새로운 제목: ' + currentTitle);
            this.logSuccess('✅ 다음 단계로 진행합니다...');
            this.logSuccess('');
            break;
          }

          // 진행 상황 로그 (30초마다)
          if (waitedTime % 30000 === 0) {
            const remainingMinutes = Math.ceil(
              (maxWaitTime - waitedTime) / 60000
            );
            this.logInfo(
              `⏳ 보안 확인 대기 중... (남은 시간: ${remainingMinutes}분)`
            );
            this.logInfo(`📍 현재 URL: ${newUrl}`);
          }
        }

        if (waitedTime >= maxWaitTime) {
          this.logError('⚠️ 보안 확인 대기 시간 초과 (15분)');
          throw new Error('보안 확인 대기 시간 초과');
        }

        // 보안 확인 완료 후 세션 상태 확인
        this.logInfo('🔍 보안 확인 완료 후 세션 상태 확인 중...');
        await this.randomWait(2000, 3000);

        // 현재 쿠키 확인
        const cookies = await this.page.cookies();
        this.logInfo(`🍪 보유 쿠키 수: ${cookies.length}`);

        // 중요 쿠키만 표시 (너무 많은 로그 방지)
        const importantCookies = cookies.filter(
          (cookie) =>
            cookie.name.includes('NID') ||
            cookie.name.includes('session') ||
            cookie.name.includes('auth')
        );

        if (importantCookies.length > 0) {
          importantCookies.forEach((cookie, index) => {
            this.logInfo(
              `🍪 주요 쿠키 ${index + 1}: ${
                cookie.name
              } = ${cookie.value.substring(0, 20)}...`
            );
          });
        }

        // 페이지 URL과 상태 확인
        const finalUrl = this.page.url();
        this.logInfo(`📍 보안 확인 완료 후 최종 URL: ${finalUrl}`);

        // 페이지 타이틀 확인
        const finalPageTitle = await this.page.title();
        this.logInfo(`📋 페이지 제목: ${finalPageTitle}`);

        // 페이지에 검색창이 있는지 확인
        const hasSearchInput =
          (await this.page.$('input[type="text"]')) !== null;
        this.logInfo(
          `🔍 검색창 존재 여부: ${hasSearchInput ? '있음' : '없음'}`
        );

        this.logSuccess('✅ 세션 상태 확인 완료 - 정상적으로 진행 중');
      } else {
        // 보안 확인 페이지가 감지되지 않았을 때
        this.logInfo('✅ 보안 확인 페이지 없음 - 정상 진행');
      }
    } catch (error) {
      this.logError(`보안 확인 처리 오류: ${error.message}`);
      // 보안 확인 에러는 치명적이지 않을 수 있으므로 경고만 출력
      this.logInfo(
        '⚠️ 보안 확인 처리에서 오류가 발생했지만 계속 진행합니다...'
      );
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
      await this.randomWait(2000, 4000);

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

      await this.randomWait(2000, 3000);

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
      await this.randomWait(3000, 5000);

      // 보안 확인 페이지 처리는 네트워크 인터셉터에서 자동 처리
      // await this.waitForSecurityCheck(); // 제거 - 인터셉터에서 처리

      // 4-1단계: productId가 포함된 상품 찾기 (최대 10페이지)
      this.logInfo(
        `상품 ID "${productId}"가 포함된 상품 찾는 중... (최대 10페이지 검색)`
      );

      let productFound = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!productFound && currentPage <= maxPages) {
        this.logInfo(`페이지 ${currentPage}에서 상품 검색 중...`);

        // 현재 페이지에서 상품 찾기
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

        for (const selector of productSelectors) {
          try {
            productElement = await this.page.$(selector);
            if (productElement) {
              foundProductSelector = selector;
              this.logSuccess(
                `✅ 상품 발견: ${selector} (페이지 ${currentPage})`
              );
              productFound = true;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (productFound) {
          // 상품이 보이도록 스크롤
          await productElement.evaluate((el) =>
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          );
          await this.randomWait(1000, 2000);

          // 5단계: 상품 클릭
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
        } else {
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

      // 보안 확인 페이지 처리는 네트워크 인터셉터에서 자동 처리
      // await this.waitForSecurityCheck(); // 제거 - 인터셉터에서 처리

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
   * HTML을 파일로 저장
   */
  async saveHtml(htmlContent, filename = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `result/naver-shopping-${timestamp}.html`;
      const filepath = filename || defaultFilename;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
      }

      await fsPromises.writeFile(filepath, htmlContent, 'utf8');
      this.logSuccess(`HTML 파일 저장 완료: ${filepath}`);

      return filepath;
    } catch (error) {
      this.logError(`HTML 파일 저장 실패: ${error.message}`);
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
