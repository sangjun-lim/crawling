# Parsers 분리 계획

## 개요
현재 스크래퍼 파일들에 분산되어 있는 데이터 파싱 로직을 `src/parsers/` 폴더로 분리하여 코드의 재사용성과 테스트 용이성을 향상시킨다.

## 현재 상태 분석

### 기존 Parser
- `src/parsers/naver-store-response-parser.js` - 네이버 스토어 GraphQL 응답 파싱

### 분리 대상 Parser 코드들

#### 1. Coupang 스크래퍼들
**위치**: `src/scrapers/coupang/`

**분리 가능한 파싱 로직**:
- **Vendor 응답 파싱**: API 응답을 정규화된 벤더 정보 구조로 변환
- **Product 응답 파싱**: 상품 목록 API 응답 파싱
- **Combined 데이터 결합**: 벤더+상품 데이터를 horizontal 구조로 결합

**현재 구현**:
```javascript
// vendor-scraper.js:56-73
return {
  success: true,
  storeId,
  vendorId,
  data: response.data,
  timestamp: new Date().toISOString(),
};

// combined-scraper.js:260-287, 410-430
// 벤더 정보와 상품 정보 결합 로직
const vendorWithProducts = {
  ...vendorData,
  vendorId,
  storeId: vendorResult.storeId,
  수집시간: vendorResult.timestamp,
};
```

#### 2. NaverSmartStoreScraper
**위치**: `src/scrapers/naver/naver-smart-store-scraper.js`

**분리 가능한 파싱 로직**:

##### API 응답 파싱 (408-486행)
복잡한 네이버 스마트스토어 API 데이터 추출:
```javascript
// 현재 processApiResponse() 메서드
const extractedData = {
  productId: apiData.id,
  productNo: apiData.productNo,
  name: apiData.name,
  salePrice: apiData.salePrice,
  // ... 복잡한 중첩 데이터 추출
  category: {
    name: apiData.category?.categoryName,
    fullPath: apiData.category?.wholeCategoryName,
  },
  options: apiData.optionCombinations?.map(/* ... */),
  images: apiData.productImages?.map(/* ... */),
  // ...
};
```

##### HTML 폴백 파싱 (491-552행)
DOM에서 데이터 추출:
```javascript
// 현재 extractFallbackData() 메서드
return {
  name: extractElementText([/* 선택자들 */]),
  salePrice: extractPrice([/* 선택자들 */]),
  brand: extractElementText([/* 선택자들 */]),
};
```

#### 3. NaverShoppingScraper
**위치**: `src/scrapers/naver/naver-shopping-scraper.js`

**분리 가능한 파싱 로직**:
- HTML 컨텐츠 정리 및 메타데이터 추가
- 검색 결과 페이지 구조 분석

## 제안하는 Parser 구조

### 최종 권장 구조 (플랫폼별 폴더 분리)

```
src/parsers/
├── coupang/
│   ├── vendor-parser.js       (신규)
│   ├── product-parser.js      (신규)
│   └── combined-parser.js     (신규)
└── naver/
    ├── store-response-parser.js (기존 파일 이주)
    ├── smartstore-api-parser.js (신규)
    ├── smartstore-html-parser.js (신규)
    └── shopping-html-parser.js   (신규)
```

### 구조 선택 근거

**플랫폼별 폴더 구조를 선택한 이유:**

1. **코드베이스 일관성**
   - `src/scrapers/`도 이미 `naver/`, `coupang/` 폴더로 분리됨
   - 동일한 구조로 전체적 일관성 확보

2. **확장성**
   - 11번가, G마켓, 옥션 등 새 플랫폼 추가 시 새 폴더만 생성
   - 각 플랫폼별 독립적 확장 가능

3. **명확한 네임스페이스**
   ```javascript
   // 명확한 import 경로
   import CoupangVendorParser from '../parsers/coupang/vendor-parser.js';
   import NaverStoreParser from '../parsers/naver/store-response-parser.js';
   ```

4. **팀 작업 효율성**
   - 플랫폼별 담당팀이 독립적으로 개발 가능
   - 코드 충돌 최소화

5. **파일명 간소화**
   - `naver-store-response-parser.js` → `store-response-parser.js`
   - 폴더가 플랫폼을 나타내므로 파일명에서 중복 제거

### 대안들과 비교

**1. 단일 루트 구조** (기각됨)
```
src/parsers/
├── naver-store-response-parser.js
├── naver-smartstore-api-parser.js
├── coupang-vendor-parser.js
└── ...
```
- 장점: 단순한 구조
- 단점: 파일 수 증가 시 관리 복잡, 확장성 부족

**2. 기능별 그룹핑** (기각됨)
```
src/parsers/
├── api-parsers/
├── html-parsers/
└── response-parsers/
```
- 장점: 기술적 관심사별 분류
- 단점: 비즈니스 도메인과 불일치, 플랫폼 이해를 위해 여러 폴더 확인 필요

### 마이그레이션 고려사항

1. **기존 파일 이주**: `naver-store-response-parser.js` → `naver/store-response-parser.js`
2. **Import 경로 업데이트**: 기존 파일을 참조하는 모든 import 수정  
3. **점진적 전환**: 기존 파일은 당분간 유지하고 deprecated 표시

## 상세 분리 계획

### 1. CoupangVendorParser
**파일**: `src/parsers/coupang/vendor-parser.js`

**역할**: 쿠팡 벤더 API 응답을 정규화
```javascript
class CoupangVendorParser {
  parseVendorResponse(response, vendorId, storeId) {
    return {
      success: true,
      storeId,
      vendorId,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  }
  
  parseVendorError(error, vendorId, storeId) {
    return {
      success: false,
      storeId,
      vendorId,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}
```

### 2. CoupangProductParser
**파일**: `src/parsers/coupang/product-parser.js`

**역할**: 쿠팡 상품 목록 API 응답 파싱
```javascript
class CoupangProductParser {
  parseProductListResponse(response, vendorId, storeId, requestParams) {
    return {
      success: true,
      vendorId,
      storeId,
      data: response.data,
      timestamp: new Date().toISOString(),
      requestParams,
    };
  }
  
  parseProductsWithTimestamp(products) {
    return products.map(product => ({
      ...product,
      collectedAt: new Date().toISOString(),
    }));
  }
}
```

### 3. CoupangCombinedParser
**파일**: `src/parsers/coupang/combined-parser.js`

**역할**: 벤더+상품 데이터 결합
```javascript
class CoupangCombinedParser {
  combineVendorWithProducts(vendorData, vendorId, storeId, timestamp, products = []) {
    if (products.length === 0) {
      return {
        ...vendorData,
        vendorId,
        storeId,
        수집시간: timestamp,
        상품명: '',
        상품링크: '',
        상품ID: '',
        상품수집시간: '',
      };
    }
    
    const vendorWithProducts = {
      ...vendorData,
      vendorId,
      storeId,
      수집시간: timestamp,
    };
    
    // Horizontal 상품 데이터 추가
    let productCollectedTime = '';
    products.forEach((product, index) => {
      const productNum = index + 1;
      vendorWithProducts[`상품명${productNum}`] = product.imageAndTitleArea?.title || '';
      vendorWithProducts[`상품링크${productNum}`] = product.link || '';
      vendorWithProducts[`상품ID${productNum}`] = product.productId || '';
      
      if (index === 0) {
        productCollectedTime = product.collectedAt || '';
      }
    });
    
    if (productCollectedTime) {
      vendorWithProducts['상품수집시간'] = productCollectedTime;
    }
    
    return vendorWithProducts;
  }
}
```

### 4. NaverSmartstoreApiParser
**파일**: `src/parsers/naver/smartstore-api-parser.js`

**역할**: 스마트스토어 API 응답 파싱
```javascript
class NaverSmartstoreApiParser {
  parseProductApiResponse(apiData) {
    return {
      productId: apiData.id,
      productNo: apiData.productNo,
      name: apiData.name,
      salePrice: apiData.salePrice,
      dispSalePrice: apiData.dispSalePrice,
      discountedSalePrice: apiData.benefitsView?.discountedSalePrice,
      discountedRatio: apiData.benefitsView?.discountedRatio,
      stockQuantity: apiData.stockQuantity,
      brand: apiData.naverShoppingSearchInfo?.brandName,
      manufacturer: apiData.naverShoppingSearchInfo?.manufacturerName,
      modelName: apiData.naverShoppingSearchInfo?.modelName,
      category: this.parseCategory(apiData.category),
      productDeliveryInfo: this.parseDeliveryInfo(apiData.productDeliveryInfo),
      options: this.parseOptions(apiData.optionCombinations),
      images: this.parseImages(apiData.productImages),
      channel: this.parseChannel(apiData.channel),
      sellerTags: apiData.sellerTags || [],
      attributes: this.parseAttributes(apiData.productAttributes),
    };
  }
  
  parseCategory(category) {
    return {
      name: category?.categoryName,
      fullPath: category?.wholeCategoryName,
    };
  }
  
  // 기타 헬퍼 메서드들...
}
```

### 5. NaverSmartstoreHtmlParser
**파일**: `src/parsers/naver/smartstore-html-parser.js`

**역할**: HTML DOM에서 fallback 데이터 추출
```javascript
class NaverSmartstoreHtmlParser {
  extractFallbackData(page) {
    return page.evaluate(() => {
      const extractElementText = (selectors) => {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
        return null;
      };
      
      const extractPrice = (selectors) => {
        // 가격 추출 로직
      };
      
      return {
        name: extractElementText([
          'h1',
          '[class*="prod_buy_header"] h3',
          '[class*="product"] h1',
          '.product_title',
        ]),
        salePrice: extractPrice([
          '.price_area .price',
          '.total_price',
          '[class*="price"]:not([class*="original"])',
          '.sale_price',
        ]),
        brand: extractElementText([
          '.channel_name',
          '.seller_name',
          '[class*="brand"]',
        ]),
      };
    });
  }
}
```

### 6. NaverShoppingHtmlParser
**파일**: `src/parsers/naver/shopping-html-parser.js`

**역할**: 네이버 쇼핑 HTML 정리 및 메타데이터 추가
```javascript
class NaverShoppingHtmlParser {
  addMetadataToHtml(htmlContent, productId) {
    const metaComment = `<!--
=== 네이버 상품 페이지 HTML ===
상품 ID: ${productId || 'Unknown'}
수집 시간: ${new Date().toISOString()}
파일 크기: ${htmlContent.length.toLocaleString()} 문자
수집 도구: NaverShoppingScraper (CDP 연결)
-->
`;
    
    return metaComment + htmlContent;
  }
  
  parseSearchResults(htmlContent) {
    // 검색 결과 파싱 로직
  }
}
```

## 마이그레이션 계획

### Phase 1: Parser 클래스 생성
1. 각 Parser 클래스를 새로 생성
2. 기존 스크래퍼에서 파싱 로직 복사
3. 단위 테스트 작성

### Phase 2: 스크래퍼 리팩토링
1. 스크래퍼에서 Parser 인스턴스 사용
2. 기존 파싱 로직 제거
3. 통합 테스트 실행

### Phase 3: 검증 및 최적화
1. 기능 테스트 실행
2. 성능 비교
3. 코드 정리

## 예상 효과

### 장점
1. **코드 재사용성**: 파싱 로직을 다른 스크래퍼에서도 사용 가능
2. **테스트 용이성**: Parser만 별도로 단위 테스트 가능
3. **유지보수성**: 파싱 로직 변경 시 한 곳만 수정
4. **관심사 분리**: 스크래핑 로직과 파싱 로직 분리
5. **타입 안전성**: Parser 출력 구조를 일관되게 관리

### 주의사항
1. **의존성 관리**: Parser가 외부 라이브러리에 의존하지 않도록 주의
2. **에러 처리**: Parser에서 발생하는 에러를 적절히 처리
3. **성능**: 불필요한 객체 생성을 피하여 성능 유지

## 구현 우선순위

1. **High Priority**: CoupangCombinedParser - 가장 복잡한 데이터 결합 로직
2. **Medium Priority**: NaverSmartstoreApiParser - 복잡한 중첩 데이터 파싱
3. **Low Priority**: 나머지 Parser들 - 상대적으로 단순한 파싱 로직

이 계획을 통해 코드베이스의 구조를 개선하고 향후 확장성을 확보할 수 있습니다.