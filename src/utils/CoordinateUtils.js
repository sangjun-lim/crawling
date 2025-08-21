import { COORDINATE_BOUNDS, API_URLS } from '../config/constants.js';

class CoordinateUtils {
  static calculateBounds(x, y) {
    const radiusX = COORDINATE_BOUNDS.RADIUS_X;
    const radiusY = COORDINATE_BOUNDS.RADIUS_Y;
  
    const minX = x - radiusX;
    const minY = y - radiusY;
    const maxX = x + radiusX;
    const maxY = y + radiusY;
    
    return `${minX};${minY};${maxX};${maxY}`;
  }

  static async getLocationCoordinates(keyword, httpClient) {
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

export default CoordinateUtils;