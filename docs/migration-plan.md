# Node.js Scraping Project - Detailed Migration Plan

## Executive Summary

This migration plan implements a NestJS-like service architecture by refactoring the current Node.js scraping application. The plan follows a dependency-level approach to minimize risks and ensure system stability during the transition.

## Migration Strategy Overview

- **Approach**: Bottom-up migration by dependency levels
- **Risk Mitigation**: Comprehensive testing at each level
- **Rollback Strategy**: Git-based checkpoint system
- **Validation**: Functional testing after each major phase
- **Timeline**: 7 phases over 2-3 weeks

---

## Phase 1: Foundation Setup & Level 0 Migration

### 1.1 Initial Setup (Day 1)
**Risk Level: LOW** ✅

#### Create New Directory Structure
```bash
mkdir -p src/services
mkdir -p src/clients
mkdir -p src/factories
```

#### Files to Create (New Architecture Components)
- `src/services/storageService.js` - Consolidate FileUtils + CoupangDataStorage
- `src/services/loggerService.js` - Enhanced LogUtils
- `src/services/serviceUtils.js` - Common utilities
- `src/clients/browserClientFactory.js` - Browser client factory
- `src/clients/puppeteerRealBrowserClient.js` - Puppeteer implementation
- `src/clients/playwrightBrowserClient.js` - Playwright implementation  
- `src/clients/httpOnlyBrowserClient.js` - HTTP-only implementation

#### Level 0 Files (No Dependencies) - Safe to Keep As-Is
**Files that remain unchanged:**
- `src/config/categories.js` ✅
- `src/config/constants.js` ✅
- `src/graphql/queries/*.js` (6 files) ✅

**Validation Checkpoint 1.1:**
```bash
npm test
node index.js map "테스트" 1
```

### 1.2 Service Layer Creation (Day 1-2)
**Risk Level: LOW** ✅

#### Create storageService.js
```javascript
// src/services/storageService.js
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';

export class StorageService {
  // Combines FileUtils + CoupangDataStorage functionality
}
```

#### Create loggerService.js
```javascript
// src/services/loggerService.js
export class LoggerService {
  // Enhanced LogUtils functionality
}
```

#### Create serviceUtils.js
```javascript
// src/services/serviceUtils.js
export class ServiceUtils {
  // Common utility functions
}
```

**Validation Checkpoint 1.2:**
```bash
node -e "import('./src/services/storageService.js').then(console.log)"
node -e "import('./src/services/loggerService.js').then(console.log)"
```

---

## Phase 2: Level 1 Files Migration (Day 2-3)

### 2.1 Utility Services Refactoring
**Risk Level: MEDIUM** ⚠️

#### Files to Migrate:

**2.1.1 CoordinateUtils.js**
- **Source**: `src/utils/CoordinateUtils.js`
- **Target**: Keep in place (minimal dependencies)
- **Risk**: LOW ✅
- **Dependencies**: Only config files
- **Reverse Dependencies**: NaverStoreScraper
- **Import Changes**: None required

**2.1.2 CategoryDetector.js**
- **Source**: `src/core/CategoryDetector.js`
- **Target**: Keep in place
- **Risk**: LOW ✅
- **Dependencies**: `categories.js`
- **Reverse Dependencies**: NaverStoreScraper, GraphQLBuilder
- **Import Changes**: None required

**2.1.3 ProxyManager.js**
- **Source**: `src/utils/ProxyManager.js`
- **Target**: Keep in place
- **Risk**: LOW ✅
- **Dependencies**: LogUtils
- **Reverse Dependencies**: HttpClient, various scrapers
- **Import Changes**: Update LogUtils → loggerService after Phase 3

### 2.2 Update Dependencies (Phase 3 Preparation)
**Risk Level: MEDIUM** ⚠️

#### Files That Will Need LogUtils Updates:
- `src/utils/ProxyManager.js`
- `src/core/HttpClient.js`
- `src/core/CoupangCombinedScraper.js`
- Multiple other scrapers

**Validation Checkpoint 2.1:**
```bash
npm test
node index.js map "테스트" 1
git status # Should show no broken imports
```

---

## Phase 3: Level 2 Files Migration (Day 3-4)

### 3.1 HTTP Clients Migration
**Risk Level: HIGH** 🚨

#### 3.1.1 LogUtils → loggerService Migration
- **Source**: `src/utils/LogUtils.js`
- **Action**: DEPRECATE and replace with service
- **Risk**: HIGH 🚨 (Used by 8+ files)
- **Reverse Dependencies**:
  - `HttpClient.js`
  - `CoupangCombinedScraper.js`
  - `ProxyManager.js`
  - `BaseScraper.js`
  - Multiple scrapers

**Import Path Changes Required:**
```javascript
// OLD:
import LogUtils from '../utils/LogUtils.js';

// NEW:
import { LoggerService } from '../services/loggerService.js';
const logger = new LoggerService();
```

#### 3.1.2 FileUtils → storageService Migration
- **Source**: `src/utils/FileUtils.js`
- **Action**: DEPRECATE and replace with service
- **Risk**: HIGH 🚨 (Used by 6+ files)
- **Reverse Dependencies**:
  - `NaverStoreScraper.js`
  - `NaverSmartStoreScraper.js`
  - `CoupangDataStorage.js`
  - Various scrapers

**Import Path Changes Required:**
```javascript
// OLD:
import FileUtils from '../utils/FileUtils.js';

// NEW:
import { StorageService } from '../services/storageService.js';
const storage = new StorageService();
```

#### 3.1.3 HttpClient.js Updates
- **Source**: `src/core/HttpClient.js`
- **Target**: Update in place
- **Risk**: HIGH 🚨 (Critical dependency)
- **Dependencies**: LogUtils → loggerService
- **Reverse Dependencies**: All scrapers (10+ files)

**Critical Update Sequence:**
1. Update LogUtils import in HttpClient.js
2. Test HttpClient functionality
3. Validate all scraper operations

### 3.2 GraphQL Components Migration
**Risk Level: MEDIUM** ⚠️

#### 3.2.1 GraphQL Payload Builders
- **Files**: `src/graphql/payloads/*.js` (5 files)
- **Target**: Keep in place
- **Risk**: LOW ✅
- **Dependencies**: None
- **Reverse Dependencies**: GraphQLBuilder

#### 3.2.2 CoupangDataStorage Migration
- **Source**: `src/core/CoupangDataStorage.js`
- **Action**: Merge into storageService
- **Risk**: MEDIUM ⚠️
- **Dependencies**: FileUtils
- **Reverse Dependencies**: CoupangCombinedScraper, main index.js

**Validation Checkpoint 3.1:**
```bash
npm test
node index.js coupang vendor 1000-1002  # Test HTTP functionality
node index.js map "테스트" 1              # Test core functionality
```

**Rollback Point 3.1:**
```bash
git tag migration-phase-3-checkpoint
git commit -am "Phase 3 checkpoint: HTTP clients migrated"
```

---

## Phase 4: Level 3 Files Migration (Day 4-5)

### 4.1 Core Components Migration
**Risk Level: HIGH** 🚨

#### 4.1.1 GraphQLBuilder.js Updates
- **Source**: `src/graphql/GraphQLBuilder.js`
- **Target**: Update in place
- **Risk**: MEDIUM ⚠️
- **Dependencies**: No service dependencies
- **Reverse Dependencies**: NaverStoreScraper

#### 4.1.2 ResponseParser.js Updates  
- **Source**: `src/parsers/ResponseParser.js`
- **Target**: Update in place
- **Risk**: MEDIUM ⚠️
- **Dependencies**: No service dependencies
- **Reverse Dependencies**: NaverStoreScraper

#### 4.1.3 BaseScraper.js Updates
- **Source**: `src/core/BaseScraper.js`
- **Target**: Update in place with service integration
- **Risk**: HIGH 🚨 (Base class for all scrapers)
- **Dependencies**: LogUtils → loggerService
- **Reverse Dependencies**: All scraper classes

**Critical Import Updates:**
```javascript
// BaseScraper.js - OLD:
import LogUtils from '../utils/LogUtils.js';

// BaseScraper.js - NEW:
import { LoggerService } from '../services/loggerService.js';

class BaseScraper {
  constructor(options = {}) {
    this.logger = new LoggerService(options);
    // ...
  }
}
```

### 4.2 Specialized Scrapers (Partial Updates)
**Risk Level: HIGH** 🚨

#### 4.2.1 CoupangVendorScraper.js
- **Source**: `src/core/CoupangVendorScraper.js`
- **Dependencies**: HttpClient (already updated in Phase 3)
- **Import Changes**: None for this phase
- **Risk**: LOW ✅

#### 4.2.2 CoupangProductListScraper.js
- **Source**: `src/core/CoupangProductListScraper.js`
- **Dependencies**: HttpClient (already updated in Phase 3)
- **Import Changes**: None for this phase
- **Risk**: LOW ✅

**Validation Checkpoint 4.1:**
```bash
npm test
node index.js coupang vendor 1000-1002   # Test Coupang scrapers
node index.js map "테스트" 1               # Test Naver scrapers
```

---

## Phase 5: Level 4 Files Migration (Day 5-6)

### 5.1 Complex Scrapers Migration
**Risk Level: CRITICAL** 🚨🚨

#### 5.1.1 CoupangCombinedScraper.js
- **Source**: `src/core/CoupangCombinedScraper.js`
- **Dependencies**: HttpClient, LogUtils, CheckpointManager, CoupangDataStorage
- **Required Updates**:
  - LogUtils → loggerService
  - CoupangDataStorage → storageService

**Critical Import Updates:**
```javascript
// OLD:
import LogUtils from '../utils/LogUtils.js';
import CoupangDataStorage from './CoupangDataStorage.js';

// NEW:
import { LoggerService } from '../services/loggerService.js';
import { StorageService } from '../services/storageService.js';

class CoupangCombinedScraper {
  constructor(options = {}) {
    this.logger = new LoggerService(options);
    this.storage = new StorageService(options);
    // ...
  }
}
```

#### 5.1.2 Browser-Based Scrapers
- **NaverShoppingScraper.js**: Update service dependencies
- **NaverShoppingRealBrowserScraper.js**: Integrate browserClientFactory
- **NaverSmartStoreScraper.js**: Update FileUtils → storageService

**Browser Client Integration:**
```javascript
// OLD:
import puppeteer from 'puppeteer-extra';

// NEW:
import { BrowserClientFactory } from '../clients/browserClientFactory.js';

class NaverShoppingRealBrowserScraper {
  constructor(options = {}) {
    this.browserClient = BrowserClientFactory.create('puppeteer-real', options);
  }
}
```

### 5.2 CheckpointManager Updates
**Risk Level: MEDIUM** ⚠️

- **Source**: `src/core/CheckpointManager.js`
- **Dependencies**: FileUtils → storageService
- **Risk**: MEDIUM ⚠️
- **Reverse Dependencies**: CoupangCombinedScraper

**Validation Checkpoint 5.1:**
```bash
npm test
node index.js coupang combined-safe 1000-1010 2  # Test checkpoint functionality
node index.js navershopping "test-url"           # Test browser scrapers
```

**Rollback Point 5.1:**
```bash
git tag migration-phase-5-checkpoint
git commit -am "Phase 5 checkpoint: Complex scrapers migrated"
```

---

## Phase 6: Level 5-6 Files Migration (Day 6-7)

### 6.1 Top-Level Components
**Risk Level: CRITICAL** 🚨🚨

#### 6.1.1 NaverStoreScraper.js (Level 5)
- **Source**: `src/core/NaverStoreScraper.js`
- **Dependencies**: Multiple services
- **Required Updates**:
  - FileUtils → storageService
  - LogUtils → loggerService (via BaseScraper)

**Critical Import Updates:**
```javascript
// OLD:
import FileUtils from '../utils/FileUtils.js';

// NEW:
import { StorageService } from '../services/storageService.js';

class NaverStoreScraper extends BaseScraper {
  constructor(options = {}) {
    super(options); // Gets logger from BaseScraper
    this.storage = new StorageService(options);
  }
}
```

#### 6.1.2 Main Entry Point (Level 6)
- **Source**: `index.js`
- **Risk**: CRITICAL 🚨🚨 (Application entry point)
- **Dependencies**: All scrapers
- **Required Updates**: None (scrapers handle their own service integration)

### 6.2 Final Integration Testing
**Risk Level: CRITICAL** 🚨🚨

**Comprehensive Testing Sequence:**
```bash
# Test each major functionality
node index.js map "치킨" 5
node index.js smartstore "test-url"
node index.js navershopping "test-url"
node index.js coupang vendor 1000-1005
node index.js coupang product 1000,1001 2
node index.js coupang combined 1000-1002 2
```

**Validation Checkpoint 6.1:**
```bash
npm test
npm run test:integration  # If available
# Manual testing of all major workflows
```

---

## Phase 7: Cleanup & Optimization (Day 7)

### 7.1 Legacy File Removal
**Risk Level: MEDIUM** ⚠️

#### Files to Remove:
- `src/utils/LogUtils.js` (replaced by loggerService)
- `src/utils/FileUtils.js` (replaced by storageService)
- `src/core/CoupangDataStorage.js` (merged into storageService)

#### Before Removal:
1. Verify no remaining imports
2. Run full test suite
3. Create backup branch

```bash
git checkout -b backup-legacy-files
git checkout main
rm src/utils/LogUtils.js
rm src/utils/FileUtils.js
rm src/core/CoupangDataStorage.js
```

### 7.2 Documentation Updates
**Risk Level: LOW** ✅

- Update `CLAUDE.md`
- Update `README.md`
- Create service architecture documentation

**Final Validation:**
```bash
npm test
node index.js map "최종테스트" 5
node index.js coupang vendor 1000-1002
```

---

## Risk Assessment Matrix

| Phase | Risk Level | Critical Files | Potential Impact | Mitigation Strategy |
|-------|------------|----------------|------------------|-------------------|
| 1 | LOW ✅ | New services | None | Isolated development |
| 2 | MEDIUM ⚠️ | Utils | Minor breakage | Keep originals |
| 3 | HIGH 🚨 | HttpClient, LogUtils | Major breakage | Careful sequencing |
| 4 | HIGH 🚨 | BaseScraper | All scrapers | Staged updates |
| 5 | CRITICAL 🚨🚨 | Complex scrapers | Core functionality | Extensive testing |
| 6 | CRITICAL 🚨🚨 | NaverStoreScraper | Main workflows | Full regression |
| 7 | MEDIUM ⚠️ | Cleanup | Legacy references | Verification checks |

---

## Rollback Strategy

### Rollback Points
1. **Phase 3 Checkpoint**: `git reset --hard migration-phase-3-checkpoint`
2. **Phase 5 Checkpoint**: `git reset --hard migration-phase-5-checkpoint`
3. **Pre-cleanup**: `git checkout backup-legacy-files`

### Emergency Rollback Procedure
```bash
# Quick rollback to last stable state
git log --oneline | grep checkpoint
git reset --hard <checkpoint-hash>
npm install
npm test
```

### Rollback Validation
```bash
node index.js map "긴급테스트" 2
node index.js coupang vendor 1000-1001
```

---

## Testing Strategy

### Checkpoint Tests
After each phase, run these validation tests:

#### Core Functionality Test
```bash
node index.js map "테스트매장" 3
```

#### Coupang Functionality Test  
```bash
node index.js coupang vendor 1000-1002
```

#### Service Integration Test
```bash
node -e "
import { StorageService } from './src/services/storageService.js';
import { LoggerService } from './src/services/loggerService.js';
console.log('Services loaded successfully');
"
```

### Pre-Migration Snapshot
```bash
git tag pre-migration-snapshot
npm test > pre-migration-test-results.txt
```

### Post-Migration Validation
```bash
npm test > post-migration-test-results.txt
diff pre-migration-test-results.txt post-migration-test-results.txt
```

---

## Critical Success Factors

1. **Dependency Order**: Strict bottom-up migration
2. **Service Testing**: Validate each service independently
3. **Import Path Consistency**: Double-check all path changes
4. **Functional Testing**: Test core workflows at each checkpoint
5. **Rollback Readiness**: Always have a rollback plan ready

---

## Import Path Change Summary

### Major Import Changes by Phase:

#### Phase 3 (Critical Changes):
```javascript
// LogUtils → loggerService
- import LogUtils from '../utils/LogUtils.js';
+ import { LoggerService } from '../services/loggerService.js';

// FileUtils → storageService  
- import FileUtils from '../utils/FileUtils.js';
+ import { StorageService } from '../services/storageService.js';

// CoupangDataStorage → storageService
- import CoupangDataStorage from './CoupangDataStorage.js';
+ import { StorageService } from '../services/storageService.js';
```

#### Phase 5 (Browser Integration):
```javascript
// Browser client factory integration
+ import { BrowserClientFactory } from '../clients/browserClientFactory.js';
```

### Files Requiring Import Updates:

#### Phase 3 Updates:
- `src/core/HttpClient.js`
- `src/core/CoupangCombinedScraper.js`
- `src/utils/ProxyManager.js`
- `src/core/BaseScraper.js`

#### Phase 4 Updates:
- `src/core/BaseScraper.js`
- All scraper classes inheriting from BaseScraper

#### Phase 5 Updates:
- `src/core/CoupangCombinedScraper.js`
- `src/core/NaverShoppingRealBrowserScraper.js`
- `src/core/NaverSmartStoreScraper.js`
- `src/core/CheckpointManager.js`

#### Phase 6 Updates:
- `src/core/NaverStoreScraper.js`

---

This migration plan provides a safe, methodical approach to refactoring the Node.js scraping application while maintaining system stability and functionality throughout the process.