// "Paste your cart": one product per line, optional $ price. A verdict per line for the face on screen, plus what skipping saves.
// Matches label claims and common active-ingredient names; it says nothing about whether a product works.
import { verdict, claimTargets } from './verdict.js';

export const MAX_LINES = 15, MAX_LEN = 1500, LIST_MIN = 8; // 1500: a real ingredient list runs to several hundred characters

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
  [/retinol|retinyl|retinal\b|retinoid|tretinoin|adapalene/i, ['wrinkle', 'texture']],
  [/zinc pca/i, ['oiliness', 'pore']],
  [/tranexamic|arbutin|kojic/i, ['age_spot']],
  [/(?<!diazolidinyl |imidazolidinyl )\burea\b/i, ['moisture']], // the two preservatives with "urea" in the name are not the moisturiser
  [/peptide/i, ['firmness', 'wrinkle']],
  [/caffeine/i, ['dark_circle_v2', 'eye_bag']],
  [/centella|cica\b|panthenol|allantoin/i, ['redness']],
];

const PRICE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/;

// A pasted ingredient list ("Aqua, Glycerin, Niacinamide, ..."): LIST_MIN or more items. Split on commas, semicolons and dots, but not inside
// brackets and not between digits ("1,2-Hexanediol" is one ingredient), so positions match the label.
const stripParen = (s) => s.replace(/\s*\(.*?\)\s*/g, ' ').trim();
function split(s) {
  const out = []; let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1);
    const cut = depth === 0 && (c === ';' || c === '·' || (c === ',' && !(/\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? ''))));
    if (cut) { out.push(cur); cur = ''; } else cur += c;
  }
  return [...out, cur].map((x) => x.trim()).filter(Boolean);
}

// "Vitamin C serum $38 - fades dark spots" -> {name, price: 38, targets: ['age_spot', 'radiance']}. Only a $ amount counts as a price.
// An ingredient list uses the actives table only (claim words would misfire on "Seed Oil"), and reports each active's position
// on the label. Position is shown, not used to rule anything out: labels do not mark where the 1% line falls.
export function parseHaul(text) {
  return String(text).split('\n').map((l) => l.trim().slice(0, MAX_LEN)).filter(Boolean).slice(0, MAX_LINES).map((line) => {
    const m = line.match(PRICE);
    const price = m ? Number(`${m[1].replace(/,/g, '')}.${m[2] ?? '0'}`) : null;
    const clean = line.replace(PRICE, '').replace(/\s{2,}/g, ' ').replace(/^[\s\-–:,]+|[\s\-–:,]+$/g, '');
    // "Night serum: Aqua, Glycerin, ..." -> a label, then the list. A long line that makes two or more different claims is marketing prose, not a list.
    const lab = clean.match(/^([^:,]{1,60}):\s*([\s\S]+)$/), body = lab ? lab[2] : clean, parts = split(body);
    if (parts.length >= LIST_MIN && claimTargets(stripParen(body)).length < 2) {
      const found = ACTIVES.map(([re, t]) => ({ i: parts.findIndex((p) => re.test(stripParen(p))), t })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i); // label order, which is how a reader checks it
      return { line, name: lab?.[1].trim() || `Ingredient list (${parts.length} ingredients)`, price,
        targets: [...new Set(found.flatMap((x) => x.t))], list: found.map((x) => ({ active: stripParen(parts[x.i]).slice(0, 40), position: x.i + 1 })) };
    }
    const targets = [...new Set([...claimTargets(line), ...ACTIVES.filter(([re]) => re.test(line)).flatMap(([, t]) => t)])];
    return { line, name: clean || line, price, targets };
  });
}

// "Found in the list: Niacinamide (ingredient 3), Retinol (ingredient 14)", or null for a plain line or a list with nothing recognised (its reason says so).
export const listNote = (r) => r.list?.length ? `Found in the list: ${r.list.map((x) => `${x.active} (ingredient ${x.position})`).join(', ')}.` : null;

// concerns: the scan on screen. Totals only count prices the user typed: skipped = money kept, kept = money you'd still spend.
export function summarize(rows, concerns) {
  const out = rows.map((r, i) => ({ ...r, id: `_cart${i}`, v: r.targets.length ? verdict(concerns, r) : { verdict: 'inconclusive', evidence: [], reason: r.list ? 'No active ingredient we recognise in that list, so no verdict.' : 'We could not map that. Add what it claims, like pores or dark spots, or an ingredient like niacinamide.' } }));
  const sum = (kind) => out.filter((r) => kind.includes(r.v.verdict) && r.price !== null).reduce((s, r) => s + r.price, 0);
  const count = (k) => out.filter((r) => r.v.verdict === k).length;
  return { rows: out, skipCount: count('skip'), keep: sum(['skip']), spend: sum(['match', 'partial']), unsure: sum(['close', 'inconclusive']), unpriced: out.filter((r) => r.price === null).length };
}

export const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
