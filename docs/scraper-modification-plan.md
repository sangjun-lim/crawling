# 네이버 스크래퍼 수정 계획

## 개요
현재 스크래퍼는 모든 검색어에 대해 동일한 `getRestaurants` GraphQL 쿼리를 사용하고 있습니다. 
하지만 네이버 지도는 검색어 카테고리에 따라 다른 전용 API를 호출합니다.
이를 반영하여 검색 정확도와 결과 품질을 향상시키는 것이 목표입니다.

## 현재 문제점
- 병원 검색에 맛집용 API 사용
- 미용실 검색에 맞지 않는 응답 구조
- 카테고리별 특화 정보 누락

## 수정 계획

### 1. 검색어 분류 시스템

#### 1.1 카테고리 정의
```javascript
const SEARCH_CATEGORIES = {
  HOSPITAL: 'hospital',        // 병원/의료
  BEAUTY: 'beauty',           // 미용실/뷰티
  RESTAURANT: 'restaurant',   // 맛집/음식점 (기존)
  ACCOMMODATION: 'accommodation', // 숙박
  PLACE: 'place'             // 일반 장소 (기본값)
};
```

#### 1.2 키워드 매핑
```javascript
const categoryKeywords = {
  hospital: [
    '병원', '치과', '피부과', '한의원',
    '내과', '외과', '산부인과', '소아과', '정형외과',
    '안과', '이비인후과', '신경과', '정신과'
  ],
  beauty: [
    '미용실', '헤어샵', '헤어살롱', '네일샵', '네일아트'
  ],
  restaurant: [
    '맛집', '음식점', '식당', '레스토랑', '카페',
    '치킨', '피자', '한식', '중식', '일식', '양식',
    '분식', '고기집', '술집'
  ],
  accommodation: [
    '펜션', '호텔', '게스트하우스',
    '민박', '풀빌라', '글램핑', '한옥스테이', '캠핑장'
  ]
};
```

### 2. GraphQL Payload 구조 변경

#### 2.1 현재 구조 (naverScraper.js:422)
```javascript
buildGraphQLPayload(keyword, display, start, adStart, coords = null) {
  // 모든 검색어에 대해 getRestaurants 사용
}
```

#### 2.2 수정될 구조
```javascript
// 메인 메서드
buildGraphQLPayload(keyword, display, start, adStart, coords = null) {
  const category = this.detectCategory(keyword);
  
  switch(category) {
    case 'hospital':
      return this.buildHospitalPayload(keyword, display, start, adStart, coords);
    case 'beauty':
      return this.buildBeautyPayload(keyword, display, start, adStart, coords);
    case 'restaurant':
      return this.buildRestaurantPayload(keyword, display, start, adStart, coords); // 기존
    case 'accommodation':
      return this.buildAccommodationPayload(keyword, display, start, adStart, coords);
    default:
      return this.buildPlacePayload(keyword, display, start, adStart, coords);
  }
}

// 카테고리 탐지
detectCategory(keyword) {
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => keyword.includes(kw))) {
      return category;
    }
  }
  return 'place'; // 기본값
}
```

### 3. 카테고리별 Payload 구현

#### 3.1 병원용 Payload
```javascript
buildHospitalPayload(keyword, display, start, adStart, coords) {
  return [
    {
      operationName: "getNxList",
      variables: {
        isNmap: true,
        isBounds: true,
        useReverseGeocode: true,
        input: {
          query: keyword,
          display: display,
          start: start,
          filterBooking: false,
          filterOpentime: false,
          filterSpecialist: false,
          sortingOrder: "precision",
          x: coords.x,
          y: coords.y,
          clientX: coords.clientX,
          clientY: coords.clientY,
          bounds: coords.bounds,
          deviceType: "pcmap"
        },
        reverseGeocodingInput: {
          x: coords.clientX,
          y: coords.clientY
        }
      },
      query: `query getNxList($input: HospitalListInput, ...) { ... }` // 병원 전용 쿼리
    },
    {
      operationName: "getAdBusinessList",
      variables: {
        input: {
          query: keyword,
          start: adStart,
          x: coords.x,
          y: coords.y,
          businessType: "hospital", // 병원용 businessType
          deviceType: "pcmap",
          // ... 기타 파라미터
        }
      },
      query: `query getAdBusinessList(...) { ... }` // 공통 광고 쿼리
    }
  ];
}
```

#### 3.2 미용실용 Payload
```javascript
buildBeautyPayload(keyword, display, start, adStart, coords) {
  return [
    {
      operationName: "getBeautyList",
      variables: {
        useReverseGeocode: true,
        input: {
          query: keyword,
          display: display,
          start: start,
          filterBooking: false,
          filterCoupon: false,
          filterNpay: false,
          filterOpening: false,
          filterBookingPromotion: false,
          naverBenefit: false,
          sortingOrder: "precision",
          x: coords.x,
          y: coords.y,
          bounds: coords.bounds,
          deviceType: "pcmap",
          bypassStyleClous: false,
          ignoreQueryResult: false
        },
        businessType: "hairshop", // 미용실 전용 businessType
        reverseGeocodingInput: {
          x: coords.clientX,
          y: coords.clientY
        }
      },
      query: `query getBeautyList(...) { ... }` // 미용실 전용 쿼리
    },
    // getAdBusinessList는 공통
  ];
}
```

#### 3.3 숙박용 Payload
```javascript
buildAccommodationPayload(keyword, display, start, adStart, coords) {
  return [
    {
      operationName: "getAccommodationList",
      variables: {
        useReverseGeocode: true,
        input: {
          query: keyword,
          display: display,
          start: start,
          x: coords.x,
          y: coords.y,
          bounds: coords.bounds,
          deviceType: "pcmap"
        },
        isNmap: true,
        isBounds: true,
        reverseGeocodingInput: {
          x: coords.clientX,
          y: coords.clientY
        }
      },
      query: `query getAccommodationList(...) { ... }` // 숙박 전용 쿼리
    },
    {
      operationName: "getAdBusinessList",
      variables: {
        input: {
          query: keyword,
          start: adStart,
          x: coords.x,
          y: coords.y,
          businessType: "accommodation", // 숙박용 businessType
          deviceType: "pcmap",
          // ... 기타 파라미터
        }
      },
      query: `query getAdBusinessList(...) { ... }` // 공통 광고 쿼리
    }
  ];
}
```

#### 3.4 일반 장소용 Payload
```javascript
buildPlacePayload(keyword, display, start, adStart, coords) {
  return [
    {
      operationName: "getPlacesList",
      variables: {
        input: {
          query: keyword,
          display: display,
          start: start,
          x: coords.x,
          y: coords.y,
          bounds: coords.bounds,
          deviceType: "pcmap"
        }
      },
      query: `query getPlacesList(...) { ... }` // 일반 장소 쿼리
    },
    // getAdBusinessList는 공통
  ];
}
```

### 4. 응답 파싱 로직 수정

#### 4.1 현재 parseStoresFromGraphQLResponse 수정
```javascript
parseStoresFromGraphQLResponse(responseData, page = 1, category = 'restaurant') {
  const allStores = [];
  
  // 카테고리별 응답 구조 처리
  switch(category) {
    case 'hospital':
      return this.parseHospitalResponse(responseData, page);
    case 'beauty':
      return this.parseBeautyResponse(responseData, page);
    case 'restaurant':
      return this.parseRestaurantResponse(responseData, page); // 기존 로직
    case 'accommodation':
      return this.parseAccommodationResponse(responseData, page);
    default:
      return this.parsePlaceResponse(responseData, page);
  }
}
```

#### 4.2 카테고리별 파싱 메서드
```javascript
parseHospitalResponse(responseData, page) {
  // getNxList 응답 처리
  const hospitalsResponse = responseData[0];
  if (hospitalsResponse?.data?.businesses?.items) {
    // 병원 특화 데이터 파싱
  }
}

parseBeautyResponse(responseData, page) {
  // getBeautyList 응답 처리
  const beautyResponse = responseData[0];
  if (beautyResponse?.data?.businesses?.items) {
    // 미용실 특화 데이터 파싱
  }
}

parseAccommodationResponse(responseData, page) {
  // getAccommodationList 응답 처리
  const accommodationResponse = responseData[0];
  if (accommodationResponse?.data?.accommodationSearch?.business?.items) {
    // 숙박 특화 데이터 파싱 (roomImages, avgPrice, facility 등)
  }
}
```

### 5. businessType 매핑 테이블

| 카테고리 | operationName | businessType | 설명 |
|----------|---------------|--------------|------|
| 병원 | getNxList | hospital | 의료기관 전용 API |
| 미용실 | getBeautyList | hairshop | 미용/뷰티 전용 API |
| 맛집 | getRestaurants | restaurant | 음식점 전용 API (기존) |
| 숙박 | getAccommodationList | accommodation | 숙박시설 전용 API |
| 일반 | getPlacesList | 동적 결정 | 범용 장소 API |

### 6. 구현 순서

1. **1단계**: 검색어 분류 로직 구현
   - `detectCategory()` 메서드 추가
   - 키워드 매핑 테이블 정의

2. **2단계**: `buildGraphQLPayload` 메서드 리팩토링
   - 카테고리별 분기 로직 추가
   - 기존 코드를 `buildRestaurantPayload`로 분리

3. **3단계**: 카테고리별 Payload 빌더 구현
   - `buildHospitalPayload()`
   - `buildBeautyPayload()`
   - `buildAccommodationPayload()`
   - `buildPlacePayload()`

4. **4단계**: 응답 파싱 로직 수정
   - `parseStoresFromGraphQLResponse` 업데이트
   - 카테고리별 파싱 메서드 구현

5. **5단계**: 테스트 및 검증
   - 각 카테고리별 검색 테스트
   - 결과 품질 비교 검증

### 7. 예상 효과

- **정확도 향상**: 카테고리에 맞는 전용 API 사용
- **데이터 품질**: 각 카테고리별 특화 정보 수집
  - 숙박: 객실 이미지, 평균 가격, 편의시설 정보
  - 병원: 전문의 정보, 의료기관 번호
  - 미용실: 스타일 이미지, 대표 가격
- **확장성**: 새로운 카테고리 추가 용이
- **유지보수성**: 카테고리별 로직 분리로 관리 편의성 증대

### 8. 위험 요소 및 대응

#### 8.1 위험 요소
- 새로운 GraphQL 쿼리 구조로 인한 파싱 오류
- 카테고리 오분류로 인한 검색 결과 품질 저하
- 기존 기능 호환성 문제

#### 8.2 대응 방안
- 단계별 구현으로 리스크 최소화
- 기존 `getRestaurants` 로직을 fallback으로 유지
- 충분한 테스트 케이스 작성
- 로깅 강화로 문제 상황 추적

### 9. 테스트 계획

#### 9.1 테스트 케이스
```javascript
const testCases = [
  { keyword: '강남역 병원', expectedCategory: 'hospital' },
  { keyword: '홍대 미용실', expectedCategory: 'beauty' },
  { keyword: '건대 맛집', expectedCategory: 'restaurant' },
  { keyword: '제주도 펜션', expectedCategory: 'accommodation' },
  { keyword: '강남역 약국', expectedCategory: 'place' },
  { keyword: '서울대 치과', expectedCategory: 'hospital' },
  { keyword: '압구정 헤어샵', expectedCategory: 'beauty' },
  { keyword: '부산 호텔', expectedCategory: 'accommodation' },
  { keyword: '여의도 게스트하우스', expectedCategory: 'accommodation' }
];
```

#### 9.2 검증 기준
- 카테고리 분류 정확도 > 95%
- 응답 파싱 성공률 > 99%
- 기존 기능 호환성 100%
- 검색 결과 품질 개선 확인

---

## 다음 단계
1. 이 계획에 대한 검토 및 피드백
2. 우선순위에 따른 단계별 구현 시작
3. 테스트 환경 구성 및 검증