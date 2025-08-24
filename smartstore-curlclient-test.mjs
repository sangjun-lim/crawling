import CurlHttpClient from './src/core/CurlHttpClient.js';
import fs from 'fs';

/**
 * CurlHttpClient를 사용한 네이버 스마트스토어 크롤러
 * Playwright 로그 분석을 기반으로 한 HTTP 요청 패턴 구현
 */
class SmartStoreCurlCrawler {
  constructor() {
    this.baseUrl = 'https://smartstore.naver.com';
    this.client = new CurlHttpClient({
      timeout: 30000,
      enableCookies: true,
    });

    // 성공한 Playwright 세션에서 추출된 핵심 헤더
    this.browserHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR',
      'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
    };

    this.apiClient = '20250820143019'; // 성공한 요청에서 발견된 X-Client-Version
  }

  /**
   * 스토어 메인페이지에서 channelUid 추출
   * - 분석 결과: channelUid는 API 호출에 필수적인 동적 값
   * - 패턴: "channelUid":"2sWDxR7klq0gCXmcpWBd4"
   */
  async extractChannelUid(storeId) {
    console.log(`🔍 channelUid 추출 중: ${storeId}`);

    const storeUrl = `${this.baseUrl}/${storeId}`;
    const headers = {
      ...this.browserHeaders,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Upgrade-Insecure-Requests': '1',
    };

    try {
      const response = await this.client.get(storeUrl, {}, headers);

      if (response.status !== 200) {
        throw new Error(`스토어 페이지 접근 실패: HTTP ${response.status}`);
      }

      // 여러 패턴으로 channelUid 추출 시도
      const extractionPatterns = [
        /"channelUid":"([a-zA-Z0-9]+)"/,
        /'channelUid':'([a-zA-Z0-9]+)'/,
        /channelUid:\s*["']([a-zA-Z0-9]+)["']/,
        /channels\/([a-zA-Z0-9]+)\/products/,
        /"channelUid":\s*"([a-zA-Z0-9]+)"/,
      ];

      for (const pattern of extractionPatterns) {
        const match = response.data.match(pattern);
        if (match && match[1]) {
          console.log(`✅ channelUid 추출 성공: ${match[1]}`);
          return match[1];
        }
      }

      // 대안: HTML에서 API 요청 URL 찾기
      const apiUrlPattern =
        /https:\/\/smartstore\.naver\.com\/i\/v2\/channels\/([a-zA-Z0-9]+)/;
      const apiMatch = response.data.match(apiUrlPattern);
      if (apiMatch && apiMatch[1]) {
        console.log(`✅ API URL에서 channelUid 추출: ${apiMatch[1]}`);
        return apiMatch[1];
      }

      throw new Error('channelUid를 찾을 수 없습니다');
    } catch (error) {
      console.log(`❌ channelUid 추출 실패: ${error.message}`);
      return null;
    }
  }

  /**
   * 성공한 브라우저 플로우 재현
   * 1. 스토어 메인페이지 → channelUid 추출
   * 2. 상품 페이지 접근 (선택적, 자연스러운 흐름용)
   * 3. API 호출 → 상품 데이터 수집
   */
  async crawlProduct(storeId, productId) {
    console.log(`🚀 CurlHttpClient 크롤링 시작: ${storeId}/${productId}`);
    const startTime = Date.now();

    try {
      // Step 1: channelUid 추출
      const channelUid = await this.extractChannelUid(storeId);
      if (!channelUid) {
        throw new Error('channelUid 추출에 실패했습니다');
      }

      // 자연스러운 사용자 흐름을 위한 지연 (더 길게)
      await this.delay(8000);

      // Step 2: 상품 페이지 접근 건너뛰고 바로 API로
      console.log('🚀 상품 페이지 건너뛰고 바로 API 접근...');
      const productUrl = `${this.baseUrl}/${storeId}/products/${productId}`;

      // Step 3: 핵심 API 호출 (성공한 패턴 그대로)
      console.log('📡 상품 정보 API 호출...');
      const apiUrl = `${this.baseUrl}/i/v2/channels/${channelUid}/products/${productId}`;

      // 성공한 요청의 정확한 헤더 복제
      const apiHeaders = {
        'Sec-Ch-Ua-Platform': '"macOS"',
        Referer: productUrl,
        'Accept-Language': 'ko-KR',
        'Sec-Ch-Ua': '"Not=A?Brand";v="24", "Chromium";v="140"',
        'Sec-Ch-Ua-Mobile': '?0',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'X-Client-Version': this.apiClient, // 핵심 헤더!
        'Content-Type': 'application/json',
      };

      // 성공한 쿼리 파라미터 복제
      const apiResponse = await this.client.get(
        apiUrl,
        { withWindow: 'false' },
        apiHeaders
      );

      if (apiResponse.status === 200) {
        console.log('✅ 상품 데이터 수집 성공!');
        return this.processProductData(
          apiResponse.data,
          channelUid,
          storeId,
          productId,
          startTime
        );
      } else {
        throw new Error(
          `API 호출 실패: HTTP ${apiResponse.status} - ${apiResponse.statusText}`
        );
      }
    } catch (error) {
      console.log(`❌ 크롤링 실패: ${error.message}`);
      return {
        success: false,
        error: error.message,
        storeId,
        productId,
        duration: `${((Date.now() - startTime) / 1000).toFixed(2)}초`,
        method: 'CurlHttpClient Pattern Analysis',
      };
    }
  }

  /**
   * API 응답 데이터 처리 및 구조화
   */
  processProductData(apiData, channelUid, storeId, productId, startTime) {
    try {
      const productData =
        typeof apiData === 'string' ? JSON.parse(apiData) : apiData;

      const result = {
        success: true,
        method: 'CurlHttpClient with Playwright Pattern Analysis',
        extractedAt: new Date().toISOString(),
        duration: `${((Date.now() - startTime) / 1000).toFixed(2)}초`,

        // 메타 정보
        storeInfo: {
          storeId: storeId,
          channelUid: channelUid,
          storeName: productData.channel?.channelName || 'Unknown',
          channelSiteUrl: productData.channel?.channelSiteUrl,
          representName: productData.channel?.representName,
        },

        // 핵심 상품 정보
        productInfo: {
          id: productData.id,
          productNo: productData.productNo,
          name: productData.name,
          salePrice: productData.salePrice,
          originalPrice: productData.originalPrice || productData.salePrice,
          dispSalePrice: productData.dispSalePrice,
          discountRate: productData.discountRate || 0,
          stockQuantity: productData.stockQuantity,
          productStatusType: productData.productStatusType,
          statusType: productData.statusType,

          // 브랜드/제조사 정보
          brandInfo: {
            brandName: productData.naverShoppingSearchInfo?.brandName || '',
            manufacturerName:
              productData.naverShoppingSearchInfo?.manufacturerName || '',
            modelName: productData.naverShoppingSearchInfo?.modelName || '',
          },

          // 카테고리 정보
          category: {
            categoryId: productData.category?.categoryId,
            categoryName: productData.category?.categoryName,
            wholeCategoryId: productData.category?.wholeCategoryId,
            wholeCategoryName: productData.category?.wholeCategoryName,
            categoryLevel: productData.category?.categoryLevel,
          },

          // 이미지 정보 (상위 5개)
          images: (productData.productImages || []).slice(0, 5).map((img) => ({
            url: img.url,
            type: img.imageType,
            order: img.order,
            width: img.width,
            height: img.height,
          })),

          // 옵션 정보 (상위 10개)
          options: (productData.optionCombinations || [])
            .slice(0, 10)
            .map((opt) => ({
              id: opt.id,
              name1: opt.optionName1,
              name2: opt.optionName2,
              name3: opt.optionName3,
              price: opt.price,
              stockQuantity: opt.stockQuantity,
              regOrder: opt.regOrder,
            })),

          // 원산지 정보
          originArea: productData.originAreaInfo
            ? {
                type: productData.originAreaInfo.originAreaType,
                content: productData.originAreaInfo.content,
                wholeOriginAreaName:
                  productData.originAreaInfo.wholeOriginAreaName,
              }
            : null,

          // SEO 정보
          seoInfo: productData.seoInfo
            ? {
                pageTitle: productData.seoInfo.pageTitle,
                metaDescription: productData.seoInfo.metaDescription,
                sellerTags: productData.seoInfo.sellerTags,
              }
            : null,
        },

        // 메타 데이터
        metadata: {
          apiResponseSize: JSON.stringify(productData).length,
          totalImages: productData.productImages?.length || 0,
          totalOptions: productData.optionCombinations?.length || 0,
          itselfProduction: productData.itselfProductionProductYn,
          best: productData.best,
          payExposure: productData.payExposure,
        },
      };

      // 할인 정보 계산
      if (result.productInfo.originalPrice && result.productInfo.salePrice) {
        const discountAmount =
          result.productInfo.originalPrice - result.productInfo.salePrice;
        result.productInfo.discountAmount = discountAmount;
        if (!result.productInfo.discountRate && discountAmount > 0) {
          result.productInfo.discountRate = Math.round(
            (discountAmount / result.productInfo.originalPrice) * 100
          );
        }
      }

      console.log('\n📊 추출된 상품 정보:');
      console.log(`   상품명: ${result.productInfo.name}`);
      console.log(
        `   판매가: ${result.productInfo.salePrice.toLocaleString()}원`
      );
      console.log(
        `   정가: ${result.productInfo.originalPrice.toLocaleString()}원`
      );
      console.log(`   할인율: ${result.productInfo.discountRate}%`);
      console.log(`   브랜드: ${result.productInfo.brandInfo.brandName}`);
      console.log(
        `   제조사: ${result.productInfo.brandInfo.manufacturerName}`
      );
      console.log(
        `   재고: ${result.productInfo.stockQuantity.toLocaleString()}개`
      );
      console.log(
        `   이미지: ${result.metadata.totalImages}개 (수집: ${result.productInfo.images.length}개)`
      );
      console.log(
        `   옵션: ${result.metadata.totalOptions}개 (수집: ${result.productInfo.options.length}개)`
      );

      return result;
    } catch (error) {
      console.log(`❌ 상품 정보 파싱 실패: ${error.message}`);
      return {
        success: false,
        error: `데이터 파싱 실패: ${error.message}`,
        rawData:
          typeof apiData === 'string'
            ? apiData.substring(0, 1000) + '...'
            : 'Invalid data format',
      };
    }
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  saveResults(result) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `smartstore-curl-${
      result.storeInfo?.storeId || 'unknown'
    }-${timestamp}.json`;
    fs.writeFileSync(filename, JSON.stringify(result, null, 2));
    console.log(`\n💾 결과 저장: ${filename}`);
    return filename;
  }

  printSummary(result) {
    console.log('\n📋 크롤링 결과 요약:');
    console.log(`   접근 방식: ${result.method}`);
    console.log(`   총 소요시간: ${result.duration}`);
    console.log(`   성공 여부: ${result.success ? '✅ 성공' : '❌ 실패'}`);

    if (result.success && result.storeInfo && result.productInfo) {
      console.log(
        `   스토어: ${result.storeInfo.storeName} (${result.storeInfo.storeId})`
      );
      console.log(`   채널UID: ${result.storeInfo.channelUid}`);
      console.log(`   상품: ${result.productInfo.name}`);
      console.log(
        `   가격: ${result.productInfo.salePrice.toLocaleString()}원`
      );
      console.log(
        `   데이터 크기: ${(result.metadata.apiResponseSize / 1024).toFixed(
          2
        )}KB`
      );
    } else if (!result.success) {
      console.log(`   실패 원인: ${result.error}`);
    }
  }
}

/**
 * 테스트 실행 함수
 */
async function testCurlCrawling() {
  const crawler = new SmartStoreCurlCrawler();

  // 테스트 케이스 (Playwright로 검증된 상품)
  const testCases = [
    {
      storeId: 'wodnr7762',
      productId: '7588460081',
      description: '바른체어 사무용 메쉬 의자 - Playwright 검증 완료',
    },
  ];

  console.log('🧪 SmartStore CurlHttpClient 크롤링 테스트');
  console.log('📋 Playwright 네트워크 로그 분석을 기반으로 한 요청 패턴 구현');
  console.log('=' * 70);

  for (const testCase of testCases) {
    console.log(`\n📦 테스트 시작: ${testCase.description}`);
    console.log(`   스토어: ${testCase.storeId}`);
    console.log(`   상품ID: ${testCase.productId}`);
    console.log(
      `   URL: https://smartstore.naver.com/${testCase.storeId}/products/${testCase.productId}`
    );

    const result = await crawler.crawlProduct(
      testCase.storeId,
      testCase.productId
    );

    const filename = crawler.saveResults(result);
    crawler.printSummary(result);

    // 다음 테스트를 위한 지연
    if (testCases.indexOf(testCase) < testCases.length - 1) {
      console.log('\n⏳ 다음 테스트까지 3초 대기...');
      await crawler.delay(3000);
    }
  }

  console.log('\n🎯 모든 테스트 완료!');
  console.log(
    '💡 결과: Playwright 분석 기반 CurlHttpClient 패턴으로 봇 탐지 우회 성공 여부 확인'
  );
}

// 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  testCurlCrawling().catch(console.error);
}

export default SmartStoreCurlCrawler;
