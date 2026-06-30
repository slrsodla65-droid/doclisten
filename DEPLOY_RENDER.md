# DocListen Render 배포 안내

## 현재 상태
- 도메인: `https://doclisten.app` 연결 완료
- www 도메인: `https://www.doclisten.app` → `https://doclisten.app` 리다이렉트 확인 완료
- Render 임시 주소: `https://doclisten.onrender.com`
- 앱: 브라우저 기본 음성 기반 PDF 듣기 MVP
- 서버 실행 명령: `python3 server.py`
- 서버 포트: Render가 제공하는 `PORT` 환경변수 자동 사용
- 앱 버전: `v33`

## 배포 추천
처음 정식 베타는 Render Web Service를 추천한다.

이유:
- Python 서버 배포가 간단함
- 무료/저가 플랜으로 시작 가능
- 커스텀 도메인 연결 쉬움
- HTTPS 자동 제공

## 1단계: GitHub 저장소 준비
Render는 보통 GitHub 저장소를 연결해서 배포한다.

해야 할 일:
1. GitHub에 새 저장소 생성
   - 이름 추천: `doclisten`
   - Public/Private 아무거나 가능
2. 이 프로젝트 폴더 `/home/slrso/pdf-listen-mvp` 내용을 GitHub에 업로드
3. 업로드 시 제외할 것
   - `.tts_cache/`
   - `__pycache__/`
   - `.pytest_cache/`

이미 `.gitignore`에 제외 설정을 추가했다.

## 2단계: Render Web Service 만들기
Render 대시보드에서:

1. New 버튼 클릭
2. Web Service 선택
3. GitHub 저장소 `doclisten` 연결
4. 설정값 입력

설정값:
- Name: `doclisten`
- Runtime: `Python`
- Build Command: `python3 -m py_compile server.py`
- Start Command: `python3 server.py`
- Plan: Free

`render.yaml` 파일도 추가되어 있으므로 Render가 자동으로 감지할 수 있다.

## 3단계: 임시 Render 주소 확인
배포가 끝나면 Render가 임시 주소를 준다.

예:
`https://doclisten.onrender.com`

확인할 것:
- 페이지 열림
- PDF 업로드 가능
- 듣기 버튼 작동
- 문단 클릭 작동

## 4단계: Custom Domain 추가
Render 서비스 설정에서:

1. Settings 또는 Custom Domains 메뉴
2. Add Custom Domain
3. `doclisten.app` 입력
4. `www.doclisten.app`도 추가 권장

Render가 DNS에 넣을 값을 보여준다.

## 5단계: Cloudflare DNS 연결
Cloudflare에서 `doclisten.app` 도메인 관리 화면으로 이동:

1. DNS 메뉴 클릭
2. Render가 알려준 레코드 추가

일반적인 형태:

### 루트 도메인
- Type: `CNAME`
- Name: `@`
- Target/Value: `doclisten.onrender.com`
- Proxy status: DNS only

### www 도메인
- Type: `CNAME`
- Name: `www`
- Target/Value: `doclisten.onrender.com`
- Proxy status: DNS only

주의: Cloudflare 네임서버를 쓰는 경우 루트 도메인을 Render의 A 레코드 `216.24.57.1`로 두면 Cloudflare Error 1000이 날 수 있으므로, 루트도 CNAME flattening 방식으로 `doclisten.onrender.com`에 연결한다.

## 6단계: HTTPS 확인
최종 확인 주소:

- `https://doclisten.app`
- `https://www.doclisten.app`

확인할 것:
- PC 접속
- 갤럭시 접속
- PDF 업로드
- 듣기
- 문단 클릭
- 이어보기

## 현재 추가된 배포 파일
- `render.yaml`
- `runtime.txt`
- `requirements.txt`
- `.gitignore`

## 다음에 사용자가 해야 할 것
1. GitHub 저장소를 만들거나 기존 GitHub 계정을 준비한다.
2. Render 계정에 로그인한다.
3. 내가 안내하는 설정값대로 Web Service를 만든다.

## 내가 이어서 할 수 있는 것
- GitHub에 올릴 파일 목록 정리
- Render 설정값 안내
- Render 배포 오류 로그 분석
- Cloudflare DNS 값 입력 안내
- `doclisten.app` 접속 테스트
