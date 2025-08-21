import FileUtils from '../utils/FileUtils.js';

class ResponseParser {
  parseStoresFromGraphQLResponse(responseData, page = 1) {
    try {
      const allStores = [];
      
      // 첫 번째 응답 (메인 비즈니스 데이터) 처리
      const mainResponse = responseData[0];
      if (mainResponse?.data) {
        const mainStores = this.parseMainResponse(mainResponse.data);
        const normalizedMainStores = mainStores.map(store => ({
          ...FileUtils.normalizeStoreData(store),
          type: 'organic'
        }));
        allStores.push(...normalizedMainStores);
        console.log(`페이지 ${page}: 메인 결과 ${mainStores.length}개`);
      }

      // 두 번째 응답 (광고) 처리
      const adsResponse = responseData[1];
      if (adsResponse?.data?.adBusinesses?.items) {
        const adBusinesses = adsResponse.data.adBusinesses.items;
        const normalizedAds = adBusinesses.map(ad => ({
          ...FileUtils.normalizeStoreData(ad),
          type: 'ad',
          adId: ad.adId
        }));
        allStores.push(...normalizedAds);
        console.log(`페이지 ${page}: 광고 ${adBusinesses.length}개`);
      }

      console.log(`페이지 ${page} 총합: ${allStores.length}개`);
      return allStores;

    } catch (error) {
      throw new Error(`GraphQL 응답 파싱 실패: ${error.message}`);
    }
  }

  parseMainResponse(data) {
    // 각 카테고리별로 다른 응답 구조를 처리
    if (data.restaurants?.items) {
      return data.restaurants.items; // 레스토랑
    } else if (data.businesses?.items) {
      return data.businesses.items; // 병원, 미용실
    } else if (data.accommodationSearch?.business?.items) {
      return data.accommodationSearch.business.items; // 숙박
    } else if (data.places?.items) {
      return data.places.items; // 일반 장소
    }
    
    return [];
  }
}

export default ResponseParser;