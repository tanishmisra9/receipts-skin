// Landing: a rotating receipt tape built from the real saved scores and the same verdict code the app uses.
import { verdict, LABEL } from '/verdict.js';
import { icon } from '/icons.js';
import { esc, receiptHTML } from '/receipt.js';
import { reveal } from '/reveal.js';

const $ = (id) => document.getElementById(id);
const fetchJSON = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
$('ctaIcon').innerHTML = icon('arrow-right', 18);

let slides = [], i = 0, timer = null, userPaused = false, hovering = false;

async function build() {
  const [products, personas] = await Promise.all([fetchJSON('/products.json'), fetchJSON('/personas/index.json')]);
  const loaded = await Promise.all(personas.map(async (p) => {
    const base = `/personas/${p.id}`;
    const d = await fetchJSON(`${base}/scores.json`);
    return { p, base, d };
  }));
  // Per face: its first Match (else Partial), its first Too close, and its first Skip, so refusals show up as often as Matches.
  const order = ['s3', 's2', 's1'];
  const out = [];
  for (const id of order) {
    const f = loaded.find((x) => x.p.id === id); if (!f) continue;
    const vs = products.map((prod) => ({ prod, v: verdict(f.d.concerns, prod) }));
    f.worth = vs.filter((x) => x.v.verdict === 'match' || x.v.verdict === 'partial').length; f.total = vs.length;
    // The strongest finding for this face: the lowest score among its Match (else Partial) products.
    const weakestFirst = (list) => list.sort((x, y) => x.v.evidence[0].raw - y.v.evidence[0].raw)[0];
    const yes = weakestFirst(vs.filter((x) => x.v.verdict === 'match')) ?? weakestFirst(vs.filter((x) => x.v.verdict === 'partial'));
    const close = vs.find((x) => x.v.verdict === 'close');
    const no = vs.find((x) => x.v.verdict === 'skip');
    for (const pick of [yes, close, no]) if (pick) out.push({ f, prod: pick.prod, e0: pick.v.evidence[0] });
  }
  slides = out;

  // "3 faces, N different shelves": counted, not typed.
  const shelves = new Set(loaded.map((f) => products.map((prod) => verdict(f.d.concerns, prod).verdict).join()));
  $('proofShelves').textContent = `${loaded.length} faces, ${shelves.size} different shelves`;
}

function render(n, { animate = true } = {}) {
  i = (n + slides.length) % slides.length;
  const { f, prod, e0 } = slides[i];
  const { html } = receiptHTML(f.d.concerns, f.p.label, prod);
  const maskFile = e0 && f.d.concerns[e0.concern]?.mask;
  const ar = f.p.ar ?? 0.8;
  $('slip').innerHTML = `<div class="photo hasmask" style="--ar:${ar}">
      <img src="${esc(f.base)}/photo.jpg" alt="${esc(f.p.label)}, ${e0 ? LABEL[e0.concern] : ''} measured" width="130" height="${Math.round(130 / ar)}">
      ${maskFile ? `<img class="mask on" src="${esc(f.base)}/${esc(maskFile)}" alt="">` : ''}
    </div>${html}<div class="slip-total"><span>Worth buying</span><b class="num">${f.worth} of ${f.total}</b></div>`;
  const slip = $('slip');
  if (animate && !reduced.matches) { slip.classList.remove('print'); void slip.offsetWidth; slip.classList.add('print'); }
  document.querySelectorAll('#dots button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
}

// Keep the slip the same height on every slide, so rotating never moves the headline or buttons.
function equalize() {
  const slip = $('slip'), keep = i;
  slip.style.minHeight = '0';
  let max = 0;
  for (let k = 0; k < slides.length; k++) { render(k, { animate: false }); max = Math.max(max, slip.offsetHeight); }
  slip.style.minHeight = `${max}px`;
  render(keep, { animate: false });
}
// Width only: on phones the address bar sliding away fires resize (height only) mid-scroll, and re-rendering then makes the page jump.
let rz, lastW = innerWidth; addEventListener('resize', () => { if (innerWidth === lastW) return; lastW = innerWidth; clearTimeout(rz); rz = setTimeout(equalize, 150); });

function tick() { clearTimeout(timer); if (userPaused || hovering || reduced.matches || document.hidden) return; timer = setTimeout(() => { render(i + 1); tick(); }, 5200); }
function setPaused(p) {
  userPaused = p;
  $('pause').innerHTML = icon(p ? 'play' : 'pause', 20);
  $('pause').setAttribute('aria-label', p ? 'Play examples' : 'Pause examples');
  tick();
}

(async () => {
  await build();
  if (!slides.length) return;
  $('dots').innerHTML = slides.map((s, k) => `<button type="button" aria-label="Example ${k + 1} of ${slides.length}: ${esc(s.prod.name)}" aria-current="false"></button>`).join('');
  $('dots').querySelectorAll('button').forEach((b, k) => b.addEventListener('click', () => { render(k); tick(); }));
  $('pause').addEventListener('click', () => setPaused(!userPaused));
  const tape = document.querySelector('.tape');
  tape.addEventListener('mouseenter', () => { hovering = true; clearTimeout(timer); });
  tape.addEventListener('mouseleave', () => { hovering = false; tick(); });
  tape.addEventListener('focusin', () => { hovering = true; clearTimeout(timer); });
  tape.addEventListener('focusout', () => { hovering = false; tick(); });
  document.addEventListener('visibilitychange', tick);
  reduced.addEventListener('change', () => { setPaused(userPaused); });
  render(0, { animate: false });
  equalize(); document.fonts?.ready.then(equalize);
  setPaused(reduced.matches); // under reduced motion it starts paused and stays manual
  reveal();
})().catch(() => { $('slip').textContent = ''; });
