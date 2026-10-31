// Live scan. POST image/jpeg -> {task}; GET ?task=ID -> {status, scores?}. API key stays server-side.
import { normalize, ACTIONS } from '../lib/normalize.js';

const API = 'https://yce-api-01.makeupar.com';
const MAX_BYTES = 4_000_000;          // Vercel caps request bodies at 4.5 MB
const FLOOR = 200;                    // refuse live scans below this many units; samples always work
const FRIENDLY = {
  error_large_face_angle: 'Face the camera straight on, with your head level.',
  error_no_face: 'We could not find a face. Try again in better light.',
  error_src_face_too_small: 'Move closer. Your face should fill most of the frame.',
  error_src_face_out_of_bound: 'Keep your whole face inside the frame.',
  error_lighting_dark: 'It is too dark. Face a window or a lamp.',
  error_below_min_image_size: 'That photo is too small. Try a larger one.',
};

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function yc(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`YouCam ${r.status}`), { body });
  return body;
}

export default {
  async fetch(request) {
    if (!process.env.YOUCAM_API_KEY) return json({ message: 'Live scans are not configured. Try a sample face.' }, 503);
    const url = new URL(request.url);
    try {
      if (request.method === 'GET') {
        const task = url.searchParams.get('task') ?? '';
        if (!/^[\w-]{10,200}$/.test(task)) return json({ message: 'Bad task id.' }, 400);
        const { data } = await yc(`/s2s/v2.0/task/skin-analysis/${task}`);
        if (data.task_status === 'running') return json({ status: 'running' });
        if (data.task_status !== 'success') return json({ status: 'error', message: FRIENDLY[data.error] ?? data.error_message ?? 'Scan failed.' });
        return json({ status: 'success', scores: normalize(data.results.output) }); // masks are remote URLs, valid ~2h
      }
      if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

      const img = Buffer.from(await request.arrayBuffer());
      if (!img.length || img.length > MAX_BYTES) return json({ message: 'Photo is empty or too large.' }, 413);
      // ponytail: balance check is not atomic; a burst can overshoot FLOOR by a few scans. Use a counter store if abused.
      const units = (await yc('/s2s/v1.0/client/credit')).results.reduce((s, t) => s + t.amount_dec, 0);
      if (units < FLOOR) return json({ message: 'Live scans are paused to protect the demo budget. Please try a sample face.' }, 503);

      const f = (await yc('/s2s/v2.0/file', { method: 'POST', body: JSON.stringify({ files: [{ content_type: 'image/jpeg', file_name: 'scan.jpg', file_size: img.length }] }) })).data.files[0];
      const put = await fetch(f.requests[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: img });
      if (!put.ok) return json({ message: 'Upload failed. Please retry.' }, 502);
      const { data } = await yc('/s2s/v2.0/task/skin-analysis', { method: 'POST', body: JSON.stringify({ src_file_id: f.file_id, dst_actions: ACTIONS, format: 'json' }) });
      return json({ task: data.task_id });
    } catch (e) {
      return json({ message: FRIENDLY[e.body?.error] ?? 'The skin analysis service had a problem. Please retry.' }, 502);
    }
  },
};
