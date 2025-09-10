import fs from 'fs/promises';
import path from 'path';

class CheckpointService {
    constructor(options = {}) {
        this.checkpointDir = options.checkpointDir || 'checkpoints';
        this.ensureCheckpointDir();
    }

    async ensureCheckpointDir() {
        try {
            await fs.mkdir(this.checkpointDir, { recursive: true });
        } catch (error) {
            console.warn('체크포인트 디렉토리 생성 실패:', error.message);
        }
    }

    generateSessionId() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomId = Math.random().toString(36).substring(2, 8);
        return `session_${timestamp}_${randomId}`;
    }

    getCheckpointPath(sessionId) {
        return path.join(this.checkpointDir, `${sessionId}.json`);
    }

    // 체크포인트 저장
    async saveCheckpoint(sessionId, checkpoint) {
        try {
            const checkpointPath = this.getCheckpointPath(sessionId);
            const data = {
                ...checkpoint,
                lastUpdated: new Date().toISOString(),
                version: '1.0'
            };

            await fs.writeFile(checkpointPath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`💾 체크포인트 저장: ${checkpointPath}`);
            return checkpointPath;
        } catch (error) {
            console.error('체크포인트 저장 실패:', error.message);
            throw error;
        }
    }

    // 체크포인트 로드
    async loadCheckpoint(sessionId) {
        try {
            const checkpointPath = this.getCheckpointPath(sessionId);
            const content = await fs.readFile(checkpointPath, 'utf8');
            const checkpoint = JSON.parse(content);
            
            console.log(`📂 체크포인트 로드: ${checkpointPath}`);
            console.log(`   진행률: ${checkpoint.processedCount}/${checkpoint.totalCount} (${checkpoint.progressPercentage}%)`);
            
            return checkpoint;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('체크포인트 파일이 없습니다. 새로 시작합니다.');
                return null;
            }
            console.error('체크포인트 로드 실패:', error.message);
            throw error;
        }
    }

    // 기존 세션 목록 조회
    async listSessions() {
        try {
            const files = await fs.readdir(this.checkpointDir);
            const sessions = files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));

            return sessions;
        } catch (error) {
            console.warn('세션 목록 조회 실패:', error.message);
            return [];
        }
    }

    // 세션 정보 조회
    async getSessionInfo(sessionId) {
        try {
            const checkpoint = await this.loadCheckpoint(sessionId);
            if (!checkpoint) return null;

            return {
                sessionId,
                startTime: checkpoint.startTime,
                lastUpdated: checkpoint.lastUpdated,
                progress: `${checkpoint.processedCount}/${checkpoint.totalCount}`,
                progressPercentage: checkpoint.progressPercentage,
                status: checkpoint.status,
                batchCount: checkpoint.currentBatch,
                estimatedTimeRemaining: this.calculateETA(checkpoint)
            };
        } catch (error) {
            console.error(`세션 정보 조회 실패 (${sessionId}):`, error.message);
            return null;
        }
    }

    // 예상 완료 시간 계산
    calculateETA(checkpoint) {
        if (!checkpoint.startTime || checkpoint.processedCount === 0) {
            return 'Unknown';
        }

        const startTime = new Date(checkpoint.startTime);
        const currentTime = new Date();
        const elapsedMs = currentTime - startTime;
        const remainingCount = checkpoint.totalCount - checkpoint.processedCount;
        
        if (remainingCount === 0) {
            return 'Completed';
        }

        const avgTimePerItem = elapsedMs / checkpoint.processedCount;
        const estimatedRemainingMs = avgTimePerItem * remainingCount;
        
        const hours = Math.floor(estimatedRemainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((estimatedRemainingMs % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    }

    // 체크포인트 삭제
    async deleteCheckpoint(sessionId) {
        try {
            const checkpointPath = this.getCheckpointPath(sessionId);
            await fs.unlink(checkpointPath);
            console.log(`🗑️  체크포인트 삭제: ${sessionId}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('체크포인트 삭제 실패:', error.message);
            }
        }
    }

    // 오래된 체크포인트 정리 (7일 이상)
    async cleanupOldCheckpoints(days = 7) {
        try {
            const files = await fs.readdir(this.checkpointDir);
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            
            let cleaned = 0;
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                
                const filePath = path.join(this.checkpointDir, file);
                const stat = await fs.stat(filePath);
                
                if (stat.mtime.getTime() < cutoffTime) {
                    await fs.unlink(filePath);
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                console.log(`🧹 ${cleaned}개 오래된 체크포인트 정리 완료`);
            }
        } catch (error) {
            console.warn('오래된 체크포인트 정리 실패:', error.message);
        }
    }

    // 진행률 업데이트
    updateProgress(checkpoint, processedCount, currentBatch = null) {
        checkpoint.processedCount = processedCount;
        checkpoint.progressPercentage = Math.floor((processedCount / checkpoint.totalCount) * 100);
        checkpoint.lastUpdated = new Date().toISOString();
        
        if (currentBatch !== null) {
            checkpoint.currentBatch = currentBatch;
        }
        
        return checkpoint;
    }

    // 체크포인트 생성
    createCheckpoint(sessionId, vendorIds, options = {}) {
        return {
            sessionId,
            startTime: new Date().toISOString(),
            totalCount: vendorIds.length,
            processedCount: 0,
            progressPercentage: 0,
            currentBatch: 0,
            batchSize: options.batchSize || 100,
            maxProductsPerVendor: options.maxProductsPerVendor || 5,
            rateLimitDelay: options.rateLimitDelay || 200,
            status: 'running',
            vendorIds: vendorIds,
            processedVendors: [],
            currentIndex: 0,
            options: options
        };
    }
}

export default CheckpointService;