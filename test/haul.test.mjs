import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHaul, summarize, MAX_LINES, MAX_LEN } from '../public/haul.js';
import { claimTargets } from '../public/verdict.js';

const persona = (n) => JSON.parse(readFileSync(new URL(`../public/personas/${n}/scores.json`, import.meta.url))).concerns;

test('prices count only with a $ sign; commas and cents work; the price is removed from the name', () => {
  const [a, b, c, d] = parseHaul('Vitamin C serum $38 - fades dark spots\nSPF 30 sunscreen 10% niacinamide\nCream $1,250.50\nEye cream $9.5');
  assert.equal(a.price, 38); assert.equal(a.name, 'Vitamin C serum - fades dark spots');
  assert.equal(b.price, null);                       // "30" and "10%" are not prices
  assert.equal(c.price, 1250.5);
  assert.equal(d.price, 9.5);
});

test('claims and ingredient names map to concerns; oil-free and named oils do not mean oiliness', () => {
  const t = (s) => parseHaul(s)[0].targets;
  assert.deepEqual(t('Fades dark spots'), ['age_spot']);
  assert.ok(t('Niacinamide 10% + zinc').includes('pore'));
  assert.ok(t('2% BHA liquid').includes('acne'));
  assert.deepEqual(claimTargets('Oil-free moisturizer'), ['moisture']);
  assert.equal(claimTargets('Jojoba oil cleanser').includes('oiliness'), false);
  assert.equal(claimTargets('Controls excess oil').includes('oiliness'), true);
  assert.equal(claimTargets('confirmed results').includes('firmness'), false);
  assert.deepEqual(t('Plain ceramic mug $5'), []);
});

test('summary: only skipped prices count as kept; close and unmappable lines are excluded and flagged', () => {
  const s = summarize(parseHaul('Vitamin C serum $38 fades dark spots\nRedness calming cream $12\nMystery thing $10\nPore clay mask $22\nHydrating gel cream $24'), persona('s2'));
  const v = (name) => s.rows.find((r) => r.name.startsWith(name)).v.verdict;
  assert.equal(v('Vitamin'), 'skip');
  assert.equal(v('Redness'), 'skip');
  assert.equal(v('Mystery'), 'inconclusive');
  assert.equal(v('Pore'), 'close');                  // within the pore noise margin
  assert.equal(v('Hydrating'), 'partial');
  assert.equal(s.skipCount, 2);
  assert.equal(s.keep, 50);                          // only the two skips
  assert.equal(s.spend, 24);                         // the partial
  assert.equal(s.unsure, 32);                        // unmappable $10 + close $22
});

test('limits: at most 15 lines of 200 characters, blank lines ignored, no input throws', () => {
  assert.equal(parseHaul(Array(40).fill('serum $5').join('\n')).length, MAX_LINES);
  assert.equal(parseHaul('x'.repeat(5000))[0].line.length, MAX_LEN);
  assert.deepEqual(parseHaul('\n   \n'), []);
  assert.deepEqual(summarize([], persona('s1')).rows, []);
});

test('every shelf product has a demo price, and every place that shows a shelf total says "demo prices"', () => {
  const products = JSON.parse(readFileSync(new URL('../public/products.json', import.meta.url)));
  for (const p of products) assert.ok(Number.isFinite(p.price) && p.price > 0, p.id);
  const src = (f) => readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
  assert.match(src('try.js'), /keeps \$\{money\(.*\)\} \(demo prices\)/s);
  assert.match(src('try.js'), /Demo prices, made up for the demo\./);
});
