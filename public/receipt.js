// Receipt rendering shared by the Try page (overlay) and the landing (tape).
import { verdict, compareScans, LABEL, cut } from '/verdict.js';
import { icon } from '/icons.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const VERDICT = { match: 'Match', partial: 'Partial', skip: 'Skip', close: 'Too close', inconclusive: 'Unclear' };
export const VICON = { match: 'circle-check', partial: 'circle-minus', skip: 'circle-x', close: 'scale', inconclusive: 'circle-help' };
export const band = (raw, k) => { const [w, f] = cut(k); return raw < w ? 'c-match' : raw < f ? 'c-partial' : 'c-skip'; };

// concerns: {name: {raw}}  label: whose face  p: product {name, targets}
// simScores: optional {concern: scores of the Skin Simulation preview, re-measured by YouCam Skin Analysis}
// rescan: optional button text, shown only on a 'too close' verdict
export function receiptHTML(concerns, label, p, title, simScores, rescan) {
  const v = verdict(concerns, p);
  const e0 = v.evidence[0];
  const lines = v.evidence.map((e) => `<div><dt>${LABEL[e.concern]}</dt><span class="dots"></span><dd class="num">${Math.round(e.raw)}/100</dd></div>`).join('');
  const rank = e0 ? `Your #${e0.rank} weakest of ${e0.of} shoppable concerns. ` : '';
  const noise = v.margin ? `${v.verdict === 'close' ? 'Inside' : Math.round(v.dist) + ' points outside'} the photo-noise margin of ${v.margin}. ` : '';
  const c = e0 && simScores?.[e0.concern] && compareScans(concerns, simScores[e0.concern], e0.concern);
  const sign = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
  const measured = c ? `<div class="measured"><span class="badge b-${c.call === 'improved' ? 'match' : c.call === 'worse' ? 'skip' : 'close'}">${c.call === 'improved' ? 'Preview delivers' : c.call === 'worse' ? 'Preview made it worse' : 'Preview not measurable'}</span>
    <p>YouCam re-measured its own preview: ${LABEL[c.concern]} ${Math.round(c.before)} to ${Math.round(c.after)} (${sign(c.delta)}, photo-noise margin ${c.margin}).${c.others.length ? ` Also moved: ${c.others.map((o) => `${LABEL[o.concern]} ${sign(o.delta)}`).join(', ')}.` : ''}</p></div>` : '';
  const html = `<article class="receipt">
    <div class="top kicker"><span>Receipt</span><span>${esc(label)}</span></div>
    <div class="stamp b-${v.verdict}">${icon(VICON[v.verdict], 20)}${VERDICT[v.verdict]}</div>
    <h3>${esc(title ?? p.name)}</h3><p class="reason">${esc(v.reason)}</p>
    <dl>${lines}</dl>${measured}${v.verdict === 'close' && rescan ? `<div class="rescan"><button class="btn" id="ovRescan" type="button">${esc(rescan)}</button><p>The two photos are averaged and the same margin applies.</p></div>` : ''}<p class="foot">${rank}${noise}Raw YouCam score, higher is healthier.</p></article>`;
  return { html, v, e0 };
}
