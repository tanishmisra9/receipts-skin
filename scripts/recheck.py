#!/usr/bin/env python3
"""Independent re-derivation of every verdict.

Written from the rules in the README, not ported from public/verdict.js, so a bug would have to
exist in both implementations to slip through. It recomputes all persona x product verdicts from
the saved scores and compares them with what the app's JavaScript actually outputs.

  python3 scripts/recheck.py        # exits 1 on any mismatch
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PERSONAS = ["s1", "s2", "s3"]

# README: "Below the weak cut-off (65, hydration 50): Match. Between weak and fine (80, hydration 65): Partial.
# At or above fine: Skip." The target furthest below its own weak cut-off decides.
CUTS = {"moisture": (50, 65)}
DEFAULT = (65, 80)


SHOPPABLE = ["acne", "age_spot", "dark_circle_v2", "eye_bag", "firmness", "moisture",
             "oiliness", "pore", "radiance", "redness", "texture", "wrinkle"]


def derive_margins():
    """Photo-noise margins, recomputed here from the stability scans (rule in scripts/margins.py): the largest
    absolute change in a concern's raw score across the ordinary variants of face s2, floor 2 points."""
    def raw(path):
        return {k: v["raw"] for k, v in json.loads(path.read_text())["concerns"].items()}
    base = raw(ROOT / "public/personas/s2/scores.json")
    var = [raw(ROOT / f"public/stability/s2/{v}.json") for v in ("dim", "warm", "tilt")]
    return {k: round(max(2, max(abs(x[k] - base[k]) for x in var)), 1) for k in SHOPPABLE}


MARGINS = derive_margins()


def verdict(raws, targets, use="raw", band=True):
    usable = []
    for k in sorted(set(targets)):  # sorted: ties resolve by concern name
        v = raws.get(k, {}).get(use)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v == v:
            usable.append((v - CUTS.get(k, DEFAULT)[0], k, v))
    if not usable:
        return "inconclusive", None
    _, k, v = min(usable)  # smallest margin; the sort above already broke ties by name
    weak, fine = CUTS.get(k, DEFAULT)
    if band and use == "raw" and min(abs(v - weak), abs(v - fine)) < MARGINS.get(k, 0):
        return "close", k
    return ("match" if v < weak else "partial" if v < fine else "skip"), k


products = json.loads((ROOT / "public/products.json").read_text())
scores = {p: json.loads((ROOT / f"public/personas/{p}/scores.json").read_text())["concerns"] for p in PERSONAS}

# What the app's code outputs, straight from the real module.
js = subprocess.run(
    ["node", "--input-type=module", "-e", f"""
import {{ readFileSync }} from 'node:fs';
import {{ verdict }} from '{ROOT}/public/verdict.js';
const products = JSON.parse(readFileSync('{ROOT}/public/products.json'));
const out = {{}};
for (const p of {json.dumps(PERSONAS)}) {{
  const c = JSON.parse(readFileSync(`{ROOT}/public/personas/${{p}}/scores.json`)).concerns;
  out[p] = Object.fromEntries(products.map((x) => {{ const v = verdict(c, x); return [x.id, [v.verdict, v.evidence[0]?.concern ?? null]]; }}));
}}
console.log(JSON.stringify(out));
"""],
    capture_output=True, text=True, check=True,
)
app = json.loads(js.stdout)

# The numbers the app ships (public/margins.js) must equal what this script derives from the raw scans.
shipped = json.loads(subprocess.run(
    ["node", "--input-type=module", "-e", f"import {{ MARGINS }} from '{ROOT}/public/margins.js'; console.log(JSON.stringify(MARGINS));"],
    capture_output=True, text=True, check=True).stdout)
if shipped != MARGINS:
    print(f"MARGINS DIFFER: shipped {shipped} vs derived {MARGINS}")
    sys.exit(1)

checked = bad = 0
tally = {}
flips = 0
for p in PERSONAS:
    for prod in products:
        mine = verdict(scores[p], prod["targets"])
        theirs = tuple(app[p][prod["id"]])
        checked += 1
        if mine != theirs:
            bad += 1
            print(f"MISMATCH {p} {prod['id']}: python={mine} app={theirs}")
        tally.setdefault(p, {}).setdefault(mine[0], 0)
        tally[p][mine[0]] += 1
        if verdict(scores[p], prod["targets"], use="ui", band=False)[0] != verdict(scores[p], prod["targets"], band=False)[0]:
            flips += 1

print(f"checked {checked} verdicts ({len(PERSONAS)} faces x {len(products)} products): {checked - bad} agree, {bad} differ")
print("verdicts per face:")
for p in PERSONAS:
    t = tally[p]
    print(f"  {p}: match {t.get('match', 0)}, partial {t.get('partial', 0)}, skip {t.get('skip', 0)}, too close {t.get('close', 0)}")
shelves = {tuple(app[p][x["id"]][0] for x in products) for p in PERSONAS}
print(f"distinct shelves across faces: {len(shelves)} of {len(PERSONAS)}")
print(f"info: using the API's flattering ui_score instead of raw_score would change {flips} of {checked} verdicts")
sys.exit(1 if bad or checked != len(PERSONAS) * len(products) else 0)
