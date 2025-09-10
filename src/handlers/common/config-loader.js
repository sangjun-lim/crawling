import dotenv from 'dotenv';

export function loadConfiguration() {
  const env = process.env.NODE_ENV || 'development';

  // 환경별 .env 파일 로딩 (우선순위: 환경별 → 로컬 → 기본)
  dotenv.config({ path: `.env.${env}` });
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });

  return {
    env,
    scraperOptions: createScraperOptions()
  };
}

function createScraperOptions() {
  return {
    // 로깅 옵션
    enableLogging: process.env.ENABLE_LOGGING !== 'false', // 기본 활성화
    logRequests: process.env.LOG_REQUESTS !== 'false',
    logResponses: process.env.LOG_RESPONSES !== 'false',
    logErrors: process.env.LOG_ERRORS !== 'false',
    logDirectory: process.env.LOG_DIRECTORY || 'log',

    // 스크래핑 옵션
    maxPages: parseInt(process.env.MAX_PAGES) || 5,
    maxProducts: parseInt(process.env.MAX_PRODUCTS) || 5,
    timeout: parseInt(process.env.TIMEOUT) || 30000,
    maxRedirects: parseInt(process.env.MAX_REDIRECTS) || 5,

    // 프록시 옵션
    proxies: process.env.PROXIES ? process.env.PROXIES.split(',').map(proxy => proxy.trim()).filter(Boolean) : null,

    // Rate limiting 옵션
    rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY) || 200, // 기본 200ms
    
    // 배치 처리 옵션
    batchSize: parseInt(process.env.BATCH_SIZE) || 100, // 기본 100

    // gemini
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  };
}