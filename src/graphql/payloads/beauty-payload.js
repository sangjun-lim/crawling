import BeautyQueries from '../queries/beauty-queries.js';
import CommonQueries from '../queries/common-queries.js';
import { DEFAULT_COORDS, BUSINESS_TYPES } from '../../config/constants.js';

class BeautyPayload {
  build(keyword, display, start, adStart, coords = null) {
    const coordsToUse = coords || DEFAULT_COORDS;

    return [
      {
        operationName: 'getBeautyList',
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
            sortingOrder: 'precision',
            x: coordsToUse.x,
            y: coordsToUse.y,
            bounds: coordsToUse.bounds,
            deviceType: 'pcmap',
            bypassStyleClous: false,
            ignoreQueryResult: false,
          },
          businessType: BUSINESS_TYPES.beauty,
          isNmap: true,
          isBounds: true,
          reverseGeocodingInput: {
            x: coordsToUse.clientX,
            y: coordsToUse.clientY,
          },
        },
        query: BeautyQueries.getBeautyList(),
      },
      {
        operationName: 'getAdBusinessList',
        variables: {
          input: {
            query: keyword,
            start: adStart,
            x: coordsToUse.x,
            y: coordsToUse.y,
            businessType: BUSINESS_TYPES.beauty,
            deviceType: 'pcmap',
            localQueryString: `pr=place_pcmap&version=2.0.0&pr=place&start=1&display=${display}&q=${encodeURIComponent(
              keyword
            )}`,
            bypassStyleClous: false,
          },
          isNmap: true,
        },
        query: CommonQueries.getAdBusinessListQuery(),
      },
    ];
  }
}

export default BeautyPayload;
