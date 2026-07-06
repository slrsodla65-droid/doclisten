# Play Store 릴리스 노트

## 1.0.0 (versionCode 1)

첫 Android 테스트 릴리스입니다.

- PDF 업로드 및 페이지 렌더링 지원
- 문단 하이라이트와 문단 단위 듣기 지원
- 듣기, 일시정지, 이전/다음 문단 이동 지원
- 음성 속도 조절 지원
- Android 앱 모드에서 로그인 없이 PDF 듣기 가능
- 외부 결제/유료 CTA는 앱 모드에서 숨김 처리
- 개인정보처리방침 및 문의 URL 제공

## 내부 테스트 확인
- Android 15 Google APIs 에뮬레이터에서 앱 실행 확인
- 테스트 PDF 업로드 확인
- 문단 하이라이트 확인
- 오디오 포커스/AAudio 재생 로그 확인
- `npm run test` 24/24 통과
- `./gradlew :app:bundleRelease` 성공
