# DocListen Android QA 보고서

## 테스트 환경
- Host: WSL2 Linux
- Android SDK: `/home/slrso/Android/Sdk`
- Emulator: Android 15 Google APIs x86_64
- AVD: `DocListen_Play_Test`
- App ID: `app.doclisten.mobile`
- 앱 버전: 1.0.0 / versionCode 1

## 실행 검증
- 앱 설치: 성공
- 앱 실행: 성공
- 운영 URL 로드: 성공 (`https://doclisten.app/`, script `app.mjs?v=56`)
- PDF 파일 선택기: 성공
- 샘플 PDF 업로드: 성공
- PDF 렌더링: 성공
- 문단 하이라이트: 성공
- 듣기 버튼: 성공
- 오디오 재생 근거: Android logcat에서 `requestAudioFocus()` 및 `AAudioStream_requestStart()` 확인
- 로그인 요구 제거: Android 앱 모드에서 기본 PDF 듣기 흐름은 로그인 없이 진행됨

## 확보한 스크린샷
- `screenshots/phone-01-home.png`
- `screenshots/phone-02-pdf-uploaded.png`
- `screenshots/phone-03-listening.png`

## 자동 검증
- `npm run test`: 24/24 통과
- `python3 -m py_compile server.py`: 통과
- `./gradlew assembleDebug`: 성공
- `./gradlew :app:bundleRelease`: 성공
- `jarsigner -verify android/app/build/outputs/bundle/release/app-release.aab`: exit code 0

## 알려진 한계
- 실제 갤럭시 실기기 테스트는 사용자가 외부 활동 중이라 에뮬레이터로 대체했습니다.
- 에뮬레이터 오디오 장치 특성상 일부 ranchu audio 경고가 있었지만, 앱 프로세스 오디오 포커스와 AAudio 시작 로그는 확인됐습니다.
- 스캔 이미지 PDF나 복잡한 표 중심 PDF는 텍스트 추출 품질이 낮을 수 있습니다.
