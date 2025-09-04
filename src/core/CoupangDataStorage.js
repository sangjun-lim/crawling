import fs from 'fs/promises';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';

class CoupangDataStorage {
    constructor(options = {}) {
        this.storageType = options.storageType || 'file'; // 'file', 'database', 'json'
        this.outputDir = options.outputDir || 'result';
    }

    async saveVendorData(results, filename = null) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const defaultFilename = filename || `coupang_vendors_${timestamp}`;

        switch (this.storageType) {
            case 'csv':
                return await this.saveVendorAsCSV(results, defaultFilename);
            case 'json':
                return await this.saveVendorAsJSON(results, defaultFilename);
            case 'database':
                return await this.saveVendorToDatabase(results);
            default:
                return await this.saveVendorAsCSV(results, defaultFilename);
        }
    }

    async saveProductData(results, filename = null) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const defaultFilename = filename || `coupang_products_${timestamp}`;

        switch (this.storageType) {
            case 'csv':
                return await this.saveProductAsCSV(results, defaultFilename);
            case 'json':
                return await this.saveProductAsJSON(results, defaultFilename);
            case 'database':
                return await this.saveProductToDatabase(results);
            default:
                return await this.saveProductAsCSV(results, defaultFilename);
        }
    }

    async saveVendorAsCSV(results, filename) {
        const successfulResults = results.filter(r => r.success);
        
        // name이 null이거나 vendorId가 빈 문자열인 경우 제외
        const validResults = successfulResults.filter(result => {
            const data = result.data;
            return data && data.name !== null && data.vendorId && data.vendorId.trim() !== '';
        });
        
        if (validResults.length === 0) {
            console.log('저장할 유효한 벤더 데이터가 없습니다.');
            return null;
        }


        // result 폴더 자동 생성
        await fs.mkdir(this.outputDir, { recursive: true });
        
        const filePath = path.join(this.outputDir, `${filename}.csv`);
        
        // 응답 데이터를 모두 저장 (JSON을 평면화)
        const csvData = validResults.map(result => {
            const data = result.data;
            return {
                수집시간: result.timestamp,
                스토어ID: result.storeId,
                벤더ID: result.vendorId,
                벤더명: data.name || '',
                평점수: data.ratingCount || 0,
                좋아요수: data.thumbUpCount || 0,
                싫어요수: data.thumbDownCount || 0,
                좋아요비율: data.thumbUpRatio || 0,
                대표주소1: data.repAddr1 || '',
                대표주소2: data.repAddr2 || '',
                대표이메일: data.repEmail || '',
                대표자명: data.repPersonName || '',
                대표전화: data.repPhoneNum || '',
                사업자번호: data.businessNumber || '',
                리뷰상세링크: data.sellerReviewDetailLink || '',
                품질배지: data.qualitySellerBadgeDto ? JSON.stringify(data.qualitySellerBadgeDto) : '',
                전체응답: JSON.stringify(data)
            };
        });

        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: '수집시간', title: '수집시간' },
                { id: '스토어ID', title: '스토어ID' },
                { id: '벤더ID', title: '벤더ID' },
                { id: '벤더명', title: '벤더명' },
                { id: '평점수', title: '평점수' },
                { id: '좋아요수', title: '좋아요수' },
                { id: '싫어요수', title: '싫어요수' },
                { id: '좋아요비율', title: '좋아요비율' },
                { id: '대표주소1', title: '대표주소1' },
                { id: '대표주소2', title: '대표주소2' },
                { id: '대표이메일', title: '대표이메일' },
                { id: '대표자명', title: '대표자명' },
                { id: '대표전화', title: '대표전화' },
                { id: '사업자번호', title: '사업자번호' },
                { id: '리뷰상세링크', title: '리뷰상세링크' },
                { id: '품질배지', title: '품질배지' },
                { id: '전체응답', title: '전체응답' }
            ],
            encoding: 'utf8'
        });

        await csvWriter.writeRecords(csvData);
        
        console.log(`✅ 벤더 데이터 저장 완료: ${filePath}`);
        console.log(`   총 ${validResults.length}개 벤더 정보 저장 (필터링 전: ${successfulResults.length}개)`);
        
        return filePath;
    }

    async saveProductAsCSV(results, filename) {
        const allProducts = [];
        
        results.forEach(vendorResult => {
            if (vendorResult.products && vendorResult.products.length > 0) {
                vendorResult.products.forEach(product => {
                    allProducts.push({
                        ...product,
                        vendorId: vendorResult.vendorId,
                        storeId: vendorResult.storeId
                    });
                });
            }
        });

        if (allProducts.length === 0) {
            console.log('저장할 상품 데이터가 없습니다.');
            return null;
        }


        // result 폴더 자동 생성
        await fs.mkdir(this.outputDir, { recursive: true });
        
        const filePath = path.join(this.outputDir, `${filename}.csv`);
        
        // CSV 헤더와 데이터 매핑 (수집시간 포함 5개 필드)
        const csvData = allProducts.map(product => ({
            수집시간: product.collectedAt,
            상품명: product.imageAndTitleArea?.title || '',
            링크: product.link || '',
            벤더ID: product.vendorId || '',
            상품ID: product.productId || ''
        }));

        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: '수집시간', title: '수집시간' },
                { id: '상품명', title: '상품명' },
                { id: '링크', title: '링크' },
                { id: '벤더ID', title: '벤더ID' },
                { id: '상품ID', title: '상품ID' }
            ],
            encoding: 'utf8'
        });

        await csvWriter.writeRecords(csvData);
        
        console.log(`✅ 상품 데이터 저장 완료: ${filePath}`);
        console.log(`   총 ${allProducts.length}개 상품 정보 저장`);
        
        return filePath;
    }

    async saveVendorAsJSON(results, filename) {
        const filePath = path.join(this.outputDir, `${filename}.json`);
        
        await fs.mkdir(this.outputDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf8');
        
        console.log(`✅ 벤더 JSON 데이터 저장 완료: ${filePath}`);
        return filePath;
    }

    async saveProductAsJSON(results, filename) {
        const filePath = path.join(this.outputDir, `${filename}.json`);
        
        await fs.mkdir(this.outputDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf8');
        
        console.log(`✅ 상품 JSON 데이터 저장 완료: ${filePath}`);
        return filePath;
    }

    async saveVendorToDatabase(results) {
        // 데이터베이스 저장 로직은 나중에 구현
        console.log('⚠️  데이터베이스 저장 기능은 아직 구현되지 않았습니다.');
        console.log(`   ${results.length}개 벤더 데이터를 임시로 JSON으로 저장합니다.`);
        return await this.saveVendorAsJSON(results, 'vendors_temp');
    }

    async saveProductToDatabase(results) {
        // 데이터베이스 저장 로직은 나중에 구현
        console.log('⚠️  데이터베이스 저장 기능은 아직 구현되지 않았습니다.');
        console.log(`   상품 데이터를 임시로 JSON으로 저장합니다.`);
        return await this.saveProductAsJSON(results, 'products_temp');
    }

    async saveCombinedData(results, filename = null) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const defaultFilename = filename || `coupang_combined_${timestamp}`;

        switch (this.storageType) {
            case 'csv':
                return await this.saveCombinedAsCSV(results, defaultFilename);
            case 'json':
                return await this.saveCombinedAsJSON(results, defaultFilename);
            case 'database':
                return await this.saveCombinedToDatabase(results);
            default:
                return await this.saveCombinedAsCSV(results, defaultFilename);
        }
    }

    async saveCombinedAsCSV(results, filename) {
        if (results.length === 0) {
            console.log('저장할 통합 데이터가 없습니다.');
            return null;
        }

        // result 폴더 자동 생성
        await fs.mkdir(this.outputDir, { recursive: true });
        
        const filePath = path.join(this.outputDir, `${filename}.csv`);
        
        // 통합 CSV 헤더와 데이터 매핑 (벤더 정보 + 상품 정보)
        const csvData = results.map(row => ({
            수집시간: row.수집시간 || '',
            벤더ID: row.vendorId || '',
            벤더명: row.name || '',
            평점수: row.ratingCount || 0,
            좋아요수: row.thumbUpCount || 0,
            싫어요수: row.thumbDownCount || 0,
            좋아요비율: row.thumbUpRatio || 0,
            대표주소1: row.repAddr1 || '',
            대표주소2: row.repAddr2 || '',
            대표이메일: row.repEmail || '',
            대표자명: row.repPersonName || '',
            대표전화: row.repPhoneNum || '',
            사업자번호: row.businessNumber || '',
            리뷰상세링크: row.sellerReviewDetailLink || '',
            품질배지: row.qualitySellerBadgeDto ? JSON.stringify(row.qualitySellerBadgeDto) : '',
            상품수집시간: row.상품수집시간 || '',
            상품명: row.상품명 || '',
            상품링크: row.상품링크 || '',
            상품ID: row.상품ID || '',
            전체응답: JSON.stringify(row)
        }));

        const csvWriter = createObjectCsvWriter({
            path: filePath,
            header: [
                { id: '수집시간', title: '수집시간' },
                { id: '벤더ID', title: '벤더ID' },
                { id: '벤더명', title: '벤더명' },
                { id: '평점수', title: '평점수' },
                { id: '좋아요수', title: '좋아요수' },
                { id: '싫어요수', title: '싫어요수' },
                { id: '좋아요비율', title: '좋아요비율' },
                { id: '대표주소1', title: '대표주소1' },
                { id: '대표주소2', title: '대표주소2' },
                { id: '대표이메일', title: '대표이메일' },
                { id: '대표자명', title: '대표자명' },
                { id: '대표전화', title: '대표전화' },
                { id: '사업자번호', title: '사업자번호' },
                { id: '리뷰상세링크', title: '리뷰상세링크' },
                { id: '품질배지', title: '품질배지' },
                { id: '상품수집시간', title: '상품수집시간' },
                { id: '상품명', title: '상품명' },
                { id: '상품링크', title: '상품링크' },
                { id: '상품ID', title: '상품ID' },
                { id: '전체응답', title: '전체응답' }
            ],
            encoding: 'utf8'
        });

        await csvWriter.writeRecords(csvData);
        
        console.log(`✅ 통합 데이터 저장 완료: ${filePath}`);
        console.log(`   총 ${results.length}행 저장`);
        
        return filePath;
    }

    async saveCombinedAsJSON(results, filename) {
        const filePath = path.join(this.outputDir, `${filename}.json`);
        
        await fs.mkdir(this.outputDir, { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(results, null, 2), 'utf8');
        
        console.log(`✅ 통합 JSON 데이터 저장 완료: ${filePath}`);
        return filePath;
    }

    async saveCombinedToDatabase(results) {
        // 데이터베이스 저장 로직은 나중에 구현
        console.log('⚠️  데이터베이스 저장 기능은 아직 구현되지 않았습니다.');
        console.log(`   ${results.length}행 통합 데이터를 임시로 JSON으로 저장합니다.`);
        return await this.saveCombinedAsJSON(results, 'combined_temp');
    }

    // 통합 저장 메서드
    async save(data, type, filename = null) {
        if (type === 'vendor') {
            return await this.saveVendorData(data, filename);
        } else if (type === 'product') {
            return await this.saveProductData(data, filename);
        } else if (type === 'combined') {
            return await this.saveCombinedData(data, filename);
        } else {
            throw new Error(`지원되지 않는 데이터 타입: ${type}`);
        }
    }
}

export default CoupangDataStorage;