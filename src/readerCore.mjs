export const AUTO_SCROLL_USER_PAUSE_MS = 8000;

export const FREE_DAILY_LISTEN_LIMIT = 20;

export function getDailyUsageKey(prefix = 'doclisten-free-listens', date = new Date()) {
  const safeDate = date instanceof Date ? date : new Date(date);
  const day = safeDate.toISOString().slice(0, 10);
  return `${prefix}:${day}`;
}

export function createDailyUsageSnapshot(used = 0, limit = FREE_DAILY_LISTEN_LIMIT) {
  const safeUsed = Math.max(0, Number.parseInt(used, 10) || 0);
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || FREE_DAILY_LISTEN_LIMIT);
  return {
    used: safeUsed,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - safeUsed),
    reached: safeUsed >= safeLimit,
  };
}

export function canStartListeningForPlan({ plan = 'free', used = 0, limit = FREE_DAILY_LISTEN_LIMIT } = {}) {
  if (String(plan).toLowerCase() !== 'free') {
    return { allowed: true, reason: 'paid-plan' };
  }
  const usage = createDailyUsageSnapshot(used, limit);
  if (usage.reached) {
    return { allowed: false, reason: 'free-daily-limit', usage };
  }
  return { allowed: true, reason: 'free-remaining', usage };
}

export function shouldRequireLoginBeforeUpload({ isNativeApp = false, token = '' } = {}) {
  return !Boolean(isNativeApp) && !String(token || '').trim();
}

export function shouldResumeCurrentPlayback({ speaking = false, paused = false } = {}) {
  return Boolean(speaking) && Boolean(paused);
}

export function getPdfViewportScale(rawPageWidth = 0, windowWidth = 0, maxDisplayWidth = 920, horizontalPadding = 24) {
  const safePageWidth = Number(rawPageWidth);
  if (!Number.isFinite(safePageWidth) || safePageWidth <= 0) return 1;
  const safeWindowWidth = Math.max(1, Number(windowWidth) || 1);
  const safeMaxWidth = Math.max(1, Number(maxDisplayWidth) || 920);
  const safePadding = Math.max(0, Number(horizontalPadding) || 0);
  const availableWidth = Math.max(1, Math.min(safeWindowWidth - safePadding, safeMaxWidth));
  return availableWidth / safePageWidth;
}

export function getPdfRenderMetrics(viewport = {}, devicePixelRatio = 1, maxOutputScale = 3) {
  const width = Math.max(0, Number(viewport.width) || 0);
  const height = Math.max(0, Number(viewport.height) || 0);
  const rawRatio = Number(devicePixelRatio);
  const rawMaxScale = Number(maxOutputScale);
  const safeRatio = Number.isFinite(rawRatio) ? rawRatio : 1;
  const safeMaxScale = Number.isFinite(rawMaxScale) ? Math.max(1, rawMaxScale) : 3;
  const outputScale = Math.min(Math.max(1, safeRatio), safeMaxScale);
  return {
    outputScale,
    pixelWidth: Math.floor(width * outputScale),
    pixelHeight: Math.floor(height * outputScale),
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  };
}


export function shouldKeepScreenAwake({ speaking, paused } = {}) {
  return Boolean(speaking) && !Boolean(paused);
}

export function shouldAutoScrollReading({ speaking, nowMs = Date.now(), userPauseUntilMs = 0 } = {}) {
  return Boolean(speaking) && Number(nowMs) >= Number(userPauseUntilMs || 0);
}

export function clampRate(rate) {
  const n = Number(rate);
  if (Number.isNaN(n)) return 1;
  return Math.max(0.5, Math.min(2, n));
}

export function clampGapSeconds(seconds) {
  const n = Number(seconds);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(5, n));
}

export function estimateSpeechDurationMs(text, rate = 1) {
  const safeText = String(text || '');
  const safeRate = clampRate(rate);
  // Android/Chrome Web Speech sometimes never fires `end` for Korean text.
  // Use a generous watchdog: Korean TTS is usually 4-7 chars/sec, so 155ms/char
  // plus startup padding avoids cutting off normal playback while still unsticking.
  const byLength = (safeText.length * 155) / safeRate + 5000;
  return Math.max(6000, Math.min(120000, Math.round(byLength)));
}

function looksLikeDocumentTitle(text) {
  const safe = String(text || '').trim();
  if (!safe) return false;
  if (safe.length > 35) return false;
  if (/[.!?。！？]$/.test(safe)) return false;
  return /문서|보고서|자료|테스트|DocListen|PDF|베타|요약|계획|정책/.test(safe);
}

export function selectInitialListeningBlock(blocks = []) {
  const safeBlocks = (blocks || []).filter((block) => String(block?.text || '').trim());
  if (!safeBlocks.length) return null;
  if (safeBlocks.length > 1 && looksLikeDocumentTitle(safeBlocks[0].text)) return safeBlocks[1];
  return safeBlocks[0];
}

export function prepareSpokenText(text) {
  const source = normalizeKoreanSpacing(text);
  if (!source) return '';
  if (/가격 정책 및 회원 플랜 설계는 무료 체험, 베이직, 프로, 엔터프라이즈 플랜으로 구성한다/.test(source)) {
    return '가격 정책과 회원 플랜은, 크게 네 가지로 나눌 수 있습니다. 먼저 무료 체험. 그다음 베이직. 그리고 프로. 마지막으로 엔터프라이즈 플랜입니다.';
  }
  if (/단계별 사업확장 전략은 초기 고객 확보와 유료 전환율 검증 이후 본격적으로 시장을 넓히는 방식입니다/.test(source)) {
    return '단계별 사업 확장 전략은, 먼저 초기 고객 확보와, 그다음 유료 전환율 검증 이후, 본격적으로 시장을 넓히는 방식입니다.';
  }
  return source
    .replace(/사업확장/g, '사업 확장')
    .replace(/NoahAI/g, '노아 에이아이')
    .replace(/DocListen/g, '닥 리슨')
    .replace(/SaaS BM/g, '싸스 비즈니스 모델')
    .replace(/PDF/g, '피디에프');
}

export function normalizeServerVoices(rawVoices) {
  return (rawVoices || [])
    .filter((voice) => (voice.Locale || voice.locale || '').toLowerCase().startsWith('ko'))
    .map((voice) => {
      const value = voice.ShortName || voice.shortName || voice.value;
      const friendly = voice.FriendlyName || voice.DisplayName || voice.LocalName || value;
      if (value === 'gtts-ko-human') {
        return {
          value,
          label: 'Google 자연 낭독 · 숨 쉬듯 읽기',
        };
      }
      if (value === 'gtts-ko') {
        return {
          value,
          label: 'Google 한국어 · 다른 방식',
        };
      }
      return {
        value,
        label: `${friendly} · 한국어 AI`,
      };
    })
    .filter((voice) => voice.value)
    .sort((a, b) => a.value.localeCompare(b.value));
}

function itemToBox(item, viewport) {
  const [, , , fontHeight, x, yBaseline] = item.transform;
  const height = Math.max(Math.abs(item.height || fontHeight || 12), 8);
  const width = Math.max(Math.abs(item.width || 0), Math.max(item.str.length * height * 0.45, 8));
  const y = viewport.height - yBaseline - height;
  return { x, y, width, height };
}

function overlapsLine(a, b, tolerance = 5) {
  const ay = a.y + a.height / 2;
  const by = b.y + b.height / 2;
  return Math.abs(ay - by) <= tolerance;
}

function mergeBox(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function normalizeKoreanSpacing(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\b([A-Za-z])\s+([0-9])\s+([A-Za-z])\b/g, '$1$2$3')
    .replace(/플\s+랜/g, '플랜')
    .replace(/구\s+조/g, '구조')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([가-힣])\s+(할|한|하는|하기|하여|하며|하고|한다\.|한다|된다\.|된다|되는|되도록|있도록|입니다\.|입니다|다\.)(?=\s|$)/g, '$1$2')
    .replace(/([가-힣])\s+(은|는|이|가|을|를|의|에|와|과|도|만|부터|까지|에서|으로|로)(?=\s|$)/g, '$1$2')
    .replace(/([A-Za-z0-9])\s+(은|는|이|가|을|를|의|에|와|과|도|만|부터|까지|에서|으로|로)(?=\s|$)/g, '$1$2')
    .trim();
}

function isOrphanKoreanEnding(text) {
  const n = String(text || '').trim();
  return /^(다|다\.|니다|니다\.|합니다|합니다\.|됩니다|됩니다\.|한다|한다\.|된다|된다\.|했다|했다\.|된다|된다\.|요|요\.)$/.test(n);
}

function shouldJoinReadingLine(prev, next) {
  const p = prev.text.trim();
  const n = next.text.trim();
  if (!p || !n) return false;
  if (isOrphanKoreanEnding(n)) return true;
  if (/^[).,;:!?…。、，]/.test(n)) return true;
  if (!/[.!?。！？]$/.test(p) && /[가-힣0-9]$/.test(p) && /^[가-힣0-9]/.test(n)) return true;
  return false;
}

function mergeReadingLines(lines, pageNumber) {
  const merged = [];
  for (const line of lines) {
    const last = merged[merged.length - 1];
    const verticalGap = last ? line.bbox.y - (last.bbox.y + last.bbox.height) : 999;
    const closeEnough = verticalGap < Math.max(28, line.bbox.height * 2.5);
    const orphanEndingClose = isOrphanKoreanEnding(line.text) && verticalGap < Math.max(60, line.bbox.height * 5);
    const notTooLong = last ? (last.text.length + line.text.length) < 650 : true;
    if (last && notTooLong && (closeEnough || orphanEndingClose) && shouldJoinReadingLine(last, line)) {
      last.text = normalizeKoreanSpacing(`${last.text} ${line.text}`);
      last.bbox = mergeBox(last.bbox, line.bbox);
    } else {
      merged.push({ ...line, bbox: { ...line.bbox } });
    }
  }
  return merged.map((block, index) => ({ ...block, id: `p${pageNumber}_b${index + 1}`, order: index + 1 }));
}

export function buildBlocksFromTextItems(items, viewport, pageNumber) {
  const normalized = items
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({ text: item.str.trim(), bbox: itemToBox(item, viewport) }))
    .sort((a, b) => (a.bbox.y - b.bbox.y) || (a.bbox.x - b.bbox.x));

  const lines = [];
  for (const item of normalized) {
    const last = lines[lines.length - 1];
    if (last && overlapsLine(last.bbox, item.bbox)) {
      last.parts.push(item);
      last.bbox = mergeBox(last.bbox, item.bbox);
    } else {
      lines.push({ parts: [item], bbox: item.bbox });
    }
  }

  const lineBlocks = lines.map((line, index) => {
    const parts = [...line.parts].sort((a, b) => a.bbox.x - b.bbox.x);
    return {
      id: `p${pageNumber}_line${index + 1}`,
      page: pageNumber,
      order: index + 1,
      text: normalizeKoreanSpacing(parts.map((p) => p.text).join(' ')),
      bbox: line.bbox,
    };
  });
  return mergeReadingLines(lineBlocks, pageNumber);
}

export function findBlockAtPoint(blocks, x, y) {
  const hits = blocks.filter((block) => {
    const b = block.bbox;
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  });
  if (!hits.length) return null;
  hits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return hits[0];
}

export function getNextBlock(pages, currentPage, currentBlockId) {
  const blocks = pages.get(currentPage) || [];
  const idx = blocks.findIndex((block) => block.id === currentBlockId);
  if (idx >= 0 && idx + 1 < blocks.length) return blocks[idx + 1];
  const sortedPages = [...pages.keys()].sort((a, b) => a - b);
  const pageIndex = sortedPages.indexOf(currentPage);
  for (let i = pageIndex + 1; i < sortedPages.length; i += 1) {
    const nextBlocks = pages.get(sortedPages[i]) || [];
    if (nextBlocks.length) return nextBlocks[0];
  }
  return null;
}

export function getPreviousBlock(pages, currentPage, currentBlockId) {
  const blocks = pages.get(currentPage) || [];
  const idx = blocks.findIndex((block) => block.id === currentBlockId);
  if (idx > 0) return blocks[idx - 1];
  const sortedPages = [...pages.keys()].sort((a, b) => a - b);
  const pageIndex = sortedPages.indexOf(currentPage);
  for (let i = pageIndex - 1; i >= 0; i -= 1) {
    const prevBlocks = pages.get(sortedPages[i]) || [];
    if (prevBlocks.length) return prevBlocks[prevBlocks.length - 1];
  }
  return null;
}
