# YouCam API: what we learned

A running log of facts about the YouCam API that we observed or verified while building Receipts. Each entry says how we know it (**measured**, **docs**, or **assumed**). Add to it whenever we learn something. No keys or secrets belong here.

## Access and units
- Host `https://yce-api-01.makeupar.com`. Auth is `Authorization: Bearer <YOUCAM_API_KEY>`. The secret key is not needed for v2. (docs)
- Balance is a free call: `GET /s2s/v1.0/client/credit`, sum `results[].amount_dec`. (measured)
- Skin Analysis SD v2.1 costs 9 / 12 / 14 / 16 units for 1-4 / 5-8 / 9-12 / 13-16 requested actions. Asking for all 15 concerns plus `skin_type` is 16 units. (docs, confirmed by balance changes: 16 per scan)
- Skin Simulation costs 4 units for 1-4 concerns, 6 for 5-10. Hair/makeup VTO 1, clothes/bag/shoes/hat VTO 2. (docs)
- Failed scans cost nothing; units are charged only on success. (measured)
- Rate limit 5 QPS / 250 per 300 s. (docs)
- Balance can move without us: one 16-unit gap turned out to be an extra live scan someone ran. Check usage history before assuming a bug. (measured)

## Skin Analysis flow
- `POST /s2s/v2.0/file` returns a presigned URL; `PUT` the JPEG there; `POST /s2s/v2.0/task/skin-analysis` with `{src_file_id, dst_actions, format: "json"}`; poll `GET .../skin-analysis/{task_id}` until `task_status` is not `running`. A scan takes about 8 to 10 seconds. (measured)
- SD actions: `wrinkle droopy_upper_eyelid droopy_lower_eyelid firmness acne moisture eye_bag dark_circle_v2 age_spot radiance redness oiliness pore texture tear_trough skin_type`. That is **15 concerns** plus skin type. Never mix SD and HD. (measured: every saved scan has 15 concern keys)
- Only 12 of the 15 are shoppable. The three eyelid / tear-trough concerns are anatomy, not something a product fixes. (our choice)
- The response also carries `skin_age` (shown on our results line as "YouCam's estimate", never used in a verdict) and a per-region `skin_type` (whole, T-zone, U-zone). (measured)
- Each concern has `raw_score` (1-100, higher is healthier) and `ui_score`. The docs say `ui_score` is "adjusted to produce more favorable results". Scoring with `ui_score` instead of `raw_score` would change 8 of our 36 verdicts. (docs + measured)
- Per-concern detection masks come back as `maskUrl` (our page reads `mask`, so the server maps one to the other). The URL expires in about 2 hours, so download masks right away if you need them. (measured)
- Photo guidance: face over 60% of image width, even light, front-facing, short side at least 480 px, under 10 MB. (docs)
- Known error codes we mapped to plain language: `error_large_face_angle`, `error_no_face`, `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_lighting_dark`, `error_below_min_image_size`. (measured)

## Scores: how stable are they?
- **Same bytes, same scores.** Scanning an identical image twice gave scores within 0.01 on every shoppable concern. The API is deterministic. (measured, 1 face)
- **Different photo, different scores.** A 25% darker copy of the same face moved pores by 10.6 points, dark circles 3.6, hydration 3.0, acne 2.9, oiliness 2.4. Pores is the most light-sensitive concern we saw. (measured, 1 face, 1 variant)
- Hydration reads 52 to 62 on every face we scanned, so one set of cut-offs would give everyone the same verdict. It needs its own cut-offs. (measured, 5 faces)
- The sweep below has the full numbers. Short version: verdicts are mostly stable under ordinary photo changes, but one concern (pores) is very sensitive, and blur breaks several verdicts.

## Stability sweep (21 scans, 5 faces, 336 units)
Variants of each face, made with `scripts/perturb.py` and scanned with `scripts/stability.mjs`. "Ordinary" = 25% darker, warm light cast, 3 degree tilt. "Stress" = blur, 6% crop, JPEG quality 35. (all measured)
- **Photo-noise margin per concern** (largest change across the three ordinary variants on face s2, floor 2 points): acne 2.9, dark spots 3.3, dark circles 3.6, eye bags 2, firmness 4.6, hydration 3, oiliness 2.4, **pores 14.3**, radiance 2, redness 4.2, texture 2.5, wrinkles 2. The margins are in `public/margins.js`.
- **Pores are the outlier.** On s2: darker -> +10.6, warm light -> +14.3, tilt -> +0.7. On s1 the same changes moved pores 1.7 / 2.6 / 0.9, and on s3 -5.1 / -1.2 / -1.4. So the pore margin comes from one face and is wide.
- **Stress tests (s2):** blur moved pores by +44.5 and flipped 5 of 12 verdicts; JPEG q35 moved pores +15.1 and flipped 1; a 6% crop barely mattered (pores +1.6, 0 flips).
- **Ordinary photo changes flipped 7 of 180 verdicts** (15 scans x 12 products, 5 faces). The "too close to call" band flagged 4 of the 7 in advance.
- **Holdout (4 faces never used for the margins: s1, s3, and test-only portraits h1, h2):** 6 flips in 12 photo changes, the band flagged 3. **All 6 flips came from the 25% darker photo**, 5 of them on the two dark-background portraits. So the band is conservative but not complete, and lighting is the dominant risk. (measured)
- h1 and h2 are dramatically lit, dark-background portraits (Divine Effiong, Luke Southern, Unsplash), cropped so the face fills the frame: the uncropped photos failed with `error_src_face_too_small`, and a too-tight crop with `error_src_face_out_of_bound`. Those failures cost nothing. (measured)

## Five more faces and live previews (Nov 1)
- Five more test portraits (a base scan and a 25% darker copy each, 160 units): every scan returned all 15 concerns and a skin type. Shelf spread at baseline varied a lot (Match counts 2, 2, 8, 6, 4; Too close 2, 7, 2, 3, 1). The darker photo flipped 4 of 60 verdicts; the band flagged 3 of the 4. (measured)
- Two of the five were first rejected by YouCam with `error_src_face_out_of_bound` (free): one face filled the whole frame, the other had its hair cut off at the top. Giving the face headroom (and shrinking the over-large face onto a soft background) fixed both. (measured)
- **One scan failed transiently on its first try with an uncaught error and succeeded unchanged on a rerun.** We have no error body, so the cause is unconfirmed; the live endpoints now retry a 429 once and log the status and code of any failure. (measured)
- **Skin Simulation has a stricter face-bounds check than Skin Analysis:** the dark low-key portrait scanned fine but its pore preview failed with "keep your whole face inside the frame" (free). The live preview surfaces that message. (measured, 1 case)
- Skin Simulation through our endpoint took 3.5 to 6.6 seconds per preview, returned 1.4 to 2.1 MB images, and the download's content type was `binary/octet-stream` (an `<img>` still loads it). Six of seven previews succeeded, 4 units each, charged only on success. (measured)
- Skin age returned by the API on these faces: 25, 32, 67, 84, 24. (measured; shown to users as YouCam's estimate, not used in any verdict)

## Photo brightness does not predict stability
- Centre-of-face mean brightness (0 to 255) of each base photo: Sample A 156, Sample B 181, Sample C 122, Test D 72, Test E 92. The 25% darker copies: Sample A 117, Sample C 91, Test D 53, Test E 68. (measured, from the saved photos)
- The two dark-background test portraits are darker than the dimmed light-skinned samples, and were fine until dimmed. So no absolute brightness cut-off separates a safe photo from an unsafe one, and one would warn on well-lit darker skin. We therefore do not gate on brightness; the app answers lighting risk with "Too close" and a second photo. YouCam itself rejects very dark photos for free (`error_lighting_dark`). (derived)
- Photo guidance from the docs: the face should fill over 60% of the image width. Our in-browser camera crops its capture to a centred 3:4 window and shows an oval at 66% of that width for this reason. (docs, our choice)

## Skin Analysis on Skin Simulation output
- The analyzer accepts a Skin Simulation image as input and scores it normally. (measured)
- Re-measured previews (before -> preview, points): s2 pores 52 -> 54 (+1.7), s2 eye bags 69 -> 86 (+17.7), s3 pores 64 -> 63 (-1.4), s3 dark circles 76 -> 85 (+8.9), s3 oiliness 54 -> 72 (+18.4). **Eye bags, dark circles and oiliness previews show a change the analyzer measures. Both pore previews show none** (inside the 14.3 margin). (measured, 5 previews)
- Previews also nudge other concerns (for example the oiliness preview moved acne +2.9 and radiance +2.6). (measured)

## Skin Simulation
- Takes one concern name with an intensity from 0 to 1; returns an image URL valid for about 2 hours. Our keys: `wrinkle radiance oiliness acne eye_bags dark_circle spots pores texture redness`. Firmness and hydration cannot be simulated. (measured)
- Preview images are saved with the repo so judges never spend units. (our choice)

## Data retention
- Uploaded files are deleted after 24 hours, per the current (v1.9) docs. The older v1.8 docs gave different figures for results, so this may change; the live docs are authoritative per the API terms. (docs, from a web search; we did not read the endpoint page ourselves)

## Open questions
- Is the pore margin really about warm light on one face, or does it show up on other faces with a stronger colour cast? (we only have s2 for the margin)
- Would a larger intensity setting on the pore preview produce a measurable change? We only tried 0.8.
