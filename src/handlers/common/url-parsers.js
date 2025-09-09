export function parseNaverShoppingUrl(urlInput) {
  if (!urlInput.includes('search.shopping.naver.com/catalog/')) {
    throw new Error('올바른 네이버 쇼핑 catalog URL을 입력해주세요');
  }

  try {
    const url = new URL(urlInput);
    
    // 상품 ID 추출 (catalog/ 다음 숫자)
    const pathMatch = url.pathname.match(/\/catalog\/(\d+)/);
    if (!pathMatch) {
      throw new Error('URL에서 상품 ID를 추출할 수 없습니다');
    }
    const productId = pathMatch[1];

    // 검색어 추출 (query 파라미터)
    const queryParam = url.searchParams.get('query');
    if (!queryParam) {
      throw new Error('URL에서 검색어를 추출할 수 없습니다');
    }
    const searchKeyword = decodeURIComponent(queryParam);

    console.log(`📄 URL 파싱 결과:`);
    console.log(`  - 검색어: "${searchKeyword}"`);
    console.log(`  - 상품 ID: "${productId}"`);

    return { productId, searchKeyword };
    
  } catch (parseError) {
    throw new Error('URL 파싱 실패: ' + parseError.message);
  }
}

export function parseCoupangVendorId(idInput) {
  let vendorId = String(idInput).trim();
  if (!vendorId.startsWith('A')) {
    vendorId = `A${vendorId.padStart(8, '0')}`;
  }
  return vendorId;
}

export function parseCoupangVendorIds(range) {
  if (range.includes('-')) {
    // 범위로 처리: "39646-39650"
    const [start, end] = range.split('-').map(Number);
    return { type: 'range', start, end };
  } else if (range.includes(',')) {
    // 특정 ID들로 처리: "39646,39649,39651"
    const vendorIds = range
      .split(',')
      .map((id) => parseCoupangVendorId(id.trim()));
    return { type: 'list', vendorIds };
  } else {
    // 단일 ID: "39646"
    const vendorId = parseCoupangVendorId(range);
    return { type: 'single', vendorId };
  }
}