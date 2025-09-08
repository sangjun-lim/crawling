import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';

class FileUtils {
  static async saveToCsv(data, filename) {
    // result 폴더 자동 생성
    const resultDir = 'result';
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    const fullPath = path.join(resultDir, filename);
    const csvWriter = createObjectCsvWriter({
      path: fullPath,
      header: [
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
        { id: 'adId', title: '광고ID' }
      ],
      encoding: 'utf8'
    });

    await csvWriter.writeRecords(data.stores);
    console.log(`CSV 파일 저장 완료: ${fullPath}`);
  }

  static async saveToJson(data, filename) {
    // result 폴더 자동 생성
    const resultDir = 'result';
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    const fullPath = path.join(resultDir, filename);
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`JSON 파일 저장 완료: ${fullPath}`);
  }

  static async saveToFile(content, filename) {
    // result 폴더 자동 생성
    const resultDir = 'result';
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    const fullPath = path.join(resultDir, filename);
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`파일 저장 완료: ${fullPath}`);
  }

  static displayResults(data) {
    if (data.stores.length === 0) {
      console.log('검색 결과가 없습니다.');
      return;
    }

    console.log(`\n"${data.keyword}" 검색 결과 (총 ${data.stores.length}개):`);
    console.log('='.repeat(80));
    
    data.stores.forEach(store => {
      const typeIcon = store.type === 'ad' ? '🟨' : '🟩';
      console.log(`${store.rank}. ${typeIcon} ${store.name}${store.type === 'ad' ? ' (광고)' : ''}`);
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

  static normalizeStoreData(restaurant) {
    return {
      name: restaurant.name || restaurant.title || 'N/A',
      category: restaurant.category || restaurant.businessCategory || 'N/A',
      address: restaurant.fullAddress || restaurant.address || restaurant.roadAddress || restaurant.addr || 'N/A',
      phone: restaurant.phone || restaurant.virtualPhone || restaurant.tel || restaurant.telephone || 'N/A',
      rating: restaurant.visitorReviewScore || restaurant.rating || restaurant.score || 'N/A',
      reviewCount: restaurant.visitorReviewCount || restaurant.totalReviewCount || 'N/A',
      saveCount: restaurant.saveCount || 'N/A',
      distance: restaurant.distance || 'N/A',
      source: 'naver_map_scraping',
      id: restaurant.id || 'N/A'
    };
  }
}

export default FileUtils;