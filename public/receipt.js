// Receipt rendering shared by the Try page (overlay) and the landing (tape).
import { verdict, LABEL, cut } from '/verdict.js';
import { icon } from '/icons.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const VERDICT = { match: 'Match', partial: 'Partial', skip: 'Skip', inconclusive: 'Unclear' };
export const VICON = { match: 'circle-check', partial: 'circle-minus', skip: 'circle-x', inconclusive: 'circle-help' };
export const band = (raw, k) => { const [w, f] = cut(k); return raw < w ? 'c-match' : raw < f ? 'c-partial' : 'c-skip'; };

// concerns: {name: {raw}}  label: whose face  p: product {name, targets}
export function receiptHTML(concerns, label, p, title) {
  const v = verdict(concerns, p);
  const e0 = v.evidence[0];
  const lines = v.evidence.map((e) => `<div><dt>${LABEL[e.concern]}</dt><span class="dots"></span><dd class="num">${Math.round(e.raw)}/100</dd></div>`).join('');
  const rank = e0 ? `Your #${e0.rank} weakest of ${e0.of} shoppable concerns. ` : '';
  const html = `<article class="receipt">
    <div class="top kicker"><span>Receipt</span><span>${esc(label)}</span></div>
    <div class="stamp b-${v.verdict}">${icon(VICON[v.verdict], 20)}${VERDICT[v.verdict]}</div>
    <h3>${esc(title ?? p.name)}</h3><p class="reason">${esc(v.reason)}</p>
    <dl>${lines}</dl><p class="foot">${rank}Raw YouCam score, higher is healthier.</p></article>`;
  return { html, v, e0 };
}
