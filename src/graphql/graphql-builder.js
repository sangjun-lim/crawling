import HospitalPayload from './payloads/hospital-payload.js';
import BeautyPayload from './payloads/beauty-payload.js';
import RestaurantPayload from './payloads/restaurant-payload.js';
import AccommodationPayload from './payloads/accommodation-payload.js';
import PlacePayload from './payloads/place-payload.js';

class GraphqlBuilder {
  constructor() {
    this.payloadBuilders = {
      hospital: new HospitalPayload(),
      beauty: new BeautyPayload(),
      restaurant: new RestaurantPayload(),
      accommodation: new AccommodationPayload(),
      place: new PlacePayload(),
    };
  }

  buildPayload(category, keyword, display, start, adStart, coords) {
    const builder = this.payloadBuilders[category];
    if (!builder) {
      throw new Error(`Unknown category: ${category}`);
    }
    return builder.build(keyword, display, start, adStart, coords);
  }
}

export default GraphqlBuilder;
