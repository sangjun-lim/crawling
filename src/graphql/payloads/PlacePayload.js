import PlaceQueries from '../queries/PlaceQueries.js';
import CommonQueries from '../queries/CommonQueries.js';
import { DEFAULT_COORDS, BUSINESS_TYPES } from '../../config/constants.js';

class PlacePayload {
  build(keyword, display, start, adStart, coords = null) {
    const coordsToUse = coords || DEFAULT_COORDS;
    
    return [
      {
        operationName: "getPlacesList",
        variables: {
          useReverseGeocode: true,
          input: {
            query: keyword,
            start: start,
            display: display,
            adult: false,
            spq: false,
            queryRank: "",
            x: coordsToUse.x,
            y: coordsToUse.y,
            clientX: coordsToUse.clientX,
            clientY: coordsToUse.clientY,
            deviceType: "pcmap",
            bounds: coordsToUse.bounds
          },
          isNmap: true,
          isBounds: true,
          reverseGeocodingInput: {
            x: coordsToUse.clientX,
            y: coordsToUse.clientY
          }
        },
        query: PlaceQueries.getPlacesList()
      },
      {
        operationName: "getAdBusinessList",
        variables: {
          input: {
            query: keyword,
            start: adStart,
            x: coordsToUse.x,
            y: coordsToUse.y,
            businessType: BUSINESS_TYPES.place,
            deviceType: "pcmap",
            localQueryString: `pr=place_pcmap&version=2.0.0&st=poi&q_enc=utf-8&r_enc=utf-8&sm=all.basic.trade_query.deepmatch.use_quasar_cid.force_match_keyword.force_use_center_coord&r_format=json&r_psglen=title.140&so=rel.dsc&hl=none&ic=basic&rp=none&r_query_info=1&start=${start}&display=${display}&q=${encodeURIComponent(keyword)}&q_center_coordinate=${coordsToUse.x}%3B${coordsToUse.y}&r_query_select=1&eq_property=adult`,
            bypassStyleClous: false,
            clientX: coordsToUse.clientX,
            clientY: coordsToUse.clientY
          },
          isNmap: true
        },
        query: CommonQueries.getAdBusinessListQuery()
      }
    ];
  }
}

export default PlacePayload;