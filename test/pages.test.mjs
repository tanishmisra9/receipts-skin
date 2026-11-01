import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const PUB = new URL('../public/', import.meta.url);
const PAGES = { '/': 'index.html', '/try/': 'try/index.html', '/how/': 'how/index.html', '/evidence/': 'evidence/index.html', '/store/': 'store/index.html' };
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
  for (const f of ['site.js', 'try.js', 'landing.js', 'receipt.js', 'how.js', 'evidence.js', 'evidence-data.js', 'store.js', 'haul.js', 'card.js', 'camera.js', 'sim.js']) {
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
  for (const f of ['index.html', 'try/index.html', 'how/index.html', 'try.js', 'landing.js', 'receipt.js', 'site.js', 'how.js']) {
    assert.ok(!readFileSync(new URL(f, PUB), 'utf8').includes('—'), `${f} contains an em dash`);
  }
});

test('every class used in the static markup exists in styles.css (catches markup ahead of the stylesheet)', () => {
  const css = readFileSync(new URL('styles.css', PUB), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const missing = [];
  for (const [url, h] of Object.entries(html)) {
    const classes = new Set([...h.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
    for (const c of classes) if (!new RegExp(`\\.${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(css)) missing.push(`${url} .${c}`);
  }
  assert.deepEqual(missing, []);
});

test('How it works stays scannable: at most 260 visible words outside the collapsed rows', () => {
  const main = html['/how/'].match(/<main[\s\S]*<\/main>/)[0];
  const visible = main.replace(/<details[\s\S]*?<\/details>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
  const words = visible.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  assert.ok(words <= 260, `How page shows ${words} words, budget is 260`);
});

test('dev server never lets the browser reuse a stale file (no-store), and redirects folders like Vercel', async () => {
  const { spawn } = await import('node:child_process');
  const port = 18080 + Math.floor(Math.random() * 500);
  const srv = spawn('node', ['scripts/dev.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  try {
    let res;
    for (let i = 0; i < 40 && !res; i++) { try { res = await fetch(`http://localhost:${port}/styles.css`); } catch { await new Promise((r) => setTimeout(r, 100)); } }
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const dir = await fetch(`http://localhost:${port}/try`, { redirect: 'manual' });
    assert.equal(dir.status, 308); assert.equal(dir.headers.get('location'), '/try/');
  } finally { srv.kill(); }
});

test('data-reveal never sits on .btn, .card or .sample (they own a hover transform the reveal would override)', () => {
  const bad = [];
  for (const [url, h] of Object.entries(html))
    for (const m of h.matchAll(/<[a-z0-9]+\s[^>]*data-reveal[^>]*>/g)) if (/class="[^"]*\b(btn|card|sample)\b/.test(m[0])) bad.push(`${url} ${m[0]}`);
  assert.deepEqual(bad, []);
});

test('scroll reveal: every page script that has data-reveal imports reveal.js and calls reveal() after rendering (it releases the data-wait blocks)', () => {
  assert.match(readFileSync(new URL('reveal.js', PUB), 'utf8'), /export const reveal\b/);
  assert.ok(!readFileSync(new URL('site.js', PUB), 'utf8').includes('reveal.js'), 'site.js must not import reveal.js (it would run before content exists)');
  const script = { '/': 'landing.js', '/try/': 'try.js', '/how/': 'how.js', '/evidence/': 'evidence.js', '/store/': 'store.js' };
  for (const [url, f] of Object.entries(script)) {
    assert.ok(html[url].includes('data-reveal'), `${url} has nothing to reveal`);
    assert.match(readFileSync(new URL(f, PUB), 'utf8'), /reveal\(/, `${f} never calls reveal()`);
  }
});

test('landing "go on" links: one row of three links with no separator text; no page uses the bare class "more" (the old store grid collided with it)', () => {
  for (const [url, h] of Object.entries(html)) assert.ok(!/class="(?:[^"]*\s)?more(?:\s[^"]*)?"/.test(h), `${url} uses class "more"`);
  assert.ok(!/\.more[\s{.,:]/.test(readFileSync(new URL('styles.css', PUB), 'utf8')), 'styles.css still defines .more');
  const row = html['/'].match(/<p\b[^>]*class="[^"]*\bgo-on\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(row, 'go-on row not found');
  assert.equal((row.match(/<a /g) || []).length, 3);
  assert.ok(!row.includes('·'));
});

test('load-in: every page hides its [data-reveal] blocks before first paint (inline lo script), starts from the header, and waits for fetched blocks', () => {
  const css = readFileSync(new URL('styles.css', PUB), 'utf8');
  assert.match(css, /\.lo \[data-reveal\]:not\(\.in\)/);
  assert.ok(!/\.rv\b/.test(css), 'old .rv classes are gone');
  assert.match(readFileSync(new URL('reveal.js', PUB), 'utf8'), /export const reveal/);
  for (const [url, h] of Object.entries(html)) {
    assert.match(h, /classList\.add\('lo'\)/, `${url} lacks the inline lo script`);
    assert.ok(h.indexOf("classList.add('lo')") < h.indexOf('rel="stylesheet"'), `${url}: lo must be set before the stylesheet, so first paint is already hidden`);
    assert.match(h, /<div class="wrap bar" data-reveal>/, `${url} header row is not revealed`);
  }
  for (const [url, wait] of Object.entries({ '/': 'class="tape" data-reveal data-wait', '/how/': 'data-reveal data-wait>', '/evidence/': 'data-reveal data-wait>', '/store/': 'data-reveal data-wait>' }))
    assert.ok(html[url].includes(wait), `${url} fetched block is not marked data-wait`);
});
