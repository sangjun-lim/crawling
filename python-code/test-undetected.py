#!/usr/bin/env python3
import undetected_chromedriver as uc
import time
import sys

def test_undetected_chrome():
    print("Undetected Chrome 초기화 중...")
    
    # 옵션 설정
    options = uc.ChromeOptions()
    options.add_argument("--no-first-run")
    options.add_argument("--no-default-browser-check")
    
    # undetected-chromedriver 실행
    driver = uc.Chrome(options=options, version_main=None)
    
    try:
        print("✅ Undetected Chrome 초기화 완료")
        print("🌐 브라우저가 열렸습니다.")
        
        # 1단계: 네이버 메인 페이지로 이동
        print("네이버 메인 페이지로 이동 중...")
        driver.get("https://www.naver.com")
        time.sleep(3)
        print("✅ 네이버 메인 페이지 로딩 완료")
        
        # 브라우저가 열린 상태로 수동 조작 가능
        print("✅ 브라우저가 열렸습니다!")
        print("수동으로 다음 단계를 진행해보세요:")
        print("1. 스토어 버튼 클릭")
        print("2. 검색창에 '의자' 입력")  
        print("3. 가격비교 태그 클릭")
        print("\n이 과정에서 제한 페이지가 나타나는지 확인해보세요!")
        
        # 최종 상태 확인
        current_url = driver.current_url
        title = driver.title
        print(f"📍 최종 URL: {current_url}")
        print(f"📋 최종 페이지 제목: {title}")
        
        # 제한 페이지인지 확인
        page_source = driver.page_source
        if "일시적으로 제한" in page_source or "VPN을 사용하여 접속" in page_source:
            print("🚨 여전히 제한됨")
        else:
            print("✅ 정상 접속 성공!")
        
        print("\n브라우저에서 직접 조작해보세요!")
        print("종료하려면 Ctrl+C를 누르세요.")
        
        # 무한 대기
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n종료 신호 감지...")
    except Exception as e:
        print(f"오류 발생: {e}")
    finally:
        driver.quit()
        print("✅ 브라우저 종료 완료")

if __name__ == "__main__":
    test_undetected_chrome()