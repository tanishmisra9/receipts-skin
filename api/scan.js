// Live scan. POST image/jpeg -> {task}; GET ?task=ID -> {status, scores?}; GET ?capacity=1 -> {live}. API key stays server-side.
import { normalize, ACTIONS } from '../lib/normalize.js';
import { yc, units, live, upload, json, logError, FLOOR, FRIENDLY } from '../lib/youcam.js';

const MAX_BYTES = 4_000_000;          // Vercel caps request bodies at 4.5 MB

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.searchParams.has('capacity')) return json({ live: await live() }); // lets the page say "paused" before an upload
    if (!process.env.YOUCAM_API_KEY) return json({ message: 'Live scans are not configured. Try a sample face.' }, 503);
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
      if (await units() < FLOOR) return json({ message: 'Live scans are paused to protect the demo budget. Please try a sample face.' }, 503);

      const { data } = await yc('/s2s/v2.0/task/skin-analysis', { method: 'POST', body: JSON.stringify({ src_file_id: await upload(img), dst_actions: ACTIONS, format: 'json' }) });
      return json({ task: data.task_id });
    } catch (e) {
      logError('scan', e);
      return json({ message: FRIENDLY[e.body?.error] ?? 'The skin analysis service had a problem. Please retry.' }, 502);
    }
  },
};
