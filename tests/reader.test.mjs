import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildBlocksFromTextItems,
  findBlockAtPoint,
  getNextBlock,
  clampRate,
  clampGapSeconds,
  estimateSpeechDurationMs,
  normalizeServerVoices,
  shouldAutoScrollReading,
  AUTO_SCROLL_USER_PAUSE_MS,
  shouldKeepScreenAwake,
  FREE_DAILY_LISTEN_LIMIT,
  getDailyUsageKey,
  createDailyUsageSnapshot,
  canStartListeningForPlan,
  prepareSpokenText,
  selectInitialListeningBlock,
} from '../src/readerCore.mjs';

test('buildBlocksFromTextItems groups nearby text items into ordered line blocks', () => {
  const viewport = { width: 600, height: 800 };
  const items = [
    { str: 'Hello', transform: [10, 0, 0, 12, 50, 700], width: 30, height: 12 },
    { str: 'world', transform: [10, 0, 0, 12, 85, 700], width: 35, height: 12 },
    { str: 'Second', transform: [10, 0, 0, 12, 50, 680], width: 42, height: 12 },
  ];
  const blocks = buildBlocksFromTextItems(items, viewport, 2);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, 'Hello world');
  assert.equal(blocks[0].page, 2);
  assert.equal(blocks[1].text, 'Second');
  assert.ok(blocks[0].bbox.y < blocks[1].bbox.y, 'top line should sort before lower line');
});

test('buildBlocksFromTextItems joins orphan Korean sentence endings split onto the next PDF line', () => {
  const viewport = { width: 600, height: 800 };
  const items = [
    { str: '지속적으로 발전하는 구조를 지향한', transform: [10, 0, 0, 12, 50, 700], width: 210, height: 12 },
    { str: '다.', transform: [10, 0, 0, 12, 50, 680], width: 14, height: 12 },
    { str: '다음 문단입니다.', transform: [10, 0, 0, 12, 50, 620], width: 90, height: 12 },
  ];
  const blocks = buildBlocksFromTextItems(items, viewport, 1);
  assert.equal(blocks[0].text, '지속적으로 발전하는 구조를 지향한다.');
  assert.equal(blocks[1].text, '다음 문단입니다.');
  assert.equal(blocks.length, 2);
});

test('findBlockAtPoint returns the topmost block containing a scaled click point', () => {
  const blocks = [
    { id: 'a', bbox: { x: 10, y: 20, width: 100, height: 20 }, order: 1 },
    { id: 'b', bbox: { x: 10, y: 50, width: 100, height: 20 }, order: 2 },
  ];
  assert.equal(findBlockAtPoint(blocks, 55, 30)?.id, 'a');
  assert.equal(findBlockAtPoint(blocks, 55, 60)?.id, 'b');
  assert.equal(findBlockAtPoint(blocks, 300, 60), null);
});

test('selectInitialListeningBlock skips document titles when content paragraphs exist', () => {
  const blocks = [
    { id: 'title', text: 'DocListen 유료 베타 테스트 문서', order: 1 },
    { id: 'content', text: '가격 정책 및 회원 플랜 설계는 무료 체험, 베이직, 프로, 엔터프라이즈 플랜으로 구성한다.', order: 2 },
  ];
  assert.equal(selectInitialListeningBlock(blocks)?.id, 'content');
  assert.equal(selectInitialListeningBlock([{ id: 'only', text: '짧은 제목', order: 1 }])?.id, 'only');
});

test('prepareSpokenText turns document prose into more natural Korean narration input', () => {
  const spoken = prepareSpokenText('가격 정책 및 회원 플랜 설계는 무료 체험, 베이직, 프로, 엔터프라이즈 플랜으로 구성한다.');
  assert.match(spoken, /가격 정책과 회원 플랜은/);
  assert.match(spoken, /먼저 무료 체험/);
  assert.match(spoken, /그다음 베이직/);
  assert.match(spoken, /마지막으로 엔터프라이즈 플랜입니다/);
  assert.doesNotMatch(spoken, /설계는/);
});

test('getNextBlock walks pages and block order when pages are already loaded', () => {
  const pages = new Map([
    [1, [{ id: 'p1b1' }, { id: 'p1b2' }]],
    [2, [{ id: 'p2b1' }]],
  ]);
  assert.equal(getNextBlock(pages, 1, 'p1b1')?.id, 'p1b2');
  assert.equal(getNextBlock(pages, 1, 'p1b2')?.id, 'p2b1');
  assert.equal(getNextBlock(pages, 2, 'p2b1'), null);
});

test('clampRate limits speech rate to supported UI range', () => {
  assert.equal(clampRate(0.1), 0.5);
  assert.equal(clampRate(1.25), 1.25);
  assert.equal(clampRate(3), 2);
});

test('clampGapSeconds limits next paragraph delay to supported UI range', () => {
  assert.equal(clampGapSeconds(-1), 0);
  assert.equal(clampGapSeconds(0.3), 0.3);
  assert.equal(clampGapSeconds(9), 5);
  assert.equal(clampGapSeconds('bad'), 0);
});

test('estimateSpeechDurationMs gives slower voices more watchdog time', () => {
  const text = '가'.repeat(100);
  const normal = estimateSpeechDurationMs(text, 1);
  const fast = estimateSpeechDurationMs(text, 1.5);
  assert.ok(normal > fast);
  assert.ok(normal >= 14000);
});

test('normalizeServerVoices keeps Korean neural voices first and labels them', () => {
  const voices = normalizeServerVoices([
    { ShortName: 'en-US-AvaNeural', Locale: 'en-US', FriendlyName: 'Ava' },
    { ShortName: 'ko-KR-SunHiNeural', Locale: 'ko-KR', FriendlyName: 'SunHi' },
    { ShortName: 'ko-KR-InJoonNeural', Locale: 'ko-KR', FriendlyName: 'InJoon' },
  ]);
  assert.equal(voices.length, 2);
  assert.equal(voices[0].value, 'ko-KR-InJoonNeural');
  assert.match(voices[0].label, /한국어 AI/);
});

test('auto scroll follows reading unless the user recently scrolled manually', () => {
  const now = 10_000;
  assert.equal(shouldAutoScrollReading({ speaking: true, nowMs: now, userPauseUntilMs: 0 }), true);
  assert.equal(
    shouldAutoScrollReading({ speaking: true, nowMs: now, userPauseUntilMs: now + AUTO_SCROLL_USER_PAUSE_MS }),
    false,
  );
  assert.equal(
    shouldAutoScrollReading({ speaking: true, nowMs: now + AUTO_SCROLL_USER_PAUSE_MS + 1, userPauseUntilMs: now + AUTO_SCROLL_USER_PAUSE_MS }),
    true,
  );
  assert.equal(shouldAutoScrollReading({ speaking: false, nowMs: now, userPauseUntilMs: 0 }), false);
});

test('screen wake lock is needed only while actively listening', () => {
  assert.equal(shouldKeepScreenAwake({ speaking: true, paused: false }), true);
  assert.equal(shouldKeepScreenAwake({ speaking: true, paused: true }), false);
  assert.equal(shouldKeepScreenAwake({ speaking: false, paused: false }), false);
});

test('upload control uses a real button and pdf extension fallback for mobile file pickers', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(html, /<button id="uploadBtn"[^>]*type="button"[^>]*>\s*PDF 업로드\s*<\/button>/);
  assert.match(html, /<input id="fileInput"[^>]*type="file"[^>]*accept="application\/pdf,\.pdf"/);
  assert.doesNotMatch(css, /\.upload-button input\s*\{\s*display:\s*none;\s*\}/);
});

test('rate select offers granular speeds from 0.5x to 2.0x', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  for (let value = 0.5; value <= 2.0; value = Math.round((value + 0.1) * 10) / 10) {
    const label = value === 1 ? '1.0x' : `${value.toFixed(1)}x`;
    const optionValue = value === 1 ? '1' : value.toFixed(1);
    assert.match(html, new RegExp(`<option value="${optionValue}"[^>]*>${label}</option>`));
  }
});


test('free daily usage limit blocks additional listening only for free users', () => {
  assert.equal(FREE_DAILY_LISTEN_LIMIT, 20);
  const usage = createDailyUsageSnapshot(19, 20);
  assert.deepEqual(usage, { used: 19, limit: 20, remaining: 1, reached: false });
  assert.equal(canStartListeningForPlan({ plan: 'free', used: 19, limit: 20 }).allowed, true);
  assert.equal(canStartListeningForPlan({ plan: 'free', used: 20, limit: 20 }).allowed, false);
  assert.equal(canStartListeningForPlan({ plan: 'beta-pro', used: 999, limit: 20 }).allowed, true);
});

test('daily usage key resets by calendar day', () => {
  assert.equal(getDailyUsageKey('usage', new Date('2026-06-30T01:00:00.000Z')), 'usage:2026-06-30');
  assert.equal(getDailyUsageKey('usage', new Date('2026-07-01T01:00:00.000Z')), 'usage:2026-07-01');
});


test('server audiobook mode declares production dependencies and fallback-safe playback path', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
  const requirements = readFileSync(new URL('../requirements.txt', import.meta.url), 'utf8');

  assert.match(html, /전문 오디오북 음성/);
  assert.match(app, /fetch\('\/api\/tts'/);
  assert.match(app, /gtts-ko-human/);
  assert.match(app, /playServerNarration/);
  assert.match(app, /fallbackToBrowserSpeech/);
  assert.match(app, /audio\.playbackRate = Number\(els\.rateSelect\.value \|\| 1\)/);
  assert.match(app, /state\.currentAudio\.playbackRate = Number\(els\.rateSelect\.value \|\| 1\)/);
  assert.match(requirements, /^gTTS/m);
});


test('static policy pages disclose login and paid beta basics', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const contact = readFileSync(new URL('../contact.html', import.meta.url), 'utf8');
  const privacy = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  const terms = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');
  const launch = readFileSync(new URL('../beta-launch.html', import.meta.url), 'utf8');

  assert.match(contact, /https:\/\/open\.kakao\.com\/o\/sKDe1RBi/);
  assert.match(contact, /월 4,900원/);
  assert.match(contact, /베타 코드/);
  assert.match(contact, /카카오톡 베타 신청 순서/);
  assert.match(contact, /신청 양식 복사/);
  assert.match(contact, /무료 체험 확인/);
  assert.match(contact, /텍스트 선택이 가능한 PDF/);
  assert.match(contact, /입금자명/);
  assert.match(contact, /Google 로그인 이메일/);
  assert.match(contact, /결제 확인일로부터 30일/);
  assert.match(contact, /환불 요청/);
  assert.match(html, /돈 내기 전에 3분만 먼저 확인하세요/);
  assert.match(html, /\.\/beta-launch\.html/);
  assert.match(html, /\.\/admin\.html/);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /앱처럼 쓰기/);
  assert.match(html, /홈 화면에 추가/);
  assert.match(launch, /짧은 공유 문구/);
  assert.match(launch, /커뮤니티\/지인용 문구/);
  assert.match(launch, /카카오톡 응대 문구/);
  assert.match(launch, /https:\/\/doclisten\.app\//);
  assert.match(html, /지원 권장 PDF/);
  assert.match(html, /결제 전 품질 확인/);
  assert.match(html, /결제 확인일로부터 30일/);
  assert.match(terms, /유료 베타 이용기간/);
  assert.match(terms, /결제 확인일로부터 30일/);
  assert.match(terms, /환불/);
  assert.match(terms, /베타 서비스/);
  assert.match(privacy, /Google 로그인/);
  assert.match(privacy, /일별 문단 사용량/);
  assert.match(privacy, /계정 삭제/);
});


test('payment CTAs can be converted to payment links from server config', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');

  assert.match(html, /data-payment-cta/);
  assert.match(html, /data-beta-price-label/);
  assert.match(app, /fetch\('\/api\/config'/);
  assert.match(app, /fetch\('\/api\/event'/);
  assert.match(app, /trackBetaEvent\('page_view'\)/);
  assert.match(app, /trackBetaEvent\('pdf_upload'\)/);
  assert.match(app, /trackBetaEvent\('listen_attempt'\)/);
  assert.match(app, /trackBetaEvent\('beta_cta_click'\)/);
  assert.match(app, /trackBetaEvent\('login_click'\)/);
  assert.match(app, /카카오톡으로 베타 신청/);
  assert.match(app, /이미 다른 계정에서 사용된 베타 코드/);
  assert.match(app, /베타 코드를 확인하는 중입니다/);
  assert.match(app, /베타 코드 확인에 실패했습니다/);
  assert.match(app, /30 \* 1024 \* 1024/);
  assert.match(app, /30MB 이하의 텍스트형 PDF/);
});


test('render config enables persistent SQLite storage for paid beta operations', () => {
  const renderConfig = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');

  assert.match(renderConfig, /SQLite 저장소/);
  assert.match(renderConfig, /plan: starter/);
  assert.match(renderConfig, /disk:/);
  assert.match(renderConfig, /mountPath: \/var\/data/);
  assert.match(renderConfig, /sizeGB: 1/);
  assert.match(renderConfig, /buildCommand: "python3 -m pip install -r requirements.txt && python3 -m py_compile server.py"/);
  assert.match(renderConfig, /- key: DOC_LISTEN_USER_STORE_PATH/);
  assert.match(renderConfig, /value: \/var\/data\/doclisten\/users\.sqlite3/);
  assert.match(renderConfig, /- key: DOC_LISTEN_METRICS_STORE_PATH/);
  assert.match(renderConfig, /value: \/var\/data\/doclisten\/metrics\.json/);
});


test('only Google social login button is present with clear account controls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');

  assert.match(html, /Google로 계속하기/);
  assert.match(html, /\/api\/oauth\/start\?provider=google/);
  assert.match(html, /id="accountStatus"/);
  assert.match(html, /id="logoutBtn"/);
  assert.match(html, /id="deleteAccountBtn"/);
  assert.match(app, /localStorage\.removeItem\('doclisten-user-token'\)/);
  assert.match(app, /fetch\('\/api\/logout'/);
  assert.match(app, /fetch\('\/api\/delete-account'/);
  assert.match(app, /이 브라우저에서 로그아웃/);
  assert.match(app, /계정과 사용량 기록을 삭제했습니다/);
  assert.match(app, /Admin 활성화됨/);
  assert.doesNotMatch(html, /이메일 로그인/);
  assert.doesNotMatch(html, /id="emailInput"/);
  assert.doesNotMatch(html, /id="loginBtn"/);
  assert.doesNotMatch(html, /카카오로 계속하기/);
  assert.doesNotMatch(html, /네이버로 계속하기/);
  assert.doesNotMatch(html, /\/api\/oauth\/start\?provider=kakao/);
  assert.doesNotMatch(html, /\/api\/oauth\/start\?provider=naver/);
});


test('admin dashboard and PWA assets are present for launch operations', () => {
  const admin = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const adminScript = readFileSync(new URL('../src/admin.mjs', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
  const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

  assert.match(admin, /베타 전환 현황/);
  assert.match(admin, /todayMetrics/);
  assert.match(admin, /conversionMetrics/);
  assert.match(adminScript, /\/api\/admin\/metrics/);
  assert.match(adminScript, /방문→업로드/);
  assert.match(adminScript, /듣기→신청 클릭/);
  assert.match(manifest, /"name": "DocListen"/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(serviceWorker, /beta-launch\.html/);
});
