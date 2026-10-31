# Receipts

**Skincare advice that's allowed to say no.**

Most beauty recommenders are paid to say yes. Receipts measures your skin once with the YouCam Skin Analysis API, then gives every product on a shelf a **Match**, **Partial** or **Skip**, with your own scores as the receipt.

Live demo: https://receipts-skin.vercel.app (sample faces work with no sign-in; "Scan my face" runs a real YouCam scan)

Built for the YouCam API Skin AI & eCommerce VTO Hackathon (Skin AI track).

## Pages

| Page | Job |
|---|---|
| `/` Landing | One tap to a sample face, plus a rotating tape of real receipts |
| `/try/` Try | Three steps: choose a face or upload one, analyze, then read your shelf. Deep links work: `/try/?face=s2&p=toner` opens a receipt |
| `/how/` How it works | The rules, the APIs, your photo, and what this is not |

One document scroll everywhere: only the header is fixed. A receipt opens as a focused overlay (a bottom sheet on phones).

## What it does

1. **Scan.** A selfie goes to YouCam Skin Analysis (SD, 14 scored concerns, 16 units per scan).
2. **Measure.** Each concern comes back as a raw score from 1 to 100 plus a detection mask. Tap any row to see where it was measured.
3. **Verdict.** Each product targets one or more concerns. Plain arithmetic on your scores decides the verdict. There is no AI opinion in the loop, so every verdict can be audited.
4. **Preview.** For products where YouCam Skin Simulation can render the concern, a before/after slider shows a predicted result, labeled "predicted, not a promise".

The receipt is the product: the stamp, the line items and the mask on the face show exactly why a product got its verdict.

## YouCam APIs used

| API | Used for | Cost |
|---|---|---|
| Skin Analysis v2 (`/s2s/v2.0/task/skin-analysis`) | 14 concern scores and masks, skin type, skin age | 16 units per scan |
| Skin Simulation v2 (`/s2s/v2.0/task/skin-simulation`) | Predicted before/after preview, saved per sample face | 4 units per preview |

Notes from building against it:
- `ui_score` is calibrated to flatter ("adjusted to produce more favorable results", per the docs). Verdicts use `raw_score`. Measured on our three sample faces, scoring with `ui_score` instead would change 8 of 36 verdicts.
- Hydration reads 52 to 62 on all five faces we scanned, which would give everyone a hydration "Match". It has its own cut-offs (50 and 65). These cut-offs are heuristics from five faces, not clinical thresholds.
- A failed scan (bad angle, glare) costs nothing; units are charged only on success.

## How verdicts are decided

`public/verdict.js` is one pure function used by both the browser and the tests.

- Take the product's targeted concerns and pick the one furthest below its cut-off.
- Below the weak cut-off (65, hydration 50): **Match**. Between weak and fine (80, hydration 65): **Partial**. At or above fine: **Skip**.
- A missing or non-numeric score returns **Unclear**, never a guess.

## Run it

```bash
npm test                      # verdict logic, plus checks that the three pages stay consistent
npm run recheck               # independent Python re-derivation of all 36 verdicts; must match the app exactly
python3 -m http.server 8080 --directory public   # sample faces work with no API key
node scripts/contrast.mjs     # WCAG contrast check for both themes
```

Live scans need a YouCam API key. Copy `.env.example` to `.env`, add `YOUCAM_API_KEY`, and deploy to Vercel (`api/scan.js` is the only server code). Without a key the app still runs on the sample faces.

Regenerate a sample face or preview (costs units, cached after the first run):

```bash
node --env-file=.env scripts/scan.mjs <name> <photo.jpg>
node --env-file=.env scripts/simulate.mjs <persona-id> <concern> [0-1]
```

## Spend and safety

- Sample faces and previews are saved in `public/personas/`, so judging never spends units.
- Live scans check the account balance first (a free call) and refuse below 200 units.
- The API key stays server-side in `api/scan.js`. The browser resizes photos to 1600px before upload to stay under Vercel's 4.5 MB body limit.

## Privacy

If you scan your own face, the photo goes to the YouCam API for analysis. This site stores nothing, and YouCam deletes uploads after 24 hours (per their docs). Sample faces are free-license Unsplash photos; scores demonstrate the API and are not a statement about these people.

## Credits

Sample face photos from Unsplash: Hassan Khan, Jake Nackos and Imansyah Muhamad Putera. Product names are fictional. Design cues from the author's Telogify and Portfolio projects.

## Evidence

- `npm test`: planted-score tests (one weak concern matches only its product, perfect skin skips everything, missing scores are Unclear) plus real-scan checks. We also broke the comparison on purpose to confirm the tests go red.
- `npm run recheck`: a separate Python implementation, written from the rules above, recomputes every face x product verdict and compares it with the app's JavaScript output. Result: 36 of 36 agree; the three faces get three different shelves (Match/Partial/Skip counts of 0/1/11, 1/3/8 and 2/2/8).

## Limits

Three sample faces and a handful of scans, so the cut-offs are not population-calibrated. This is cosmetic guidance, not medical advice.

## License

MIT
