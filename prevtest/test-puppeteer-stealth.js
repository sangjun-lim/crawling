import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FingerprintGenerator } from 'fingerprint-generator';

puppeteer.use(StealthPlugin());

async function testPuppeteerStealth() {
    const fingerprintGenerator = new FingerprintGenerator();
    const fingerprintData = fingerprintGenerator.getFingerprint();
    
    // Extract the actual fingerprint and headers
    const { fingerprint, headers } = fingerprintData;
    const screen = fingerprint.screen;
    const navigator = fingerprint.navigator;
    
    console.log('Generated fingerprint structure confirmed');
    console.log(`Screen: ${screen.width}x${screen.height}`);
    console.log(`User Agent: ${navigator.userAgent}`);
    
    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: './chrome-profile', // Use persistent profile
        args: [
            // 기본 보안 설정
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            
            // 핵심 봇 탐지 우회
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--exclude-switches=enable-automation',
            '--disable-dev-shm-usage',
            
            // Chrome 확장 및 기능 비활성화
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-field-trial-config',
            '--disable-back-forward-cache',
            '--disable-ipc-flooding-protection',
            
            // GPU 및 렌더링 최적화
            '--use-gl=desktop',
            '--enable-webgl',
            '--enable-accelerated-2d-canvas',
            '--disable-gpu-sandbox',
            '--ignore-gpu-blacklist',
            '--enable-gpu-rasterization',
            
            // 메모리 및 성능
            '--max_old_space_size=4096',
            '--disable-background-networking',
            
            // 추가 봇 탐지 우회
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-first-run',
            '--no-default-browser-check',
            '--password-store=basic',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            
            // User Agent
            `--user-agent=${navigator.userAgent}`
        ],
        ignoreDefaultArgs: [
            '--enable-automation',
            '--enable-blink-features=IdleDetection',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-component-extensions-with-background-pages'
        ]
    });

    const page = await browser.newPage();
    
    // Set viewport based on fingerprint
    await page.setViewport({
        width: screen.width,
        height: screen.height,
        deviceScaleFactor: screen.devicePixelRatio,
        isMobile: navigator.userAgentData?.mobile || false,
        hasTouch: navigator.maxTouchPoints > 0
    });

    // Apply fingerprint settings
    await page.setUserAgent(navigator.userAgent);
    
    // Set additional headers
    await page.setExtraHTTPHeaders(headers);

    // Level 2: Advanced fingerprint spoofing
    await page.evaluateOnNewDocument((fp) => {
        // Override screen properties
        Object.defineProperty(screen, 'width', { value: fp.width });
        Object.defineProperty(screen, 'height', { value: fp.height });
        Object.defineProperty(screen, 'availWidth', { value: fp.availWidth });
        Object.defineProperty(screen, 'availHeight', { value: fp.availHeight });
        Object.defineProperty(screen, 'colorDepth', { value: fp.colorDepth });
        Object.defineProperty(screen, 'pixelDepth', { value: fp.pixelDepth });
        
        // Override navigator properties
        Object.defineProperty(navigator, 'hardwareConcurrency', { value: fp.hardwareConcurrency });
        Object.defineProperty(navigator, 'deviceMemory', { value: fp.deviceMemory });
        Object.defineProperty(navigator, 'maxTouchPoints', { value: fp.maxTouchPoints });
        Object.defineProperty(navigator, 'language', { value: fp.language });
        Object.defineProperty(navigator, 'languages', { value: fp.languages });
        Object.defineProperty(navigator, 'platform', { value: fp.platform });
        
        // WebGL fingerprint spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
                return 'Intel Inc.';
            }
            if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
                return 'Intel Iris OpenGL Engine';
            }
            return getParameter.apply(this, arguments);
        };
        
        // WebGL2 support
        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Intel Inc.';
            if (parameter === 37446) return 'Intel Iris OpenGL Engine';
            return getParameter2.apply(this, arguments);
        };
        
        // Canvas fingerprint spoofing - add noise
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function() {
            const imageData = originalGetImageData.apply(this, arguments);
            const data = imageData.data;
            // Add minimal noise to canvas data
            for (let i = 0; i < data.length; i += 4) {
                const noise = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
                data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
                data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise)); // G  
                data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise)); // B
            }
            return imageData;
        };
        
        // Audio context fingerprint spoofing
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const originalCreateAnalyser = AudioContext.prototype.createAnalyser;
            AudioContext.prototype.createAnalyser = function() {
                const analyser = originalCreateAnalyser.apply(this, arguments);
                const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;
                analyser.getFloatFrequencyData = function(array) {
                    originalGetFloatFrequencyData.apply(this, arguments);
                    // Add slight noise to audio fingerprint
                    for (let i = 0; i < array.length; i++) {
                        array[i] = array[i] + Math.random() * 0.0001 - 0.00005;
                    }
                };
                return analyser;
            };
        }
        
        // Font detection bypass
        Object.defineProperty(document, 'fonts', {
            value: {
                check: () => true,
                ready: Promise.resolve(),
                addEventListener: () => {},
                removeEventListener: () => {}
            }
        });
        
        // Timezone consistency
        Date.prototype.getTimezoneOffset = function() {
            return -540; // JST (Korea/Japan timezone)
        };
        
        // Performance timing spoofing
        if (window.performance && window.performance.now) {
            const originalNow = window.performance.now;
            let startTime = originalNow.call(window.performance);
            window.performance.now = function() {
                return startTime + (Math.random() * 0.1); // Add small random delay
            };
        }
    }, {
        ...screen,
        ...navigator
    });

    // Aggressive bot detection bypass
    await page.evaluateOnNewDocument(() => {
        // Overwrite the `eval` function to prevent detection of script injection
        const originalEval = window.eval;
        window.eval = function(code) {
            return originalEval.call(this, code);
        };
        
        // Hide chrome runtime completely
        delete window.chrome;
        
        // Remove headless indicators
        Object.defineProperty(window, 'outerWidth', { value: screen.width });
        Object.defineProperty(window, 'outerHeight', { value: screen.height });
        Object.defineProperty(window, 'innerWidth', { value: screen.width - 16 });
        Object.defineProperty(window, 'innerHeight', { value: screen.height - 160 });
        
        // Mock real mouse movement
        let mouseX = Math.random() * screen.width;
        let mouseY = Math.random() * screen.height;
        
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        // Override getBoundingClientRect with realistic values
        const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
            const rect = originalGetBoundingClientRect.apply(this);
            return {
                ...rect,
                x: rect.x + Math.random() * 0.01,
                y: rect.y + Math.random() * 0.01,
            };
        };
    });

    // Level 4: CDP detection bypass
    await page.evaluateOnNewDocument(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
        
        // Hide automation indicators
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
        
        // Override the `plugins` property to use a custom getter
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                {
                    0: {
                        type: "application/x-google-chrome-pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format",
                        enabledPlugin: Plugin,
                    },
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer",
                    length: 1,
                    name: "Chrome PDF Plugin",
                },
                {
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf", 
                        description: "Portable Document Format",
                        enabledPlugin: Plugin,
                    },
                    description: "Portable Document Format",
                    filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                    length: 1,
                    name: "Chrome PDF Viewer",
                },
            ],
        });
        
        // Override the `languages` property to use a custom getter
        Object.defineProperty(navigator, 'languages', {
            get: () => ['ko-KR', 'ko', 'en-US', 'en'],
        });
        
        // Spoof the Notification permission
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        
        // Hide CDP runtime
        window.chrome = {
            runtime: {},
            loadTimes: function() {
                return {
                    commitLoadTime: 1484583832.839,
                    connectionInfo: 'http/1.1',
                    finishDocumentLoadTime: 1484583833.063,
                    finishLoadTime: 1484583833.064,
                    firstPaintAfterLoadTime: 0,
                    firstPaintTime: 1484583833.094,
                    navigationType: 'Other',
                    npnNegotiatedProtocol: 'unknown',
                    requestTime: 1484583832.839,
                    startLoadTime: 1484583832.839,
                    wasAlternateProtocolAvailable: false,
                    wasFetchedViaSpdy: false,
                    wasNpnNegotiated: false
                };
            },
            csi: function() {
                return {
                    onloadT: 1484583833064,
                    pageT: 284.64000000001137,
                    startE: 1484583832780,
                    tran: 15
                };
            }
        };
        
        // Iframe contentWindow property override
        try {
            if (window.HTMLIFrameElement) {
                Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
                    get: function() {
                        return window;
                    }
                });
            }
        } catch (e) {}
        
        // Plugin array spoofing
        const pluginArray = [
            {
                name: "Chrome PDF Plugin",
                description: "Portable Document Format",
                filename: "internal-pdf-viewer",
                length: 1
            },
            {
                name: "Chrome PDF Viewer", 
                description: "Portable Document Format",
                filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
                length: 1
            },
            {
                name: "Native Client",
                description: "",
                filename: "internal-nacl-plugin",
                length: 2
            }
        ];
        
        Object.setPrototypeOf(pluginArray, PluginArray.prototype);
        Object.defineProperty(navigator, 'plugins', {
            get: () => pluginArray,
        });
        
        // Ultimate stealth: Override toString for all native functions
        const nativeFunctions = [
            'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 
            'propertyIsEnumerable', 'toLocaleString'
        ];
        
        nativeFunctions.forEach(funcName => {
            if (Function.prototype[funcName]) {
                const originalToString = Function.prototype[funcName].toString;
                Function.prototype[funcName].toString = function() {
                    if (this === Object.getOwnPropertyDescriptor(navigator, 'webdriver').get) {
                        return 'function get webdriver() { [native code] }';
                    }
                    if (this === navigator.plugins.toString) {
                        return 'function toString() { [native code] }';
                    }
                    return originalToString.call(this);
                };
            }
        });
        
        // Hide script modifications by overriding Error stack traces
        const originalPrepareStackTrace = Error.prepareStackTrace;
        Error.prepareStackTrace = function(error, stack) {
            return stack.filter(frame => !frame.toString().includes('puppeteer')).slice(0, 10);
        };
    });

    console.log('\n🚀 브라우저가 시작되었습니다!');
    console.log('📋 테스트할 수 있는 사이트들:');
    console.log('   • https://bot.sannysoft.com/ - 봇 탐지 테스트');
    console.log('   • https://browserleaks.com/canvas - Canvas 지문 테스트');  
    console.log('   • https://browserleaks.com/webrtc - WebRTC 테스트');
    console.log('   • https://map.naver.com/ - 네이버 맵');
    console.log('   • https://smartstore.naver.com/ - 네이버 스마트스토어');
    console.log('\n✨ 브라우저를 직접 조작해보세요!');
    console.log('⚠️  브라우저를 닫으면 프로그램이 종료됩니다.');
    
    // Keep the browser running until manually closed
    try {
        // Wait indefinitely until browser is closed
        await new Promise((resolve, reject) => {
            browser.on('disconnected', () => {
                console.log('\n👋 브라우저가 닫혔습니다.');
                resolve();
            });
        });
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test
testPuppeteerStealth().catch(console.error);