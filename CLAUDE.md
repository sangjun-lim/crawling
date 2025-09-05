# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js web scraping application that extracts business ranking data from Naver Map using GraphQL API and scrapes product information from Naver Smart Store. The project supports multiple business categories (restaurants, hospitals, beauty salons, accommodations, general places) with category-specific query optimization, plus e-commerce product data collection.

## Commands

### Development

```bash
# Run the scraper with default settings (map mode, keyword: 치킨)
npm start

# Run with specific mode, keyword/URL, and max results
node index.js [map|smartstore|navershopping] [keyword|url] [maxResults]

# Example searches - Naver Map
node index.js map "강남 맛집" 10
node index.js map "카페" 50
node index.js map "미용실" 20

# Example searches - Smart Store
node index.js smartstore "https://smartstore.naver.com/wodnr7762/products/8464846750"
node index.js smartstore "https://smartstore.naver.com/store123/products/123456"

# Example searches - Naver Shopping
# "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-crawling --no-first-run --disable-default-apps --disable-extensions
node index.js navershopping "https://search.shopping.naver.com/catalog/51449387077?cat_id=50003299&frm=NVSCVUI&query=%EC%9D%98%EC%9E%90"

# Example searches - Coupang (Basic Mode)
node index.js coupang vendor 1039646-1039649     # Vendor info collection
node index.js coupang product A01039646 5        # Product collection (max 5 products)
node index.js coupang combined 1039646,1039649 3 # Combined vendor+product collection

# Example searches - Coupang (Safe Mode for Large Collections)
node index.js coupang combined-safe 1-2000000 3  # Safe collection with checkpoint system
node index.js coupang resume session_2025-09-04T15-30-45_abc123  # Resume interrupted session
node index.js coupang complete session_2025-09-04T15-30-45_abc123 # Merge batch files

# Note: maxResults is only used in map mode
```

### Configuration

```bash
# Environment variables for logging control
set ENABLE_LOGGING=false    # Disable all logging
set LOG_REQUESTS=false      # Disable request logging
set LOG_RESPONSES=false     # Disable response logging
set LOG_ERRORS=false        # Disable error logging
set LOG_DIRECTORY=custom    # Custom log directory
```

## Architecture

### Core Components

#### Naver Map/Store Components
- **NaverStoreScraper** (`src/core/NaverStoreScraper.js`): Main scraping engine that orchestrates the entire process
- **CategoryDetector** (`src/core/CategoryDetector.js`): Automatically detects business category from search keywords
- **GraphQLBuilder** (`src/graphql/GraphQLBuilder.js`): Builds category-specific GraphQL payloads using specialized payload classes
- **ResponseParser** (`src/parsers/ResponseParser.js`): Parses and normalizes GraphQL responses

#### Coupang Components
- **CoupangVendorScraper** (`src/core/CoupangVendorScraper.js`): Vendor information collection
- **CoupangProductListScraper** (`src/core/CoupangProductListScraper.js`): Product listing collection
- **CoupangCombinedScraper** (`src/core/CoupangCombinedScraper.js`): Combined vendor+product collection with error recovery
- **CoupangDataStorage** (`src/core/CoupangDataStorage.js`): CSV storage with batch processing support
- **CheckpointManager** (`src/core/CheckpointManager.js`): Session management and progress tracking

#### Shared Components
- **HttpClient** (`src/core/HttpClient.js`): HTTP communication with rate limiting, proxy rotation, and error handling

### Data Flow

1. **Keyword Analysis**: CategoryDetector determines business type from search keywords
2. **Coordinate Resolution**: CoordinateUtils gets location coordinates for geo-targeted searches
3. **GraphQL Query Building**: Category-specific payload builders create optimized queries
4. **API Communication**: HttpClient executes paginated requests with 500ms rate limiting
5. **Response Processing**: ResponseParser normalizes data from multiple query types (regular + ads)
6. **Output Generation**: Results saved as CSV files with Korean headers

### GraphQL Architecture

The application uses category-specific GraphQL queries to optimize data extraction:

- **Restaurant queries**: `getRestaurants` + `getAdBusinessList`
- **Hospital queries**: `getHospitals` + medical-specific fields
- **Beauty queries**: `getHairShops` + beauty-specific fields
- **Accommodation queries**: `getAccommodations` + lodging-specific fields
- **Place queries**: Generic `getPlaces` for other business types

Each category has dedicated payload builders in `src/graphql/payloads/` and query definitions in `src/graphql/queries/`.

### Configuration System

- **Global constants**: `src/config/constants.js` contains API URLs, default coordinates, HTTP headers
- **Category keywords**: `src/config/categories.js` maps keywords to business categories
- **Environment-based options**: Logging and scraping behavior controlled via .env variables

### Output Structure

- **CSV files**: `result/naver_stores_{keyword}_{timestamp}.csv`
- **Request logs**: `log/requests/` (when enabled)
- **Response logs**: `log/responses/` (when enabled)
- **Error logs**: `log/errors/` (when enabled)

## Key Features

### Naver Map/Store Features
- **Smart categorization**: Automatic business type detection optimizes query performance
- **Geographic targeting**: Location-aware searches using coordinate bounds
- **Rate limiting**: 500ms delays prevent API blocking
- **Dual query system**: Combines organic results with sponsored listings
- **Data normalization**: Consistent output format regardless of source category
- **Pagination support**: Configurable page limits (default: 5 pages, 70 items each)

### Coupang Features
- **Multi-mode collection**: Separate vendor, product, or combined collection modes
- **Error recovery**: Checkpoint system with session resume capability
- **Batch processing**: Incremental saving prevents data loss on large collections
- **Proxy rotation**: Multiple proxy support with automatic rotation and statistics
- **Rate limiting**: 200ms delays for combined mode (300 requests/minute)
- **Progress tracking**: Real-time progress monitoring with ETA calculation
- **Large-scale support**: Safe collection of millions of records with memory management

### Shared Features
- **Comprehensive logging**: Request/response/error logging for debugging
- **Flexible configuration**: Environment-based logging and behavior control

## Common Patterns

When extending functionality:

1. **Adding new categories**: Create payload class in `src/graphql/payloads/`, add query definitions in `src/graphql/queries/`, update category keywords in `src/config/categories.js`
2. **Modifying queries**: Update category-specific payload builders rather than core scraper logic
3. **Changing output format**: Modify FileUtils methods or add new formatters
4. **Adding new data sources**: Extend HttpClient or create new client classes following the same interface pattern

The codebase follows a clear separation of concerns with category-driven polymorphism for handling different business types efficiently.

## Coupang Collection Examples

### Basic Collection
```bash
# Collect vendor information
node index.js coupang vendor 1039646-1039649

# Collect specific vendor products
node index.js coupang product A01039646 5

# Combined vendor+product collection (small scale)
node index.js coupang combined 1039646,1039649 3
```

### Large-Scale Safe Collection
```bash
# Start large collection with error recovery (1-2 million vendors)
node index.js coupang combined-safe 1-2000000 3

# If interrupted, resume using session ID
node index.js coupang resume session_2025-09-04T15-30-45_abc123

# Complete session (merge batch files)
node index.js coupang complete session_2025-09-04T15-30-45_abc123
```

### Proxy Configuration
```javascript
// Example: Using proxy rotation for IP protection
const scraper = new CoupangCombinedScraper({
  batchSize: 100,
  proxies: [
    'http://proxy1.com:8080',
    'http://user:pass@proxy2.com:3128',
    'socks5://proxy3.com:1080'
  ],
  proxyRotation: true
});
```

### Output Structure
- **Vendor only**: `result/coupang_vendors_{range}_{timestamp}.csv`
- **Product only**: `result/coupang_products_{range}_{timestamp}.csv` 
- **Combined**: `result/coupang_combined_{range}_{timestamp}.csv`
- **Safe mode batches**: `result/batches/{sessionId}/batch_*.csv`
- **Safe mode final**: `result/coupang_combined_merged_{timestamp}.csv`
- **Checkpoints**: `checkpoints/{sessionId}.json`
