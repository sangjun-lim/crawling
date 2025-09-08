import { GoogleGenerativeAI } from '@google/generative-ai';
import LoggerService from '../services/logger-service.js';

/**
 * 네이버 쇼핑 영수증 CAPTCHA 자동 해결 클래스
 * Gemini API를 사용한 이미지 분석 및 답변 생성
 */
class NaverReceiptCaptchaSolver {
  constructor(options = {}) {
    this.logger = new LoggerService(options);
    this.options = {
      maxAttempts: options.maxAttempts || 5,
      retryDelayMs: options.retryDelayMs || 5200,
      geminiModel: options.geminiModel || 'gemini-2.5-flash',
      apiTimeout: options.apiTimeout || 30000,
      ...options,
    };
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

      const model = client.getGenerativeModel({
        model: this.options.geminiModel,
      });

      // 타임아웃 설정
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Gemini API 호출 타임아웃 (${this.options.apiTimeout / 1000}초)`
            )
          );
        }, this.options.apiTimeout);
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
   * @param {number} maxAttempts 최대 시도 횟수 (기본값: options에서 설정)
   * @param {number} delayMs 재시도 간격 (밀리초, 기본값: options에서 설정)
   * @returns {Promise<boolean>} 최종 해결 성공 여부
   */
  async solveCaptchaWithRetry(page, maxAttempts = null, delayMs = null) {
    const attempts = maxAttempts || this.options.maxAttempts;
    const delay = delayMs || this.options.retryDelayMs;

    this.logInfo(`🎲 캡차 자동 해결 시작 (최대 ${attempts}회 시도)`);

    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.logInfo(`📍 시도 ${attempt}/${attempts}`);

      try {
        const success = await this.attemptCaptchaSolve(page);

        if (success) {
          this.logSuccess(`🎉 캡차 해결 성공! (${attempt}회 시도)`);
          return true;
        } else {
          this.logInfo(`❌ 시도 ${attempt} 실패`);

          if (attempt < attempts) {
            this.logInfo(`⏳ ${delay / 1000}초 대기 후 재시도...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      } catch (error) {
        this.logError(`시도 ${attempt} 에러: ${error.message}`);

        if (attempt < attempts) {
          this.logInfo(`⏳ ${delay / 1000}초 대기 후 재시도...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.logError(`💥 캡차 해결 실패 (${attempts}회 모든 시도 실패)`);
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

      // 🚀 자동 해결 시도
      this.logInfo('🤖 캡차 자동 해결을 시도합니다...');
      const autoSolved = await this.solveCaptchaWithRetry(page);

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
          error: `${this.options.maxAttempts}번 시도 모두 실패`,
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

  // 로거 메서드들 (LoggerService와 동일한 인터페이스 제공)
  logInfo(message) {
    this.logger.logInfo(message);
  }

  logSuccess(message) {
    this.logger.logSuccess(message);
  }

  logError(message) {
    this.logger.logError(message);
  }
}

export default NaverReceiptCaptchaSolver;
