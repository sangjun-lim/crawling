import AccommodationQueries from '../queries/accommodation-queries.js';
import CommonQueries from '../queries/common-queries.js';
import { DEFAULT_COORDS, BUSINESS_TYPES } from '../../config/constants.js';

class AccommodationPayload {
  build(keyword, display, start, adStart, coords = null) {
    const coordsToUse = coords || DEFAULT_COORDS;

    return [
      {
        operationName: 'getAccommodationList',
        variables: {
          useReverseGeocode: true,
          input: {
            query: keyword,
            display: display,
            start: start,
            x: coordsToUse.x,
            y: coordsToUse.y,
            bounds: coordsToUse.bounds,
            deviceType: 'pcmap',
          },
          isNmap: true,
          isBounds: true,
          reverseGeocodingInput: {
            x: coordsToUse.clientX,
            y: coordsToUse.clientY,
          },
        },
        query: AccommodationQueries.getAccommodationList(),
      },
      {
        operationName: 'getAdBusinessList',
        variables: {
          input: {
            query: keyword,
            start: adStart,
            x: coordsToUse.x,
            y: coordsToUse.y,
            businessType: BUSINESS_TYPES.accommodation,
            deviceType: 'pcmap',
            localQueryString: `version=2.0.0&pr=place&start=1&display=${display}&q=${encodeURIComponent(
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

export default AccommodationPayload;
