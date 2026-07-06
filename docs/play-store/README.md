# DocListen Play Store Release Kit

## 빌드 산출물
- Release AAB: `/home/slrso/pdf-listen-mvp/android/app/build/outputs/bundle/release/app-release.aab`
- AAB size: `3,005,725` bytes
- AAB SHA-256: `54b2c0bf8f1c5f6c7b5609f53b741e9667720e3ddfbb8403db78943772f132f5`
- Upload certificate public file: `/home/slrso/pdf-listen-mvp/docs/play-store/doclisten-upload-certificate.pem`
- Upload keystore local path: `/home/slrso/pdf-listen-mvp/android/keystores/doclisten-upload-key.jks`
- Keystore backup folder: `/home/slrso/.hermes/profiles/goals-test/secrets/doclisten-play-store/`

> 주의: `android/keystore.properties`와 `android/keystores/`는 Git에 올리지 않는다. Play Console 업로드 키를 잃어버리면 업데이트 제출이 막힐 수 있으므로 백업 폴더를 별도 보관해야 한다.

## Play Console 업로드 파일
1. 앱 번들: `android/app/build/outputs/bundle/release/app-release.aab`
2. 앱 아이콘: `docs/play-store/play-store-icon-512.png`
3. Feature graphic: `docs/play-store/feature-graphic-1024x500.png`
4. 휴대전화 스크린샷: `docs/play-store/screenshots/*.png`
5. 개인정보처리방침 URL: `https://doclisten.app/privacy.html`
6. 지원 URL: `https://doclisten.app/contact.html`

## 검증 요약
- Android emulator: Android 15 Google APIs x86_64
- 확인 흐름: 앱 실행 → PDF 업로드 → PDF 렌더링 → 문단 하이라이트 → 듣기 버튼 → 오디오 포커스/AAudio 재생 로그 확인
- Web/unit tests: `npm run test` 24/24 통과
- Server syntax: `python3 -m py_compile server.py` 통과
- Debug build: `./gradlew assembleDebug` 성공
- Release bundle: `./gradlew :app:bundleRelease` 성공
