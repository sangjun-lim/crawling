import BaseScraper from './BaseScraper.js';
import CurlHttpClient from './CurlHttpClient.js';
import fs from 'fs';
import { promises as fsPromises } from 'fs';

class NaverShoppingHttpScraper extends BaseScraper {
  constructor(options = {}) {
    super(options);

    this.options = {
      timeout: options.timeout ?? 30000,
      saveData: options.saveData ?? true,
      ...options,
    };

    // 프록시 설정을 CurlHttpClient 형식으로 변환
    const proxyConfig = this.getHttpProxyConfig();
    let curlOptions = { ...options };

    if (proxyConfig) {
      curlOptions.proxy =
        proxyConfig.protocol === 'https'
          ? `https://${proxyConfig.host}:${proxyConfig.port}`
          : `http://${proxyConfig.host}:${proxyConfig.port}`;

      if (proxyConfig.auth) {
        curlOptions.proxyAuth = proxyConfig.auth;
      }

      this.logInfo(`CurlHttpClient 프록시 설정: ${curlOptions.proxy}`);
    }

    this.httpClient = new CurlHttpClient(curlOptions);
  }

  /**
   * 프록시 테스트용 HTTP 요청 (부모 클래스 오버라이드)
   */
  async makeTestRequest(url) {
    try {
      const response = await this.httpClient.get(url);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      return false;
    }
  }

  /**
   * 네이버 쇼핑 홈페이지 HTTP 요청으로 HTML 반환
   */
  async getHomepageHtml() {
    try {
      let url, response, payload;
      this.logInfo('네이버 쇼핑 검색 페이지 HTTP 요청 중...');
      url = 'https://search.shopping.naver.com/catalog/51449387077?query=%EC%9D%98%EC%9E%90&NaPm=ct%3Dmes2nvl4%7Cci%3D1927a15e74b13c54bbe312b6ece18d85c0e6aacb%7Ctr%3Dslsl%7Csn%3D95694%7Chk%3D1ff359a90554d6aeda95dc6d17bb3c737cc1a384';

      response = await this.httpClient.get(
        url,
        {},
        {
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Sec-Fetch-Site': 'same-site',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-arch': 'arm',
          'sec-ch-ua-platform': 'macOS',
          'sec-ch-ua-platform-version': '15.6.0',
          'sec-ch-ua-model': '""',
          'sec-ch-ua-bitness': '64',
          'sec-ch-ua-wow64': '?0',
          'sec-ch-ua-full-version-list': '"Not;A=Brand";v="99.0.0.0", "Google Chrome";v="139.0.7258.139", "Chromium";v="139.0.7258.139"',
          'sec-ch-ua-form-factors': 'Desktop',
          'Referer': 'https://search.shopping.naver.com/search/all?query=%EC%9D%98%EC%9E%90',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cookie': 'NNB=PBS5ATIEDHRGI; ASID=738a27760000018f8c1c97cf00000065; NFS=2; BNB_FINANCE_HOME_TOOLTIP_MYASSET=true; ba.uuid=112a009c-0356-4e8f-919d-ce402de57095; NV_WETR_LAST_ACCESS_RGN_M="MDkxNDAxMDQ="; NV_WETR_LOCATION_RGN_M="MDkxNDAxMDQ="; _fbp=fb.1.1752146940101.380195513315487304; _ga_EFBDNNF91G=GS2.1.s1752146940$o1$g0$t1752146940$j60$l0$h0; _ga=GA1.1.18899327.1752146941; bnb_tooltip_shown_finance_v1=true; SHP_BUCKET_ID=2; nstore_session=79n5DtkePcflctve1eP+hPNP; RELATED_PRODUCT=ON; page_uid=j60wsdqosTCssFDZbrossssssXd-210586; NAC=J03zBwgIxUva; SRT30=1756183024; NACT=1; nid_inf=1747328577; NID_AUT=6+/bSmXiIe6uSBdaaj0c/EwgbAYIzTqieE2dGzKcdP/mzMPzcl2q5VIuUS+tCk+F; NID_SES=AAABqUHNWJLkgFf/9SuBvTJPeovIb5aiWIvZY3Ht5boyUj527aB9rWUZG5mvY3ygJM6/yC3IoYq6olj0d34qduqjc1SCsTuPxtMh7mozKCex9UpZMCaX570jH0P1qY1a4tRQO6CnPIaL2wXTgkAZKmdgh36V3GqQeplFjDJ+m7+VRjtMvcSzpsR7vNUtaVstmFX+D3UXeUzzabDuvMIeBj7bnx8XSjlqRPZg1lNa62R/hUFah/+xpPL/KamPNvUJDnUNZWbvgHu4heXJ8OABDbmX+OxXpLRGQb7rp9s7CdDZ6ZD12Mx87D9JGjJ8RP3QUa4eDVGFzt1de18FXRJM6yG6UxCW0FNZ3OIFfhO9HmLiddfIWtY20G6LQUqIdYRYch/eaM65rNSEbC5Vz8tezrQ8FtVCzNpca4zd4BZRclfhTQ/ccDatjhtkriaVQJZ0prSrEznfDIgzBZClMK+9B9+Ds3X9rvC0MNv6gKJghINi+h25AUeHBTKqabqJ65Jvu/+GB+SMTP0siX9Ph+TPo7WZLsLxdj152/AIct+tAN7arlLMhRrb3iDK/oQmlORfgReFgA==; nstore_pagesession=j60IWsqQRjQ7lwsLV14-133286; OEP_CONFIG=[{%22serId%22:%22shopping%22%2C%22type%22:%22oep%22%2C%22expId%22:%22NSP-SEARCH-ABT%22%2C%22varId%22:%227%22%2C%22value%22:{%22bucket%22:%221%22%2C%22is_control%22:true}%2C%22userType%22:%22idno%22%2C%22provId%22:%22%22%2C%22sesnId%22:%22%22}%2C{%22serId%22:%22shopping%22%2C%22type%22:%22oep%22%2C%22expId%22:%22QAC-RANK-VDT%22%2C%22varId%22:%222%22%2C%22value%22:{%22bt%22:%222%22%2C%22is_control%22:true}%2C%22userType%22:%22idno%22%2C%22provId%22:%22%22%2C%22sesnId%22:%22%22}]; SRT5=1756183844; BUC=iei3XkDheJ2E8CV8AHutb9AjXl6DOxXj8T26D9VYgO4=; sus_val=kHEUq4wqPQPFSUIlXwLrmxK4'
        }
      );

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const htmlContent = response.data;
      this.logSuccess(
        `HTML 응답 수신 완료 (길이: ${htmlContent.length.toLocaleString()}자)`
      );

      return htmlContent;
    } catch (error) {
      this.logError(`네이버 쇼핑 HTTP 요청 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * HTML을 파일로 저장
   */
  async saveHtml(htmlContent, filename = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultFilename = `result/naver-shopping-http-${timestamp}.html`;
      const filepath = filename || defaultFilename;

      // result 디렉토리가 없으면 생성
      const resultDir = 'result';
      if (!fs.existsSync(resultDir)) {
        await fsPromises.mkdir(resultDir, { recursive: true });
      }

      await fsPromises.writeFile(filepath, htmlContent, 'utf8');
      this.logSuccess(`HTML 파일 저장 완료: ${filepath}`);

      return filepath;
    } catch (error) {
      this.logError(`HTML 파일 저장 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 네이버 쇼핑 홈페이지 HTTP 스크래핑 실행
   */
  async scrapeHomepage() {
    try {
      this.logInfo('네이버 쇼핑 HTTP 스크래핑 시작');

      // 부모 클래스 초기화 (프록시 테스트 포함)
      await this.init();

      // 홈페이지 HTML 가져오기
      const htmlContent = await this.getHomepageHtml();

      // HTML 파일 저장
      let savedPath = null;
      if (this.options.saveData) {
        savedPath = await this.saveHtml(htmlContent);
      }

      this.logSuccess('네이버 쇼핑 HTTP 스크래핑 완료');

      return {
        html: htmlContent,
        savedPath: savedPath,
        url: 'https://shopping.naver.com/ns/home',
        method: 'http',
        crawledAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logError(`네이버 쇼핑 HTTP 스크래핑 실패: ${error.message}`);
      throw error;
    }
  }
}

export default NaverShoppingHttpScraper;
