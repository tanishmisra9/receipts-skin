import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeEvidence } from '../public/evidence-data.js';

const e = await computeEvidence((p) => JSON.parse(readFileSync(new URL(`../public/${p}`, import.meta.url))));

// These numbers are quoted in the README and write-up. If a rescan changes them, update the docs on purpose.
test('evidence: the flattering score flips 8 of 36 verdicts (same figure as scripts/recheck.py)', () => {
  assert.equal(e.flattery.total, 36);
  assert.equal(e.flattery.flips.length, 8);
});

test('evidence: photo changes, band and holdout counts match scripts/margins.py', () => {
  assert.deepEqual({ ...e.stability.ordinary }, { flips: 7, scans: 15, flagged: 4, comparisons: 180 });
  assert.deepEqual({ ...e.stability.holdout }, { flips: 6, scans: 12, flagged: 3, faces: 4, darkFlips: 6 });
  assert.deepEqual(e.stability.close, [3, 2, 1]);
});

test('evidence: five more faces, darker photo only, match scripts/margins.py and leave the figures above unchanged', () => {
  assert.deepEqual({ faces: e.extra.faces, flips: e.extra.flips, flagged: e.extra.flagged, comparisons: e.extra.comparisons }, { faces: 5, flips: 4, flagged: 3, comparisons: 60 });
});

test('evidence: previews are re-measured, and pore previews do not move the measured score', () => {
  assert.equal(e.previews.length, 5);
  assert.deepEqual(e.previews.filter((p) => p.call === 'within noise').map((p) => `${p.face} ${p.concern}`).sort(), ['s2 pore', 's3 pore']);
});
