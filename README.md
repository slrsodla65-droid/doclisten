# DocListen MVP

DocListen은 PDF를 업로드하고 원하는 문단부터 브라우저 기본 한국어 음성으로 들을 수 있는 웹앱 MVP입니다.

## 주요 기능

- PDF 업로드
- 실제 PDF 페이지 렌더링
- PDF 화면에서 문단 터치 → 해당 문단부터 듣기
- 듣기 / 일시정지 / 재개
- 이전 문단 / 다음 문단
- 속도 조절: 0.5x~2.0x
- 현재 읽는 문단 하이라이트
- 같은 PDF 마지막 읽은 위치 localStorage 저장
- 하루 20문단 무료 듣기 제한
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


## 수익화 MVP

- Free: Google 로그인 기준 하루 20문단 듣기 체험
- Beta Pro 후보: 월 4,900원, 베타 코드 입력 후 하루 제한 없이 긴 PDF 듣기
- Credit 후보: 1문서 900원
- 현재 결제 연결 전 단계이며, 유료 베타 신청은 문의 페이지에서 받습니다.
- 실제 결제 연결 후보: Stripe 또는 Toss Payments


## 결제 연결

현재 추천 방식은 초기 베타 검증용 카카오톡 오픈채팅 신청입니다. PG 결제는 유료 전환이 검증된 뒤 연결합니다.

Render 환경변수에 아래 값을 넣으면 앱의 유료 베타 CTA가 결제 페이지로 자동 연결됩니다.

```text
DOC_LISTEN_PAYMENT_PROVIDER=kakao-openchat
DOC_LISTEN_PAYMENT_URL=https://open.kakao.com/o/sKDe1RBi
DOC_LISTEN_BETA_PRICE_LABEL=월 4,900원 · 카카오톡 베타 신청
```

환경변수가 없으면 기본 카카오톡 오픈채팅 링크로 연결됩니다.


## 회원별 사용량 제한

- Google OAuth 로그인으로 사용자를 생성합니다. 직접 이메일 입력 로그인은 관리자 권한 보안을 위해 비활성화되어 있습니다.
- 서버의 `.doclisten_users.json`에 사용자 토큰, 플랜, 일별 사용량을 저장합니다.
- Free 사용자는 서버 기준 하루 20문단까지 들을 수 있습니다.
- 입금 확인 후 운영자가 알려준 베타 코드를 사용자가 입력하면 `beta-pro`로 전환되어 한도가 해제됩니다.
- 운영자 이메일은 Render 환경변수 `DOC_LISTEN_ADMIN_EMAILS`에 등록하면 Google 로그인으로 인증된 경우에만 `admin` 플랜으로 전환되어 한도 없이 사용할 수 있습니다.
- 운영 환경에서는 Render 환경변수 `DOC_LISTEN_BETA_ACCESS_CODE`를 Secret으로 설정합니다.


## 소셜 로그인

Google OAuth 로그인만 사용합니다. 카카오/네이버 소셜 로그인은 현재 비활성화되어 있습니다.

리다이렉트 URI:

```text
https://doclisten.app/api/oauth/callback/google
```

필요 환경변수:

```text
DOC_LISTEN_BASE_URL=https://doclisten.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
DOC_LISTEN_ADMIN_EMAILS=owner@example.com
```
