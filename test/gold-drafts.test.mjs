import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { renderGoldDrafts } from '../src/gold-drafts.mjs';

const previews = new URL('../previews/', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('sources.json', previews), 'utf8'));

test('the four saved previews match the renderer', () => {
  for (const kind of ['chart', 'calendar']) {
    for (const [platform, body] of Object.entries(renderGoldDrafts(kind))) {
      const saved = readFileSync(new URL(`${platform}-${kind}.txt`, previews), 'utf8');
      assert.equal(saved.trimEnd().replaceAll('\r\n', '\n'), body);
      assert.ok(body.length <= (platform === 'discord' ? 2000 : 4096));
    }
  }
});

test('chart and macro drafts preserve independent evidence dates', () => {
  for (const post of Object.values(renderGoldDrafts())) {
    assert.match(post, /Archive chart review.*2 Nov 2026/);
    assert.match(post, /bid of 3,899\.81 and an ask of 3,900\.01/);
    assert.doesNotMatch(post, /mt5_review|\.json|25 Nov/);
  }
  for (const post of Object.values(renderGoldDrafts('calendar'))) {
    assert.match(post, /08:30 New York • 13:30 UTC • 14:30 Ljubljana/);
    assert.match(post, /25 Nov 2026/);
    assert.match(post, /Schedule checked 21 Nov 2026/);
    assert.ok(post.includes(evidence.calendar.url));
    assert.doesNotMatch(post, /3,899\.81/);
  }
});

test('rejects crossed bid and ask, unfinished bars, and non-official calendar URLs', () => {
  const invalid = structuredClone(evidence);
  invalid.chart.bid = invalid.chart.ask + 1;
  assert.throws(() => renderGoldDrafts('chart', invalid), /spread/);
  invalid.chart.bid = evidence.chart.bid;
  invalid.chart.h1CloseAt = '2026-11-02T12:00:00Z';
  assert.throws(() => renderGoldDrafts('chart', invalid), /timestamps/);
  invalid.calendar.url = 'https://example.org/release';
  assert.throws(() => renderGoldDrafts('calendar', invalid), /official source/);
  assert.throws(() => renderGoldDrafts('publish'), /Choose chart or calendar/);
});

const workspace = new URL('../../', import.meta.url);
const rawPath = new URL(evidence.chart.rawWorkspaceFile, workspace);
const analysisPath = new URL(evidence.chart.analysisWorkspaceFile, workspace);
test('local chart facts match the original archive and derived evidence', {
  skip: !existsSync(rawPath) || !existsSync(analysisPath)
}, () => {
  const rawBytes = readFileSync(rawPath);
  const analysisBytes = readFileSync(analysisPath);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(rawBytes), evidence.chart.rawSha256);
  assert.equal(hash(analysisBytes), evidence.chart.analysisSha256);
  const raw = JSON.parse(rawBytes);
  const derived = JSON.parse(analysisBytes);
  assert.equal(raw.captured_utc, evidence.chart.observedAt);
  assert.equal(raw.gold_tick.bid, evidence.chart.bid);
  assert.equal(raw.gold_tick.ask, evidence.chart.ask);
  assert.equal(raw.bars.H1.at(-2).close, evidence.chart.h1Close);
  assert.equal(derived.generated_utc, evidence.chart.analysedAt);
  assert.equal(derived.timeframes.H1.ema200, evidence.chart.h1Ema200);
  assert.equal(derived.timeframes.H1.last_closed_end_utc_current_offset, evidence.chart.h1CloseAt);
  for (const [label, range] of [['H1 S1', evidence.chart.swingLows], ['H1 R1', evidence.chart.swingHighs]]) {
    const band = derived.chart_areas.H1.find(area => area.label === label);
    assert.deepEqual([band.area_low, band.area_high], range);
  }
});
