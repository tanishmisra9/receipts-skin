import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verdict, rankOf, claimTargets, SHOPPABLE, cut } from '../public/verdict.js';

const products = JSON.parse(readFileSync(new URL('../public/products.json', import.meta.url)));
const byId = Object.fromEntries(products.map((p) => [p.id, p]));
const all = (raw) => Object.fromEntries(SHOPPABLE.map((k) => [k, { raw }]));
const persona = (n) => JSON.parse(readFileSync(new URL(`../public/personas/${n}/scores.json`, import.meta.url))).concerns;
const v = (c, id) => verdict(c, byId[id]).verdict;

test('perfect skin: every product is a Skip (not a rubber stamp)', () => {
  for (const p of products) assert.equal(verdict(all(95), p).verdict, 'skip', p.id);
});

test('one weak concern: only its product Matches', () => {
  const c = { ...all(92), redness: { raw: 40 } };
  assert.equal(v(c, 'calm'), 'match');
  for (const p of products.filter((p) => p.id !== 'calm')) assert.equal(verdict(c, p).verdict, 'skip', p.id);
});

test('thresholds are exact: weak cut is exclusive, fine cut is exclusive', () => {
  const [WEAK, FINE] = cut('pore');
  const at = (raw) => verdict({ pore: { raw } }, byId['clay-mask']).verdict;
  assert.equal(at(WEAK - 0.01), 'match');
  assert.equal(at(WEAK), 'partial');
  assert.equal(at(FINE - 0.01), 'partial');
  assert.equal(at(FINE), 'skip');
});

test('hydration has its own lower cuts (the scanner reads it low on everyone)', () => {
  const [w, f] = cut('moisture');
  assert.deepEqual([w, f], [50, 65]);
  const at = (raw) => verdict({ moisture: { raw } }, byId['gel-cream']).verdict;
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
  assert.equal(v(s2, 'clay-mask'), 'match');  // s2 pore raw ~52
  assert.equal(v(s1, 'clay-mask'), 'skip');   // s1 pore raw ~94
  assert.equal(v(s3, 'toner'), 'match');      // s3 oiliness raw ~54
  assert.equal(v(s2, 'toner'), 'skip');       // s2 oiliness raw ~98
  assert.equal(v(s1, 'calm'), 'skip');        // s1 redness raw 100
  const rows = [s1, s2, s3].map((p) => products.map((x) => v(p, x.id)).join());
  assert.equal(new Set(rows).size, 3);        // three faces, three different shelves
});
