import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verdict, rankOf, claimTargets, compareScans, combineScans, SHOPPABLE, cut } from '../public/verdict.js';

const products = JSON.parse(readFileSync(new URL('../public/products.json', import.meta.url)));
const byId = Object.fromEntries(products.map((p) => [p.id, p]));
const all = (raw) => Object.fromEntries(SHOPPABLE.map((k) => [k, { raw }]));
const persona = (n) => JSON.parse(readFileSync(new URL(`../public/personas/${n}/scores.json`, import.meta.url))).concerns;
const v = (c, id) => verdict(c, byId[id]).verdict;

test('perfect skin: every product is a Skip (not a rubber stamp)', () => {
  for (const p of products) assert.equal(verdict(all(95), p).verdict, 'skip', p.id);
});

test('one weak concern: only its product Matches', () => {
  const c = { ...all(98), redness: { raw: 40 } };
  assert.equal(v(c, 'calm'), 'match');
  for (const p of products.filter((p) => p.id !== 'calm')) assert.equal(verdict(c, p).verdict, 'skip', p.id);
});

test('thresholds are exact: weak cut is exclusive, fine cut is exclusive', () => {
  const [WEAK, FINE] = cut('pore');
  const at = (raw) => verdict({ pore: { raw } }, byId['clay-mask'], { band: false }).verdict;
  assert.equal(at(WEAK - 0.01), 'match');
  assert.equal(at(WEAK), 'partial');
  assert.equal(at(FINE - 0.01), 'partial');
  assert.equal(at(FINE), 'skip');
});

test('hydration has its own lower cuts (the scanner reads it low on everyone)', () => {
  const [w, f] = cut('moisture');
  assert.deepEqual([w, f], [50, 65]);
  const at = (raw) => verdict({ moisture: { raw } }, byId['gel-cream'], { band: false }).verdict;
  assert.equal(at(w - 0.01), 'match');
  assert.equal(at(w), 'partial');
  assert.equal(at(f), 'skip');
});

test('multi-target product is decided by its weakest target', () => {
  const c = { age_spot: { raw: 95 }, radiance: { raw: 50 } };
  const r = verdict(c, byId['vit-c']);
  assert.equal(r.verdict, 'match');
  assert.equal(r.evidence[0].concern, 'radiance');
});

test('missing or non-numeric target is inconclusive, never a guess', () => {
  assert.equal(verdict({}, byId['clay-mask']).verdict, 'inconclusive');
  assert.equal(verdict({ pore: { raw: 'x' } }, byId['clay-mask']).verdict, 'inconclusive');
  assert.equal(verdict({ pore: { raw: NaN } }, byId['clay-mask']).verdict, 'inconclusive');
  assert.equal(verdict(all(10), { targets: [] }).verdict, 'inconclusive');
});

test('ties rank deterministically by key', () => {
  const c = all(50);
  assert.equal(rankOf(c, 'acne').rank, 1);
  assert.equal(rankOf(c, 'wrinkle').rank, SHOPPABLE.length);
});

test('claim box maps keywords to concerns', () => {
  assert.deepEqual(claimTargets('Fades dark spots and boosts glow'), ['age_spot', 'radiance']);
  assert.deepEqual(claimTargets('nothing relevant here'), []);
});

// Real scans (committed stock faces). Different faces must get different verdicts.
test('real personas: verdicts differ and follow the measured scores', () => {
  const s1 = persona('s1'), s2 = persona('s2'), s3 = persona('s3');
  assert.equal(v(s2, 'clay-mask'), 'close');  // s2 pore raw ~52, within the pore photo-noise margin of the 65 cut-off
  assert.equal(verdict(s2, byId['clay-mask'], { band: false }).verdict, 'match');
  assert.equal(v(s1, 'clay-mask'), 'skip');   // s1 pore raw ~94
  assert.equal(v(s3, 'toner'), 'match');      // s3 oiliness raw ~54
  assert.equal(v(s2, 'toner'), 'skip');       // s2 oiliness raw ~98
  assert.equal(v(s1, 'calm'), 'skip');        // s1 redness raw 100
  const rows = [s1, s2, s3].map((p) => products.map((x) => v(p, x.id)).join());
  assert.equal(new Set(rows).size, 3);        // three faces, three different shelves
});

// A score inside its concern's photo-noise margin of either cut-off is 'close': too close to call from one photo.
test('close state: strictly inside the margin of a cut-off, exact at the margin, with the margin on the result', () => {
  const [WEAK, FINE] = cut('eye_bag');
  const m = verdict({ eye_bag: { raw: 90 } }, byId['eye-roll']).margin; // eye_bag margin is its own number
  assert.ok(m > 0);
  const at = (raw) => verdict({ eye_bag: { raw } }, byId['eye-roll']);
  assert.equal(at(WEAK + m - 0.01).verdict, 'close');
  assert.equal(at(WEAK - m + 0.01).verdict, 'close');
  assert.equal(at(WEAK - m).verdict, 'match');
  assert.equal(at(WEAK + m).verdict, 'partial');
  assert.equal(at(FINE - m + 0.01).verdict, 'close');
  assert.equal(at(FINE + m).verdict, 'skip');
  assert.equal(at(WEAK + m - 0.01).dist < m, true);
  assert.equal(verdict({ eye_bag: { raw: WEAK } }, byId['eye-roll'], { band: false }).verdict, 'partial');
});

test('compareScans: only a change beyond the photo-noise margin counts, and side effects are listed', () => {
  const before = { eye_bag: { raw: 60 }, redness: { raw: 70 }, wrinkle: { raw: 50 } };
  const m = (k) => verdict({ [k]: { raw: 50 } }, { targets: [k] }).margin;
  const after = (d, extra = {}) => ({ eye_bag: { raw: 60 + d }, redness: { raw: 70 }, wrinkle: { raw: 50 }, ...extra });
  assert.equal(compareScans(before, after(m('eye_bag') + 0.1), 'eye_bag').call, 'improved');
  assert.equal(compareScans(before, after(m('eye_bag')), 'eye_bag').call, 'within noise');
  assert.equal(compareScans(before, after(-m('eye_bag') - 0.1), 'eye_bag').call, 'worse');
  assert.deepEqual(compareScans(before, after(0, { redness: { raw: 70 + m('redness') + 1 } }), 'eye_bag').others.map((o) => o.concern), ['redness']);
  assert.equal(compareScans(before, { eye_bag: {} }, 'eye_bag'), null);
});

test('combineScans: averages raw, keeps the same margin, can resolve a close verdict but never invents one', () => {
  const [WEAK] = cut('eye_bag');
  const a = { concerns: { eye_bag: { raw: WEAK + 1, ui: 90, mask: 'a.png' } } };
  const farther = { concerns: { eye_bag: { raw: WEAK + 15, ui: 90 } } };  // a second photo that reads healthier
  const nearer = { concerns: { eye_bag: { raw: WEAK + 1, ui: 90 } } };    // a second photo that agrees
  const p = byId['eye-roll'];
  assert.equal(verdict({ eye_bag: a.concerns.eye_bag }, p).verdict, 'close');
  const m = combineScans(a, farther);
  assert.equal(m.concerns.eye_bag.raw, WEAK + 8);
  assert.equal(m.photos, 2);
  assert.equal(m.concerns.eye_bag.mask, 'a.png');                          // no masks on b, so a's are kept
  assert.equal(verdict(m.concerns, p).verdict, 'partial');                 // resolved
  assert.equal(verdict(combineScans(a, nearer).concerns, p).verdict, 'close'); // still too close
  assert.equal(combineScans(m, farther).photos, 3);
});

test('the rule reads only { concern: { raw } }: plain hand-made scores work with no vendor fields, and a missing score is Unclear', () => {
  const p = { id: 'x', name: 'x', targets: ['pore'] };
  assert.equal(verdict({ pore: { raw: 30 } }, p).verdict, 'match');
  assert.equal(verdict({ pore: { raw: 99 } }, p).verdict, 'skip');
  assert.equal(verdict({}, p).verdict, 'inconclusive');
});
