import { verdict, combineScans, SHOPPABLE, LABEL, cut } from '/verdict.js';
import { parseHaul, summarize, money, listNote } from '/haul.js';
import { makeCard } from '/card.js';
import { icon } from '/icons.js';
import { esc, VERDICT, VICON, band, receiptHTML } from '/receipt.js';
import { reveal } from '/reveal.js';
import { captureSelfie, cameraSupported, cameraError } from '/camera.js';
import { SIM_CONCERNS } from '/sim.js';

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
  if (name === 'results') reveal($('step-results')); // below-the-fold shelf, cart box; skips what is already marked
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
    setSim(src, show = false) { simSrc = src || null; mode = show && simSrc ? 'preview' : 'measured'; draw(); },
    clear() { mask = null; simSrc = null; mode = 'measured'; draw(); },
  };
}

const mainView = makeView($('photo'), { img: $('photoImg'), maskEl: $('maskImg'), tag: $('tag') });
const ovView = makeView($('ovPhoto'), { img: $('ovImg'), maskEl: $('ovMask'), tag: $('ovTag'), sim: $('ovSim'), line: $('ovLine'), cmp: $('ovCmp'), toggle: $('ovToggle') });

// ---------- results ----------
const ranked = () => { const c = current.concerns; return SHOPPABLE.filter((k) => c[k]).sort((a, b) => c[a].raw - c[b].raw); };
const rows = () => products.map((p) => ({ p, v: verdict(current.concerns, p) }));
// "Flattering view": what the display score (ui_score, which the docs say is adjusted to look better) would have said.
let flatter = false;
const asUi = (c) => Object.fromEntries(Object.entries(c).map(([k, x]) => [k, { raw: x.ui }]));
const flatRows = () => products.map((p) => { const was = verdict(current.concerns, p, { band: false }), v = verdict(asUi(current.concerns), p, { band: false }); return { p, v, was, changed: was.verdict !== v.verdict }; });
function syncFlatter() {
  const changed = flatter ? flatRows().filter((x) => x.changed).length : 0;
  $('flatter').setAttribute('aria-pressed', String(flatter));
  $('flatNote').textContent = flatter ? `On the display score, ${changed} of ${products.length} verdicts change (outlined). YouCam's docs say it is adjusted to look better.` : '';
}

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
  const r = flatter ? flatRows() : rows();
  const n = (k) => r.filter((x) => x.v.verdict === k).length;
  const opts = [['all', `All ${r.length}`], ['match', `Match ${n('match')}`], ['partial', `Partial ${n('partial')}`], ['skip', `Skip ${n('skip')}`], ...(n('close') ? [['close', `Too close ${n('close')}`]] : [])];
  $('filters').innerHTML = opts.map(([k, t]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}" type="button">${t}</button>`).join('');
  $('filters').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; renderShelf(); }));
  $('shelfGrid').innerHTML = r.filter((x) => filter === 'all' || x.v.verdict === filter).map(({ p, v, was, changed }) => `
    <button class="card${changed ? ' changed' : ''}" data-id="${p.id}" type="button">
      <span class="badge b-${v.verdict}">${icon(VICON[v.verdict], 14)}${VERDICT[v.verdict]}</span>
      <span class="brand">${esc(p.brand)}</span><span class="name">${esc(p.name)}</span><span class="claim">${changed ? `Raw score says ${VERDICT[was.verdict]}` : esc(p.claim)}</span>
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
  $('meta').textContent = [`${n('skip')} ${n('skip') === 1 ? 'is a Skip' : 'are a Skip'}`, n('skip') && `skipping them keeps ${money(r.filter((x) => x.v.verdict === 'skip').reduce((s, x) => s + (x.p.price ?? 0), 0))} (demo prices)`, n('close') && `${n('close')} too close to call`, st && `${cap(st.toLowerCase())} skin`, current.skin_age && `skin age ${current.skin_age} (YouCam's estimate)`, current.photos > 1 && `${current.photos} photos averaged`, current.maskNote].filter(Boolean).join(' · ');
  root.style.setProperty('--ar', String(currentAr));
  mainView.set(photoSrc, `Face being analyzed (${current.label})`);
  filter = 'all'; flatter = false; syncFlatter();
  renderBars(); renderShelf(); renderCart();
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

// ---------- live preview: Skin Simulation on the photo you scanned (4 units each; saved samples already have theirs) ----------
let livePreviews = {}, ovConcern = null, previewing = false;
function syncLiveSim(p) {
  const ask = activeId === '__me' && ovConcern && SIM_CONCERNS.includes(ovConcern) && !livePreviews[ovConcern] && verdict(current.concerns, p).verdict !== 'skip';
  $('liveSim').hidden = !ask;
  $('liveSimBtn').disabled = previewing;
  $('liveSimNote').textContent = ask ? `Predicted, not re-measured, and not a promise. Sends your photo to YouCam again; the link lasts about 2 hours.${ovConcern === 'pore' ? ' In our tests, pore previews did not change the score YouCam measures.' : ''}` : '';
}
async function livePreview() {
  const concern = ovConcern, mine = current;
  if (!concern || previewing) return;
  previewing = true; $('liveSimBtn').disabled = true; $('liveSimNote').textContent = 'Asking YouCam for a predicted result. About 10 seconds.';
  try {
    const r = await fetch(`/api/simulate?concern=${concern}`, { method: 'POST', body: await (await fetch(photoSrc)).blob() });
    const j = await r.json();
    if (!j.task) throw new Error(j.message);
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 2500));
      const o = await (await fetch(`/api/simulate?task=${j.task}`)).json();
      if (o.status === 'running') continue;
      if (o.status !== 'success') throw new Error(o.message);
      if (current === mine) { livePreviews[concern] = o.url; if (isOpen() && ovConcern === concern) { ovView.setSim(o.url, true); $('liveSim').hidden = true; } }
      return;
    }
    throw new Error('That took too long. Please try again.');
  } catch (e) {
    if (current === mine && ovConcern === concern) $('liveSimNote').textContent = e.message || 'The preview did not work. Please try again.';
  } finally { previewing = false; $('liveSimBtn').disabled = false; }
}
$('liveSimBtn').addEventListener('click', livePreview);

function fillOverlay(p, title) {
  const { html, e0 } = receiptHTML(current.concerns, current.label, p, title, current.simScores, rescanText());
  $('ovReceipt').innerHTML = html;
  root.style.setProperty('--ar', String(currentAr));
  ovView.set(photoSrc, e0 ? `${current.label}, ${LABEL[e0.concern]}` : current.label);
  ovConcern = e0?.concern ?? null;
  ovView.setSim(e0 && (current.sim?.[e0.concern] ?? livePreviews[e0.concern]));
  syncLiveSim(p);
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

// ---------- rescan to resolve a "too close" verdict ----------
// One extra photo, once. A sample face uses its saved second photo (0 units); a live scan asks for a new photo (16 units).
const sampleRescan = () => personas.find((x) => x.id === activeId)?.rescan;
function rescanText() {
  if (!current || current.photos > 1) return null;
  if (activeId === '__me') return 'Rescan with a second photo (16 units)';
  return sampleRescan() ? 'Rescan with a second photo (saved, 0 units)' : null;
}
let rescanBase = null;
$('ovReceipt').addEventListener('click', async (e) => {
  if (!e.target.closest('#ovRescan')) return;
  if (activeId === '__me') { rescanBase = current; hideOverlay(); history.replaceState(null, '', '?scan=1'); $('rescanFile').click(); return; }
  const id = activeId, v = sampleRescan();
  const second = await fetchJSON(`/stability/${id}/${v}.json`);
  const merged = combineScans(current, second);
  load(merged, photoSrc, `${personas.find((x) => x.id === id).label} · 2 photos`, currentAr, id);
  fillOverlay(sel);
  $('ovClose').focus();
});
$('rescanFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) startScan(f, rescanBase); else rescanBase = null; });

// ---------- paste your cart ----------
const CART_EXAMPLE = 'Niacinamide 10% serum $6\nHydrating gel cream $24\nBrightening vitamin C serum $38\nPore clay mask $22\nNight serum $42: Aqua, Glycerin, Propanediol, Niacinamide, Zinc PCA, Sodium Hyaluronate, Panthenol, Squalane, Tocopherol, Retinyl Palmitate, Phenoxyethanol';
let cart = null;
function renderCart() {
  const text = $('cart').value.trim();
  if (!text || !current) { cart = null; $('cartOut').innerHTML = ''; return; }
  cart = summarize(parseHaul(text), current.concerns);
  const total = cart.skipCount
    ? `<div class="cart-total"><span>Skip ${cart.skipCount}, you keep</span><b class="num">${money(cart.keep)}</b></div>`
    : `<div class="cart-total"><span>Nothing here to skip for this face</span></div>`;
  const rows = cart.rows.map((r, i) => `<button class="cart-row" data-i="${i}" type="button">
    <span class="badge b-${r.v.verdict}">${icon(VICON[r.v.verdict], 14)}${VERDICT[r.v.verdict]}</span><span class="name">${esc(r.name)}</span><span class="num">${r.price === null ? '' : money(r.price)}</span>
    <span class="why">${esc(r.v.reason)}${listNote(r) ? ` ${esc(listNote(r))}` : ''}</span></button>`).join('');
  $('cartOut').innerHTML = `${rows}${total}<p class="cart-note">Prices are what you typed; items marked Too close or Unclear are not counted. We match label claims and ingredient names. That says nothing about whether a product works.</p>`;
  $('cartOut').querySelectorAll('.cart-row').forEach((b) => b.addEventListener('click', () => { const r = cart.rows[b.dataset.i]; openReceipt({ id: r.id, name: r.name, targets: r.targets }, b, r.name); }));
}
$('cartForm').addEventListener('submit', (e) => { e.preventDefault(); renderCart(); });
$('flatter').addEventListener('click', () => { flatter = !flatter; syncFlatter(); renderShelf(); });

// ---------- share card: the cart if there is one, else the shelf. No face, no mask. ----------
$('saveCard').addEventListener('click', async () => {
  const useCart = cart?.rows.length;
  const rowsSrc = useCart ? cart.rows.map((r) => ({ name: r.name, verdict: r.v.verdict, price: r.price })) : rows().map(({ p, v }) => ({ name: p.name, verdict: v.verdict, price: p.price ?? null }));
  const skips = rowsSrc.filter((r) => r.verdict === 'skip');
  const keep = skips.reduce((s, r) => s + (r.price ?? 0), 0);
  try {
    const blob = await makeCard({ label: `${useCart ? 'My cart' : 'The shelf'} · ${current.label}`, rows: rowsSrc, keep, skipCount: skips.length, note: useCart ? 'Prices as typed. Unsure items not counted.' : 'Demo prices, made up for the demo.' });
    const file = new File([blob], 'my-receipt.png', { type: 'image/png' });
    // Phones get the share sheet (a download is awkward there); desktops get a file.
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'My skin receipt' }).catch(() => {}); return; }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'my-receipt.png' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { status(e.message || 'Could not save the image.', true); }
});
$('cartExample').addEventListener('click', () => { $('cart').value = CART_EXAMPLE; renderCart(); });

// ---------- loading faces ----------
function load(data, src, label, ar, id) {
  current = { ...data, label }; photoSrc = src; currentAr = ar; activeId = id; livePreviews = {};
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
    // What YouCam's own analyzer measures on each preview image (scripts/stability.mjs --sim).
    const scored = await Promise.all(Object.keys(m).map((k) => fetchJSON(`${base}/sim-scores/${k}.json`).then((j) => [k, j.concerns], () => null)));
    data.simScores = Object.fromEntries(scored.filter(Boolean));
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

async function startScan(file, base = null) {
  if (scanning) return;
  camCtl?.abort(); // a camera still waiting on its permission prompt must not open behind the analyze step
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
      const scores = base ? combineScans(base, withMasks(j.scores)) : withMasks(j.scores);
      rescanBase = null;
      saveScan({ scores, photoSrc: dataUrl, ar });
      scanning = false; stopTimer();
      load(scores, dataUrl, base ? 'Your scan · 2 photos' : 'Your scan', ar, '__me');
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
// Camera: shown only where the browser can open one (a phone's file chooser already offers its camera).
let camCtl = null;
if (cameraSupported()) $('camBtn').hidden = false;
function camUI(open) { $('cam').hidden = !open; $('drop').hidden = open; $('camBtn').hidden = open || !cameraSupported(); }
$('camBtn').addEventListener('click', async () => {
  if (scanning || camCtl) return;
  status(''); camCtl = new AbortController();
  let file = null;
  try {
    file = await captureSelfie({ video: $('camVideo'), count: $('camCount'), shoot: $('camShoot'), cancel: $('camCancel'), signal: camCtl.signal, onReady: () => { camUI(true); $('cam').scrollIntoView({ block: 'center' }); $('camShoot').focus({ preventScroll: true }); } });
  } catch (e) { status(cameraError(e), true); }
  camCtl = null; camUI(false);
  if (file) startScan(file);
});
// Say "paused" before an upload, not after. A failing check (no API, as on the static dev server) leaves everything enabled.
fetch('/api/scan?capacity=1').then((r) => r.json()).then((j) => {
  if (j.live !== false) return;
  $('file').disabled = true; $('camBtn').disabled = true; $('drop').classList.add('paused');
  $('pausedNote').hidden = false;
}).catch(() => {});
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (f) startScan(f); });


// ---------- routing: the URL is the state ----------
function showChoose(msg) { showStep('choose'); status(msg || '', !!msg); }
async function route() {
  camCtl?.abort(); // leaving the page state (Back, a link) must turn the camera off
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
