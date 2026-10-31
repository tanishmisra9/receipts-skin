import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const PUB = new URL('../public/', import.meta.url);
const PAGES = { '/': 'index.html', '/try/': 'try/index.html', '/how/': 'how/index.html' };
const html = Object.fromEntries(Object.entries(PAGES).map(([url, f]) => [url, readFileSync(new URL(f, PUB), 'utf8')]));
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b) + b.length);

test('header and footer are identical on every page (they are copied by hand, so this catches drift)', () => {
  for (const [a, b] of [['<!--site-header-->', '<!--/site-header-->'], ['<!--site-footer-->', '<!--/site-footer-->']]) {
    const blocks = Object.values(html).map((h) => between(h, a, b));
    assert.ok(blocks[0].length > 40, `${a} not found`);
    for (const x of blocks) assert.equal(x, blocks[0]);
  }
});

test('each page has exactly one h1, a unique title, a lang, and a skip target', () => {
  const titles = new Set();
  for (const [url, h] of Object.entries(html)) {
    // The Try page has one h1 per step; only the current step is visible (the rest are `hidden`).
    const steps = (h.match(/<section id="step-[a-z]+"[^>]*hidden/g) || []).length;
    const h1s = (h.match(/<h1[\s>]/g) || []).length;
    assert.equal(h1s, steps || 1, `${url} h1 count`);
    const title = h.match(/<title>([^<]+)<\/title>/)[1];
    assert.ok(!titles.has(title), `duplicate title on ${url}`); titles.add(title);
    assert.match(h, /<html lang="en">/);
    assert.match(h, /href="#main"/); assert.match(h, /id="main"/);
  }
});

test('every internal link and asset resolves to a real file', () => {
  const resolve = (ref) => {
    const path = ref.split('#')[0].split('?')[0];
    if (!path) return true;
    const f = new URL(`.${path}`, PUB);
    return existsSync(f) && (statSync(f).isFile() || existsSync(new URL('index.html', `${f.href}/`)));
  };
  for (const [url, h] of Object.entries(html)) {
    const refs = [...h.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
    assert.ok(refs.length > 5, `${url} found no refs`);
    for (const r of refs) assert.ok(resolve(r), `${url} -> ${r} does not exist`);
  }
});

test('module imports resolve (absolute paths, since pages sit at different depths)', () => {
  for (const f of ['site.js', 'try.js', 'landing.js', 'receipt.js']) {
    const src = readFileSync(new URL(f, PUB), 'utf8');
    for (const m of src.matchAll(/from '(\/[^']+)'/g)) assert.ok(existsSync(new URL(`.${m[1]}`, PUB)), `${f} imports missing ${m[1]}`);
  }
});

test('one document scroll: only the header is sticky; fixed is limited to the overlay, backdrop and skip link', () => {
  const css = readFileSync(new URL('styles.css', PUB), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*position:\s*(sticky|fixed)[^}]*)\}/g)].map((m) => [m[1].trim(), m[3]]);
  const sticky = rules.filter(([, p]) => p === 'sticky').map(([s]) => s);
  const fixed = rules.filter(([, p]) => p === 'fixed').map(([s]) => s).sort();
  assert.deepEqual(sticky, ['.site-header']);
  assert.deepEqual(fixed, ['.backdrop', '.overlay', '.skip']);
});

test('copy rule: no em dashes in any page or script', () => {
  for (const f of ['index.html', 'try/index.html', 'how/index.html', 'try.js', 'landing.js', 'receipt.js', 'site.js']) {
    assert.ok(!readFileSync(new URL(f, PUB), 'utf8').includes('—'), `${f} contains an em dash`);
  }
});
