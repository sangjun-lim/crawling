import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';

class StorageService {
  constructor(options = {}) {
    this.options = {
      resultDirectory: options.resultDirectory || 'result',
      encoding: options.encoding || 'utf8'
    };
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
      { id: 'adId', title: '광고ID' }
    ];

    const csvWriter = createObjectCsvWriter({
      path: fullPath,
      header: csvHeaders,
      encoding: this.options.encoding
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
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), this.options.encoding);
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
    
    stores.forEach(store => {
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

  // 데이터 정규화 메서드
  normalizeStoreData(restaurant) {
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

export default StorageService;