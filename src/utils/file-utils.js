import fs from 'fs';
import path from 'path';

class FileUtils {
  /**
   * 디렉토리 생성 (중첩 디렉토리 지원)
   */
  static ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  }

  /**
   * 타임스탬프 기반 파일명 생성
   */
  static generateTimestampedFilename(baseName, extension = '.csv') {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .split('.')[0];
    return `${baseName}_${timestamp}${extension}`;
  }

  /**
   * 안전한 파일명 생성 (특수문자 제거)
   */
  static sanitizeFilename(filename) {
    return filename
      .replace(/[^\w\s-가-힣]/gi, '') // 한글, 영문, 숫자, 하이픈, 공백만 허용
      .replace(/\s+/g, '_')           // 공백을 언더스코어로 변환
      .replace(/_+/g, '_')            // 연속 언더스코어 제거
      .trim();
  }

  /**
   * 파일 크기 확인
   */
  static getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 파일 존재 여부 확인
   */
  static fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  /**
   * 파일 삭제 (에러 무시)
   */
  static safeDeleteFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch (error) {
      console.warn(`Failed to delete file: ${filePath}`, error.message);
    }
    return false;
  }

  /**
   * JSON 파일 읽기
   */
  static readJsonFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * JSON 파일 쓰기
   */
  static writeJsonFile(filePath, data) {
    try {
      const dirPath = path.dirname(filePath);
      this.ensureDirectoryExists(dirPath);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to write JSON file: ${filePath}`, error.message);
      return false;
    }
  }
}

export default FileUtils;