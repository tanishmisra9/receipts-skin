// Everything on the Evidence page, computed from the saved scans with the same verdict code the app uses.
// `load(path)` returns parsed JSON for a file under public/ (fetch in the browser, readFileSync in tests).
import { verdict, compareScans, SHOPPABLE } from './verdict.js';
import { MARGINS } from './margins.js';

export const FACES = ['s1', 's2', 's3'];
export const TEST_FACES = ['h1', 'h2']; // test-only portraits: scored against their own unchanged scan, never shown as samples
export const ORDINARY = ['dim', 'warm', 'tilt']; // the margin comes only from these, measured on s2
export const STRESS = ['blur', 'crop', 'jpeg'];  // reported, never used for the margin

const asUi = (concerns) => Object.fromEntries(Object.entries(concerns).map(([k, c]) => [k, { raw: c.ui }]));
const raw = { band: false };

export async function computeEvidence(load) {
  const products = await load('products.json');
  const scans = Object.fromEntries(await Promise.all(FACES.map(async (f) => [f, (await load(`personas/${f}/scores.json`)).concerns])));

  // 1. The flattering score: verdicts on ui_score vs raw_score.
  const flips = [];
  for (const f of FACES) for (const p of products) {
    const a = verdict(scans[f], p, raw), b = verdict(asUi(scans[f]), p, raw);
    if (a.verdict !== b.verdict) flips.push({ face: f, product: p, raw: a, ui: b });
  }

  // 2. Photo changes: flips of the unbanded verdict, and whether the band flagged that product in advance.
  const base = async (f) => (TEST_FACES.includes(f) ? (await load(`stability/${f}/base.json`)).concerns : scans[f]);
  const variants = (f) => (f === 's2' ? [...ORDINARY.map((v) => [v, 'ordinary']), ...STRESS.map((v) => [v, 'stress'])] : ORDINARY.map((v) => [v, 'ordinary']));
  const rows = [];
  for (const f of [...FACES, ...TEST_FACES]) for (const [v, group] of variants(f)) {
    const b = await base(f), alt = (await load(`stability/${f}/${v}.json`)).concerns;
    let n = 0, flagged = 0;
    for (const p of products) if (verdict(b, p, raw).verdict !== verdict(alt, p, raw).verdict) { n++; flagged += verdict(b, p).verdict === 'close'; }
    rows.push({ face: f, variant: v, group, flips: n, flagged });
  }
  const sum = (list, k) => list.reduce((s, r) => s + r[k], 0);
  const ordinary = rows.filter((r) => r.group === 'ordinary');
  const holdout = ordinary.filter((r) => r.face !== 's2');
  const close = FACES.map((f) => products.filter((p) => verdict(scans[f], p).verdict === 'close').length);

  // 3. Previews: what YouCam's analyzer measures on its own Skin Simulation images.
  const previews = [];
  const hasSim = new Set((await load('personas/index.json')).filter((x) => x.sim).map((x) => x.id));
  for (const f of FACES.filter((x) => hasSim.has(x))) {
    const sim = await load(`personas/${f}/sim.json`);
    for (const concern of Object.keys(sim)) {
      const after = (await load(`personas/${f}/sim-scores/${concern}.json`)).concerns;
      previews.push({ face: f, ...compareScans(scans[f], after, concern) });
    }
  }
  return {
    flattery: { flips, total: FACES.length * products.length },
    stability: { rows, ordinary: { flips: sum(ordinary, 'flips'), scans: ordinary.length, flagged: sum(ordinary, 'flagged'), comparisons: ordinary.length * products.length },
      holdout: { flips: sum(holdout, 'flips'), scans: holdout.length, flagged: sum(holdout, 'flagged'), faces: new Set(holdout.map((r) => r.face)).size, darkFlips: sum(holdout.filter((r) => r.variant === 'dim'), 'flips') }, close, margins: MARGINS, concerns: SHOPPABLE },
    previews,
  };
}
