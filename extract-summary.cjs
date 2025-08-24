#!/usr/bin/env node

/**
 * 수집된 JSON 데이터에서 핵심 정보만 추출하여 요약
 */

const fs = require('fs');

function extractSummary(jsonFile) {
    try {
        const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        
        const summary = {
            // 기본 정보
            상품명: data.name || data.title,
            가격: data.salePrice ? `${data.salePrice.toLocaleString()}원` : 'N/A',
            원가: data.originalPrice ? `${data.originalPrice.toLocaleString()}원` : 'N/A',
            할인율: data.discountRate ? `${data.discountRate}%` : '0%',
            할인금액: data.discountAmount ? `${data.discountAmount.toLocaleString()}원` : 'N/A',
            
            // 상세 정보
            브랜드: data.brand,
            제조사: data.manufacturer,
            상품번호: data.productId,
            재고수량: data.stockQuantity ? data.stockQuantity.toLocaleString() : 'N/A',
            
            // 카테고리
            카테고리: data.category?.fullPath,
            
            // 이미지 URL들
            이미지URLs: data.images?.map(img => img.url) || [],
            
            // 옵션 정보 (처음 5개만)
            옵션샘플: data.options?.slice(0, 5).map(opt => ({
                옵션명: `${opt.name1} | ${opt.name2} | ${opt.name3}`,
                추가가격: opt.price ? `+${opt.price.toLocaleString()}원` : '기본가',
                재고: opt.stock?.toLocaleString()
            })) || [],
            
            // 통계
            통계: {
                총옵션수: data.options?.length || 0,
                총이미지수: data.images?.length || 0,
                속성수: data.attributes?.length || 0
            },
            
            // URL 및 수집 정보
            상품URL: data.url,
            수집일시: data.crawledAt
        };
        
        return summary;
        
    } catch (error) {
        console.error(`❌ 파일 읽기 실패: ${error.message}`);
        return null;
    }
}

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // 최신 파일 자동 선택
        const files = fs.readdirSync('.').filter(f => f.startsWith('smartstore-') && f.endsWith('.json'));
        if (files.length === 0) {
            console.log('❌ 수집된 데이터 파일이 없습니다.');
            process.exit(1);
        }
        
        // 가장 최신 파일 선택
        const latestFile = files.sort().pop();
        console.log(`📄 최신 파일 분석: ${latestFile}`);
        args.push(latestFile);
    }
    
    const jsonFile = args[0];
    
    if (!fs.existsSync(jsonFile)) {
        console.log(`❌ 파일을 찾을 수 없습니다: ${jsonFile}`);
        process.exit(1);
    }
    
    const summary = extractSummary(jsonFile);
    
    if (summary) {
        console.log('\n🎯 수집 데이터 요약');
        console.log('='.repeat(80));
        console.log(`📦 상품명: ${summary.상품명}`);
        console.log(`💰 판매가: ${summary.가격}`);
        console.log(`💳 정가: ${summary.원가}`);
        console.log(`🏷️  할인율: ${summary.할인율}`);
        console.log(`🏭 브랜드: ${summary.브랜드} (제조사: ${summary.제조사})`);
        console.log(`📊 재고: ${summary.재고수량}개`);
        console.log(`📂 카테고리: ${summary.카테고리}`);
        
        console.log(`\n🖼️  이미지 URL (${summary.통계.총이미지수}개):`);
        summary.이미지URLs.forEach((url, i) => {
            console.log(`   ${i + 1}. ${url}`);
        });
        
        console.log(`\n⚙️  상품 옵션 샘플 (총 ${summary.통계.총옵션수}개 중 5개):`);
        summary.옵션샘플.forEach((opt, i) => {
            console.log(`   ${i + 1}. ${opt.옵션명} | ${opt.추가가격} | 재고: ${opt.재고}`);
        });
        
        console.log(`\n🔗 상품 URL: ${summary.상품URL}`);
        console.log(`⏰ 수집일시: ${summary.수집일시}`);
        console.log('='.repeat(80));
        
        // CSV 형태로도 저장 (이미지 URL 포함)
        const imageUrls = summary.이미지URLs.join(' | '); // 여러 URL을 | 로 구분
        
        const csvData = [
            '상품명,판매가,정가,할인율,브랜드,제조사,재고수량,카테고리,옵션수,이미지수,이미지URLs,상품URL,수집일시',
            [
                `"${summary.상품명}"`,
                summary.가격.replace('원', '').replace(',', ''),
                summary.원가.replace('원', '').replace(',', ''),
                summary.할인율.replace('%', ''),
                `"${summary.브랜드}"`,
                `"${summary.제조사}"`,
                summary.재고수량.replace(',', ''),
                `"${summary.카테고리}"`,
                summary.통계.총옵션수,
                summary.통계.총이미지수,
                `"${imageUrls}"`,
                `"${summary.상품URL}"`,
                `"${summary.수집일시}"`
            ].join(',')
        ].join('\n');
        
        const csvFile = jsonFile.replace('.json', '-summary.csv');
        fs.writeFileSync(csvFile, csvData, 'utf8');
        console.log(`📊 CSV 요약 저장: ${csvFile}`);
        
    }
}

if (require.main === module) {
    main();
}