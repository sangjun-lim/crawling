import categoryKeywords from '../config/categories.js';
import { COORDINATE_BOUNDS, API_URLS } from '../config/constants.js';

class NaverLocationService {
  constructor() {
    this.categoryKeywords = categoryKeywords;
  }

  /**
   * 검색어를 분석하여 적절한 비즈니스 카테고리를 감지
   * @param {string} keyword - 검색 키워드
   * @returns {string} 감지된 카테고리 (restaurant, hospital, beauty, accommodation, place)
   */
  detectCategory(keyword) {
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      if (keywords.some(kw => keyword.includes(kw))) {
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
      
      const response = await httpClient.get(API_URLS.INSTANT_SEARCH, {
        query: keyword,
        coords: defaultCoords
      }, {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.6,en;q=0.4',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Expires': 'Sat, 01 Jan 2000 00:00:00 GMT',
        'Referer': 'https://map.naver.com/p',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty'
      });

      const data = response.data;
      
      if (data?.place?.length > 0) {
        const place = data.place[0];
        if (place.x && place.y) {
          const coords = {
            x: place.x.toString(),
            y: place.y.toString(),
            clientX: place.x.toString(),
            clientY: place.y.toString(),
            bounds: this.calculateBounds(parseFloat(place.x), parseFloat(place.y))
          };
          
          console.log(`장소 좌표 획득 성공: ${place.title} (${coords.x}, ${coords.y})`);
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
}

export default NaverLocationService;