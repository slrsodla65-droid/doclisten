# DocListen 카카오톡 유료 베타 운영 가이드

## 현재 결제 방식

- 정식 PG 결제는 사용하지 않습니다.
- 유료 베타 신청은 카카오톡 오픈채팅으로 받습니다.
- 입금 확인 후 운영자가 베타 코드를 발급합니다.
- 사용자는 DocListen에서 Google 로그인 후 베타 코드를 입력해 `Beta Pro`로 전환합니다.

## 신청자에게 받을 정보

아래 양식을 카카오톡으로 받습니다.

```text
DocListen 유료 베타 신청합니다.
Google 로그인 이메일:
입금자명:
사용 목적: 학습 / 업무 / 연구 / 기타
사용 기기: 갤럭시 / 아이폰 / PC / 기타
확인 요청: 월 4,900원 Beta Pro 코드 발급
```

## 베타 코드 운영 방식

코드 생성 예:

```bash
python3 scripts/generate_beta_codes.py 20
```

출력된 값을 Render Secret 환경변수에 붙여넣습니다.

권장 환경변수:

```text
DOC_LISTEN_BETA_ACCESS_CODES=DL-2026-0001,DL-2026-0002,DL-2026-0003
```

- 쉼표로 여러 코드를 넣습니다.
- 각 코드는 서로 다른 사용자에게 한 번만 사용할 수 있습니다.
- 같은 사용자가 같은 코드를 다시 입력하는 것은 허용됩니다.
- 이미 다른 계정에서 쓴 코드를 다른 사람이 입력하면 `code-already-used`로 거절됩니다.

기존 단일 공용 코드도 계속 지원됩니다.

```text
DOC_LISTEN_BETA_ACCESS_CODE=PAID-1234
```

단, 공용 코드는 공유될 수 있으므로 실제 유료 베타 운영에는 `DOC_LISTEN_BETA_ACCESS_CODES`를 권장합니다.

## 코드 발급 절차

1. 사용자가 카카오톡 오픈채팅으로 신청 양식을 보냅니다.
2. 운영자가 입금자명과 입금 여부를 확인합니다.
3. 아직 사용하지 않은 베타 코드를 하나 선택합니다.
4. 카카오톡으로 코드를 전달합니다.
5. 운영 기록에 이메일, 입금자명, 발급 코드, 발급일을 적어둡니다.
6. 사용자가 앱에서 코드를 입력해 Beta Pro가 활성화됐는지 확인합니다.

## Render 설정 체크리스트

필수:

```text
DOC_LISTEN_PAYMENT_PROVIDER=kakao-openchat
DOC_LISTEN_BETA_PRICE_LABEL=월 4,900원 · 카카오톡 베타 신청
DOC_LISTEN_PAYMENT_URL=https://open.kakao.com/o/sKDe1RBi
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
DOC_LISTEN_BASE_URL=https://doclisten.app
DOC_LISTEN_BETA_ACCESS_CODES=...
```

유료 사용자 데이터를 안정적으로 보존하려면 Render Disk 승인 후 다음 설정을 추가합니다.

```text
DOC_LISTEN_USER_STORE_PATH=/var/data/doclisten/users.sqlite3
```

중요: 실제 유료 사용자를 받기 전에는 위 영속 저장소 설정을 완료하는 것을 권장합니다. 저장소가 초기화되면 Beta Pro 전환 상태와 1회용 코드 사용 이력도 함께 사라질 수 있습니다.

주의: Render Disk는 비용이 발생할 수 있으므로 운영자 승인 후 켭니다.

## 이용기간 및 환불 운영 기준

- Beta Pro 이용기간은 결제 확인일로부터 30일입니다.
- 베타 코드를 아직 사용하지 않은 경우 결제 확인 후 7일 이내 환불 요청을 받을 수 있습니다.
- 코드 사용 후에는 서비스 장애로 정상 이용이 불가능한 경우를 제외하고 환불이 제한될 수 있습니다.
- 환불 요청을 받으면 Google 로그인 이메일, 입금자명, 입금일, 발급 코드를 함께 확인합니다.
- 카카오톡 응대 기록과 코드 발급 기록을 같은 운영 시트에 남깁니다.

## 고객 응대 문구

입금 확인 전:

```text
신청 감사합니다. Google 로그인 이메일과 입금자명을 확인한 뒤 베타 코드를 발급해드리겠습니다.
```

코드 발급 시:

```text
입금 확인되었습니다. 아래 베타 코드를 DocListen 화면의 베타 코드 입력칸에 넣으면 Beta Pro가 활성화됩니다.
코드: [발급코드]
```

코드 중복/오류 시:

```text
해당 코드는 이미 사용되었거나 잘못 입력된 코드입니다. Google 로그인 이메일과 함께 다시 보내주시면 확인하겠습니다.
```
