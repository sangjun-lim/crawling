import HttpClient from '../../clients/http-client.js';
import CheckpointService from '../../services/checkpoint-service.js';
import CoupangStorageService from '../../services/coupang-storage-service.js';
import HttpRequestLoggerService from '../../services/http-request-logger-service.js';

class CoupangCombinedScraper {
  constructor(options = {}) {
    this.httpClient = new HttpClient({
      timeout: 30000,
      enableCookies: true,
      ...options,
    });
    this.httpLogger = new HttpRequestLoggerService();
    this.checkpointManager = new CheckpointService(options);
    this.storage = new CoupangStorageService(options);

    // Rate limiting: 벤더당 2번 요청이므로 200ms 간격 (300 requests per minute)
    this.rateLimitDelay = 200; // milliseconds
    this.lastRequestTime = 0;

    // 배치 설정
    this.batchSize = options.batchSize || 100;
    this.autoSave = options.autoSave !== false; // 기본값: true
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  async getVendorInfo(storeId = 0, vendorId, urlName = '') {
    try {
      await this.waitForRateLimit();

      let url = `https://shop.coupang.com/api/v1/store/getStoreReview?storeId=${storeId}&vendorId=${vendorId}`;
      if (urlName) {
        url += `&urlName=${urlName}`;
      }

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        Referer: 'https://shop.coupang.com/',
        Origin: 'https://shop.coupang.com',
      };

      const response = await this.httpClient.get(url, {}, headers);

      // Rate limit 정보만 한 줄로 출력
      const rateLimitInfo = {
        remaining: response.headers['x-ratelimit-remaining'] || 'N/A',
        requested: response.headers['x-ratelimit-requested-tokens'] || 'N/A',
        burst: response.headers['x-ratelimit-burst-capacity'] || 'N/A',
        replenish: response.headers['x-ratelimit-replenish-rate'] || 'N/A',
      };
      console.log(
        `🚦 Rate Limit (${vendorId}): remaining=${rateLimitInfo.remaining}, requested=${rateLimitInfo.requested}, burst=${rateLimitInfo.burst}, replenish=${rateLimitInfo.replenish}`
      );

      return {
        success: true,
        storeId,
        vendorId,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.httpLogger.logError(error, `combined_vendor_error_${vendorId}`);

      return {
        success: false,
        storeId,
        vendorId,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getProductList(params) {
    try {
      await this.waitForRateLimit();

      const url = 'https://shop.coupang.com/api/v1/listing';

      const defaultParams = {
        storeId: params.storeId || 0,
        brandId: params.brandId || 0,
        vendorId: params.vendorId,
        sourceProductId: params.sourceProductId || 0,
        sourceVendorItemId: params.sourceVendorItemId || 0,
        source: params.source || 'brandstore_sdp_atf',
        enableAdultItemDisplay: params.enableAdultItemDisplay !== false,
        nextPageKey: params.nextPageKey || 0,
        filter: params.filter || 'SORT_KEY:',
      };

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        Referer: 'https://shop.coupang.com/',
        Origin: 'https://shop.coupang.com',
      };

      const response = await this.httpClient.post(url, defaultParams, headers);

      return {
        success: true,
        vendorId: params.vendorId,
        storeId: defaultParams.storeId,
        data: response.data,
        timestamp: new Date().toISOString(),
        requestParams: defaultParams,
      };
    } catch (error) {
      this.httpLogger.logError(
        error,
        `combined_product_error_${params.vendorId}`
      );

      return {
        success: false,
        vendorId: params.vendorId,
        storeId: params.storeId,
        error: error.message,
        timestamp: new Date().toISOString(),
        requestParams: params,
      };
    }
  }

  async getAllProducts(vendorId, storeId = 0, maxProducts = 5) {
    const allProducts = [];
    let nextPageKey = 0;
    let currentPage = 1;

    console.log(`${vendorId} 상품 수집 시작 (최대 ${maxProducts}개)`);

    while (allProducts.length < maxProducts) {
      console.log(
        `페이지 ${currentPage} 수집 중... (nextPageKey: ${nextPageKey})`
      );

      const result = await this.getProductList({
        vendorId,
        storeId,
        nextPageKey,
      });

      if (!result.success) {
        console.log(`❌ 페이지 ${currentPage} 수집 실패: ${result.error}`);
        break;
      }

      const products = result.data?.data?.products || [];
      if (products.length === 0) {
        console.log(`페이지 ${currentPage}에서 상품이 없음. 수집 종료.`);
        break;
      }

      // 필요한 만큼만 추가하고 수집시간 추가
      const remainingNeeded = maxProducts - allProducts.length;
      const productsToAdd = products
        .slice(0, remainingNeeded)
        .map((product) => ({
          ...product,
          collectedAt: new Date().toISOString(),
        }));

      allProducts.push(...productsToAdd);
      console.log(
        `페이지 ${currentPage}: ${productsToAdd.length}개 상품 수집 (총 ${allProducts.length}개)`
      );

      // 목표 개수에 도달하면 종료
      if (allProducts.length >= maxProducts) {
        console.log(`목표 상품 수 ${maxProducts}개 달성. 수집 종료.`);
        break;
      }

      // 다음 페이지는 nextPageKey를 1씩 증가
      nextPageKey++;
      currentPage++;
    }

    return allProducts;
  }

  async collectCombinedData(vendorIds, storeId = 0, maxProductsPerVendor = 5) {
    const results = [];

    console.log(`쿠팡 통합 데이터 수집 시작: ${vendorIds.length}개 벤더`);

    // 프록시 통계 초기화 로깅
    if (this.httpClient.proxies.length > 0) {
      console.log(`📡 프록시 ${this.httpClient.proxies.length}개 사용 중`);
    }

    for (const vendorId of vendorIds) {
      console.log(`\n=== 처리 중: vendorId ${vendorId} ===`);

      // 1. 벤더 정보 수집
      const vendorResult = await this.getVendorInfo(storeId, vendorId);

      if (!vendorResult.success) {
        console.log(`❌ 벤더 정보 실패: ${vendorId} - ${vendorResult.error}`);
        continue;
      }

      // 벤더 데이터 유효성 검사 (null name이나 빈 vendorId 제외)
      const vendorData = vendorResult.data;
      if (
        !vendorData ||
        vendorData.name === null ||
        !vendorData.vendorId ||
        vendorData.vendorId.trim() === ''
      ) {
        console.log(`❌ 벤더 데이터 유효하지 않음: ${vendorId}`);
        continue;
      }

      console.log(`✅ 벤더 정보 성공: ${vendorId} - ${vendorData.name}`);

      // 2. 상품 정보 수집
      const products = await this.getAllProducts(
        vendorId,
        storeId,
        maxProductsPerVendor
      );

      if (products.length === 0) {
        console.log(`⚠️  상품 없음: ${vendorId} - 벤더 정보만 저장`);
        // 상품이 없어도 벤더 정보는 저장 (상품 컬럼은 빈값)
        results.push({
          ...vendorData,
          vendorId,
          storeId: vendorResult.storeId,
          수집시간: vendorResult.timestamp,
        });
      } else {
        console.log(`✅ 상품 수집 성공: ${vendorId} - ${products.length}개`);

        // 3. 벤더 정보와 상품 정보 결합 (한 행에 모든 상품 저장)
        const vendorWithProducts = {
          ...vendorData, // 벤더 정보 전체
          vendorId,
          storeId: vendorResult.storeId,
          수집시간: vendorResult.timestamp,
        };

        // 상품 정보를 horizontal하게 추가
        let productCollectedTime = '';
        products.forEach((product, index) => {
          const productNum = index + 1;
          vendorWithProducts[`상품명${productNum}`] =
            product.imageAndTitleArea?.title || '';
          vendorWithProducts[`상품링크${productNum}`] = product.link || '';
          vendorWithProducts[`상품ID${productNum}`] = product.productId || '';

          // 첫 번째 상품의 수집시간을 공통으로 사용
          if (index === 0) {
            productCollectedTime = product.collectedAt || '';
          }
        });

        // 상품수집시간을 하나로 통일
        if (productCollectedTime) {
          vendorWithProducts['상품수집시간'] = productCollectedTime;
        }

        results.push(vendorWithProducts);
      }
    }

    console.log(`\n통합 데이터 수집 완료: 총 ${results.length}행`);

    // 프록시 통계 출력
    if (this.httpClient.proxies.length > 0) {
      this.httpClient.logProxyStats();
    }

    return results;
  }

  // 안전한 대량 수집 (배치 + 체크포인트)
  async collectCombinedSafe(
    vendorIds,
    storeId = 0,
    maxProductsPerVendor = 5,
    options = {}
  ) {
    const sessionId =
      options.resumeSessionId || this.checkpointManager.generateSessionId();
    let checkpoint;

    try {
      // 기존 체크포인트 로드 또는 새로 생성
      if (options.resumeSessionId) {
        checkpoint = await this.checkpointManager.loadCheckpoint(sessionId);
        if (!checkpoint) {
          throw new Error(`체크포인트를 찾을 수 없습니다: ${sessionId}`);
        }
        console.log(`🔄 세션 재개: ${sessionId}`);
      } else {
        checkpoint = this.checkpointManager.createCheckpoint(
          sessionId,
          vendorIds,
          {
            batchSize: this.batchSize,
            maxProductsPerVendor,
            storeId,
            ...options,
          }
        );
        await this.checkpointManager.saveCheckpoint(sessionId, checkpoint);
        console.log(`🚀 새 세션 시작: ${sessionId}`);
      }

      console.log(
        `쿠팡 안전 수집 시작: ${vendorIds.length}개 벤더 (배치 크기: ${this.batchSize})`
      );

      // 이미 처리된 벤더들 스킵
      const remainingVendors = vendorIds.slice(checkpoint.currentIndex);
      let currentBatch = [];
      let batchIndex = checkpoint.currentBatch;
      let processedInSession = 0;
      let currentPosition = checkpoint.currentIndex; // 전체 진행률용

      for (let i = 0; i < remainingVendors.length; i++) {
        const vendorId = remainingVendors[i];
        currentPosition++; // 각 벤더 처리 시작할 때 증가

        console.log(
          `\n=== [${i + 1}/${remainingVendors.length}] 처리 중: ${vendorId} ===`
        );

        try {
          // 1. 벤더 정보 수집
          const vendorResult = await this.getVendorInfo(storeId, vendorId);

          if (!vendorResult.success) {
            console.log(
              `❌ 벤더 정보 실패: ${vendorId} - ${vendorResult.error}`
            );
            checkpoint.processedVendors.push({
              vendorId,
              status: 'vendor_failed',
              error: vendorResult.error,
            });
            continue;
          }

          // 벤더 데이터 유효성 검사
          const vendorData = vendorResult.data;
          if (
            !vendorData ||
            vendorData.name === null ||
            !vendorData.vendorId ||
            vendorData.vendorId.trim() === ''
          ) {
            console.log(`❌ 벤더 데이터 유효하지 않음: ${vendorId}`);
            checkpoint.processedVendors.push({
              vendorId,
              status: 'invalid_data',
            });
            continue;
          }

          console.log(`✅ 벤더 정보 성공: ${vendorId} - ${vendorData.name}`);

          // 2. 상품 정보 수집
          const products = await this.getAllProducts(
            vendorId,
            storeId,
            maxProductsPerVendor
          );

          // 3. 데이터 결합
          const vendorWithProducts = {
            ...vendorData,
            vendorId,
            storeId: vendorResult.storeId,
            수집시간: vendorResult.timestamp,
          };

          if (products.length === 0) {
            console.log(`⚠️  상품 없음: ${vendorId} - 벤더 정보만 저장`);
            // 상품이 없는 경우 빈 상품 필드들 추가하지 않음
          } else {
            console.log(
              `✅ 상품 수집 성공: ${vendorId} - ${products.length}개`
            );
            // 상품 정보를 horizontal하게 추가
            let productCollectedTime = '';
            products.forEach((product, index) => {
              const productNum = index + 1;
              vendorWithProducts[`상품명${productNum}`] =
                product.imageAndTitleArea?.title || '';
              vendorWithProducts[`상품링크${productNum}`] = product.link || '';
              vendorWithProducts[`상품ID${productNum}`] =
                product.productId || '';

              // 첫 번째 상품의 수집시간을 공통으로 사용
              if (index === 0) {
                productCollectedTime = product.collectedAt || '';
              }
            });

            // 상품수집시간을 하나로 통일
            if (productCollectedTime) {
              vendorWithProducts['상품수집시간'] = productCollectedTime;
            }
          }

          currentBatch.push(vendorWithProducts);

          checkpoint.processedVendors.push({
            vendorId,
            status: 'success',
            productCount: products.length,
          });
          processedInSession++;
        } catch (error) {
          console.error(`💥 벤더 처리 오류 (${vendorId}):`, error.message);
          checkpoint.processedVendors.push({
            vendorId,
            status: 'error',
            error: error.message,
          });
        }

        // 배치 저장 (배치 크기 도달시)
        if (currentBatch.length >= this.batchSize) {
          if (currentBatch.length > 0 && this.autoSave) {
            await this.storage.saveIncrementalBatch(
              currentBatch,
              batchIndex,
              sessionId
            );
            console.log(
              `📦 배치 ${batchIndex} 저장 완료: ${currentBatch.length}행`
            );
            currentBatch = [];
            batchIndex++;
          }

          // 배치 저장 시에만 체크포인트 업데이트
          checkpoint.currentIndex = currentPosition;
          checkpoint.currentBatch = batchIndex;
          this.checkpointManager.updateProgress(
            checkpoint,
            currentPosition,
            batchIndex
          );
          await this.checkpointManager.saveCheckpoint(sessionId, checkpoint);

          const progress = Math.floor(
            (currentPosition / vendorIds.length) * 100
          );
          console.log(
            `💾 진행률: ${currentPosition}/${vendorIds.length} (${progress}%)`
          );
        }
      }

      // 마지막 배치 저장 (남은 데이터가 있으면)
      if (currentBatch.length > 0 && this.autoSave) {
        await this.storage.saveIncrementalBatch(
          currentBatch,
          batchIndex,
          sessionId
        );
        console.log(
          `📦 마지막 배치 ${batchIndex} 저장 완료: ${currentBatch.length}행`
        );
        batchIndex++;
      }

      // 완료 처리 - 최종 진행률 업데이트
      checkpoint.currentIndex = currentPosition;
      checkpoint.currentBatch = batchIndex;
      checkpoint.status = 'completed';
      checkpoint.endTime = new Date().toISOString();
      this.checkpointManager.updateProgress(
        checkpoint,
        currentPosition,
        batchIndex
      );
      await this.checkpointManager.saveCheckpoint(sessionId, checkpoint);

      const finalProgress = Math.floor(
        (currentPosition / vendorIds.length) * 100
      );
      console.log(
        `💾 최종 진행률: ${currentPosition}/${vendorIds.length} (${finalProgress}%)`
      );

      console.log(`\n✅ 안전 수집 완료!`);
      console.log(`   세션 ID: ${sessionId}`);
      console.log(`   처리된 벤더: ${processedInSession}개`);
      console.log(`   저장된 배치: ${batchIndex}개`);

      // 프록시 통계 출력
      if (this.httpClient.proxies.length > 0) {
        this.httpClient.logProxyStats();
      }

      return {
        sessionId,
        checkpoint,
        batchCount: batchIndex,
        processedVendors: processedInSession,
      };
    } catch (error) {
      console.error('💥 안전 수집 중 치명적 오류:', error.message);

      // 오류 체크포인트 저장
      if (checkpoint) {
        checkpoint.status = 'error';
        checkpoint.error = error.message;
        checkpoint.errorTime = new Date().toISOString();
        await this.checkpointManager.saveCheckpoint(sessionId, checkpoint);
      }

      throw error;
    }
  }

  // 세션 재개
  async resumeSession(sessionId, options = {}) {
    console.log(`🔄 세션 재개: ${sessionId}`);
    return await this.collectCombinedSafe([], 0, 5, {
      ...options,
      resumeSessionId: sessionId,
    });
  }

  // 세션 완료 (배치 병합)
  async completeSession(sessionId, options = {}) {
    console.log(`🔗 세션 완료 처리: ${sessionId}`);

    try {
      // 배치 병합
      const mergedFile = await this.storage.mergeBatches(
        sessionId,
        options.finalFilename
      );

      // 배치 파일 정리 (옵션)
      if (options.cleanupBatches !== false) {
        // await this.storage.cleanupBatches(sessionId, false);
      }

      // 체크포인트 정리 (옵션)
      if (options.cleanupCheckpoint !== false) {
        // await this.checkpointManager.deleteCheckpoint(sessionId);
      }

      console.log(`✅ 세션 완료: ${mergedFile}`);
      return mergedFile;
    } catch (error) {
      console.error('세션 완료 처리 실패:', error.message);
      throw error;
    }
  }

  async collectCombinedByRange(
    startVendorId = 1,
    endVendorId = 100,
    storeId = 0,
    maxProductsPerVendor = 5
  ) {
    const vendorIds = [];

    for (
      let vendorIdNum = startVendorId;
      vendorIdNum <= endVendorId;
      vendorIdNum++
    ) {
      const vendorId = `A${String(vendorIdNum).padStart(8, '0')}`;
      vendorIds.push(vendorId);
    }

    return await this.collectCombinedData(
      vendorIds,
      storeId,
      maxProductsPerVendor
    );
  }

  // 안전한 범위 수집
  async collectCombinedByRangeSafe(
    startVendorId = 1,
    endVendorId = 100,
    storeId = 0,
    maxProductsPerVendor = 5,
    options = {}
  ) {
    const vendorIds = [];

    for (
      let vendorIdNum = startVendorId;
      vendorIdNum <= endVendorId;
      vendorIdNum++
    ) {
      const vendorId = `A${String(vendorIdNum).padStart(8, '0')}`;
      vendorIds.push(vendorId);
    }

    return await this.collectCombinedSafe(
      vendorIds,
      storeId,
      maxProductsPerVendor,
      options
    );
  }
}

export default CoupangCombinedScraper;
