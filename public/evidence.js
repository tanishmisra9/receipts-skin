// Evidence page: renders computeEvidence() (same verdict code and saved scans as the app) into plain tables.
import { computeEvidence } from '/evidence-data.js';
import { LABEL } from '/verdict.js';
import { VERDICT, esc } from '/receipt.js';

const $ = (id) => document.getElementById(id);
const FACE = { s1: 'Sample A', s2: 'Sample B', s3: 'Sample C', h1: 'Test D', h2: 'Test E' };
const VARIANT = { dim: '25% darker', warm: 'warm light', tilt: '3° tilt', blur: 'blurred', crop: '6% cropped', jpeg: 'heavy JPEG' };
const sign = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
const table = (head, rows) => `<table class="evt"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table>`;

computeEvidence((p) => fetch(`/${p}`).then((r) => { if (!r.ok) throw new Error(p); return r.json(); })).then((e) => {
  const f = e.flattery;
  $('flatSub').textContent = `Scoring on YouCam's display score instead of the raw score changes ${f.flips.length} of ${f.total} verdicts. Each row below is a product the flattering number would have sold you.`;
  $('flatTable').innerHTML = table(['Face', 'Product', 'Raw score says', 'Display score says'],
    f.flips.map((x) => [FACE[x.face], esc(x.product.name), `${VERDICT[x.raw.verdict]} (${Math.round(x.raw.evidence[0].raw)})`, `${VERDICT[x.ui.verdict]} (${Math.round(x.ui.evidence[0].raw)})`]));

  const s = e.stability, o = s.ordinary, h = s.holdout;
  $('photoSub').textContent = `The identical photo scans identically. Changing the light or tilt moves some scores a lot (pores most). Across ${o.scans} ordinary photo changes on 5 faces, ${o.flips} of ${o.comparisons} verdicts flipped, and the "too close" band flagged ${o.flagged} of them in advance. On the ${h.faces} faces it was not fitted to (${h.scans} photo changes), ${h.flips} verdicts flipped and it flagged ${h.flagged} of them; ${h.darkFlips === h.flips ? 'all of them' : `${h.darkFlips} of them`} came from the darker photo. It now calls ${s.close.reduce((a, b) => a + b, 0)} of ${f.total} verdicts too close to call.`;
  $('photoTable').innerHTML = table(['Face', 'Photo change', 'Kind', 'Verdicts that flipped', 'Flagged in advance'],
    s.rows.map((r) => [FACE[r.face], VARIANT[r.variant], r.group === 'ordinary' ? 'ordinary' : 'stress test', `${r.flips} of 12`, String(r.flagged)]));
  $('margins').innerHTML = s.concerns.map((k) => `<li><span>${LABEL[k]}</span><b class="num">±${s.margins[k]}</b></li>`).join('');

  const p = e.previews, win = p.filter((x) => x.call === 'improved').length;
  $('prevSub').textContent = `We sent each Skin Simulation preview image back through Skin Analysis. ${win} of ${p.length} show a change YouCam can measure. ${p.length - win} do not.`;
  $('prevTable').innerHTML = table(['Face', 'Concern', 'Before', 'Preview, measured', 'Change', 'Verdict on the preview'],
    p.map((x) => [FACE[x.face], LABEL[x.concern], String(Math.round(x.before)), String(Math.round(x.after)), `${sign(x.delta)} (margin ${x.margin})`,
      x.call === 'improved' ? 'Delivers' : x.call === 'worse' ? 'Worse' : 'Not measurable']));
}).catch(() => { $('flatSub').textContent = 'The saved scans could not be loaded.'; });
