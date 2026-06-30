# DocListen 1단계 공개 체크리스트

## 완료된 항목
- DocListen MVP 실행
- 브라우저 기본 한국어 음성 낭독 방식으로 단순화
- PDF 업로드
- PDF 페이지 보기
- 문단 클릭 재생
- 듣기 / 일시정지 / 이전 문단 / 다음 문단
- 속도 조절
- 현재 문단 하이라이트
- 같은 PDF 마지막 위치 이어보기
- 수익화 검증용 랜딩 섹션 추가
- 무료/유료/크레딧 가격 가설 표시
- 앱 내 무료 사용량 표시 및 한도 도달 안내 추가
- 카카오톡 오픈채팅 베타 신청 링크 연결
- 개인정보처리방침 페이지 추가
- 이용약관 페이지 추가
- 파일 처리 정책 페이지 추가
- 문의 페이지 추가
- `doclisten.app` 도메인 구매 완료
- GitHub 비공개 저장소 업로드 완료: https://github.com/slrsodla65-droid/doclisten
- Render 배포용 설정 파일 준비 완료

## 정식 공개 전 필요한 항목
- Render Web Service 생성
- Render 임시 주소 접속 확인
- Cloudflare DNS를 Render에 연결
- `https://doclisten.app` HTTPS 접속 확인
- 공식 문의 이메일 연결: support@도메인
- 초기 베타 신청/입금 확인 운영 프로세스 정리
- 추후 Toss Payments 또는 Stripe PG 전환 여부 결정
- 파일 자동 삭제 주기 확정
- 서버 디스크 용량/캐시 삭제 정책 설정
- 개인정보처리방침 내 사업자/운영자 정보 확정
- 베타 사용량 제한 기준 확정: Free 하루 20문단
- 무료/유료 플랜 가격 가설 반영: Beta Pro 월 4,900원 후보, Credit 1문서 900원 후보

## 추천 배포 선택지
1. 빠른 베타: 현재 Python 서버 + VPS + Nginx + 도메인
2. 안정 서비스: Docker + VPS/클라우드 + HTTPS + 로그 관리
3. 확장 서비스: 프론트/백엔드 분리 + 객체 저장소 + DB + 결제

## 다음 실행 단계
- 사용자가 Render에서 GitHub 저장소 `doclisten`을 연결해 Web Service를 생성한다.
- 배포 완료 후 Render 임시 주소를 확인한다.
- Render의 Custom Domain 메뉴에서 `doclisten.app`과 `www.doclisten.app`을 추가한다.
- Cloudflare DNS에 Render가 안내한 레코드를 추가한다.
- 최종적으로 `https://doclisten.app`에서 PDF 업로드/듣기/이어보기를 검증한다.
