import HospitalQueries from '../queries/hospital-queries.js';
import CommonQueries from '../queries/common-queries.js';
import { DEFAULT_COORDS, BUSINESS_TYPES } from '../../config/constants.js';

class HospitalPayload {
  build(keyword, display, start, adStart, coords = null) {
    const coordsToUse = coords || DEFAULT_COORDS;

    return [
      {
        operationName: 'getNxList',
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
            sortingOrder: 'precision',
            x: coordsToUse.x,
            y: coordsToUse.y,
            clientX: coordsToUse.clientX,
            clientY: coordsToUse.clientY,
            bounds: coordsToUse.bounds,
            deviceType: 'pcmap',
          },
          reverseGeocodingInput: {
            x: coordsToUse.clientX,
            y: coordsToUse.clientY,
          },
        },
        query: HospitalQueries.getNxList(),
      },
      {
        operationName: 'getAdBusinessList',
        variables: {
          input: {
            query: keyword,
            start: adStart,
            x: coordsToUse.x,
            y: coordsToUse.y,
            businessType: BUSINESS_TYPES.hospital,
            deviceType: 'pcmap',
            localQueryString: `pr=place_pcmap&version=2.0.0&st=poi&q_enc=utf-8&r_enc=utf-8&sm=all.basic.use_quasar_cid.force_use_center_coord&r_format=json&r_psglen=none&so=rel.dsc&hl=none&ic=basic&rp=none&r_query_info=1&start=1&display=${display}&q=${encodeURIComponent(
              keyword
            )}&q_center_coordinate=${coordsToUse.x}%3B${
              coordsToUse.y
            }&r_query_select=1&eq_property=adult`,
            bypassStyleClous: false,
            clientX: coordsToUse.clientX,
            clientY: coordsToUse.clientY,
          },
          isNmap: true,
        },
        query: CommonQueries.getAdBusinessListQuery(),
      },
    ];
  }
}

export default HospitalPayload;
