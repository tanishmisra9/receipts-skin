// Skin Simulation preview for one persona and one concern (4 units). Saves public/personas/<id>/sim/<concern>.jpg
// and records it in sim.json. Usage: node --env-file=.env scripts/simulate.mjs <persona-id> <concern> [intensity]
// Re-running an existing preview costs 0 units.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';

const API = 'https://yce-api-01.makeupar.com';
const KEY = process.env.YOUCAM_API_KEY;
// Our concern keys -> Skin Simulation's names. Firmness and hydration are not simulatable.
export const SIM_KEY = { wrinkle: 'wrinkle', radiance: 'radiance', oiliness: 'oiliness', acne: 'acne', eye_bag: 'eye_bags',
  dark_circle_v2: 'dark_circle', age_spot: 'spots', pore: 'pores', texture: 'texture', redness: 'redness' };

const [id, concern, intensity = '0.8'] = process.argv.slice(2);
if (!KEY || !id || !SIM_KEY[concern]) throw new Error(`usage: node --env-file=.env scripts/simulate.mjs <id> <${Object.keys(SIM_KEY).join('|')}> [0-1]`);
const dir = `public/personas/${id}`;
const exists = (p) => access(p).then(() => true, () => false);
if (await exists(`${dir}/sim/${concern}.jpg`)) { console.log('cached, 0 units'); process.exit(0); }

const call = async (path, opts = {}) => {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...opts.headers } });
  const body = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(body)}`);
  return body;
};
const balance = async () => (await call('/s2s/v1.0/client/credit')).results.reduce((s, t) => s + t.amount_dec, 0);

const img = await readFile(`${dir}/photo.jpg`);
const before = await balance();
const f = (await call('/s2s/v2.0/file', { method: 'POST', body: JSON.stringify({ files: [{ content_type: 'image/jpeg', file_name: `${id}.jpg`, file_size: img.length }] }) })).data.files[0];
const put = await fetch(f.requests[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: img });
if (!put.ok) throw new Error(`upload ${put.status}`);

const { task_id } = (await call('/s2s/v2.0/task/skin-simulation', { method: 'POST', body: JSON.stringify({ src_file_id: f.file_id, [SIM_KEY[concern]]: Number(intensity) }) })).data;
let res;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  res = await call(`/s2s/v2.0/task/skin-simulation/${task_id}`);
  if (res.data.task_status !== 'running') break;
}
if (res.data.task_status !== 'success') throw new Error(`task ended: ${res.data.task_status} ${JSON.stringify(res.data)}`);

const url = res.data.results.url ?? res.data.results.output?.[0]?.url;
const out = await fetch(url);
if (!out.ok) throw new Error(`download ${out.status}`);
await mkdir(`${dir}/sim`, { recursive: true });
await writeFile(`${dir}/sim/${concern}.jpg`, Buffer.from(await out.arrayBuffer()));
const manifest = (await exists(`${dir}/sim.json`)) ? JSON.parse(await readFile(`${dir}/sim.json`)) : {};
manifest[concern] = { file: `sim/${concern}.jpg`, intensity: Number(intensity) };
await writeFile(`${dir}/sim.json`, JSON.stringify(manifest, null, 2));
console.log(`saved ${dir}/sim/${concern}.jpg, units spent: ${before - (await balance())}`);
