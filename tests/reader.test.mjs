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
  shouldRequireLoginBeforeUpload,
  shouldResumeCurrentPlayback,
  getPdfViewportScale,
  getPdfRenderMetrics,
  prepareSpokenText,
  selectInitialListeningBlock,
} from '../src/readerCore.mjs';

test('PDF canvas uses high-DPI backing pixels without unbounded memory growth', () => {
  assert.deepEqual(getPdfRenderMetrics({ width: 360, height: 480 }, 2.75), {
    outputScale: 2.75,
    pixelWidth: 990,
    pixelHeight: 1320,
    transform: [2.75, 0, 0, 2.75, 0, 0],
  });
  assert.deepEqual(getPdfRenderMetrics({ width: 360, height: 480 }, 4), {
    outputScale: 3,
    pixelWidth: 1080,
    pixelHeight: 1440,
    transform: [3, 0, 0, 3, 0, 0],
  });
  assert.deepEqual(getPdfRenderMetrics({ width: 360.8, height: 480.9 }, 0.5), {
    outputScale: 1,
    pixelWidth: 360,
    pixelHeight: 480,
    transform: null,
  });
});

test('PDF viewport fits the full page width inside mobile and desktop screens', () => {
  assert.equal(getPdfViewportScale(600, 390), 366 / 600);
  assert.equal(getPdfViewportScale(600, 1200), 920 / 600);
  assert.equal(getPdfViewportScale(0, 390), 1);
});

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

test('prepareSpokenText cleans common PDF extraction spacing before narration', () => {
  const spoken = prepareSpokenText('NoahAI 는 B 2 C 구독과 플 랜을 제공 한다 . PDF 문서다 .');
  assert.match(spoken, /노아 에이아이/);
  assert.match(spoken, /B2C/);
  assert.match(spoken, /플랜/);
  assert.match(spoken, /제공한다\./);
  assert.match(spoken, /피디에프 문서다\./);
  assert.doesNotMatch(spoken, /\s+[.,!?]/);
});

test('web upload requires login while the native app keeps login-free upload', () => {
  assert.equal(shouldRequireLoginBeforeUpload({ isNativeApp: false, token: '' }), true);
  assert.equal(shouldRequireLoginBeforeUpload({ isNativeApp: false, token: 'user-token' }), false);
  assert.equal(shouldRequireLoginBeforeUpload({ isNativeApp: true, token: '' }), false);
});

test('listen control resumes an actively paused paragraph instead of consuming a new listen', () => {
  assert.equal(shouldResumeCurrentPlayback({ speaking: true, paused: true }), true);
  assert.equal(shouldResumeCurrentPlayback({ speaking: true, paused: false }), false);
  assert.equal(shouldResumeCurrentPlayback({ speaking: false, paused: true }), false);
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
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');

  assert.match(html, /<button id="uploadBtn"[^>]*type="button"[^>]*>\s*PDF 업로드\s*<\/button>/);
  assert.match(html, /<input id="fileInput"[^>]*type="file"[^>]*accept="application\/pdf,\.pdf"/);
  assert.doesNotMatch(css, /\.upload-button input\s*\{\s*display:\s*none;\s*\}/);
  assert.match(app, /shouldRequireLoginBeforeUpload/);
  assert.match(app, /PDF 업로드 전에 먼저 Google로 로그인해주세요/);
  assert.match(html, /id="sampleDemoBtn"/);
  assert.match(app, /assets\/demo\/doclisten-review-sample\.pdf/);
  assert.match(app, /demoMode: true/);
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
  assert.match(app, /shouldResumeCurrentPlayback/);
  assert.match(app, /text: prepareSpokenText\(block\.text\)/);
  assert.match(app, /prefetchNextNarration/);
  assert.match(app, /nextNarration/);
  assert.match(app, /narrationBlobFor/);
  assert.match(app, /mergeReadingLines/);
  assert.match(app, /isOrphanKoreanEnding/);
  assert.match(app, /normalizeKoreanSpacing/);
  assert.match(requirements, /^gTTS/m);
});


test('static policy pages disclose free access, rights, and deletion controls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const contact = readFileSync(new URL('../contact.html', import.meta.url), 'utf8');
  const privacy = readFileSync(new URL('../privacy.html', import.meta.url), 'utf8');
  const deletion = readFileSync(new URL('../delete-account.html', import.meta.url), 'utf8');
  const terms = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');

  assert.match(contact, /저작권·상표권·개인정보 침해 신고/);
  assert.match(contact, /파일 또는 음성 캐시 삭제 요청/);
  assert.match(contact, /결제나 계좌이체를 요구하지 않습니다/);
  assert.match(html, /3단계로 안전하게 시작하세요/);
  assert.doesNotMatch(html, /\.\/beta-launch\.html/);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /앱처럼 쓰기/);
  assert.match(html, /홈 화면에 추가/);
  assert.match(html, /지원 권장 PDF/);
  assert.match(html, /무료 품질 확인/);
  assert.match(terms, /현재 공개 웹 서비스/);
  assert.match(terms, /비공식 결제를 요구하지 않습니다/);
  assert.match(privacy, /Google 로그인/);
  assert.match(privacy, /일별 문단 사용량/);
  assert.match(privacy, /계정 삭제/);
  assert.match(privacy, /Google 광고 설정/);
  assert.match(privacy, /delete-account\.html/);
  assert.match(deletion, /DocListen 계정 및 데이터 삭제/);
  assert.match(deletion, /계정 삭제 요청/);
  assert.match(deletion, /영업일 기준 7일 이내/);
  assert.match(deletion, /최대 90일/);
});


test('adsense-oriented public content pages are linked and substantive', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const blog = readFileSync(new URL('../blog.html', import.meta.url), 'utf8');
  const fieldTest = readFileSync(new URL('../doclisten-field-test.html', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../pdf-tts-guide.html', import.meta.url), 'utf8');
  const commute = readFileSync(new URL('../listen-to-pdf-commute.html', import.meta.url), 'utf8');
  const paper = readFileSync(new URL('../research-paper-audio.html', import.meta.url), 'utf8');
  const compare = readFileSync(new URL('../pdf-audio-app-comparison.html', import.meta.url), 'utf8');
  const scanned = readFileSync(new URL('../scanned-pdf-limitations.html', import.meta.url), 'utf8');
  const study = readFileSync(new URL('../study-with-pdf-audio.html', import.meta.url), 'utf8');
  const work = readFileSync(new URL('../work-document-audio.html', import.meta.url), 'utf8');
  const ebook = readFileSync(new URL('../ebook-pdf-audio.html', import.meta.url), 'utf8');
  const privacyGuide = readFileSync(new URL('../pdf-audio-privacy.html', import.meta.url), 'utf8');
  const faq = readFileSync(new URL('../pdf-tts-faq.html', import.meta.url), 'utf8');
  const checklist = readFileSync(new URL('../pdf-listening-checklist.html', import.meta.url), 'utf8');
  const about = readFileSync(new URL('../about.html', import.meta.url), 'utf8');
  const siteMap = readFileSync(new URL('../site-map.html', import.meta.url), 'utf8');
  const editorial = readFileSync(new URL('../editorial-policy.html', import.meta.url), 'utf8');
  const accessibility = readFileSync(new URL('../accessibility.html', import.meta.url), 'utf8');
  const languageLearning = readFileSync(new URL('../pdf-audio-for-language-learning.html', import.meta.url), 'utf8');
  const mobileGuide = readFileSync(new URL('../pdf-audio-mobile-guide.html', import.meta.url), 'utf8');
  const troubleshooting = readFileSync(new URL('../pdf-audio-troubleshooting.html', import.meta.url), 'utf8');
  const robots = readFileSync(new URL('../robots.txt', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8');

  assert.match(html, /PDF 듣기 가이드/);
  assert.match(html, /\.\/blog\.html/);
  assert.match(blog, /직접 확인한 내용만 남긴 PDF 듣기 실전 가이드/);
  assert.match(fieldTest, /실제 PDF 업로드부터 문단 듣기까지/);
  assert.match(fieldTest, /doclisten-listening\.png/);
  assert.match(blog, /pdf-tts-guide\.html/);
  assert.match(guide, /PDF TTS를 제대로 쓰려면/);
  assert.match(commute, /20분을 제대로 쓰는 실전 루틴/);
  assert.match(paper, /논문과 보고서 PDF/);
  assert.match(compare, /PDF 읽어주는 앱 선택 기준/);
  assert.match(scanned, /스캔 PDF와 복잡한 문서/);
  assert.match(study, /학습용 PDF를 음성으로 반복해서 듣는 방법/);
  assert.match(work, /업무 문서 PDF를 음성으로 복습하는 방법/);
  assert.match(ebook, /전자책과 유료 PDF/);
  assert.match(privacyGuide, /개인정보 체크리스트/);
  assert.match(faq, /PDF TTS 자주 묻는 질문/);
  assert.match(checklist, /PDF를 듣기 전에 확인할 체크리스트/);
  assert.match(about, /Google Play 비공개 테스트/);
  assert.match(siteMap, /DocListen 사이트맵/);
  assert.match(editorial, /콘텐츠 편집 원칙/);
  assert.match(accessibility, /접근성 안내/);
  assert.match(languageLearning, /외국어 PDF를 음성으로 들을 때 효과적인 방법/);
  assert.match(mobileGuide, /모바일에서 PDF를 음성으로 듣는 방법/);
  assert.match(troubleshooting, /PDF 음성이 안 나올 때 확인할 것/);
  assert.ok(guide.replace(/<[^>]+>/g, ' ').length > 900);
  assert.ok(blog.match(/article-list/));
  assert.match(robots, /Sitemap: https:\/\/doclisten\.app\/sitemap\.xml/);
  assert.match(sitemap, /doclisten-field-test\.html/);
  assert.doesNotMatch(sitemap, /pdf-audio-app-comparison\.html/);
  assert.doesNotMatch(sitemap, /pdf-listening-checklist\.html/);
  assert.match(sitemap, /editorial-policy\.html/);
  assert.doesNotMatch(sitemap, /pdf-audio-for-reports\.html/);
  assert.match(sitemap, /acceptable-use\.html/);
  assert.match(sitemap, /delete-account\.html/);
  assert.doesNotMatch(sitemap, /beta-launch\.html/);
  assert.match(blog, /작성·검토: DocListen 운영팀/);
  assert.ok(fieldTest.replace(/<[^>]+>/g, ' ').length > 1500);
});


test('public app avoids unofficial payment funnels and ads beside uploaded documents', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const contact = readFileSync(new URL('../contact.html', import.meta.url), 'utf8');
  const terms = readFileSync(new URL('../terms.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /data-payment-cta/);
  assert.doesNotMatch(html, /pagead2\.googlesyndication\.com/);
  assert.match(html, /name="google-adsense-account" content="ca-pub-1136619051034273"/);
  assert.doesNotMatch(contact, /pagead2\.googlesyndication\.com/);
  assert.doesNotMatch(terms, /pagead2\.googlesyndication\.com/);
  assert.match(contact, /현재 공개된 무료 사용 범위/);
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


test('mobile app shell is configured and hides external purchase CTAs in native mode', () => {
  const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../capacitor.config.ts', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const androidBuild = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  const reviewNotes = readFileSync(new URL('../docs/app-store/review-notes-ko.md', import.meta.url), 'utf8');

  assert.match(pkg, /"@capacitor\/ios"/);
  assert.match(pkg, /"@capacitor\/android"/);
  assert.match(config, /appId: 'app\.doclisten\.mobile'/);
  assert.match(config, /url: 'https:\/\/doclisten\.app'/);
  assert.match(androidBuild, /applicationId "com\.voxly\.studio"/);
  assert.match(androidBuild, /versionCode 2/);
  assert.match(androidBuild, /versionName "1\.0\.1"/);
  assert.match(app, /isNativeContainer/);
  assert.match(app, /applyNativeAppMode/);
  assert.match(app, /if \(state\.isNativeApp\) return/);
  assert.match(app, /앱에서는 로그인 없이 PDF 문단 듣기를 사용할 수 있습니다/);
  assert.match(app, /section\[aria-label="회원 로그인"\]/);
  assert.match(app, /PDF 업로드 → 무료 문단 듣기/);
  assert.match(app, /실제로 듣고 싶은 PDF를 올려 문단별 음성과 화면 표시를 바로 테스트합니다/);
  assert.match(app, /if \(state\.isNativeApp && !state\.token\) \{/);
  assert.match(app, /window\.speechSynthesis\?\.cancel\(\)/);
  assert.match(app, /!window\.speechSynthesis\?\.speak/);
  assert.match(styles, /html\.native-app \[data-payment-cta\]/);
  assert.match(styles, /html\.native-app \.pricing-grid/);
  assert.match(reviewNotes, /In-App Purchase\(IAP\)/);
});


test('admin dashboard and PWA assets are present for launch operations', () => {
  const admin = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const adminScript = readFileSync(new URL('../src/admin.mjs', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
  const serviceWorker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  const appScript = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.py', import.meta.url), 'utf8');

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
  assert.match(serviceWorker, /blog\.html/);
  assert.match(serviceWorker, /pdf-tts-guide\.html/);
  assert.match(serviceWorker, /doclisten-field-test\.html/);
  assert.match(serviceWorker, /doclisten-review-sample\.pdf/);
  assert.match(serviceWorker, /about\.html/);
  assert.match(serviceWorker, /editorial-policy\.html/);
  assert.doesNotMatch(serviceWorker, /pdf-audio-mobile-guide\.html/);
  assert.match(serviceWorker, /doclisten-shell-v13/);
  assert.match(serviceWorker, /fetch\(asset, \{ cache: 'reload' \}\)/);
  assert.match(serviceWorker, /event\.request\.mode === 'navigate'/);
  assert.match(serviceWorker, /delete-account\.html/);
  assert.match(appScript, /updateViaCache: 'none'/);
  assert.match(appScript, /registration\.update\(\)/);
  assert.match(server, /service-worker\.js/);
  assert.match(server, /no-cache, no-store, must-revalidate/);
});
