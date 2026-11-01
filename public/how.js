// "Try the rule": the real verdict code behind a slider, so this page can never disagree with the app.
import { verdict, cut } from '/verdict.js';
import { MARGINS } from '/margins.js';
import { icon } from '/icons.js';
import { VERDICT, VICON, receiptHTML } from '/receipt.js';
import { reveal } from '/reveal.js';

const $ = (id) => document.getElementById(id);
const NAMES = { eye_bag: 'Eye bags', moisture: 'Hydration', pore: 'Pores' };
const START = { eye_bag: 72, moisture: 57, pore: 52 }; // somewhere meaningful for each scale
let products = [], concern = 'eye_bag';

const prodFor = (k) => products.find((p) => p.targets.length === 1 && p.targets[0] === k);
const verdictAt = (score) => verdict({ [concern]: { raw: score } }, prodFor(concern)).verdict;

function render() {
  const score = Number($('score').value);
  const [w, f] = cut(concern);
  const m = MARGINS[concern];
  const p = prodFor(concern);
  const band = (c) => `<span class="c-close" style="left:${Math.max(0, c - m)}%;width:${Math.min(100, c + m) - Math.max(0, c - m)}%"></span>`;

  $('zones').innerHTML = `<span class="c-match" style="width:${w}%"></span><span class="c-partial" style="width:${f - w}%"></span><span class="c-skip" style="width:${100 - f}%"></span>${band(w)}${band(f)}`;
  $('ticks').innerHTML = `<span style="left:${w}%">${w}</span><span style="left:${f}%">${f}</span>`;
  $('legend').innerHTML = [['match', `Below ${w}`], ['partial', `${w} to ${f - 1}`], ['skip', `${f} or more`], ['close', `Within ${m} of ${w} or ${f}`]]
    .map(([v, range]) => `<li><span class="badge b-${v}">${icon(VICON[v], 14)}${VERDICT[v]}</span><span class="num">${range}</span></li>`).join('');

  $('gaugeLabel').textContent = `${NAMES[concern]} score`;
  $('scoreNum').textContent = score;
  $('score').setAttribute('aria-valuetext', `${score}, ${VERDICT[verdictAt(score)]}`);
  $('ruleOut').innerHTML = receiptHTML({ [concern]: { raw: score } }, 'Example', p).html;
}

document.querySelectorAll('.seg [data-c]').forEach((b) => b.addEventListener('click', () => {
  concern = b.dataset.c; // scores are 0 to 100, so START is in range for each
  document.querySelectorAll('.seg [data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  // Keep the knob somewhere meaningful for the new scale.
  $('score').value = START[concern];
  render();
}));
$('score').addEventListener('input', render);

(async () => {
  products = await (await fetch('/products.json')).json();
  render();
  reveal();
})().catch(() => { $('ruleOut').textContent = ''; reveal(); });
