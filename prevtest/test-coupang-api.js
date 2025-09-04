import https from 'https';

const testCoupangAPI = () => {
    const url = 'https://shop.coupang.com/api/v1/store/getStoreReview?storeId=130701&vendorId=A01039646&urlName=A01039650';
    
    const options = {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Referer': 'https://shop.coupang.com/',
            'Origin': 'https://shop.coupang.com'
        }
    };

    console.log('쿠팡 API 요청 테스트 시작...');
    console.log('URL:', url);
    
    const req = https.request(url, options, (res) => {
        console.log('응답 상태:', res.statusCode);
        console.log('응답 헤더:', res.headers);
        
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('\n=== 응답 데이터 ===');
            try {
                const jsonData = JSON.parse(data);
                console.log(JSON.stringify(jsonData, null, 2));
            } catch (e) {
                console.log('JSON 파싱 실패, 원본 응답:');
                console.log(data);
            }
        });
    });
    
    req.on('error', (error) => {
        console.error('요청 오류:', error);
    });
    
    req.end();
};

testCoupangAPI();