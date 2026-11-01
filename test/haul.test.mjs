import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHaul, summarize, listNote, MAX_LINES, MAX_LEN } from '../public/haul.js';
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

test('limits: at most 15 lines of 1500 characters, blank lines ignored, no input throws', () => {
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

const INCI = 'Aqua, Glycerin, Propanediol, Niacinamide, Zinc PCA, Sodium Hyaluronate, Panthenol, Squalane, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Xanthan Gum, Phenoxyethanol, Ethylhexylglycerin, Citric Acid, Retinyl Palmitate';

test('ingredient list: not cut at 200 characters, actives found with their position, claim words and "Seed Oil" never misfire', () => {
  assert.ok(INCI.length > 200);
  const [r] = parseHaul(`Night serum $42: ${INCI}`);
  assert.equal(r.price, 42); assert.equal(r.name, 'Night serum');
  assert.ok(r.line.includes('Retinyl Palmitate'));                        // past character 200: kept
  assert.deepEqual(r.list.map((x) => [x.active, x.position]), [['Niacinamide', 4], ['Zinc PCA', 5], ['Sodium Hyaluronate', 6], ['Panthenol', 7], ['Retinyl Palmitate', 15]]);
  assert.ok(r.targets.includes('pore') && r.targets.includes('moisture') && r.targets.includes('wrinkle'));
  assert.equal(r.targets.includes('oiliness'), true);                     // from niacinamide and zinc PCA, named actives ...
  assert.equal(parseHaul(INCI.replace('Niacinamide, ', '').replace('Zinc PCA, ', ''))[0].targets.includes('oiliness'), false); // ... never from "Seed Oil"
});

test('ingredient list: a late active still counts and reports where it sits; a list with no known active gives no verdict; short prose is not a list', () => {
  assert.equal(parseHaul(INCI)[0].name, 'Ingredient list (15 ingredients)');
  assert.equal(listNote(parseHaul(INCI)[0]).includes('Retinyl Palmitate (ingredient 15)'), true);
  const none = summarize(parseHaul('Aqua, Glycerin, Propanediol, Squalane, Tocopherol, Xanthan Gum, Phenoxyethanol, Citric Acid'), persona('s1')).rows[0];
  assert.equal(none.v.verdict, 'inconclusive'); assert.match(none.v.reason, /recognise/);
  assert.equal(listNote(parseHaul('Aqua, Glycerin, Propanediol, Squalane, Tocopherol, Xanthan Gum, Phenoxyethanol, Citric Acid')[0]), null); // the reason already says it; no second sentence
  const prose = parseHaul('Fades dark spots, evens tone, brightens, smooths')[0];
  assert.equal(prose.list, undefined); assert.deepEqual(prose.targets.sort(), ['age_spot', 'radiance', 'texture']);
  assert.equal(listNote(prose), null);
});

test('ingredient list: positions follow the label (1,2-Hexanediol is one item, brackets are not split), the label is not an ingredient, preservatives are not actives', () => {
  const pos = (s) => Object.fromEntries(parseHaul(s)[0].list.map((x) => [x.active, x.position]));
  assert.equal(pos('Aqua, Glycerin, Propanediol, 1,2-Hexanediol, Niacinamide, Panthenol, Tocopherol, Xanthan Gum').Niacinamide, 5);
  assert.equal(pos('Aqua, Glycerin, Propanediol, Phenoxyethanol, Tocopherol, Xanthan Gum, Citric Acid, Retinol (Vitamin A)').Retinol, 8);
  assert.equal(parseHaul('Aqua, Glycerin, Propanediol, Squalane, Tocopherol, Xanthan Gum, Citric Acid, Panthenol, Retinol (Vitamin A, Stabilised), Urea')[0].list.at(-1).position, 10);
  const [a] = parseHaul('Retinol night serum $42: Aqua, Glycerin, Propanediol, Squalane, Tocopherol, Xanthan Gum, Phenoxyethanol, Citric Acid');
  assert.equal(a.name, 'Retinol night serum'); assert.deepEqual(a.list, []); assert.deepEqual(a.targets, []); // retinol is in the name, not the list
  const pres = parseHaul('Aqua, Glycerin, Propanediol, Squalane, Tocopherol, Xanthan Gum, Phenoxyethanol, Diazolidinyl Urea, Butylated Hydroxyanisole (BHA)')[0];
  assert.deepEqual(pres.targets, []);                                      // a preservative and an antioxidant are not moisturiser or salicylic acid
  assert.deepEqual(parseHaul('Aqua, Glycerin, Propanediol, Squalane, Tocopherol, Xanthan Gum, Phenoxyethanol, Urea')[0].targets, ['moisture']);
});

test('a long marketing line with several claims stays prose and keeps its claim words', () => {
  const [r] = parseHaul('Glow serum $30 - fades dark spots, evens tone, brightens, smooths, hydrates, plumps, firms, soothes');
  assert.equal(r.list, undefined);
  for (const k of ['age_spot', 'moisture', 'firmness', 'redness', 'radiance']) assert.ok(r.targets.includes(k), k);
});
