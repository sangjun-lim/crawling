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
node index.js [map|smartstore] [keyword|url] [maxResults]

# Example searches - Naver Map
node index.js map "강남 맛집" 10
node index.js map "카페" 50
node index.js map "미용실" 20

# Example searches - Smart Store
node index.js smartstore "https://smartstore.naver.com/wodnr7762/products/8464846750"
node index.js smartstore "https://smartstore.naver.com/store123/products/123456"

# Example searches - Naver Shopping
node index.js navershopping "https://search.shopping.naver.com/catalog/51449387077?cat_id=50003299&frm=NVSCVUI&query=%EC%9D%98%EC%9E%90"

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

- **NaverStoreScraper** (`src/core/NaverStoreScraper.js`): Main scraping engine that orchestrates the entire process
- **CategoryDetector** (`src/core/CategoryDetector.js`): Automatically detects business category from search keywords
- **GraphQLBuilder** (`src/graphql/GraphQLBuilder.js`): Builds category-specific GraphQL payloads using specialized payload classes
- **HttpClient** (`src/core/HttpClient.js`): Handles HTTP communication with rate limiting and error handling
- **ResponseParser** (`src/parsers/ResponseParser.js`): Parses and normalizes GraphQL responses

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

- **Smart categorization**: Automatic business type detection optimizes query performance
- **Geographic targeting**: Location-aware searches using coordinate bounds
- **Rate limiting**: 500ms delays prevent API blocking
- **Dual query system**: Combines organic results with sponsored listings
- **Comprehensive logging**: Request/response/error logging for debugging
- **Data normalization**: Consistent output format regardless of source category
- **Pagination support**: Configurable page limits (default: 5 pages, 70 items each)

## Common Patterns

When extending functionality:

1. **Adding new categories**: Create payload class in `src/graphql/payloads/`, add query definitions in `src/graphql/queries/`, update category keywords in `src/config/categories.js`
2. **Modifying queries**: Update category-specific payload builders rather than core scraper logic
3. **Changing output format**: Modify FileUtils methods or add new formatters
4. **Adding new data sources**: Extend HttpClient or create new client classes following the same interface pattern

The codebase follows a clear separation of concerns with category-driven polymorphism for handling different business types efficiently.
