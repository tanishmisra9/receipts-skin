# Receipts

[![CI](https://github.com/tanishmisra9/receipts-skin/actions/workflows/ci.yml/badge.svg)](https://github.com/tanishmisra9/receipts-skin/actions/workflows/ci.yml)

**Skincare advice that's allowed to say no.**

A recommendation that can't say no isn't advice. Receipts measures your skin once with the YouCam Skin Analysis API, then gives every product on a shelf a **Match**, **Partial** or **Skip**, with your own scores as the receipt.

Live demo: https://receipts-skin.vercel.app (sample faces work with no sign-in; "Scan my face" runs a real YouCam scan)

Built for the YouCam API Skin AI & eCommerce VTO Hackathon (Skin AI topic).

**What makes it more than a wrapper:** we measured how far to trust YouCam's numbers (see [Evidence](https://receipts-skin.vercel.app/evidence/) and [YOUCAM-API-NOTES.md](YOUCAM-API-NOTES.md)). The rule says "too close to call" when a score sits within the photo-noise margin of a cut-off, and we re-measured YouCam's own previews with its own analyzer.

## Pages

| Page | Job |
|---|---|
| `/` Landing | One tap to a sample face, plus a rotating tape of real receipts |
| `/try/` Try | Three steps: choose a face, upload a photo or use your camera, analyze, then read your shelf, your cart and a saveable receipt. Deep links work: `/try/?face=s2&p=toner` opens a receipt |
| `/how/` How it works | The rules, the APIs, your photo, and what this is not |
| `/store/` Demo store | A fictional product page with a "Checked for your skin" chip beside Add to Cart, to show where a retailer could use it |
| `/evidence/` Evidence | What we measured about YouCam's scores: the flattering score, photo changes, and its own previews |

One document scroll everywhere: only the header is fixed. A receipt opens as a focused overlay (a bottom sheet on phones).

## What it does

1. **Scan.** A selfie goes to YouCam Skin Analysis (SD, 15 scored concerns, 16 units per scan).
2. **Measure.** Each concern comes back as a raw score from 1 to 100 plus a detection mask. Tap any row to see where it was measured.
3. **Verdict.** Each product targets one or more concerns. Plain arithmetic on your scores decides the verdict, so every verdict can be audited. A score inside the photo-noise margin of a cut-off is **Too close** to call; one extra photo ("Rescan") is averaged in to try to resolve it.
4. **Preview.** For products where YouCam Skin Simulation can render the concern, a before/after slider shows a predicted result, labeled "predicted, not a promise". Sample faces ship with theirs; on your own scan a "Show predicted result (4 units)" button asks YouCam for one live (`api/simulate.js`), and says plainly that it is not re-measured. The receipt also says whether YouCam's own analyzer measures that change.
5. **Paste your cart.** Type or paste the products you're about to buy, one per line with a `$` price, or paste a product's whole ingredient list (the position of each recognised active on the label is shown). Each gets a verdict for your face and you see what skipping keeps. It matches label claims and common ingredient names, not whether a product works, and nothing leaves the browser.
6. **Flattering view.** One toggle shows the shelf as YouCam's display score would grade it; the changed verdicts are outlined.
7. **Save receipt image.** A 1080 by 1350 image of the verdicts and total, with no face or mask on it. Shelf prices are made-up demo prices.

The receipt is the product: the stamp, the line items and the mask on the face show exactly why a product got its verdict.

## YouCam APIs used

| API | Used for | Cost |
|---|---|---|
| Skin Analysis v2 (`/s2s/v2.0/task/skin-analysis`) | 15 concern scores and masks, skin type, skin age | 16 units per scan |
| Skin Simulation v2 (`/s2s/v2.0/task/skin-simulation`) | Predicted before/after preview, saved per sample face | 4 units per preview |

Notes from building against it:
- `ui_score` is calibrated to flatter ("adjusted to produce more favorable results", per the docs). Verdicts use `raw_score`. Measured on our three sample faces, scoring with `ui_score` instead would change 8 of 36 verdicts.
- Hydration reads 52 to 62 on all five faces we scanned, which would give everyone a hydration "Match". It has its own cut-offs (50 and 65). These cut-offs are heuristics from five faces, not clinical thresholds.
- The same photo scans identically (within 0.01), but a different photo of the same face does not: a 25% darker copy moved pores by 10.6 points. The full sweep is in [YOUCAM-API-NOTES.md](YOUCAM-API-NOTES.md).
- A failed scan (bad angle, glare) costs nothing; units are charged only on success.

## Using another sensor

The rule (`public/verdict.js`), the noise-margin method (`scripts/perturb.py`, `scripts/margins.py`) and the "too close" abstention only read `{ concern: { raw } }` scores, so they do not know which vendor produced them (`test/verdict.test.mjs` runs the rule on hand-made scores). What does **not** transfer: the cut-offs and the margins. Both are calibrated to YouCam's 1 to 100 scale and to our photos, so a different sensor needs its own stability sweep and cut-offs before its verdicts mean anything. We have not run another vendor.

## How verdicts are decided

`public/verdict.js` is one pure function used by both the browser and the tests.

- Take the product's targeted concerns and pick the one furthest below its cut-off.
- Below the weak cut-off (65, hydration 50): **Match**. Between weak and fine (80, hydration 65): **Partial**. At or above fine: **Skip**.
- If that score is within its concern's photo-noise margin of either cut-off (`public/margins.js`, measured by `scripts/margins.py`), the verdict is **Too close**.
- A missing or non-numeric score returns **Unclear**, never a guess.

## Run it

```bash
npm test                      # verdict logic, plus checks that the three pages stay consistent
npm run recheck               # independent Python re-derivation of all 36 verdicts; must match the app exactly
npm run dev                   # local server (no-store cache); sample faces work with no API key
node scripts/contrast.mjs     # WCAG contrast check for both themes
python3 scripts/margins.py    # photo-noise margins and the stability tables (--write regenerates public/margins.js)
```

Live scans need a YouCam API key. Copy `.env.example` to `.env`, add `YOUCAM_API_KEY`, and deploy to Vercel (`api/scan.js` and `api/simulate.js` are the only server code; `lib/youcam.js` holds the shared client). `LIVE_FLOOR` (default 48) is the balance below which live scans and previews pause. Without a key the app still runs on the sample faces.

Regenerate a sample face or preview (costs units, cached after the first run):

```bash
node --env-file=.env scripts/scan.mjs <name> <photo.jpg>
node --env-file=.env scripts/simulate.mjs <persona-id> <concern> [0-1]
```

## Spend and safety

- Sample faces and previews are saved in `public/personas/`, so judging never spends units.
- Live scans and live previews check the account balance first (a free call) and pause below `LIVE_FLOOR` units (default 48). The Try page asks once on load (`GET /api/scan?capacity=1`) and says "paused" before anyone uploads. A rate-limited (429) call is retried once; nothing else is retried, so a scan can never be charged twice.
- The API key stays server-side in `api/scan.js` and `api/simulate.js`. Failures are logged by status and error code only, never the photo. The browser resizes photos to 1600px before upload to stay under Vercel's 4.5 MB body limit.

## Privacy

If you scan your own face, the photo goes to the YouCam API for analysis. We keep nothing on our server (your browser holds the results only until you close the tab), and YouCam deletes uploads after 24 hours (per their docs). Sample faces are free-license Unsplash photos; scores demonstrate the API and are not a statement about these people.

## Credits

Sample face photos from Unsplash: Hassan Khan, Jake Nackos and Imansyah Muhamad Putera. Seven test-only portraits (not shown, not in the repo, scores only): Divine Effiong, Luke Southern, Andre Styles, eee plus, Omar Abozeid, Michael Thomson and Muthia Ashifa Salsabella (Unsplash License). Product names are fictional. Design cues from the author's Telogify and Portfolio projects.

## Evidence

- `npm test`: planted-score tests (one weak concern matches only its product, perfect skin skips everything, missing scores are Unclear) plus real-scan checks. We also broke the comparison on purpose to confirm the tests go red.
- `npm run recheck`: a separate Python implementation, written from the rules above, recomputes every face x product verdict (including the too-close band, with margins it derives itself from the raw scans) and compares it with the app's JavaScript output. Result: 36 of 36 agree; the three faces get three different shelves (Match/Partial/Skip/Too close counts of 0/0/9/3, 0/3/7/2 and 1/2/8/1).
- **Stability** (`/evidence/`, `scripts/margins.py`): 21 extra scans of 5 faces under photo changes (two faces are test-only portraits that are never shown). Ordinary changes (darker, warm light, tilt) flipped 7 of 180 verdicts and the band flagged 4 of them in advance. On the 4 faces it was not fitted to, 6 verdicts flipped in 12 photo changes, it flagged 3, and all 6 came from the 25% darker photo. Blur flipped 5 of 12 on Sample B.
- **Five more test portraits** (`stability/t1` to `t5`): scanned once and once darker (10 scans, all 15 concerns returned on every one). The darker photo flipped 4 of 60 verdicts and the band flagged 3 of those 4. Reported on their own; no figure above uses them.
- **Previews measured by YouCam itself:** 3 of 5 Skin Simulation previews show a change its analyzer can measure (eye bags +17.7, dark circles +8.9, oiliness +18.4). Both pore previews do not (+1.7, -1.4).

## Limits

Three sample faces and a handful of scans, so the cut-offs are not population-calibrated. The photo-noise margins come from one face's three ordinary photo changes (the pore margin of 14.3 is driven by one face), and the four other faces are a test the band passed only partly (it flagged half of the flips; the two test portraits are dark-background, dramatically lit photos, a harder case than a selfie by a window). This is cosmetic guidance, not medical advice.

## License

MIT
