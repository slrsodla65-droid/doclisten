# DocListen 도메인 구매 안내

## 조회 결과

2026-06-28 기준 1차 WHOIS/RDAP 확인 결과:

- `doclisten.app`: Google Registry RDAP에서 Not Found → 미등록으로 보임
- `doclisten.io`: WHOIS 결과 Domain not found → 미등록으로 보임
- `doclisten.co.kr`: KISA WHOIS 결과 등록되어 있지 않음
- `doclisten.net`: Verisign WHOIS 결과 No match → 미등록으로 보임
- `doclisten.com`: 이미 등록됨

주의: 최종 구매 가능 여부와 가격은 도메인 판매처 결제 화면에서 확정된다.

## 구매 우선순위

1. `doclisten.app` — 가장 추천
2. `doclisten.co.kr` — 한국 서비스 보호용
3. `doclisten.net` — 보조 후보
4. `doclisten.io` — 가격이 비쌀 수 있어 후순위

## 왜 doclisten.app인가

- 앱/웹앱 느낌이 강함
- 서비스 이름과 잘 맞음
- `.com`이 이미 등록되어 있어도 `.app`으로 충분히 브랜드 가능
- HTTPS가 기본적으로 잘 어울리는 서비스 도메인

## 구매 추천처

아래 중 하나에서 구매하면 된다.

### 쉬운 선택
- 가비아: 한국어 결제/관리 쉬움
- 후이즈: 한국어 결제/관리 쉬움

### 개발/배포 관리 편한 선택
- Cloudflare Registrar
- Namecheap
- Porkbun

## 구매할 때 선택

- 도메인: `doclisten.app`
- 기간: 1년 먼저
- 개인정보 보호: 가능하면 켜기
- 이메일/호스팅 추가상품: 처음엔 구매하지 않아도 됨
- SSL 인증서 추가상품: 처음엔 구매하지 않아도 됨. 배포 서버에서 무료 HTTPS 사용 가능

## 구매 후 나에게 알려줘야 할 것

구매가 끝나면 아래 중 하나만 알려주면 된다.

1. 도메인 구매처 이름
   - 예: 가비아, Cloudflare, Namecheap
2. DNS 관리 화면에 접근 가능한지 여부
3. 구매한 도메인
   - 예: `doclisten.app`

## 구매 후 다음 작업

1. 배포 위치 선택
   - 빠른 베타: Render 또는 Railway
   - 안정 운영: VPS + Nginx + HTTPS
2. DNS 연결
   - `A` 레코드 또는 `CNAME` 설정
3. HTTPS 적용
4. `https://doclisten.app`으로 접속 확인
5. 개인정보/약관 페이지의 도메인 문구 업데이트
6. 공식 문의 이메일 준비
   - `support@doclisten.app`

## 지금 사용자가 할 일

도메인 판매처에서 `doclisten.app`을 검색하고, 구매 가능하면 1년만 구매한다.

결제 전 확인 문구:
- 도메인 이름이 정확히 `doclisten.app`인지 확인
- 불필요한 호스팅/이메일/SSL 추가상품은 제외
- 총 결제금액 확인
