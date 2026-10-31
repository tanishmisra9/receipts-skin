// Pure verdict logic. Shared by the browser and the tests. No LLM: arithmetic you can audit.
// Scores are YouCam Skin Analysis raw_score (1-100, higher = healthier). ui_score is not used.

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
// -> {verdict: 'match'|'partial'|'skip'|'inconclusive', evidence: [{concern, raw, rank, of}], reason}
export function verdict(concerns, product) {
  const evidence = [...new Set(product.targets)]
    .filter((k) => num(concerns[k]?.raw))
    .map((k) => ({ concern: k, raw: concerns[k].raw, ...rankOf(concerns, k) }))
    .sort((a, b) => (a.raw - cut(a.concern)[0]) - (b.raw - cut(b.concern)[0]) || (a.concern < b.concern ? -1 : 1));
  if (!evidence.length) return { verdict: 'inconclusive', evidence, reason: 'We could not measure what this product targets.' };

  const w = evidence[0]; // the target furthest below its own cut-off decides
  const [WEAK, FINE] = cut(w.concern);
  const name = LABEL[w.concern] ?? w.concern;
  const n = Math.round(w.raw);
  if (w.raw < WEAK) return { verdict: 'match', evidence, reason: `Your ${name} measured ${n}/100, your #${w.rank} weakest area. This targets it.` };
  if (w.raw < FINE) return { verdict: 'partial', evidence, reason: `Your ${name} measured ${n}/100. Mild, so this may help a little.` };
  return { verdict: 'skip', evidence, reason: `Your ${name} measured ${n}/100. Healthy. You don't need this.` };
}

// Keyword -> concern, for the "paste any claim" box. First match order is irrelevant: all hits count.
const KEYWORDS = [
  [/dark spot|pigment|age spot|sun spot|uneven tone/i, 'age_spot'],
  [/pore/i, 'pore'],
  [/hydrat|moistur|dry|dehydrat/i, 'moisture'],
  [/redness|soothe|calm|irritat/i, 'redness'],
  [/acne|breakout|blemish|pimple|blackhead/i, 'acne'],
  [/wrinkle|fine line|anti-?aging|retinol/i, 'wrinkle'],
  [/firm|lift|sagging|elastic/i, 'firmness'],
  [/puff|eye bag|depuff/i, 'eye_bag'],
  [/dark circle/i, 'dark_circle_v2'],
  [/oil|shine|mattif|sebum/i, 'oiliness'],
  [/texture|smooth|rough|resurfac|exfoliat/i, 'texture'],
  [/glow|radian|bright|dull|luminous/i, 'radiance'],
];
export const claimTargets = (text) => KEYWORDS.filter(([re]) => re.test(text)).map(([, k]) => k);
