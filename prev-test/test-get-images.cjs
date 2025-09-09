#!/usr/bin/env node

/**
 * 수집된 JSON 데이터에서 이미지 URL만 추출
 */

const fs = require('fs');

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // 최신 파일 자동 선택
        const files = fs.readdirSync('.').filter(f => f.startsWith('smartstore-') && f.endsWith('.json') && !f.includes('summary'));
        if (files.length === 0) {
            console.log('❌ 수집된 데이터 파일이 없습니다.');
            process.exit(1);
        }
        
        const latestFile = files.sort().pop();
        console.log(`📄 최신 파일에서 이미지 추출: ${latestFile}\n`);
        args.push(latestFile);
    }
    
    const jsonFile = args[0];
    
    try {
        const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        
        console.log(`🖼️  상품 이미지 URL (${data.images?.length || 0}개):`);
        console.log('='.repeat(80));
        
        if (data.images && data.images.length > 0) {
            data.images.forEach((img, i) => {
                console.log(`${i + 1}. ${img.url}`);
                console.log(`   타입: ${img.type}, 순서: ${img.order}`);
                console.log('');
            });
            
            // URL만 따로 텍스트 파일로 저장
            const imageUrls = data.images.map(img => img.url).join('\n');
            const urlFile = jsonFile.replace('.json', '-image-urls.txt');
            fs.writeFileSync(urlFile, imageUrls, 'utf8');
            console.log(`📝 이미지 URL만 저장: ${urlFile}`);
            
        } else {
            console.log('이미지 URL이 없습니다.');
        }
        
    } catch (error) {
        console.error(`❌ 파일 처리 실패: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}