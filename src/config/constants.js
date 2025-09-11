export const DEFAULT_COORDS = {
    x: '127.06528818797699',
    y: '37.543708133849094',
    clientX: '126.97825',
    clientY: '37.566551',
    bounds: '127.05646908473659;37.53699598779373;127.07432186794011;37.55024955530108'
  };
  
export const API_URLS = {
    GRAPHQL: 'https://pcmap-api.place.naver.com/graphql',
    INSTANT_SEARCH: 'https://map.naver.com/p/api/search/instant-search'
  };
  
export const BUSINESS_TYPES = {
    hospital: 'hospital',
    beauty: 'hairshop',
    restaurant: 'restaurant',
    accommodation: 'accommodation',
    place: 'place'
  };

export const DEFAULT_OPTIONS = {
    maxPages: 5,
    pageSize: 70,
    adPageSize: 5,
    timeout: 30000,
    maxRedirects: 5,
    logging: {
      enableLogging: true,
      logRequests: true,
      logResponses: true,
      logErrors: true,
      logDirectory: 'log'
    }
  };

export const HTTP_HEADERS = {
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ACCEPT: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    ACCEPT_LANGUAGE: 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
    ACCEPT_ENCODING: 'gzip, deflate',
    CONNECTION: 'keep-alive',
    UPGRADE_INSECURE_REQUESTS: '1',
    REFERER: 'https://map.naver.com/',
    CACHE_CONTROL: 'max-age=0'
  };

export const COORDINATE_BOUNDS = {
    RADIUS_X: 0.01488,
    RADIUS_Y: 0.00663
  };