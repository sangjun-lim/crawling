import RestaurantQueries from '../queries/RestaurantQueries.js';
import CommonQueries from '../queries/common-queries.js';
import { DEFAULT_COORDS, BUSINESS_TYPES } from '../../config/constants.js';

class RestaurantPayload {
  build(keyword, display, start, adStart, coords = null) {
    const coordsToUse = coords || DEFAULT_COORDS;

    return [
      {
        operationName: 'getRestaurants',
        variables: {
          useReverseGeocode: true,
          isNmap: true,
          restaurantListInput: {
            query: keyword,
            x: coordsToUse.x,
            y: coordsToUse.y,
            start: start,
            display: display,
            takeout: null,
            orderBenefit: null,
            isCurrentLocationSearch: null,
            filterOpening: null,
            deviceType: 'pcmap',
            bounds: coordsToUse.bounds,
            isPcmap: true,
          },
          restaurantListFilterInput: {
            x: coordsToUse.x,
            y: coordsToUse.y,
            display: display,
            start: start,
            query: keyword,
            bounds: coordsToUse.bounds,
            isCurrentLocationSearch: null,
          },
          reverseGeocodingInput: {
            x: coordsToUse.clientX,
            y: coordsToUse.clientY,
          },
        },
        query: RestaurantQueries.getRestaurants(),
      },
      {
        operationName: 'getAdBusinessList',
        variables: {
          input: {
            query: keyword,
            start: adStart,
            x: coordsToUse.x,
            y: coordsToUse.y,
            businessType: BUSINESS_TYPES.restaurant,
            deviceType: 'pcmap',
            localQueryString: `pr=place_pcmap&version=2.0.0&st=poi&q_enc=utf-8&r_enc=utf-8&sm=all.basic.trade_query.deepmatch.force_use_center_coord&r_format=json&r_psglen=none&so=rel.dsc&hl=none&ic=basic&rp=none&r_query_info=1&start=1&display=70&q=${encodeURIComponent(
              keyword
            )}&iq_cid=220036&q_center_coordinate=${coordsToUse.x}%3B${
              coordsToUse.y
            }&r_query_select=1&eq_property=adult`,
            bypassStyleClous: false,
          },
          isNmap: true,
        },
        query: CommonQueries.getAdBusinessListQuery(),
      },
    ];
  }
}

export default RestaurantPayload;
