// Pure verdict logic. Shared by the browser and the tests. No LLM: arithmetic you can audit.
// Scores are YouCam Skin Analysis raw_score (1-100, higher = healthier). ui_score is not used.
// A score within its concern's photo-noise margin (public/margins.js, measured by scripts/margins.py) of a
// cut-off is 'close': too close to call from one photo. verdict(c, p, { band: false }) turns that off.
import { MARGINS } from './margins.js';

// Concerns a shopper can actually buy something for (eyelid droop / tear trough are not shoppable).
export const SHOPPABLE = ['acne', 'age_spot', 'dark_circle_v2', 'eye_bag', 'firmness', 'moisture',
  'oiliness', 'pore', 'radiance', 'redness', 'texture', 'wrinkle'];

export const LABEL = {
  acne: 'acne', age_spot: 'dark spots', dark_circle_v2: 'dark circles', eye_bag: 'eye bags',
  firmness: 'firmness', moisture: 'hydration', oiliness: 'oiliness', pore: 'pores',
  radiance: 'radiance', redness: 'redness', texture: 'texture', wrinkle: 'wrinkles',
};

// ponytail: cut-offs are heuristics from 5 scanned faces, not population data. Calibrate on real
// distributions if this ever ships. Below weak = needs help, weak..fine = mild, fine+ = fine.
// Hydration reads 52-62 on every face we scanned (a scale offset, not five dry faces), so it gets lower cuts.
const CUTS = { moisture: [50, 65] };
export const cut = (k) => CUTS[k] ?? [65, 80];

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// 1 = weakest among shoppable concerns; ties broken by key so output is deterministic.
export function rankOf(concerns, key) {
  const list = SHOPPABLE.filter((k) => num(concerns[k]?.raw))
    .sort((a, b) => concerns[a].raw - concerns[b].raw || (a < b ? -1 : 1));
  return { rank: list.indexOf(key) + 1, of: list.length };
}

// concerns: {name: {raw}}   product: {targets: [concern keys]}
// -> {verdict: 'match'|'partial'|'skip'|'close'|'inconclusive', evidence: [{concern, raw, rank, of}], reason, margin, dist}
export function verdict(concerns, product, { band = true } = {}) {
  const evidence = [...new Set(product.targets)]
    .filter((k) => num(concerns[k]?.raw))
    .map((k) => ({ concern: k, raw: concerns[k].raw, ...rankOf(concerns, k) }))
    .sort((a, b) => (a.raw - cut(a.concern)[0]) - (b.raw - cut(b.concern)[0]) || (a.concern < b.concern ? -1 : 1));
  if (!evidence.length) return { verdict: 'inconclusive', evidence, reason: 'We could not measure what this product targets.' };

  const w = evidence[0]; // the target furthest below its own cut-off decides
  const [WEAK, FINE] = cut(w.concern);
  const name = LABEL[w.concern] ?? w.concern;
  const n = Math.round(w.raw);
  const margin = MARGINS[w.concern] ?? 0;
  const dist = Math.min(Math.abs(w.raw - WEAK), Math.abs(w.raw - FINE));
  if (band && dist < margin) return { verdict: 'close', evidence, margin, dist, reason: `Your ${name} measured ${n}/100, within ${margin} points of a cut-off. A different photo of the same face can move it that far, so this is too close to call.` };
  if (w.raw < WEAK) return { verdict: 'match', evidence, margin, dist, reason: `Your ${name} measured ${n}/100, your #${w.rank} weakest area. This targets it.` };
  if (w.raw < FINE) return { verdict: 'partial', evidence, margin, dist, reason: `Your ${name} measured ${n}/100. Mild, so this may help a little.` };
  return { verdict: 'skip', evidence, margin, dist, reason: `Your ${name} measured ${n}/100. Healthy. You don't need this.` };
}

// Two photos of the same face: average each score. The margin stays the same on purpose (no gain assumed from averaging),
// so only a second photo that moves the score away from a cut-off can resolve a "too close" verdict.
// Masks and everything else come from `b` when it has masks (a live rescan), else from `a`.
export function combineScans(a, b) {
  const hasMasks = Object.values(b.concerns).some((c) => c.mask || c.maskUrl);
  const base = hasMasks ? b : a;
  const concerns = {};
  for (const k of Object.keys(a.concerns)) {
    const x = a.concerns[k], y = b.concerns[k];
    concerns[k] = num(x?.raw) && num(y?.raw) ? { ...base.concerns[k], raw: (x.raw + y.raw) / 2, ui: (x.ui + y.ui) / 2 } : { ...base.concerns[k] };
  }
  return { ...base, concerns, photos: (a.photos ?? 1) + 1 };
}

// Did one concern really change between two scans of a face? Only a change bigger than the photo-noise margin counts.
// -> {concern, before, after, delta, margin, call: 'improved'|'worse'|'within noise', others: [{concern, delta}]}
// `others` are the other shoppable concerns that also moved beyond their margin (side effects).
export function compareScans(before, after, concern) {
  const d = (k) => (num(before[k]?.raw) && num(after[k]?.raw) ? after[k].raw - before[k].raw : null);
  const delta = d(concern);
  if (delta === null) return null;
  const margin = MARGINS[concern] ?? 0;
  return {
    concern, before: before[concern].raw, after: after[concern].raw, delta, margin,
    call: delta > margin ? 'improved' : delta < -margin ? 'worse' : 'within noise',
    others: SHOPPABLE.filter((k) => k !== concern && d(k) !== null && Math.abs(d(k)) > (MARGINS[k] ?? 0)).map((k) => ({ concern: k, delta: d(k) })),
  };
}

// Keyword -> concern, for the "paste any claim" box. First match order is irrelevant: all hits count.
const KEYWORDS = [
  [/dark spot|pigment|age spot|sun spot|uneven tone/i, 'age_spot'],
  [/pore/i, 'pore'],
  [/hydrat|moistur|dry|dehydrat/i, 'moisture'],
  [/redness|soothe|calm|irritat/i, 'redness'],
  [/acne|breakout|blemish|pimple|blackhead/i, 'acne'],
  [/wrinkle|fine line|anti-?aging|retinol/i, 'wrinkle'],
  [/\bfirm|\blift|sagging|elastic/i, 'firmness'],
  [/puff|eye bag|depuff/i, 'eye_bag'],
  [/dark circle/i, 'dark_circle_v2'],
  [/oil|shine|mattif|sebum/i, 'oiliness'],
  [/texture|smooth|rough|resurfac|exfoliat/i, 'texture'],
  [/glow|radian|bright|dull|luminous/i, 'radiance'],
];
// "oil-free" and named oils (jojoba oil) are not claims about oiliness.
const NOT_OILINESS = /\boil[- ]free\b|\b(?:jojoba|argan|rosehip|olive|coconut|tea tree|squalane|marula|sunflower|cleansing|face|facial|body|hair) oil\b/gi;
export const claimTargets = (text) => { const t = String(text).replace(NOT_OILINESS, ' '); return KEYWORDS.filter(([re]) => re.test(t)).map(([, k]) => k); };
