export const AUTO_SCROLL_USER_PAUSE_MS = 8000;

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
    .replace(/([가-힣])\s+(할|한|하는|하기|하여|하며|하고|한다|된다|되는|되도록|있도록|입니다|다\.)(?=\s|$)/g, '$1$2')
    .replace(/([가-힣])\s+(은|는|이|가|을|를|의|에|와|과|도|만|부터|까지|에서|으로|로)(?=\s|$)/g, '$1$2')
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
