import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';
import categoryKeywords from '../config/categories.js';
import { COORDINATE_BOUNDS, API_URLS } from '../config/constants.js';

class NaverMapService {
  constructor(options = {}) {
    this.options = {
      resultDirectory: options.resultDirectory || 'result',
      encoding: options.encoding || 'utf8',
    };
    this.categoryKeywords = categoryKeywords;
  }

  /**
   * 검색어를 분석하여 적절한 비즈니스 카테고리를 감지
   * @param {string} keyword - 검색 키워드
   * @returns {string} 감지된 카테고리 (restaurant, hospital, beauty, accommodation, place)
   */
  detectCategory(keyword) {
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some((kw) => keyword.includes(kw))) {
        console.log(`검색어 "${keyword}" → 카테고리: ${category}`);
        return category;
      }
    }
    console.log(`검색어 "${keyword}" → 카테고리: place (기본값)`);
    return 'place';
  }

  /**
   * 좌표 경계 계산
   * @param {number} x - X 좌표
   * @param {number} y - Y 좌표
   * @returns {string} 경계 문자열 (minX;minY;maxX;maxY)
   */
  calculateBounds(x, y) {
    const radiusX = COORDINATE_BOUNDS.RADIUS_X;
    const radiusY = COORDINATE_BOUNDS.RADIUS_Y;

    const minX = x - radiusX;
    const minY = y - radiusY;
    const maxX = x + radiusX;
    const maxY = y + radiusY;

    return `${minX};${minY};${maxX};${maxY}`;
  }

  /**
   * 키워드를 통해 지역 좌표를 검색
   * @param {string} keyword - 검색 키워드
   * @param {HttpClient} httpClient - HTTP 클라이언트
   * @returns {Object|null} 좌표 객체 또는 null
   */
  async getLocationCoordinates(keyword, httpClient) {
    try {
      console.log(`"${keyword}" 키워드로 지역 좌표 검색 중...`);

      const defaultCoords = '37.595395999999354,126.67367494605946';

      const response = await httpClient.get(
        API_URLS.INSTANT_SEARCH,
        {
          query: keyword,
          coords: defaultCoords,
        },
        {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.6,en;q=0.4',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Expires: 'Sat, 01 Jan 2000 00:00:00 GMT',
          Referer: 'https://map.naver.com/p',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        }
      );

      const data = response.data;

      if (data?.place?.length > 0) {
        const place = data.place[0];
        if (place.x && place.y) {
          const coords = {
            x: place.x.toString(),
            y: place.y.toString(),
            clientX: place.x.toString(),
            clientY: place.y.toString(),
            bounds: this.calculateBounds(
              parseFloat(place.x),
              parseFloat(place.y)
            ),
          };

          console.log(
            `장소 좌표 획득 성공: ${place.title} (${coords.x}, ${coords.y})`
          );
          return coords;
        }
      }

      console.log('좌표를 찾을 수 없어 기본 좌표 사용');
      return null;
    } catch (error) {
      console.warn(`좌표 검색 실패, 기본 좌표 사용: ${error.message}`);
      return null;
    }
  }

  async saveToCsv(data, filename, headers = null) {
    // result 폴더 자동 생성
    const resultDir = this.options.resultDirectory;
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    const fullPath = path.join(resultDir, filename);

    // 기본 네이버 스토어 헤더 또는 커스텀 헤더 사용
    const csvHeaders = headers || [
      { id: 'rank', title: '순위' },
      { id: 'name', title: '매장명' },
      { id: 'category', title: '카테고리' },
      { id: 'address', title: '주소' },
      { id: 'phone', title: '전화번호' },
      { id: 'rating', title: '평점' },
      { id: 'reviewCount', title: '리뷰수' },
      { id: 'saveCount', title: '저장수' },
      { id: 'distance', title: '거리' },
      { id: 'type', title: '타입' },
      { id: 'adId', title: '광고ID' },
    ];

    const csvWriter = createObjectCsvWriter({
      path: fullPath,
      header: csvHeaders,
      encoding: this.options.encoding,
    });

    const records = data.stores || data;
    await csvWriter.writeRecords(records);
    console.log(`CSV 파일 저장 완료: ${fullPath}`);

    return fullPath;
  }

  async saveToJson(data, filename) {
    // result 폴더 자동 생성
    const resultDir = this.options.resultDirectory;
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    const fullPath = path.join(resultDir, filename);
    fs.writeFileSync(
      fullPath,
      JSON.stringify(data, null, 2),
      this.options.encoding
    );
    console.log(`JSON 파일 저장 완료: ${fullPath}`);

    return fullPath;
  }

  async saveToFile(content, filename) {
    // result 폴더 자동 생성
    const resultDir = this.options.resultDirectory;
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    const fullPath = path.join(resultDir, filename);
    fs.writeFileSync(fullPath, content, this.options.encoding);
    console.log(`파일 저장 완료: ${fullPath}`);

    return fullPath;
  }

  displayResults(data) {
    const stores = data.stores || data;
    if (!stores || stores.length === 0) {
      console.log('검색 결과가 없습니다.');
      return;
    }

    const keyword = data.keyword || '검색';
    console.log(`\n"${keyword}" 검색 결과 (총 ${stores.length}개):`);
    console.log('='.repeat(80));

    stores.forEach((store) => {
      const typeIcon = store.type === 'ad' ? '🟨' : '🟩';
      console.log(
        `${store.rank}. ${typeIcon} ${store.name}${
          store.type === 'ad' ? ' (광고)' : ''
        }`
      );
      console.log(`   카테고리: ${store.category}`);
      console.log(`   주소: ${store.address}`);
      console.log(`   전화: ${store.phone}`);

      if (store.rating !== 'N/A') {
        console.log(`   평점: ${store.rating} (리뷰 ${store.reviewCount}개)`);
      }

      if (store.distance !== 'N/A') {
        console.log(`   거리: ${store.distance}`);
      }

      console.log('-'.repeat(50));
    });
  }

  // 데이터 정규화 메서드
  normalizeStoreData(restaurant) {
    return {
      name: restaurant.name || restaurant.title || 'N/A',
      category: restaurant.category || restaurant.businessCategory || 'N/A',
      address:
        restaurant.fullAddress ||
        restaurant.address ||
        restaurant.roadAddress ||
        restaurant.addr ||
        'N/A',
      phone:
        restaurant.phone ||
        restaurant.virtualPhone ||
        restaurant.tel ||
        restaurant.telephone ||
        'N/A',
      rating:
        restaurant.visitorReviewScore ||
        restaurant.rating ||
        restaurant.score ||
        'N/A',
      reviewCount:
        restaurant.visitorReviewCount || restaurant.totalReviewCount || 'N/A',
      saveCount: restaurant.saveCount || 'N/A',
      distance: restaurant.distance || 'N/A',
      source: 'naver_map_scraping',
      id: restaurant.id || 'N/A',
    };
  }

  // 디렉토리 생성 유틸리티
  ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // 파일명 생성 유틸리티
  generateTimestampFilename(prefix, extension = 'csv') {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    return `${prefix}_${timestamp}.${extension}`;
  }
}

export default NaverMapService;
