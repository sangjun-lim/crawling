import HttpClient from '../../clients/http-client.js';
import NaverLocationService from '../../services/naver-location-service.js';
import GraphqlBuilder from '../../graphql/graphql-builder.js';
import ResponseParser from '../../parsers/response-parser.js';
import StorageService from '../../services/storage-service.js';
import LoggerService from '../../services/logger-service.js';
import ProxyService from '../../services/proxy-service.js';
import FileUtils from '../../utils/file-utils.js';
import {
  DEFAULT_COORDS,
  DEFAULT_OPTIONS,
  API_URLS,
} from '../../config/constants.js';

class NaverStoreScraper {
  constructor(options = {}) {
    // 서비스 조합 (Composition 패턴)
    this.logger = new LoggerService(options);
    this.proxyService = new ProxyService(options);
    this.storageService = new StorageService(options);

    this.options = {
      timeout: options.timeout || 30000,
      enableLogging: options.enableLogging ?? true,
      ...options,
    };

    this.config = {
      defaultCoords: DEFAULT_COORDS,
      pagination: {
        maxPages: options.maxPages || DEFAULT_OPTIONS.maxPages,
        pageSize: DEFAULT_OPTIONS.pageSize,
        adPageSize: DEFAULT_OPTIONS.adPageSize,
      },
      ...options,
    };

    this.httpClient = new HttpClient({
      ...options,
      proxy: this.proxyService.getHttpConfig(), // 프록시 설정 전달
    });
    this.naverLocationService = new NaverLocationService();
    this.graphQLBuilder = new GraphqlBuilder();
    this.responseParser = new ResponseParser();
  }

  async searchStores(keyword, maxResults = null) {
    try {
      console.log(`"${keyword}" 검색 시작...`);

      const coords = await this.naverLocationService.getLocationCoordinates(
        keyword,
        this.httpClient
      );
      const stores = await this.fetchStoresFromNaverMap(keyword, coords);

      const limitedStores = maxResults ? stores.slice(0, maxResults) : stores;

      return {
        keyword,
        total: limitedStores.length,
        stores: limitedStores.map((store, index) => ({
          ...store,
          rank: index + 1,
        })),
      };
    } catch (error) {
      console.error(`검색 실패: ${error.message}`);
      throw new Error(`네이버 지도 검색 실패: ${error.message}`);
    }
  }

  async fetchStoresFromNaverMap(keyword, coords = null) {
    const allStores = [];

    try {
      console.log(
        `네이버 지도 GraphQL API - ${this.config.pagination.maxPages}페이지 조회 시작...`
      );

      // 페이지별 display 크기를 동적으로 계산하는 헬퍼 함수
      const getDisplaySize = (page, maxPages) => {
        return page === maxPages ? 20 : this.config.pagination.pageSize;
      };

      for (let page = 1; page <= this.config.pagination.maxPages; page++) {
        const displaySize = getDisplaySize(
          page,
          this.config.pagination.maxPages
        );
        const start = (page - 1) * this.config.pagination.pageSize + 1;
        const adStart = (page - 1) * this.config.pagination.adPageSize + 1;

        console.log(
          `페이지 ${page}/${this.config.pagination.maxPages} 요청 중... (start: ${start}, display: ${displaySize})`
        );

        const category = this.naverLocationService.detectCategory(keyword);
        const payload = this.graphQLBuilder.buildPayload(
          category,
          keyword,
          displaySize,
          start,
          adStart,
          coords
        );

        // 첫 페이지일 때 요청 페이로드 로깅
        if (page === 1) {
          console.log('=== 요청 페이로드 ===');
          console.log('Headers:', {
            'x-wtm-graphql': this.httpClient.buildWtmGraphqlHeader(keyword),
          });
          console.log(
            'Payload:',
            JSON.stringify(payload, null, 2).substring(0, 500) + '...'
          );
          console.log('===================');
        }

        const response = await this.httpClient.post(API_URLS.GRAPHQL, payload, {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'Accept-Language': 'ko',
          'x-wtm-graphql': this.httpClient.buildWtmGraphqlHeader(keyword),
          'x-ncaptcha-violation': 'false',
          Origin: 'https://pcmap.place.naver.com',
          'Sec-Fetch-Site': 'same-site',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        });

        const pageStores = this.responseParser.parseStoresFromGraphQLResponse(
          response.data,
          page
        );

        if (pageStores.length === 0) {
          console.log(
            `페이지 ${page}에서 더 이상 데이터가 없습니다. 조회 종료.`
          );
          break;
        }

        allStores.push(...pageStores);
        console.log(
          `페이지 ${page} 완료: ${pageStores.length}개 매장 추가 (총 ${allStores.length}개)`
        );

        // 현재 페이지에서 받은 매장 수가 예상 display 크기보다 적으면 마지막 페이지로 간주하여 조회 종료
        if (pageStores.length < displaySize) {
          console.log('pageStores.length : ', pageStores.length);
          console.log(
            `페이지 ${page}에서 ${pageStores.length}개 매장 조회 (예상 크기: ${displaySize}개 미만). 조회 종료.`
          );
          break;
        }

        // 페이지 간 간격 (Rate limiting 방지)
        if (page < this.config.pagination.maxPages) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      console.log(`총 ${allStores.length}개 매장 조회 완료`);
      return allStores;
    } catch (error) {
      console.error('=== GraphQL API 에러 상세 정보 ===');
      console.error('Status:', error.response?.status);
      console.error('Status Text:', error.response?.statusText);
      console.error('Headers:', error.response?.headers);

      if (error.response?.data) {
        console.error(
          'Error Response Data:',
          JSON.stringify(error.response.data, null, 2)
        );

        // 에러 응답도 파일로 저장
        try {
          const fs = (await import('fs')).default;
          const path = (await import('path')).default;

          // log 폴더 자동 생성
          const logDir = this.config.logDirectory || 'log';
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }

          const timestamp = new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/:/g, '-');
          const errorFile = path.join(
            logDir,
            `error_response_${keyword.replace(/\s+/g, '_')}_${timestamp}.json`
          );
          fs.writeFileSync(
            errorFile,
            JSON.stringify(
              {
                status: error.response.status,
                statusText: error.response.statusText,
                headers: error.response.headers,
                data: error.response.data,
                requestUrl: error.config?.url,
                requestMethod: error.config?.method,
              },
              null,
              2
            ),
            'utf8'
          );
          console.error(`에러 응답이 ${errorFile}에 저장되었습니다.`);
        } catch (saveError) {
          console.error('에러 파일 저장 실패:', saveError.message);
        }
      }

      if (error.request) {
        console.error('Request was made but no response received');
        console.error('Request config:', {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        });
      }

      console.error('=====================================');
      throw new Error(`GraphQL API 요청 실패: ${error.message}`);
    }
  }

  async saveToCsv(data, filename) {
    return FileUtils.saveToCsv(data, filename);
  }

  async saveToJson(data, filename) {
    return FileUtils.saveToJson(data, filename);
  }

  displayResults(data) {
    return FileUtils.displayResults(data);
  }

  // 테스트 호환성을 위한 메서드들
  detectCategory(keyword) {
    return this.naverLocationService.detectCategory(keyword);
  }

  buildGraphQLPayload(keyword, display, start, adStart, coords = null) {
    const category = this.naverLocationService.detectCategory(keyword);
    return this.graphQLBuilder.buildPayload(
      category,
      keyword,
      display,
      start,
      adStart,
      coords
    );
  }
}

export default NaverStoreScraper;
