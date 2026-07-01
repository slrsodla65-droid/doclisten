import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
import {
  AUTO_SCROLL_USER_PAUSE_MS,
  shouldAutoScrollReading,
  shouldKeepScreenAwake,
  FREE_DAILY_LISTEN_LIMIT,
  getDailyUsageKey,
  createDailyUsageSnapshot,
  canStartListeningForPlan,
  prepareSpokenText,
  selectInitialListeningBlock,
} from './readerCore.mjs?v=35';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const els = {
  fileInput: document.querySelector('#fileInput'),
  uploadBtn: document.querySelector('#uploadBtn'),
  emptyState: document.querySelector('#emptyState'),
  reader: document.querySelector('#reader'),
  player: document.querySelector('#player'),
  pdfCanvas: document.querySelector('#pdfCanvas'),
  pdfStage: document.querySelector('#pdfStage'),
  textOverlay: document.querySelector('#textOverlay'),
  pageLabel: document.querySelector('#pageLabel'),
  prevPageBtn: document.querySelector('#prevPageBtn'),
  nextPageBtn: document.querySelector('#nextPageBtn'),
  listenBtn: document.querySelector('#listenBtn'),
  pauseBtn: document.querySelector('#pauseBtn'),
  prevBlockBtn: document.querySelector('#prevBlockBtn'),
  nextBlockBtn: document.querySelector('#nextBlockBtn'),
  rateSelect: document.querySelector('#rateSelect'),
  currentText: document.querySelector('#currentText'),
  docTitle: document.querySelector('#docTitle'),
  planLabel: document.querySelector('#planLabel'),
  usageLabel: document.querySelector('#usageLabel'),
  paywallNotice: document.querySelector('#paywallNotice'),
  paymentLinks: document.querySelectorAll('[data-payment-cta]'),
  priceLabels: document.querySelectorAll('[data-beta-price-label]'),
  betaCodeInput: document.querySelector('#betaCodeInput'),
  activateBtn: document.querySelector('#activateBtn'),
  accountMessage: document.querySelector('#accountMessage'),
  accountStatus: document.querySelector('#accountStatus'),
  logoutBtn: document.querySelector('#logoutBtn'),
  deleteAccountBtn: document.querySelector('#deleteAccountBtn'),
  installGuideBtn: document.querySelector('#installGuideBtn'),
  installGuide: document.querySelector('#installGuide'),
};

const state = {
  pdf: null,
  fileName: '',
  currentPage: 1,
  pages: new Map(),
  activeBlock: null,
  speaking: false,
  paused: false,
  autoScrollPauseUntilMs: 0,
  wakeLock: null,
  renderToken: 0,
  speechRunId: 0,
  plan: 'free',
  freeListensUsed: 0,
  user: null,
  token: localStorage.getItem('doclisten-user-token') || '',
  serverUsage: null,
  socialLoginProviders: [],
  currentAudio: null,
  currentAudioUrl: '',
};

const canvasContext = els.pdfCanvas.getContext('2d');



async function loadPaymentConfig() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    if (config.betaPriceLabel) {
      els.priceLabels.forEach((node) => {
        node.textContent = config.betaPriceLabel;
      });
    }
    state.socialLoginProviders = config.socialLoginProviders || [];
    if (config.paymentUrl) {
      els.paymentLinks.forEach((node) => {
        node.href = config.paymentUrl;
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
        node.textContent = config.paymentProvider === 'kakao-openchat' ? '카카오톡으로 베타 신청' : '유료 베타 결제하기';
      });
    }
  } catch (error) {
    console.debug('Payment config unavailable', error);
  }
}

function trackBetaEvent(event) {
  const payload = JSON.stringify({ event, token: state.token || '' });
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/event', blob);
      return;
    }
  } catch (error) {
    console.debug('Beta event beacon unavailable', error);
  }
  fetch('/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: payload,
    keepalive: true,
  }).catch((error) => console.debug('Beta event unavailable', error));
}

function authHeaders() {
  return state.token ? { 'X-DocListen-Token': state.token } : {};
}

function setAccountMessage(message) {
  if (els.accountMessage) els.accountMessage.textContent = message;
}

function planDisplayLabel(plan) {
  if (plan === 'admin') return 'Admin';
  if (plan === 'beta-pro') return 'Beta Pro';
  return 'Free';
}

function updateAccountStatusUi() {
  if (els.accountStatus) {
    if (state.user?.email) {
      els.accountStatus.textContent = `${state.user.email} · ${planDisplayLabel(state.plan)}`;
    } else {
      els.accountStatus.textContent = '아직 로그인하지 않았습니다.';
    }
  }
  els.logoutBtn?.classList.toggle('hidden', !state.token);
  els.deleteAccountBtn?.classList.toggle('hidden', !state.token);
}

function applyServerStatus(payload) {
  if (payload?.user) {
    state.user = payload.user;
    state.token = payload.user.token || state.token;
    localStorage.setItem('doclisten-user-token', state.token);
  }
  if (payload?.usage) {
    state.serverUsage = payload.usage;
    state.plan = payload.usage.plan || 'free';
    state.freeListensUsed = Number(payload.usage.used || 0);
  }
  updateUsageUi();
  updateAccountStatusUi();
}

async function refreshAccountStatus() {
  if (!state.token) {
    updateUsageUi();
    updateAccountStatusUi();
    return;
  }
  try {
    const response = await fetch('/api/me', { headers: authHeaders(), cache: 'no-store' });
    const payload = await response.json();
    if (payload.ok) {
      applyServerStatus(payload);
      return;
    }
    clearLocalAccountState();
    setAccountMessage('로그인 세션이 만료되었습니다. 다시 Google로 로그인해주세요.');
  } catch (error) {
    console.debug('Account status unavailable', error);
  }
}

function clearLocalAccountState() {
  localStorage.removeItem('doclisten-user-token');
  localStorage.removeItem('doclisten-user-email');
  state.user = null;
  state.token = '';
  state.serverUsage = null;
  state.plan = 'free';
  state.freeListensUsed = 0;
  updateUsageUi();
  updateAccountStatusUi();
}

async function logout() {
  const token = state.token;
  if (token) {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DocListen-Token': token },
        body: JSON.stringify({}),
      });
    } catch (error) {
      console.debug('Server logout unavailable', error);
    }
  }
  clearLocalAccountState();
  setAccountMessage('이 브라우저에서 로그아웃했습니다. 다시 사용하려면 Google로 로그인해주세요.');
}

async function deleteAccount() {
  if (!state.token) return;
  const confirmed = window.confirm('DocListen 계정과 서버 사용량 기록을 삭제할까요? 이 브라우저에서도 로그아웃됩니다.');
  if (!confirmed) return;
  try {
    const response = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setAccountMessage('계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    clearLocalAccountState();
    setAccountMessage('계정과 사용량 기록을 삭제했습니다. 다시 사용하려면 Google로 로그인해주세요.');
  } catch (error) {
    console.debug('Account deletion unavailable', error);
    setAccountMessage('계정 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}

async function activateBetaCode() {
  const code = els.betaCodeInput?.value?.trim();
  trackBetaEvent('beta_code_attempt');
  if (!state.token) {
    setAccountMessage('먼저 Google로 로그인해주세요.');
    return;
  }
  if (!code) {
    setAccountMessage('베타 코드를 입력해주세요.');
    return;
  }
  els.activateBtn.disabled = true;
  setAccountMessage('베타 코드를 확인하는 중입니다...');
  try {
    const response = await fetch('/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ code }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      if (payload.reason === 'code-already-used') {
        setAccountMessage('이미 다른 계정에서 사용된 베타 코드입니다. 카카오톡으로 새 코드를 요청해주세요.');
        return;
      }
      if (payload.reason === 'code-not-configured') {
        setAccountMessage('베타 코드가 아직 서버에 설정되지 않았습니다. 카카오톡으로 운영자에게 확인해주세요.');
        return;
      }
      setAccountMessage('베타 코드가 맞지 않습니다. 카카오톡으로 받은 코드를 다시 확인해주세요.');
      return;
    }
    applyServerStatus(payload);
    setAccountMessage('Beta Pro 활성화 완료. 오늘 한도 없이 사용할 수 있습니다.');
  } catch (error) {
    console.debug('Beta activation unavailable', error);
    setAccountMessage('베타 코드 확인에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.');
  } finally {
    els.activateBtn.disabled = false;
  }
}

function updateUsageUi() {
  const usage = state.serverUsage || createDailyUsageSnapshot(state.freeListensUsed, FREE_DAILY_LISTEN_LIMIT);
  if (els.planLabel) els.planLabel.textContent = usage.plan === 'free' ? 'Free 체험' : planDisplayLabel(usage.plan);
  if (els.usageLabel) {
    if (!state.token) {
      els.usageLabel.textContent = `Google 로그인 후 오늘 무료 듣기 ${usage.limit || FREE_DAILY_LISTEN_LIMIT}문단까지 사용할 수 있습니다.`;
    } else if (usage.plan === 'free') {
      els.usageLabel.textContent = `서버 저장 사용량: 오늘 ${usage.used}/${usage.limit}문단 사용 · 남은 ${usage.remaining}문단`;
    } else if (usage.plan === 'admin') {
      els.usageLabel.textContent = 'Admin 활성화됨 · 운영자는 하루 제한 없이 사용할 수 있습니다.';
    } else {
      els.usageLabel.textContent = 'Beta Pro 활성화됨 · 하루 제한 없이 사용할 수 있습니다.';
    }
  }
  els.paywallNotice?.classList.toggle('hidden', !usage.reached || usage.plan !== 'free');
}

async function consumeListeningCredit() {
  trackBetaEvent('listen_attempt');
  if (!state.token) {
    setAccountMessage('무료 사용량 관리를 위해 먼저 Google 로그인을 해주세요.');
    return false;
  }
  try {
    const response = await fetch('/api/listen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({}),
    });
    const payload = await response.json();
    applyServerStatus(payload);
    if (!payload.allowed) {
      els.currentText.textContent = '오늘 무료 듣기 한도를 모두 사용했습니다. 카카오톡 베타 신청 후 코드를 입력하면 제한이 해제됩니다.';
      els.paywallNotice?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  } catch (error) {
    console.debug('Server usage unavailable', error);
    setAccountMessage('서버 사용량 확인에 실패했습니다. 잠시 후 다시 시도해주세요.');
    return false;
  }
}

function progressKey() {
  return `pdf-listener-progress:${state.fileName}`;
}

function saveProgress(block) {
  if (!block || !state.fileName) return;
  localStorage.setItem(progressKey(), JSON.stringify({ page: block.page, blockId: block.id }));
}

function loadProgress() {
  if (!state.fileName) return null;
  try {
    return JSON.parse(localStorage.getItem(progressKey()) || 'null');
  } catch {
    return null;
  }
}

function showReader() {
  els.emptyState.classList.add('hidden');
  els.reader.classList.remove('hidden');
  els.player.classList.remove('hidden');
}

function releaseCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.removeAttribute('src');
    state.currentAudio.load();
    state.currentAudio = null;
  }
  if (state.currentAudioUrl) {
    URL.revokeObjectURL(state.currentAudioUrl);
    state.currentAudioUrl = '';
  }
}

function stopSpeech() {
  state.speechRunId += 1;
  window.speechSynthesis?.cancel();
  releaseCurrentAudio();
  state.speaking = false;
  state.paused = false;
  updateControls();
}

async function syncWakeLock() {
  const shouldHold = shouldKeepScreenAwake({ speaking: state.speaking, paused: state.paused });
  if (!shouldHold) {
    if (state.wakeLock) {
      try {
        await state.wakeLock.release();
      } catch (error) {
        console.debug('Wake Lock release failed', error);
      }
      state.wakeLock = null;
    }
    return;
  }

  if (state.wakeLock || document.visibilityState !== 'visible') return;
  if (!('wakeLock' in navigator) || !navigator.wakeLock?.request) return;
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener?.('release', () => {
      state.wakeLock = null;
    });
  } catch (error) {
    console.debug('Screen Wake Lock is unavailable', error);
    state.wakeLock = null;
  }
}

function updateControls() {
  void syncWakeLock();
  const hasPdf = Boolean(state.pdf);
  els.prevPageBtn.disabled = !hasPdf || state.currentPage <= 1;
  els.nextPageBtn.disabled = !hasPdf || state.currentPage >= state.pdf.numPages;
  els.listenBtn.disabled = !hasPdf;
  els.pauseBtn.disabled = !state.speaking;
  els.prevBlockBtn.disabled = !state.activeBlock;
  els.nextBlockBtn.disabled = !state.activeBlock;
  els.pauseBtn.textContent = state.paused ? '재개' : '일시정지';
  els.pageLabel.textContent = hasPdf ? `${state.currentPage} / ${state.pdf.numPages}` : '0 / 0';
}

function makeBlockFromTextItem(item, viewport, pageNumber, order) {
  const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(item.height || 12);
  const width = Math.max((item.width || 0) * viewport.scale, 8);
  const height = Math.max(fontHeight, 9);
  const x = tx[4];
  const y = tx[5] - height;
  return {
    id: `p${pageNumber}_b${order}`,
    page: pageNumber,
    order,
    text: String(item.str || '').trim().replace(/\s+/g, ' '),
    bbox: { x, y, width, height },
  };
}

function unionBox(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function buildBlocks(textItems, viewport, pageNumber) {
  const items = textItems
    .filter((item) => item.str && item.str.trim())
    .map((item, index) => makeBlockFromTextItem(item, viewport, pageNumber, index + 1))
    .sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x));

  const lines = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    const sameLine = last && Math.abs((last.bbox.y + last.bbox.height / 2) - (item.bbox.y + item.bbox.height / 2)) < 8;
    if (sameLine) {
      last.parts.push(item);
      last.bbox = unionBox(last.bbox, item.bbox);
    } else {
      lines.push({ parts: [item], bbox: { ...item.bbox } });
    }
  }

  return lines.map((line, index) => {
    const parts = [...line.parts].sort((a, b) => a.bbox.x - b.bbox.x);
    return {
      id: `p${pageNumber}_b${index + 1}`,
      page: pageNumber,
      order: index + 1,
      text: parts.map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim(),
      bbox: line.bbox,
    };
  }).filter((block) => block.text);
}

function pauseAutoScrollForUserInput() {
  if (!state.speaking) return;
  state.autoScrollPauseUntilMs = Date.now() + AUTO_SCROLL_USER_PAUSE_MS;
}

function scrollActiveBlockIntoView(node) {
  if (!node) return;
  if (!shouldAutoScrollReading({
    speaking: state.speaking,
    userPauseUntilMs: state.autoScrollPauseUntilMs,
  })) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

function setActiveBlock(block, options = {}) {
  state.activeBlock = block || null;
  document.querySelectorAll('.text-block.active').forEach((node) => node.classList.remove('active'));
  if (block) {
    const node = document.querySelector(`[data-block-id="${block.id}"]`);
    node?.classList.add('active');
    els.currentText.textContent = block.text;
    saveProgress(block);
    if (options.autoScroll) scrollActiveBlockIntoView(node);
  }
  updateControls();
}

async function renderPage(pageNumber, preferredBlockId = null) {
  if (!state.pdf) return;
  const token = ++state.renderToken;
  state.currentPage = Math.min(Math.max(1, pageNumber), state.pdf.numPages);
  const page = await state.pdf.getPage(state.currentPage);
  if (token !== state.renderToken) return;

  const rawViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.min(window.innerWidth - 24, 920);
  const scale = Math.max(0.7, availableWidth / rawViewport.width);
  const viewport = page.getViewport({ scale });

  els.pdfCanvas.width = Math.floor(viewport.width);
  els.pdfCanvas.height = Math.floor(viewport.height);
  els.pdfCanvas.style.width = `${viewport.width}px`;
  els.pdfCanvas.style.height = `${viewport.height}px`;
  els.textOverlay.style.width = `${viewport.width}px`;
  els.textOverlay.style.height = `${viewport.height}px`;
  els.textOverlay.innerHTML = '';

  await page.render({ canvasContext, viewport }).promise;
  const textContent = await page.getTextContent();
  const blocks = buildBlocks(textContent.items, viewport, state.currentPage);
  state.pages.set(state.currentPage, blocks);

  for (const block of blocks) {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'text-block';
    div.dataset.blockId = block.id;
    div.title = block.text;
    div.style.left = `${block.bbox.x}px`;
    div.style.top = `${block.bbox.y}px`;
    div.style.width = `${block.bbox.width}px`;
    div.style.height = `${block.bbox.height}px`;
    div.addEventListener('click', () => speakBlock(block));
    els.textOverlay.appendChild(div);
  }

  const target = blocks.find((block) => block.id === preferredBlockId) || selectInitialListeningBlock(blocks);
  setActiveBlock(target);
}

async function getNextBlock() {
  if (!state.activeBlock || !state.pdf) return null;
  const blocks = state.pages.get(state.activeBlock.page) || [];
  const index = blocks.findIndex((block) => block.id === state.activeBlock.id);
  if (index >= 0 && index + 1 < blocks.length) return blocks[index + 1];
  if (state.activeBlock.page < state.pdf.numPages) {
    await renderPage(state.activeBlock.page + 1);
    return (state.pages.get(state.currentPage) || [])[0] || null;
  }
  return null;
}

async function getPreviousBlock() {
  if (!state.activeBlock || !state.pdf) return null;
  const blocks = state.pages.get(state.activeBlock.page) || [];
  const index = blocks.findIndex((block) => block.id === state.activeBlock.id);
  if (index > 0) return blocks[index - 1];
  if (state.activeBlock.page > 1) {
    await renderPage(state.activeBlock.page - 1);
    const previousBlocks = state.pages.get(state.currentPage) || [];
    return previousBlocks[previousBlocks.length - 1] || null;
  }
  return null;
}

function rateForServerTts() {
  const value = String(els.rateSelect.value || '1');
  return value === '2.0' ? '2' : value;
}

async function continueToNextBlock(runId) {
  if (runId !== state.speechRunId) return;
  const next = await getNextBlock();
  if (next) {
    speakBlock(next);
  } else {
    releaseCurrentAudio();
    state.speaking = false;
    state.paused = false;
    updateControls();
  }
}

function fallbackToBrowserSpeech(block, runId) {
  if (runId !== state.speechRunId) return;
  const spokenText = prepareSpokenText(block.text);
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = 'ko-KR';
  utterance.rate = Number(els.rateSelect.value || 1);
  utterance.pitch = 1;

  utterance.onstart = () => {
    if (runId !== state.speechRunId) return;
    state.speaking = true;
    state.paused = false;
    updateControls();
  };
  utterance.onend = () => {
    void continueToNextBlock(runId);
  };
  utterance.onerror = () => {
    if (runId !== state.speechRunId) return;
    state.speaking = false;
    state.paused = false;
    updateControls();
  };

  window.speechSynthesis.speak(utterance);
}

async function playServerNarration(block, runId) {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: block.text,
      voice: 'gtts-ko-human',
      rate: rateForServerTts(),
    }),
  });
  if (!response.ok) throw new Error(`TTS failed: ${response.status}`);
  if (runId !== state.speechRunId) return;

  const blob = await response.blob();
  if (runId !== state.speechRunId) return;

  releaseCurrentAudio();
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  audio.playbackRate = Number(els.rateSelect.value || 1);
  state.currentAudioUrl = audioUrl;
  state.currentAudio = audio;

  audio.onplay = () => {
    if (runId !== state.speechRunId) return;
    state.speaking = true;
    state.paused = false;
    updateControls();
  };
  audio.onended = () => {
    void continueToNextBlock(runId);
  };
  audio.onerror = () => {
    if (runId !== state.speechRunId) return;
    releaseCurrentAudio();
    fallbackToBrowserSpeech(block, runId);
  };
  await audio.play();
}

async function speakBlock(block) {
  if (!block?.text) return;
  if (!(await consumeListeningCredit())) return;
  state.speechRunId += 1;
  const runId = state.speechRunId;
  state.speaking = true;
  state.paused = false;
  window.speechSynthesis.cancel();
  releaseCurrentAudio();
  setActiveBlock(block, { autoScroll: true });
  els.currentText.textContent = `${block.text} · 오디오북 음성을 준비하는 중입니다...`;
  updateControls();

  try {
    await playServerNarration(block, runId);
  } catch (error) {
    console.debug('Server narration unavailable; falling back to browser speech', error);
    if (runId !== state.speechRunId) return;
    fallbackToBrowserSpeech(block, runId);
  }
}

async function loadPdf(file) {
  stopSpeech();
  if (!file?.name?.toLowerCase().endsWith('.pdf') && file?.type !== 'application/pdf') {
    throw new Error('Only PDF files are supported');
  }
  if (file.size > 30 * 1024 * 1024) {
    throw new Error('PDF file is too large for beta testing');
  }
  trackBetaEvent('pdf_upload');
  state.fileName = file.name;
  state.pages.clear();
  state.activeBlock = null;
  els.docTitle.textContent = file.name;
  els.currentText.textContent = 'PDF를 불러오는 중입니다...';
  showReader();

  const buffer = await file.arrayBuffer();
  state.pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const saved = loadProgress();
  await renderPage(saved?.page || 1, saved?.blockId || null);
  els.currentText.textContent = state.activeBlock?.text || '듣기 버튼을 누르거나 문단을 터치하세요.';
  updateControls();
}

els.uploadBtn.addEventListener('click', () => {
  els.fileInput.value = '';
  els.fileInput.click();
});

els.fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await loadPdf(file);
  } catch (error) {
    console.error(error);
    els.currentText.textContent = 'PDF를 불러오지 못했습니다. 30MB 이하의 텍스트형 PDF로 다시 시도해주세요. 계속 실패하면 카카오톡으로 PDF 종류와 기기 정보를 알려주세요.';
  }
});

els.listenBtn.addEventListener('click', () => {
  const block = state.activeBlock || (state.pages.get(state.currentPage) || [])[0];
  speakBlock(block);
});

els.pauseBtn.addEventListener('click', () => {
  if (!state.speaking) return;
  if (state.paused) {
    if (state.currentAudio) {
      void state.currentAudio.play();
    } else {
      window.speechSynthesis.resume();
    }
    state.paused = false;
  } else {
    if (state.currentAudio) {
      state.currentAudio.pause();
    } else {
      window.speechSynthesis.pause();
    }
    state.paused = true;
  }
  updateControls();
});

els.rateSelect.addEventListener('change', () => {
  if (state.currentAudio) {
    state.currentAudio.playbackRate = Number(els.rateSelect.value || 1);
  }
});

els.nextBlockBtn.addEventListener('click', async () => {
  const next = await getNextBlock();
  if (next) speakBlock(next);
});

els.prevBlockBtn.addEventListener('click', async () => {
  const previous = await getPreviousBlock();
  if (previous) speakBlock(previous);
});

els.prevPageBtn.addEventListener('click', async () => {
  stopSpeech();
  await renderPage(state.currentPage - 1);
});

els.nextPageBtn.addEventListener('click', async () => {
  stopSpeech();
  await renderPage(state.currentPage + 1);
});

window.addEventListener('wheel', pauseAutoScrollForUserInput, { passive: true });
window.addEventListener('touchmove', pauseAutoScrollForUserInput, { passive: true });
window.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
    pauseAutoScrollForUserInput();
  }
});

window.addEventListener('visibilitychange', () => {
  void syncWakeLock();
});

document.querySelector('a.social-login.google')?.addEventListener('click', () => {
  trackBetaEvent('login_click');
});

els.paymentLinks.forEach((link) => {
  link.addEventListener('click', () => trackBetaEvent('beta_cta_click'));
});

els.activateBtn?.addEventListener('click', () => {
  void activateBetaCode();
});

els.logoutBtn?.addEventListener('click', () => {
  void logout();
});

els.deleteAccountBtn?.addEventListener('click', () => {
  void deleteAccount();
});

els.installGuideBtn?.addEventListener('click', () => {
  els.installGuide?.classList.toggle('hidden');
});

window.addEventListener('beforeunload', () => {
  window.speechSynthesis?.cancel();
});

trackBetaEvent('page_view');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch((error) => console.debug('Service worker registration failed', error));
}
void loadPaymentConfig();
void refreshAccountStatus();
updateControls();
updateUsageUi();
updateAccountStatusUi();
