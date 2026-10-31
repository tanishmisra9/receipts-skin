import { verdict, claimTargets, SHOPPABLE, LABEL, cut } from './verdict.js';
import { icon, logoMark } from './icons.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const mq = matchMedia('(max-width: 899px)'); // below this the receipt is a bottom sheet
const VERDICT = { match: 'Match', partial: 'Partial', skip: 'Skip', inconclusive: 'Unclear' };
const VICON = { match: 'circle-check', partial: 'circle-minus', skip: 'circle-x', inconclusive: 'circle-help' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const band = (raw, k) => { const [w, f] = cut(k); return raw < w ? 'c-match' : raw < f ? 'c-partial' : 'c-skip'; };

let products = [], personas = [], current = null, photoSrc = '', userScan = null;
let filter = 'all', selected = null, lastFocus = null, activeFace = null;
let currentAr = 0.8;
let view = 'measured', selConcern = null, lastMask = null; // photo view: measured (mask) or preview (Skin Simulation)

// ---------- static chrome ----------
$('logo').innerHTML = `${logoMark(26)}<span>Receipts</span>`;
$('iconMoon').innerHTML = icon('moon', 20);
$('iconSun').innerHTML = icon('sun', 20);
$('iconCam').innerHTML = icon('camera', 18);
$('sheetClose').innerHTML = icon('x', 22);

// ---------- theme (instant swap: animating it breaks Safari, per the Portfolio notes) ----------
function setTheme(t, save = true) {
  root.dataset.theme = t;
  if (save) try { localStorage.setItem('theme', t); } catch { /* private mode: still applies this session */ }
  document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#171310' : '#faf6ea';
  $('themeBtn').setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`);
}
setTheme(root.dataset.theme, false);
$('themeBtn').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

// ---------- data ----------
const fetchJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };
function status(msg, err = false) {
  const s = $('status');
  s.textContent = msg; s.className = 'status' + (err ? ' err' : '');
  s.setAttribute('role', err ? 'alert' : 'status');
}

// ---------- mask on the photo ----------
function drawMask(concern, text) {
  const m = $('maskImg'), tag = $('tag'), src = current.concerns[concern]?.mask;
  document.querySelectorAll('.bar-row').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === concern)));
  $('photo').classList.toggle('hasmask', !!src);
  m.classList.remove('on');
  if (!src) { m.hidden = true; tag.hidden = true; return; }
  m.hidden = false; m.src = src;
  (m.decode ? m.decode().catch(() => {}) : Promise.resolve()).then(() => requestAnimationFrame(() => m.classList.add('on')));
  tag.textContent = text; tag.hidden = false;
}

const showMask = (concern, text) => { lastMask = { concern, text }; view = 'measured'; renderView(); };

// Preview = YouCam Skin Simulation, a predicted result with a before/after slider. Only products whose
// weakest concern has a saved preview offer it.
function renderView() {
  const sim = selConcern && current.sim?.[selConcern];
  if (!sim && view === 'preview') view = 'measured';
  const preview = view === 'preview';
  $('viewToggle').hidden = !sim;
  $('viewToggle').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === view)));
  ['simImg', 'cmp', 'cmpLine'].forEach((id) => { $(id).hidden = !preview; });
  if (preview) {
    $('simImg').src = sim;
    $('cmp').value = 50; $('photo').style.setProperty('--pos', '50%');
    $('maskImg').classList.remove('on'); $('photo').classList.remove('hasmask');
    $('tag').textContent = 'Before | predicted after, not a promise'; $('tag').hidden = false;
    document.querySelectorAll('.bar-row').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  } else if (lastMask) drawMask(lastMask.concern, lastMask.text);
}
$('cmp').addEventListener('input', (e) => $('photo').style.setProperty('--pos', `${e.target.value}%`));
$('viewToggle').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; renderView(); }));
function showPreview() { view = 'preview'; renderView(); if (mq.matches) { closeSheet(); $('photo').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } }
['receiptInline', 'sheetBody'].forEach((id) => $(id).addEventListener('click', (e) => { if (e.target.closest('[data-act="preview"]')) showPreview(); }));

// ---------- measured-skin bars ----------
function renderBars() {
  const c = current.concerns;
  const keys = SHOPPABLE.filter((k) => c[k]).sort((a, b) => c[a].raw - c[b].raw);
  $('bars').innerHTML = keys.map((k) => {
    const [w, f] = cut(k);
    return `<button class="bar-row" data-k="${k}" type="button" aria-pressed="false" aria-label="${LABEL[k]}: ${Math.round(c[k].raw)} out of 100">
      <span class="name">${LABEL[k]}</span>
      <span class="track"><span class="fill ${band(c[k].raw, k)}" style="width:${c[k].raw}%"></span><span class="tick" style="left:${w}%"></span><span class="tick" style="left:${f}%"></span></span>
      <b class="num">${Math.round(c[k].raw)}</b></button>`;
  }).join('');
  $('bars').querySelectorAll('.bar-row').forEach((b) => b.addEventListener('click', () => showMask(b.dataset.k, `${LABEL[b.dataset.k]} ${Math.round(c[b.dataset.k].raw)}/100`)));
}

// ---------- shelf ----------
function renderShelf() {
  const rows = products.map((p) => ({ p, v: verdict(current.concerns, p) }));
  const n = (k) => rows.filter((r) => r.v.verdict === k).length;
  const worth = n('match') + n('partial');
  $('headline').textContent = `${worth} of ${rows.length} products are worth your money. ${rows.length - worth} aren't.`;
  const opts = [['all', `All ${rows.length}`], ['match', `Match ${n('match')}`], ['partial', `Partial ${n('partial')}`], ['skip', `Skip ${n('skip')}`]];
  $('filters').innerHTML = opts.map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}" type="button">${t}</button>`).join('');
  $('filters').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderShelf(); }));
  $('shelfGrid').innerHTML = rows.filter((r) => filter === 'all' || r.v.verdict === filter).map(({ p, v }) => `
    <button class="card" data-id="${p.id}" aria-pressed="${selected === p.id}" type="button">
      <span class="badge b-${v.verdict}">${icon(VICON[v.verdict], 14)}${VERDICT[v.verdict]}</span>
      <span class="brand">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span><span class="claim">${esc(p.claim)}</span>
    </button>`).join('');
  $('shelfGrid').querySelectorAll('.card').forEach((b) => b.addEventListener('click', () => select(products.find((p) => p.id === b.dataset.id), undefined, b)));
}

// ---------- receipt (paper) ----------
function receiptHTML(p, title) {
  const v = verdict(current.concerns, p);
  const e0 = v.evidence[0];
  const mask = e0 && current.concerns[e0.concern]?.mask;
  const lines = v.evidence.map((e) => `<div><dt>${LABEL[e.concern]}</dt><span class="dots"></span><dd class="num">${Math.round(e.raw)}/100</dd></div>`).join('');
  const thumb = mask ? `<div class="thumb"><img src="${esc(photoSrc)}" alt=""><img src="${esc(mask)}" alt="Where ${LABEL[e0.concern]} was measured"></div>` : '';
  const rank = e0 ? `Your #${e0.rank} weakest of ${e0.of} shoppable concerns. ` : '';
  const hasSim = e0 && current.sim?.[e0.concern];
  const previewNote = hasSim ? `<div class="preview-note"><span>A predicted result is available. It is a preview, not a promise.</span><button class="btn" type="button" data-act="preview">See it</button></div>` : '';
  return `<article class="receipt">${thumb}
    <div class="top kicker"><span>Receipt</span><span>${esc(current.label)}</span></div>
    <div class="stamp b-${v.verdict}">${icon(VICON[v.verdict], 20)}${VERDICT[v.verdict]}</div>
    <h3>${esc(title ?? p.name)}</h3><p class="reason">${esc(v.reason)}</p>
    <dl>${lines}</dl><p class="foot">${rank}Raw YouCam score, higher is healthier.</p>${previewNote}</article>`;
}

function select(p, title, trigger, { open = true } = {}) {
  selected = trigger?.dataset?.id ?? p.id;
  const html = receiptHTML(p, title);
  $('receiptInline').innerHTML = html;
  $('sheetBody').innerHTML = html;
  const el = $('receiptInline').firstElementChild;
  el.classList.remove('print'); void el.offsetWidth; el.classList.add('print');
  const e0 = verdict(current.concerns, p).evidence[0];
  selConcern = e0?.concern ?? null;
  if (e0) lastMask = { concern: e0.concern, text: `${LABEL[e0.concern]} ${Math.round(e0.raw)}/100` };
  renderView();
  document.querySelectorAll('.card').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === selected)));
  if (open && mq.matches) openSheet(trigger);
}

// ---------- mobile sheet: focus trap, inert page, scroll lock, focus return (Telogify/Portfolio pattern) ----------
const pageParts = () => [$('main'), document.querySelector('.site-header'), document.querySelector('footer')];
function openSheet(trigger) {
  lastFocus = trigger || document.activeElement;
  $('sheet').dataset.open = 'true'; $('backdrop').dataset.open = 'true';
  root.style.overflow = 'hidden';
  pageParts().forEach((e) => e.setAttribute('inert', ''));
  requestAnimationFrame(() => $('sheetClose').focus());
  addEventListener('keydown', sheetKeys);
}
function closeSheet() {
  if ($('sheet').dataset.open !== 'true') return;
  $('sheet').dataset.open = 'false'; $('backdrop').dataset.open = 'false';
  root.style.overflow = '';
  pageParts().forEach((e) => e.removeAttribute('inert'));
  removeEventListener('keydown', sheetKeys);
  if (lastFocus?.isConnected) lastFocus.focus();
}
function sheetKeys(e) {
  if (e.key === 'Escape') { closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const f = [...$('sheet').querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')];
  if (!f.length) return;
  if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
}
$('backdrop').addEventListener('click', closeSheet);
$('sheetClose').addEventListener('click', closeSheet);
mq.addEventListener('change', (e) => { if (!e.matches) closeSheet(); });

// ---------- faces ----------
function renderFaces() {
  const list = [...personas.map((p) => ({ ...p, thumb: `./personas/${p.dir ? p.dir + '/' : ''}${p.id}/photo.jpg` }))];
  if (userScan) list.push({ id: '__me', label: 'Your scan', thumb: userScan.photoSrc });
  $('faces').innerHTML = list.map((p) => `<button class="face" data-id="${p.id}" type="button" aria-label="${esc(p.label)}" title="${esc(p.label)}" aria-pressed="${p.id === activeFace}"><img src="${esc(p.thumb)}" alt="" width="38" height="38" loading="lazy" decoding="async"><span>${esc(p.label)}</span></button>`).join('');
  $('faces').querySelectorAll('.face').forEach((b) => b.addEventListener('click', () => b.dataset.id === '__me' ? loadUser() : loadPersona(b.dataset.id)));
}

function load(data, src, label, ar, id) {
  current = { ...data, label }; photoSrc = src; selected = null; filter = 'all'; activeFace = id;
  view = 'measured'; selConcern = null; lastMask = null;
  closeSheet();
  root.style.setProperty('--ar', String(ar)); currentAr = ar;
  setBusy(false);
  $('app').hidden = false; $('maskImg').hidden = true; $('tag').hidden = true; $('photo').classList.remove('hasmask');
  $('photoImg').src = src; $('photoImg').alt = `Face being analyzed (${label})`;
  const st = data.skin_type?.whole;
  $('meta').textContent = [label, st && `skin type ${st.toLowerCase()}`, data.skin_age && `skin age ${data.skin_age}`].filter(Boolean).join(' · ');
  renderFaces(); renderBars(); renderShelf();
  // Pre-select the first Match so the face, glowing mask and receipt are populated on arrival.
  const pick = (v) => products.find((p) => verdict(current.concerns, p).verdict === v);
  const first = pick('match') ?? pick('partial') ?? products[0];
  select(first, undefined, $('shelfGrid').querySelector(`[data-id="${first.id}"]`), { open: false });
}

async function loadPersona(id) {
  const p = personas.find((x) => x.id === id);
  const base = `./personas/${p.dir ? p.dir + '/' : ''}${id}`;
  status('');
  const data = await fetchJSON(`${base}/scores.json`);
  for (const k of Object.keys(data.concerns)) if (data.concerns[k].mask) data.concerns[k].mask = `${base}/${data.concerns[k].mask}`;
  if (p.sim) {
    const m = await fetchJSON(`${base}/sim.json`);
    data.sim = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, `${base}/${v.file}`]));
  }
  load(data, `${base}/photo.jpg`, p.label, p.ar ?? 0.8, id);
}
const loadUser = () => load(userScan.scores, userScan.photoSrc, 'Your scan', userScan.ar, '__me');

// ---------- live scan: resize in the browser (keeps us under the 4.5 MB function limit), then poll ----------
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

// While a scan runs: show the user's own photo with a sweep, and park the shelf so stale receipts can't be read.
function setBusy(on, text) {
  $('photo').classList.toggle('scanning', on);
  $('app').classList.toggle('busy', on);
  $('app').setAttribute('aria-busy', String(on));
  $('shelf').inert = on; $('receiptInline').inert = on;
  if (on) { $('tag').textContent = text; $('tag').hidden = false; }
}

async function liveScan(file) {
  const btn = $('scanBtn'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    status('Preparing your photo…');
    const { blob, dataUrl, ar } = await resize(file);
    status('Analyzing your skin with YouCam. This takes about 10 seconds.');
    closeSheet();
    $('photoImg').src = dataUrl; $('photoImg').alt = 'Your photo, being analyzed'; root.style.setProperty('--ar', String(ar));
    $('maskImg').hidden = true; $('simImg').hidden = true; $('cmp').hidden = true; $('cmpLine').hidden = true; $('viewToggle').hidden = true;
    $('photo').classList.remove('hasmask');
    setBusy(true, 'Analyzing with YouCam…');
    $('app').hidden = false; $('photo').scrollIntoView({ block: 'center' });
    const start = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    const sj = await start.json();
    if (!start.ok) throw new Error(sj.message || 'Scan failed.');
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const j = await (await fetch(`/api/scan?task=${encodeURIComponent(sj.task)}`)).json();
      if (j.status === 'running') continue;
      if (j.status !== 'success') throw new Error(j.message || 'Scan failed.');
      userScan = { scores: j.scores, photoSrc: dataUrl, ar };
      status('');
      return loadUser();
    }
    throw new Error('That took too long. Please try again.');
  } catch (e) {
    setBusy(false);
    $('photoImg').src = photoSrc; $('photoImg').alt = `Face being analyzed (${current.label})`; root.style.setProperty('--ar', String(currentAr));
    renderView();
    status(`${e.message} Failed scans cost nothing, so feel free to retry.`, true);
    $('status').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

$('scanBtn').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) liveScan(f); });

$('claimForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('claim').value.trim(); if (!text || !current) return;
  const targets = claimTargets(text);
  if (!targets.length) { status('We could not map that to something we measure. Try words like pores, dark spots, hydration, redness, wrinkles or glow.', true); return; }
  status('');
  select({ id: '__claim', name: text, targets }, `"${text}"`, $('claimForm').querySelector('button'));
});

// ---------- boot ----------
(async () => {
  products = await fetchJSON('./products.json');
  personas = await fetchJSON('./personas/index.json');
  // Optional local-only faces (git-ignored, never deployed): present only on the developer's machine.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    try { personas = personas.concat(await fetchJSON('./personas/local/index.json')); } catch { /* not present: fine */ }
  }
  await loadPersona(personas[0].id);
})().catch((e) => status(`Something went wrong loading the demo: ${e.message}`, true));
