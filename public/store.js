// A fictional product page showing where a Receipts check could sit beside Add to Cart.
// Same verdict code, receipt and saved scans as the app; nothing here is sold.
import { verdict } from '/verdict.js';
import { receiptHTML, esc, VERDICT, VICON } from '/receipt.js';
import { icon } from '/icons.js';

const $ = (id) => document.getElementById(id);
const fetchJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };
const money = (n) => `$${n}`;
let products = [], faces = [], scans = {}, pid = 'toner', fid = 's3';

const bottle = (p) => `<svg viewBox="0 0 120 160" width="100%" height="100%" role="img" aria-hidden="true"><rect x="40" y="10" width="40" height="28" rx="6" fill="var(--ink)"/><rect x="30" y="34" width="60" height="116" rx="14" fill="var(--surface)" stroke="var(--ink)" stroke-width="3"/><rect x="38" y="70" width="44" height="42" rx="4" fill="var(--accent)"/><text x="60" y="97" text-anchor="middle" font-family="Space Mono, monospace" font-size="13" font-weight="700" fill="var(--accent-ink)">${esc(p.name.split(' ').filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).slice(0, 3).join(''))}</text></svg>`;
const chip = (v, big) => `<span class="badge b-${v.verdict}"${big ? ' style="font-size:.85rem;padding:5px 12px 5px 9px"' : ''}>${icon(VICON[v.verdict], big ? 16 : 14)}${VERDICT[v.verdict]}</span>`;

function render() {
  const p = products.find((x) => x.id === pid), c = scans[fid];
  document.title = `${p.name} | Demo store`;
  $('pdpBrand').textContent = p.brand; $('h-prod').textContent = p.name; $('pdpClaim').textContent = p.claim; $('pdpPrice').textContent = money(p.price);
  $('pdpImg').innerHTML = bottle(p);
  const v = verdict(c, p), { html } = receiptHTML(c, faces.find((f) => f.id === fid).label, p);
  $('rcVerdict').innerHTML = `${chip(v, true)}<p>${esc(v.reason)}</p>`;
  $('rcReceipt').innerHTML = html;
  $('addNote').textContent = '';
  $('moreGrid').innerHTML = products.filter((x) => x.id !== pid).map((x) => { const xv = verdict(c, x); return `<button class="card" data-id="${x.id}" type="button">${chip(xv)}<span class="brand">${esc(x.brand)}</span><span class="name">${esc(x.name)}</span><span class="claim">${money(x.price)}</span></button>`; }).join('');
  $('moreGrid').querySelectorAll('.card').forEach((b) => b.addEventListener('click', () => { pid = b.dataset.id; sync(); scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); $('h-prod').focus({ preventScroll: true }); }));
}
function sync() { history.replaceState(null, '', `?p=${pid}&face=${fid}`); render(); }

$('faceSel').addEventListener('change', (e) => { fid = e.target.value; sync(); });
$('addCart').addEventListener('click', () => { $('addNote').textContent = 'Demo store: nothing is sold.'; });

(async () => {
  products = await fetchJSON('/products.json');
  faces = await fetchJSON('/personas/index.json');
  const loaded = await Promise.all(faces.map((f) => fetchJSON(`/personas/${f.id}/scores.json`)));
  faces.forEach((f, i) => { scans[f.id] = loaded[i].concerns; });
  $('faceSel').innerHTML = faces.map((f) => `<option value="${f.id}">${esc(f.label)}</option>`).join('');
  const q = new URLSearchParams(location.search);
  if (products.some((x) => x.id === q.get('p'))) pid = q.get('p');
  if (faces.some((x) => x.id === q.get('face'))) fid = q.get('face');
  $('faceSel').value = fid; render();
})().catch(() => { $('rcVerdict').textContent = 'The saved scans could not be loaded.'; });
