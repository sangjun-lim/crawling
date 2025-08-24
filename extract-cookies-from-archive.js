import fs from 'fs';
import path from 'path';

class CookieExtractor {
    constructor() {
        this.archiveDir = './archive';
        this.cookies = new Set();
        this.setCookieHeaders = [];
        this.requestCookies = [];
    }

    async extractAllCookies() {
        console.log('🍪 Archive에서 쿠키 데이터 추출 시작...');
        
        // 1. API 응답 파일들에서 Set-Cookie 헤더 찾기
        await this.findSetCookieHeaders();
        
        // 2. 네트워크 요청에서 Cookie 헤더 찾기
        await this.findRequestCookies();
        
        // 3. 쿠키 정보 분석 및 정리
        const cookieAnalysis = this.analyzeCookies();
        
        // 4. CurlHttpClient용 쿠키 문자열 생성
        const cookieString = this.generateCookieString();
        
        // 5. 결과 저장
        this.saveResults(cookieAnalysis, cookieString);
        
        return { cookieAnalysis, cookieString };
    }

    async findSetCookieHeaders() {
        console.log('📤 Set-Cookie 헤더 검색 중...');
        
        const files = fs.readdirSync(this.archiveDir)
            .filter(file => file.startsWith('api-response-') && file.endsWith('.json'));
        
        let foundCount = 0;
        
        for (const file of files) {
            try {
                const filePath = path.join(this.archiveDir, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // headers에서 Set-Cookie 찾기
                if (data.headers) {
                    Object.keys(data.headers).forEach(key => {
                        if (key.toLowerCase() === 'set-cookie') {
                            const cookieValue = data.headers[key];
                            this.setCookieHeaders.push({
                                file: file,
                                url: data.url,
                                cookies: Array.isArray(cookieValue) ? cookieValue : [cookieValue]
                            });
                            foundCount++;
                        }
                    });
                }
            } catch (error) {
                // JSON 파싱 에러는 무시
            }
        }
        
        console.log(`   Found ${foundCount} Set-Cookie responses`);
    }

    async findRequestCookies() {
        console.log('📥 Request Cookie 헤더 검색 중...');
        
        try {
            const networkFile = path.join(this.archiveDir, 'network-requests-2025-08-22T12-50-57-946Z.json');
            const networkData = JSON.parse(fs.readFileSync(networkFile, 'utf8'));
            
            let foundCount = 0;
            
            networkData.forEach((request, index) => {
                if (request.headers && request.headers.cookie) {
                    this.requestCookies.push({
                        index: index,
                        url: request.url,
                        method: request.method,
                        cookies: request.headers.cookie,
                        timestamp: request.timestamp
                    });
                    foundCount++;
                }
            });
            
            console.log(`   Found ${foundCount} requests with cookies`);
        } catch (error) {
            console.log(`   Network requests file not found: ${error.message}`);
        }
    }

    analyzeCookies() {
        console.log('🔍 쿠키 데이터 분석 중...');
        
        const analysis = {
            setCookieCount: this.setCookieHeaders.length,
            requestCookieCount: this.requestCookies.length,
            uniqueCookies: new Map(),
            domains: new Set(),
            cookiesByDomain: new Map()
        };

        // Set-Cookie 헤더 분석
        this.setCookieHeaders.forEach(item => {
            const domain = new URL(item.url).hostname;
            analysis.domains.add(domain);
            
            if (!analysis.cookiesByDomain.has(domain)) {
                analysis.cookiesByDomain.set(domain, []);
            }
            
            item.cookies.forEach(cookieStr => {
                const parsed = this.parseCookie(cookieStr);
                if (parsed) {
                    analysis.uniqueCookies.set(parsed.name, parsed);
                    analysis.cookiesByDomain.get(domain).push(parsed);
                }
            });
        });

        // Request Cookie 헤더 분석
        this.requestCookies.forEach(item => {
            const domain = new URL(item.url).hostname;
            analysis.domains.add(domain);
            
            const cookies = item.cookies.split('; ').map(cookiePair => {
                const [name, value] = cookiePair.split('=');
                return { name: name.trim(), value: value?.trim() || '', source: 'request' };
            });
            
            cookies.forEach(cookie => {
                analysis.uniqueCookies.set(cookie.name, cookie);
            });
        });

        console.log(`   총 도메인: ${analysis.domains.size}`);
        console.log(`   고유 쿠키: ${analysis.uniqueCookies.size}`);
        
        return analysis;
    }

    parseCookie(cookieStr) {
        try {
            const parts = cookieStr.split(';').map(part => part.trim());
            const [nameValue] = parts;
            const [name, value] = nameValue.split('=').map(part => part?.trim());

            if (!name || value === undefined) {
                return null;
            }

            const cookie = { 
                name, 
                value, 
                source: 'response',
                raw: cookieStr
            };

            // 쿠키 속성 파싱
            parts.slice(1).forEach(part => {
                const [key, val] = part.split('=').map(p => p?.trim());
                const keyLower = key?.toLowerCase();
                
                if (keyLower === 'domain') {
                    cookie.domain = val;
                } else if (keyLower === 'path') {
                    cookie.path = val;
                } else if (keyLower === 'expires') {
                    cookie.expires = val;
                } else if (keyLower === 'max-age') {
                    cookie.maxAge = val;
                } else if (keyLower === 'secure') {
                    cookie.secure = true;
                } else if (keyLower === 'httponly') {
                    cookie.httpOnly = true;
                }
            });

            return cookie;
        } catch (error) {
            return null;
        }
    }

    generateCookieString() {
        console.log('🔗 CurlHttpClient용 쿠키 문자열 생성...');
        
        const smartstoreCookies = [];
        const naverCookies = [];
        
        for (const [name, cookie] of this.cookiesByDomain.entries()) {
            if (name.includes('smartstore') || name.includes('naver')) {
                // 스마트스토어 관련 쿠키들만 선별
                if (cookie.name && cookie.value) {
                    if (name.includes('smartstore')) {
                        smartstoreCookies.push(`${cookie.name}=${cookie.value}`);
                    } else {
                        naverCookies.push(`${cookie.name}=${cookie.value}`);
                    }
                }
            }
        }
        
        // 모든 고유 쿠키를 포함한 문자열도 생성
        const allCookies = [];
        for (const [name, cookie] of Array.from(this.analyzeCookies().uniqueCookies.entries())) {
            if (cookie.name && cookie.value && cookie.value !== '') {
                allCookies.push(`${cookie.name}=${cookie.value}`);
            }
        }
        
        const result = {
            smartstore: smartstoreCookies.join('; '),
            naver: naverCookies.join('; '),
            all: allCookies.join('; ')
        };
        
        console.log(`   스마트스토어 쿠키: ${smartstoreCookies.length}개`);
        console.log(`   네이버 쿠키: ${naverCookies.length}개`);
        console.log(`   전체 쿠키: ${allCookies.length}개`);
        
        return result;
    }

    saveResults(analysis, cookieString) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const resultFile = `extracted-cookies-${timestamp}.json`;
        
        const result = {
            extractedAt: new Date().toISOString(),
            summary: {
                totalSetCookieResponses: analysis.setCookieCount,
                totalRequestsWithCookies: analysis.requestCookieCount,
                uniqueCookieCount: analysis.uniqueCookies.size,
                domainCount: analysis.domains.size
            },
            domains: Array.from(analysis.domains),
            cookies: Object.fromEntries(analysis.uniqueCookies),
            cookieStrings: cookieString,
            setCookieHeaders: this.setCookieHeaders,
            requestCookies: this.requestCookies
        };
        
        fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
        console.log(`📄 결과 저장: ${resultFile}`);
    }
}

// 실행
const extractor = new CookieExtractor();
extractor.extractAllCookies().catch(console.error);