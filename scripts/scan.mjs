// Scan one photo with YouCam Skin Analysis (SD, all concerns) into public/personas/<name>/.
// Usage: node --env-file=.env scripts/scan.mjs <name> <photo.jpg>
// Re-running a name that already has raw.json costs 0 units.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

import { normalize, ACTIONS } from '../lib/normalize.js';

const API = 'https://yce-api-01.makeupar.com';
const KEY = process.env.YOUCAM_API_KEY;

const [name, photo] = process.argv.slice(2);
if (!KEY || !name || !photo) throw new Error('usage: node --env-file=.env scripts/scan.mjs <name> <photo.jpg>');
const dir = `public/personas/${name}`;
const exists = (p) => access(p).then(() => true, () => false);

// raw.json -> scores.json + masks/ (mask URLs expire in ~2h, so download right away)
async function extract() {
  const scores = normalize(JSON.parse(await readFile(`${dir}/raw.json`)).data.results.output);
  await mkdir(`${dir}/masks`, { recursive: true });
  for (const [k, c] of Object.entries(scores.concerns)) {
    const m = c.maskUrl && await fetch(c.maskUrl);
    if (m?.ok) await writeFile(`${dir}/masks/${k}.png`, Buffer.from(await m.arrayBuffer()));
    scores.concerns[k] = { raw: c.raw, ui: c.ui, mask: m?.ok ? `masks/${k}.png` : null };
  }
  await writeFile(`${dir}/scores.json`, JSON.stringify(scores, null, 2));
}
if (await exists(`${dir}/scores.json`)) { console.log('cached, 0 units'); process.exit(0); }
if (await exists(`${dir}/raw.json`)) { await extract(); console.log('extracted from raw.json, 0 units'); process.exit(0); }

const call = async (path, opts = {}) => {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...opts.headers } });
  const body = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(body)}`);
  return body;
};
const balance = async () => (await call('/s2s/v1.0/client/credit')).results.reduce((s, t) => s + t.amount_dec, 0);

const img = await readFile(photo);
const before = await balance();

const f = (await call('/s2s/v2.0/file', { method: 'POST', body: JSON.stringify({ files: [{ content_type: 'image/jpeg', file_name: `${name}.jpg`, file_size: img.length }] }) })).data.files[0];
const put = await fetch(f.requests[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: img });
if (!put.ok) throw new Error(`upload ${put.status}`);

const { task_id } = (await call('/s2s/v2.0/task/skin-analysis', { method: 'POST', body: JSON.stringify({ src_file_id: f.file_id, dst_actions: ACTIONS, format: 'json' }) })).data;

let res;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  res = await call(`/s2s/v2.0/task/skin-analysis/${task_id}`);
  if (res.data.task_status !== 'running') break;
}
if (res.data.task_status !== 'success') throw new Error(`task ended: ${res.data.task_status} ${JSON.stringify(res.data)}`);
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/raw.json`, JSON.stringify(res, null, 2));

await writeFile(`${dir}/photo.jpg`, img);
await extract();
const after = await balance();
console.log(`status success, units spent: ${before - after}, raw saved to ${dir}/raw.json`);
