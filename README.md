# DocListen MVP

DocListen은 PDF를 업로드하고 원하는 문단부터 브라우저 기본 한국어 음성으로 들을 수 있는 웹앱 MVP입니다.

## 주요 기능

- PDF 업로드
- 실제 PDF 페이지 렌더링
- PDF 화면에서 문단 터치 → 해당 문단부터 듣기
- 듣기 / 일시정지 / 재개
- 이전 문단 / 다음 문단
- 속도 조절: 0.8x, 1.0x, 1.2x, 1.5x
- 현재 읽는 문단 하이라이트
- 같은 PDF 마지막 읽은 위치 localStorage 저장
- 무료/유료 베타 수익화 안내 섹션
- 개인정보처리방침 / 이용약관 / 파일 처리 정책 / 문의 페이지

## 로컬 실행

```bash
cd /home/slrso/pdf-listen-mvp
npm test
npm start
```

브라우저에서 열기:

```text
http://localhost:4173
```

## 배포

Render 배포용 파일이 포함되어 있습니다.

- `render.yaml`
- `runtime.txt`
- `requirements.txt`
- `.gitignore`
- `DEPLOY_RENDER.md`

Render 설정값:

- Runtime: Python
- Build Command: `python3 -m py_compile server.py`
- Start Command: `python3 server.py`

## 도메인

구매 도메인:

```text
doclisten.app
```

구매 후 Render에 배포하고 Cloudflare DNS에서 연결합니다.
자세한 절차는 `DEPLOY_RENDER.md`를 참고합니다.

## 주의

- 텍스트가 실제로 들어있는 PDF에서 가장 잘 작동합니다.
- 스캔 이미지 PDF는 OCR이 필요합니다.
- 현재 기본 낭독은 브라우저 내장 음성을 사용합니다.
