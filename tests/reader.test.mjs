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

test('rate select offers granular speeds from 0.5x to 2.0x', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  for (let value = 0.5; value <= 2.0; value = Math.round((value + 0.1) * 10) / 10) {
    const label = value === 1 ? '1.0x' : `${value.toFixed(1)}x`;
    const optionValue = value === 1 ? '1' : value.toFixed(1);
    assert.match(html, new RegExp(`<option value="${optionValue}"[^>]*>${label}</option>`));
  }
});
