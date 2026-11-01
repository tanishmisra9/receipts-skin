// Scan one stability variant with YouCam Skin Analysis (16 units) and save only the scores.
// Usage: node --env-file=.env scripts/stability.mjs <face> <variant> [--sim]
// Reads stability-src/<face>/<variant>.jpg, writes public/stability/<face>/<variant>.json. Cached: re-running costs 0.
// With --sim, <variant> is a Skin Simulation concern: scans public/personas/<face>/sim/<concern>.jpg (the preview image)
// and writes public/personas/<face>/sim-scores/<concern>.json, to check what the analyzer measures on a predicted result.
// Refuses to run if the balance would drop below RESERVE, so judges can still run live scans.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { normalize, ACTIONS } from '../lib/normalize.js';

const API = 'https://yce-api-01.makeupar.com';
const KEY = process.env.YOUCAM_API_KEY;
const RESERVE = Number(process.env.RESERVE) || 500; // override per run: RESERVE=300 node ...scripts/stability.mjs ...
const [face, variant] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sim = process.argv.includes('--sim');
if (!KEY || !face || !variant) throw new Error('usage: node --env-file=.env scripts/stability.mjs <face> <variant>');
const outDir = sim ? `public/personas/${face}/sim-scores` : `public/stability/${face}`;
const outFile = `${outDir}/${variant}.json`;
if (await access(outFile).then(() => true, () => false)) { console.log(`${face}/${variant}: cached, 0 units`); process.exit(0); }

const call = async (path, opts = {}) => {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...opts.headers } });
  const body = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(body)}`);
  return body;
};
const balance = async () => (await call('/s2s/v1.0/client/credit')).results.reduce((s, t) => s + t.amount_dec, 0);

const before = await balance();
if (before - 16 < RESERVE) throw new Error(`balance ${before}: a scan would drop it below the ${RESERVE} reserve`);
const img = await readFile(sim ? `public/personas/${face}/sim/${variant}.jpg` : `stability-src/${face}/${variant}.jpg`);
const f = (await call('/s2s/v2.0/file', { method: 'POST', body: JSON.stringify({ files: [{ content_type: 'image/jpeg', file_name: `${face}-${variant}.jpg`, file_size: img.length }] }) })).data.files[0];
const put = await fetch(f.requests[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: img });
if (!put.ok) throw new Error(`upload ${put.status}`);
const { task_id } = (await call('/s2s/v2.0/task/skin-analysis', { method: 'POST', body: JSON.stringify({ src_file_id: f.file_id, dst_actions: ACTIONS, format: 'json' }) })).data;
let res;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  res = await call(`/s2s/v2.0/task/skin-analysis/${task_id}`);
  if (res.data.task_status !== 'running') break;
}
if (res.data.task_status !== 'success') { console.log(`${face}/${variant}: ${res.data.task_status} ${res.data.error ?? ''} (failed scans are free)`); process.exit(1); }
const s = normalize(res.data.results.output);
const concerns = Object.fromEntries(Object.entries(s.concerns).map(([k, c]) => [k, { raw: c.raw, ui: c.ui }]));
await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify({ face, variant, concerns, skin_type: s.skin_type, skin_age: s.skin_age }, null, 2));
console.log(`${face}/${variant}: saved, units spent ${before - (await balance())}`);
