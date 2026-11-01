// "Paste your cart": one product per line, optional $ price. A verdict per line for the face on screen, plus what skipping saves.
// Matches label claims and common active-ingredient names; it says nothing about whether a product works.
import { verdict, claimTargets } from './verdict.js';

export const MAX_LINES = 15, MAX_LEN = 200;

// What labels usually claim for common actives. This is marketing vocabulary, not evidence about the product.
const ACTIVES = [
  [/niacinamide/i, ['pore', 'oiliness']],
  [/salicylic|\bbha\b/i, ['pore', 'acne']],
  [/benzoyl/i, ['acne']],
  [/hyaluron/i, ['moisture']],
  [/vitamin c|ascorbic/i, ['age_spot', 'radiance']],
  [/azelaic/i, ['redness', 'acne']],
  [/glycolic|\baha\b|lactic acid|mandelic/i, ['texture', 'radiance']],
  [/ceramide/i, ['moisture']],
  [/retinol|retinal\b|retinoid|tretinoin|adapalene/i, ['wrinkle', 'texture']],
  [/peptide/i, ['firmness', 'wrinkle']],
  [/caffeine/i, ['dark_circle_v2', 'eye_bag']],
  [/centella|cica\b|panthenol|allantoin/i, ['redness']],
];

const PRICE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/;

// "Vitamin C serum $38 - fades dark spots" -> {name, price: 38, targets: ['age_spot', 'radiance']}. Only a $ amount counts as a price.
export function parseHaul(text) {
  return String(text).split('\n').map((l) => l.trim().slice(0, MAX_LEN)).filter(Boolean).slice(0, MAX_LINES).map((line) => {
    const m = line.match(PRICE);
    const price = m ? Number(`${m[1].replace(/,/g, '')}.${m[2] ?? '0'}`) : null;
    const name = line.replace(PRICE, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–:,]+|[\s\-–:,]+$/g, '') || line;
    const targets = [...new Set([...claimTargets(line), ...ACTIVES.filter(([re]) => re.test(line)).flatMap(([, t]) => t)])];
    return { line, name, price, targets };
  });
}

// concerns: the scan on screen. Totals only count prices the user typed: skipped = money kept, kept = money you'd still spend.
export function summarize(rows, concerns) {
  const out = rows.map((r, i) => ({ ...r, id: `_cart${i}`, v: r.targets.length ? verdict(concerns, r) : { verdict: 'inconclusive', evidence: [], reason: 'We could not map that. Add what it claims, like pores or dark spots, or an ingredient like niacinamide.' } }));
  const sum = (kind) => out.filter((r) => kind.includes(r.v.verdict) && r.price !== null).reduce((s, r) => s + r.price, 0);
  const count = (k) => out.filter((r) => r.v.verdict === k).length;
  return { rows: out, skipCount: count('skip'), keep: sum(['skip']), spend: sum(['match', 'partial']), unsure: sum(['close', 'inconclusive']), unpriced: out.filter((r) => r.price === null).length };
}

export const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
