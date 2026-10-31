// "Try the rule": the real verdict code behind a slider, so this page can never disagree with the app.
import { verdict, cut } from '/verdict.js';
import { icon } from '/icons.js';
import { VERDICT, VICON, receiptHTML } from '/receipt.js';

const $ = (id) => document.getElementById(id);
const NAMES = { pore: 'Pores', moisture: 'Hydration' };
let products = [], concern = 'pore';

const prodFor = (k) => products.find((p) => p.targets.length === 1 && p.targets[0] === k);
const verdictAt = (score) => verdict({ [concern]: { raw: score } }, prodFor(concern)).verdict;

function render() {
  const score = Number($('score').value);
  const [w, f] = cut(concern);
  const p = prodFor(concern);

  $('zones').innerHTML = `<span class="c-match" style="width:${w}%"></span><span class="c-partial" style="width:${f - w}%"></span><span class="c-skip" style="width:${100 - f}%"></span>`;
  $('ticks').innerHTML = `<span style="left:${w}%">${w}</span><span style="left:${f}%">${f}</span>`;
  $('legend').innerHTML = [['match', `Below ${w}`], ['partial', `${w} to ${f - 1}`], ['skip', `${f} or more`]]
    .map(([v, range]) => `<li><span class="badge b-${v}">${icon(VICON[v], 14)}${VERDICT[v]}</span><span class="num">${range}</span></li>`).join('');

  $('gaugeLabel').textContent = `${NAMES[concern]} score`;
  $('scoreNum').textContent = score;
  $('score').setAttribute('aria-valuetext', `${score}, ${VERDICT[verdictAt(score)]}`);
  $('ruleOut').innerHTML = receiptHTML({ [concern]: { raw: score } }, 'Example', p).html;
}

document.querySelectorAll('.seg [data-c]').forEach((b) => b.addEventListener('click', () => {
  concern = b.dataset.c;
  document.querySelectorAll('.seg [data-c]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  // Keep the knob somewhere meaningful for the new scale.
  $('score').value = concern === 'moisture' ? 57 : 52;
  render();
}));
$('score').addEventListener('input', render);

(async () => {
  products = await (await fetch('/products.json')).json();
  render();
})().catch(() => { $('ruleOut').textContent = ''; });
