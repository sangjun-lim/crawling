import HospitalPayload from './payloads/HospitalPayload.js';
import BeautyPayload from './payloads/BeautyPayload.js';
import RestaurantPayload from './payloads/RestaurantPayload.js';
import AccommodationPayload from './payloads/AccommodationPayload.js';
import PlacePayload from './payloads/PlacePayload.js';

class GraphQLBuilder {
  constructor() {
    this.payloadBuilders = {
      hospital: new HospitalPayload(),
      beauty: new BeautyPayload(),
      restaurant: new RestaurantPayload(),
      accommodation: new AccommodationPayload(),
      place: new PlacePayload()
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

export default GraphQLBuilder;