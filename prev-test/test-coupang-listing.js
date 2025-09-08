import https from 'https';

const testCoupangListingAPI = () => {
    const url = 'https://shop.coupang.com/api/v1/listing';
    
    const postData = JSON.stringify({
        "storeId": 130703,
        "brandId": 0,
        "vendorId": "A01039649",
        "sourceProductId": 8363764627,
        "sourceVendorItemId": 92282746298,
        "source": "brandstore_sdp_atf",
        "enableAdultItemDisplay": true,
        "nextPageKey": 0,
        "filter": "SORT_KEY:"
    });
    
    const options = {
        method: 'POST',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Referer': 'https://shop.coupang.com/',
            'Origin': 'https://shop.coupang.com'
        }
    };

    console.log('쿠팡 Listing API 요청 테스트 시작...');
    console.log('URL:', url);
    console.log('POST Data:', postData);
    
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
    
    req.write(postData);
    req.end();
};

testCoupangListingAPI();