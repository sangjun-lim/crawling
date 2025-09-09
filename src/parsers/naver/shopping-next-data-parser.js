class NaverShoppingNextDataParser {
  /**
   * HTML에서 __NEXT_DATA__ JSON 데이터 추출
   */
  extractNextDataFromHtml(htmlContent) {
    try {
      // <script id="__NEXT_DATA__" type="application/json"> 태그 찾기
      const scriptRegex =
        /<script\s+id="__NEXT_DATA__"\s+type="application\/json"[^>]*>(.*?)<\/script>/s;
      const match = htmlContent.match(scriptRegex);

      if (!match || !match[1]) {
        throw new Error('__NEXT_DATA__ script 태그를 찾을 수 없습니다');
      }

      const jsonString = match[1].trim();
      const nextData = JSON.parse(jsonString);

      return nextData;
    } catch (error) {
      throw new Error(`__NEXT_DATA__ 추출 실패: ${error.message}`);
    }
  }

  /**
   * 상품 정보 파싱
   */
  parseProductInfo(nextData) {
    try {
      const productInfo =
        nextData.props?.pageProps?.initialState?.catalog?.info;

      if (!productInfo) {
        throw new Error(
          '상품 정보를 찾을 수 없습니다 (props.pageProps.initialState.catalog.info)'
        );
      }

      return productInfo;
    } catch (error) {
      throw new Error(`상품 정보 파싱 실패: ${error.message}`);
    }
  }

  /**
   * 카테고리 정보 파싱
   */
  parseCategoryInfo(nextData) {
    try {
      const categoryInfo =
        nextData.props?.pageProps?.initialState?.catalog?.category;

      if (!categoryInfo) {
        throw new Error(
          '카테고리 정보를 찾을 수 없습니다 (props.pageProps.initialState.catalog.category)'
        );
      }

      return categoryInfo;
    } catch (error) {
      throw new Error(`카테고리 정보 파싱 실패: ${error.message}`);
    }
  }

  /**
   * 판매처별 상품 및 가격 정보 파싱
   */
  parseCatalogProducts(nextData) {
    try {
      const queries = nextData.props?.pageProps?.dehydratedState?.queries;

      if (!queries || !Array.isArray(queries)) {
        throw new Error('queries 배열을 찾을 수 없습니다');
      }

      // queryKey 배열의 첫번째 값이 "CatalogProducts"인 객체 찾기
      const catalogQuery = queries.find((query) => {
        return (
          query.queryKey &&
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'CatalogProducts'
        );
      });

      if (!catalogQuery) {
        throw new Error(
          'CatalogProducts queryKey를 가진 객체를 찾을 수 없습니다'
        );
      }

      const products = catalogQuery.state?.data?.Catalog_Products?.products;

      if (!products || !Array.isArray(products)) {
        throw new Error(
          '상품 목록을 찾을 수 없습니다 (state.data.Catalog_Products.products)'
        );
      }

      return products;
    } catch (error) {
      throw new Error(`판매처별 상품 정보 파싱 실패: ${error.message}`);
    }
  }

  /**
   * 파싱된 데이터를 구조화
   */
  structureProductData(productInfo, categoryInfo, catalogProducts, productId = null) {
    const productData = {
      metadata: {
        productId: productId || 'Unknown',
        extractedAt: new Date().toISOString(),
        extractor: 'NaverShoppingNextDataParser',
      },
      productInfo: productInfo,
      categoryInfo: categoryInfo,
      catalogProducts: catalogProducts,
      summary: {
        productInfoAvailable: !!productInfo,
        categoryInfoAvailable: !!categoryInfo,
        catalogProductsCount: catalogProducts ? catalogProducts.length : 0,
      },
    };

    return productData;
  }

  /**
   * HTML에서 모든 데이터를 파싱하는 통합 메서드
   */
  parseAllDataFromHtml(htmlContent, productId = null) {
    try {
      // 1. JSON 데이터 추출
      const nextData = this.extractNextDataFromHtml(htmlContent);

      // 2. 각 섹션별 파싱 (실패해도 계속 진행)
      let productInfo = null;
      let categoryInfo = null;
      let catalogProducts = null;

      try {
        productInfo = this.parseProductInfo(nextData);
      } catch (error) {
        console.warn(`상품 정보 파싱 실패: ${error.message}`);
      }

      try {
        categoryInfo = this.parseCategoryInfo(nextData);
      } catch (error) {
        console.warn(`카테고리 정보 파싱 실패: ${error.message}`);
      }

      try {
        catalogProducts = this.parseCatalogProducts(nextData);
      } catch (error) {
        console.warn(`판매처별 상품 정보 파싱 실패: ${error.message}`);
      }

      // 3. 데이터 구조화
      const structuredData = this.structureProductData(
        productInfo,
        categoryInfo,
        catalogProducts,
        productId
      );

      return {
        success: true,
        data: structuredData,
        nextData: nextData, // 원본 데이터도 함께 반환
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null,
        nextData: null,
      };
    }
  }

  /**
   * HTML 메타데이터 추가
   */
  addHtmlMetadata(htmlContent, productId = null) {
    const metaComment = `<!--
=== 네이버 상품 페이지 HTML ===
상품 ID: ${productId || 'Unknown'}
수집 시간: ${new Date().toISOString()}
파일 크기: ${htmlContent.length.toLocaleString()} 문자
수집 도구: NaverShoppingRealBrowserScraper
파서: NaverShoppingNextDataParser
-->
`;

    return metaComment + htmlContent;
  }
}

export default NaverShoppingNextDataParser;