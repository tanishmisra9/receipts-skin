// Live Skin Simulation preview for one concern (4 units). POST ?concern=KEY image/jpeg -> {task}; GET ?task=ID -> {status, url?}.
import { SIM_KEY } from '../lib/sim.js';
import { yc, units, upload, json, logError, FLOOR, FRIENDLY } from '../lib/youcam.js';

const MAX_BYTES = 4_000_000;
const INTENSITY = 0.8; // the same setting as the saved sample previews

export default {
  async fetch(request) {
    if (!process.env.YOUCAM_API_KEY) return json({ message: 'Live previews are not configured.' }, 503);
    const url = new URL(request.url);
    try {
      if (request.method === 'GET') {
        const task = url.searchParams.get('task') ?? '';
        if (!/^[\w-]{10,200}$/.test(task)) return json({ message: 'Bad task id.' }, 400);
        const { data } = await yc(`/s2s/v2.0/task/skin-simulation/${task}`);
        if (data.task_status === 'running') return json({ status: 'running' });
        const out = data.results?.url ?? data.results?.output?.[0]?.url;
        if (data.task_status !== 'success' || !out) return json({ status: 'error', message: FRIENDLY[data.error] ?? 'The preview could not be made.' });
        return json({ status: 'success', url: out }); // valid ~2h, like masks
      }
      if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);

      const concern = url.searchParams.get('concern');
      if (!Object.hasOwn(SIM_KEY, concern)) return json({ message: 'That concern cannot be previewed.' }, 400);
      const img = Buffer.from(await request.arrayBuffer());
      if (!img.length || img.length > MAX_BYTES) return json({ message: 'Photo is empty or too large.' }, 413);
      if (await units() < FLOOR) return json({ message: 'Live previews are paused to protect the demo budget.' }, 503);

      const { data } = await yc('/s2s/v2.0/task/skin-simulation', { method: 'POST', body: JSON.stringify({ src_file_id: await upload(img), [SIM_KEY[concern]]: INTENSITY }) });
      return json({ task: data.task_id });
    } catch (e) {
      logError('simulate', e);
      return json({ message: FRIENDLY[e.body?.error] ?? 'The preview service had a problem. Please retry.' }, 502);
    }
  },
};
