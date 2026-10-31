import { verdict, claimTargets, SHOPPABLE, LABEL, cut } from '/verdict.js';
import { icon } from '/icons.js';
import { esc, VERDICT, VICON, band, receiptHTML } from '/receipt.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fetchJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let products = [], personas = [], current = null, photoSrc = '', currentAr = 0.8, activeId = null, filter = 'all';
let sel = null, pushed = false, lastFocus = null;
let scanning = false, abortCtl = null, timerId = null;

// ---------- static chrome ----------
$('dropIcon').innerHTML = icon('upload', 28);
$('shieldIcon').innerHTML = icon('shield-check', 18);
$('ovPrev').innerHTML = icon('chevron-left', 22);
$('ovNext').innerHTML = icon('chevron-right', 22);
$('ovClose').innerHTML = icon('x', 22);
$('tips').innerHTML = [['scan-face', 'Face the camera, head level'], ['glasses', 'Glasses off'], ['sun', 'Even light, no harsh shadows'], ['user', 'Hair back, forehead clear']]
  .map(([i, t]) => `<li>${icon(i, 18)}<span>${t}</span></li>`).join('');

function status(msg, err = false) {
  const s = $('status');
  s.textContent = msg || ''; s.className = 'status' + (err ? ' err' : '');
  s.setAttribute('role', err ? 'alert' : 'status');
}

// ---------- steps ----------
const ORDER = ['choose', 'analyze', 'results'];
const TITLES = { choose: 'Try Receipts: pick a face', analyze: 'Reading your skin | Receipts', results: 'Your shelf | Receipts' };
function showStep(name, { focus = true } = {}) {
  ORDER.forEach((s) => { $(`step-${s}`).hidden = s !== name; });
  const i = ORDER.indexOf(name);
  document.querySelectorAll('#stepper li').forEach((li, idx) => {
    li.classList.toggle('done', idx < i);
    if (idx === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
  document.title = TITLES[name];
  if (focus) { window.scrollTo(0, 0); $(`h-${name}`).focus({ preventScroll: true }); }
}

// ---------- a photo with a mask (and optional before/after preview) ----------
function makeView(box, { img, maskEl, tag, sim, line, cmp, toggle }) {
  let mode = 'measured', mask = null, simSrc = null;
  const sweepIn = () => {
    box.classList.remove('sweep'); box.style.setProperty('--pos', '100%'); cmp.value = 100;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      box.classList.add('sweep'); box.style.setProperty('--pos', '50%'); cmp.value = 50;
      setTimeout(() => box.classList.remove('sweep'), 1000);
    }));
  };
  function draw() {
    const preview = mode === 'preview' && !!simSrc;
    if (toggle) { toggle.hidden = !simSrc; toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mode))); }
    if (sim) {
      const entering = preview && sim.hidden;
      [sim, line, cmp].forEach((e) => { e.hidden = !preview; });
      if (preview) { sim.src = simSrc; if (entering) sweepIn(); }
    }
    if (preview) {
      maskEl.classList.remove('on'); box.classList.remove('hasmask');
      tag.textContent = 'Before | predicted after, not a promise'; tag.hidden = false;
      return;
    }
    const src = mask && current.concerns[mask.concern]?.mask;
    box.classList.toggle('hasmask', !!src);
    maskEl.classList.remove('on');
    if (!src) { maskEl.hidden = true; tag.hidden = true; return; }
    maskEl.hidden = false; maskEl.src = src;
    (maskEl.decode ? maskEl.decode().catch(() => {}) : Promise.resolve()).then(() => requestAnimationFrame(() => maskEl.classList.add('on')));
    tag.textContent = mask.text; tag.hidden = false;
  }
  if (cmp) cmp.addEventListener('input', (e) => box.style.setProperty('--pos', `${e.target.value}%`));
  if (toggle) toggle.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.v; draw(); }));
  return {
    set(src, alt) { img.src = src; img.alt = alt; },
    show(concern, text) { mask = concern ? { concern, text } : null; mode = 'measured'; draw(); },
    setSim(src) { simSrc = src || null; mode = 'measured'; draw(); },
    clear() { mask = null; simSrc = null; mode = 'measured'; draw(); },
  };
}

const mainView = makeView($('photo'), { img: $('photoImg'), maskEl: $('maskImg'), tag: $('tag') });
const ovView = makeView($('ovPhoto'), { img: $('ovImg'), maskEl: $('ovMask'), tag: $('ovTag'), sim: $('ovSim'), line: $('ovLine'), cmp: $('ovCmp'), toggle: $('ovToggle') });

// ---------- results ----------
const ranked = () => { const c = current.concerns; return SHOPPABLE.filter((k) => c[k]).sort((a, b) => c[a].raw - c[b].raw); };
const rows = () => products.map((p) => ({ p, v: verdict(current.concerns, p) }));

function renderBars() {
  const c = current.concerns;
  $('bars').innerHTML = ranked().map((k) => {
    const [w, f] = cut(k);
    return `<button class="bar-row" data-k="${k}" type="button" aria-pressed="false" aria-label="${LABEL[k]}: ${Math.round(c[k].raw)} out of 100">
      <span class="name">${LABEL[k]}</span>
      <span class="track"><span class="fill ${band(c[k].raw, k)}" style="width:${c[k].raw}%"></span><span class="tick" style="left:${w}%"></span><span class="tick" style="left:${f}%"></span></span>
      <b class="num">${Math.round(c[k].raw)}</b></button>`;
  }).join('');
  $('bars').querySelectorAll('.bar-row').forEach((b) => b.addEventListener('click', () => showBarMask(b.dataset.k)));
}
function showBarMask(k) {
  mainView.show(k, `${LABEL[k]} ${Math.round(current.concerns[k].raw)}/100`);
  document.querySelectorAll('.bar-row').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
}

function renderShelf() {
  const r = rows();
  const n = (k) => r.filter((x) => x.v.verdict === k).length;
  const opts = [['all', `All ${r.length}`], ['match', `Match ${n('match')}`], ['partial', `Partial ${n('partial')}`], ['skip', `Skip ${n('skip')}`]];
  $('filters').innerHTML = opts.map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}" type="button">${t}</button>`).join('');
  $('filters').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderShelf(); }));
  $('shelfGrid').innerHTML = r.filter((x) => filter === 'all' || x.v.verdict === filter).map(({ p, v }) => `
    <button class="card" data-id="${p.id}" type="button">
      <span class="badge b-${v.verdict}">${icon(VICON[v.verdict], 14)}${VERDICT[v.verdict]}</span>
      <span class="brand">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span><span class="claim">${esc(p.claim)}</span>
    </button>`).join('');
  $('shelfGrid').querySelectorAll('.card').forEach((b) => b.addEventListener('click', () => openReceipt(products.find((p) => p.id === b.dataset.id), b)));
}

function renderResults() {
  const r = rows();
  const n = (k) => r.filter((x) => x.v.verdict === k).length;
  const worth = n('match') + n('partial');
  $('resKicker').textContent = current.label;
  $('h-results').textContent = `${worth} of ${r.length} products are worth your money.`;
  const st = current.skin_type?.whole;
  $('meta').textContent = [`${n('skip')} ${n('skip') === 1 ? 'is a Skip' : 'are a Skip'}`, st && `${cap(st.toLowerCase())} skin`, current.skin_age && `skin age ${current.skin_age}`, current.maskNote].filter(Boolean).join(' · ');
  root.style.setProperty('--ar', String(currentAr));
  mainView.set(photoSrc, `Face being analyzed (${current.label})`);
  filter = 'all';
  renderBars(); renderShelf();
  const weakest = ranked()[0];
  if (weakest) showBarMask(weakest);
  const top = r.find((x) => x.v.verdict === 'match') ?? r.find((x) => x.v.verdict === 'partial');
  $('topMatch').hidden = !top;
  if (top) { $('topMatch').textContent = `Open your top ${top.v.verdict}: ${top.p.name}`; $('topMatch').onclick = (e) => openReceipt(top.p, e.currentTarget); }
}

// ---------- receipt overlay: focus trap, inert page, scroll lock, focus return ----------
const pageParts = () => [$('main'), document.querySelector('.site-header'), document.querySelector('footer')];
const isOpen = () => $('overlay').dataset.open === 'true';
const visibleIds = () => [...$('shelfGrid').querySelectorAll('.card')].map((c) => c.dataset.id);

function fillOverlay(p, title) {
  const { html, e0 } = receiptHTML(current.concerns, current.label, p, title);
  $('ovReceipt').innerHTML = html;
  root.style.setProperty('--ar', String(currentAr));
  ovView.set(photoSrc, e0 ? `${current.label}, ${LABEL[e0.concern]}` : current.label);
  ovView.setSim(e0 && current.sim?.[e0.concern]);
  ovView.show(e0?.concern, e0 ? `${LABEL[e0.concern]} ${Math.round(e0.raw)}/100` : '');
  const ids = visibleIds(), i = ids.indexOf(p.id);
  $('ovNav').hidden = i < 0;
  $('ovCount').textContent = i < 0 ? '' : `${i + 1} of ${ids.length}`;
  $('ovPrev').disabled = i <= 0; $('ovNext').disabled = i < 0 || i >= ids.length - 1;
}

function openReceipt(p, trigger, title, { push = true } = {}) {
  sel = p;
  fillOverlay(p, title);
  if (!isOpen()) {
    lastFocus = trigger || document.activeElement;
    $('overlay').dataset.open = 'true'; $('backdrop').dataset.open = 'true';
    root.style.overflow = 'hidden';
    pageParts().forEach((e) => e.setAttribute('inert', ''));
    requestAnimationFrame(() => $('ovClose').focus());
    addEventListener('keydown', overlayKeys);
    if (push) {
      const q = new URLSearchParams(location.search); q.set('p', p.id);
      history.pushState(null, '', `?${q}`); pushed = true;
    }
  }
}
function hideOverlay() {
  if (!isOpen()) return;
  $('overlay').dataset.open = 'false'; $('backdrop').dataset.open = 'false';
  root.style.overflow = '';
  pageParts().forEach((e) => e.removeAttribute('inert'));
  removeEventListener('keydown', overlayKeys);
  pushed = false; sel = null;
  if (lastFocus?.isConnected) lastFocus.focus();
}
function closeReceipt() {
  if (!isOpen()) return;
  if (pushed) history.back(); // popstate closes it, so Back and the close button agree
  else { const q = new URLSearchParams(location.search); q.delete('p'); history.replaceState(null, '', q.toString() ? `?${q}` : location.pathname); hideOverlay(); }
}
function step(delta) {
  const ids = visibleIds(), i = ids.indexOf(sel?.id), next = products.find((p) => p.id === ids[i + delta]);
  if (!next) return;
  sel = next; fillOverlay(next);
  const q = new URLSearchParams(location.search); q.set('p', next.id); history.replaceState(null, '', `?${q}`);
}
function overlayKeys(e) {
  if (e.key === 'Escape') { closeReceipt(); return; }
  if (e.target.type !== 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !$('ovNav').hidden) { step(e.key === 'ArrowLeft' ? -1 : 1); return; }
  if (e.key !== 'Tab') return;
  const f = [...$('overlay').querySelectorAll('button:not([disabled]), input:not([hidden]), a[href]')].filter((el) => !el.closest('[hidden]'));
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
}
$('backdrop').addEventListener('click', closeReceipt);
$('ovClose').addEventListener('click', closeReceipt);
$('ovPrev').addEventListener('click', () => step(-1));
$('ovNext').addEventListener('click', () => step(1));

function syncOverlay(pid) {
  const p = pid && products.find((x) => x.id === pid);
  if (p) openReceipt(p, document.activeElement, undefined, { push: false });
  else hideOverlay();
}

// ---------- claim box ----------
$('claimForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('claim').value.trim(); if (!text || !current) return;
  const targets = claimTargets(text);
  if (!targets.length) { status('We could not map that to something we measure. Try words like pores, dark spots, hydration, redness, wrinkles or glow.', true); return; }
  status('');
  openReceipt({ id: '_claim', name: text, targets }, e.submitter, `"${text}"`);
});

// ---------- loading faces ----------
function load(data, src, label, ar, id) {
  current = { ...data, label }; photoSrc = src; currentAr = ar; activeId = id;
  renderResults();
}
async function loadPersona(id) {
  const p = personas.find((x) => x.id === id);
  const base = `/personas/${p.dir ? p.dir + '/' : ''}${id}`;
  const data = await fetchJSON(`${base}/scores.json`);
  for (const k of Object.keys(data.concerns)) if (data.concerns[k].mask) data.concerns[k].mask = `${base}/${data.concerns[k].mask}`;
  if (p.sim) {
    const m = await fetchJSON(`${base}/sim.json`);
    data.sim = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, `${base}/${v.file}`]));
  }
  load(data, `${base}/photo.jpg`, p.label, p.ar ?? 0.8, id);
}

// ---------- live scan ----------
// The API returns each mask as `maskUrl`; the page reads `mask` (saved samples use a file path).
const withMasks = (s) => { for (const c of Object.values(s.concerns)) c.mask = c.maskUrl ?? null; return s; };
const SESSION_KEY = 'receipts.scan';
const MASK_TTL_MS = 110 * 60 * 1000; // YouCam mask links last about 2 hours
function saveScan(scan) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...scan, t: Date.now() })); } catch { /* storage full or blocked: results still show, only a refresh loses them */ } }
function restoreScan() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!s?.scores) return false;
    const expired = Date.now() - s.t > MASK_TTL_MS;
    if (expired) for (const k of Object.keys(s.scores.concerns)) s.scores.concerns[k].mask = null;
    load({ ...s.scores, maskNote: expired ? 'Masks from a live scan expire after about 2 hours' : null }, s.photoSrc, 'Your scan', s.ar, '__me');
    return true;
  } catch { return false; }
}

function resize(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((b) => b ? res({ blob: b, dataUrl: c.toDataURL('image/jpeg', .85), ar: c.width / c.height }) : rej(new Error('Could not read that image.')), 'image/jpeg', .85);
    };
    img.onerror = () => rej(new Error('Could not read that image. Try a JPG or PNG.'));
    img.src = url;
  });
}
const sleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }, { once: true }); });

function setStage(name) {
  const order = ['upload', 'measure', 'masks']; const i = order.indexOf(name);
  document.querySelectorAll('#stages li').forEach((li, idx) => { li.classList.toggle('done', idx < i); li.classList.toggle('now', idx === i); if (idx === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
}
function startTimer() { const t0 = Date.now(); $('timer').textContent = '0s'; timerId = setInterval(() => { $('timer').textContent = `${Math.round((Date.now() - t0) / 1000)}s`; }, 1000); }
function stopTimer() { clearInterval(timerId); timerId = null; }

async function startScan(file) {
  if (scanning) return;
  if (!file.type.startsWith('image/')) { status('That file is not an image. Try a JPG or PNG.', true); return; }
  status('');
  scanning = true; abortCtl = new AbortController();
  $('anError').hidden = true; $('cancelBtn').hidden = false; $('anPhoto').classList.add('scanning');
  setStage('upload'); startTimer();
  history.pushState(null, '', '?scan=1');
  showStep('analyze');
  try {
    const { blob, dataUrl, ar } = await resize(file);
    $('anImg').src = dataUrl; root.style.setProperty('--ar', String(ar));
    const start = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob, signal: abortCtl.signal });
    const sj = await start.json();
    if (!start.ok) throw new Error(sj.message || 'Scan failed.');
    setStage('measure');
    for (let i = 0; i < 40; i++) {
      await sleep(3000, abortCtl.signal);
      const j = await (await fetch(`/api/scan?task=${encodeURIComponent(sj.task)}`, { signal: abortCtl.signal })).json();
      if (j.status === 'running') continue;
      if (j.status !== 'success') throw new Error(j.message || 'Scan failed.');
      setStage('masks');
      const scores = withMasks(j.scores);
      saveScan({ scores, photoSrc: dataUrl, ar });
      scanning = false; stopTimer();
      load(scores, dataUrl, 'Your scan', ar, '__me');
      history.replaceState(null, '', '?scan=1');
      showStep('results');
      return;
    }
    throw new Error('That took too long. Please try again.');
  } catch (e) {
    if (e.name === 'AbortError') return; // user cancelled
    scanning = false; stopTimer();
    $('anPhoto').classList.remove('scanning'); $('cancelBtn').hidden = true;
    $('anErrorText').textContent = `${e.message} Failed scans cost nothing, so feel free to retry.`;
    $('anError').hidden = false; $('retryBtn').focus();
  }
}
function cancelScan() { abortCtl?.abort(); scanning = false; stopTimer(); }
$('cancelBtn').addEventListener('click', () => { cancelScan(); history.back(); });
$('retryBtn').addEventListener('click', () => { history.replaceState(null, '', location.pathname); showChoose(); $('file').click(); });

$('file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) startScan(f); });
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) startScan(f); });


// ---------- routing: the URL is the state ----------
function showChoose(msg) { showStep('choose'); status(msg || '', !!msg); }
async function route() {
  const q = new URLSearchParams(location.search);
  const face = q.get('face'), scan = q.get('scan'), p = q.get('p');
  if (face) {
    if (!personas.some((x) => x.id === face)) { showChoose('We could not find that face. Pick one below.'); return; }
    if (activeId !== face) await loadPersona(face);
    showStep('results', { focus: !p }); syncOverlay(p); return;
  }
  if (scan) {
    if (scanning) { showStep('analyze'); return; }
    if (activeId === '__me' || restoreScan()) { showStep('results', { focus: !p }); syncOverlay(p); return; }
    showChoose('Your scan was not saved. Please scan again.'); return;
  }
  if (scanning) cancelScan();
  hideOverlay(); showChoose();
}
addEventListener('popstate', route);

async function renderSamples() {
  const items = await Promise.all(personas.map(async (p) => {
    const base = `/personas/${p.dir ? p.dir + '/' : ''}${p.id}`;
    const d = await fetchJSON(`${base}/scores.json`);
    const weakest = SHOPPABLE.filter((k) => d.concerns[k]).sort((a, b) => d.concerns[a].raw - d.concerns[b].raw)[0];
    return { ...p, photo: `${base}/photo.jpg`, line: `${cap((d.skin_type?.whole || 'normal').toLowerCase())} skin. Weakest: ${LABEL[weakest]}.` };
  }));
  $('samples').innerHTML = items.map((p) => `<a class="sample" href="/try/?face=${p.id}"><img src="${esc(p.photo)}" alt="" width="64" height="64" loading="lazy" decoding="async"><span class="s-name">${esc(p.label)}</span><span class="s-line">${esc(p.line)}</span></a>`).join('');
}

(async () => {
  products = await fetchJSON('/products.json');
  personas = await fetchJSON('/personas/index.json');
  if (['localhost', '127.0.0.1'].includes(location.hostname)) { // local-only faces (git-ignored, never deployed)
    try { personas = personas.concat(await fetchJSON('/personas/local/index.json')); } catch { /* not present: fine */ }
  }
  renderSamples();
  await route();
})().catch((e) => { showStep('choose', { focus: false }); status(`Something went wrong loading the demo: ${e.message}`, true); });
