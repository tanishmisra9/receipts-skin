// Shared by the live endpoints (api/scan.js, api/simulate.js): the key stays server-side, one retry on a rate limit,
// a floor so judges cannot spend the last units, and errors logged by code only (never the photo).
const API = 'https://yce-api-01.makeupar.com';
export const FLOOR = Number(process.env.LIVE_FLOOR ?? 48); // live calls pause below this many units; 48 = a video retake, a smoke test and a buffer

export const FRIENDLY = {
  error_large_face_angle: 'Face the camera straight on, with your head level.',
  error_no_face: 'We could not find a face. Try again in better light.',
  error_src_face_too_small: 'Move closer. Your face should fill most of the frame.',
  error_src_face_out_of_bound: 'Keep your whole face inside the frame.',
  error_lighting_dark: 'It is too dark. Face a window or a lamp.',
  error_below_min_image_size: 'That photo is too small. Try a larger one.',
  upload_failed: 'Upload failed. Please retry.',
};

export const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ponytail: retries a 429 once. A 429 is refused before it is processed, so a retry cannot double-charge; nothing else is retried.
export async function yc(path, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, 'Content-Type': 'application/json', ...opts.headers } });
    if (r.status === 429 && attempt === 0) { await sleep(1000); continue; }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`YouCam ${r.status}`), { status: r.status, body });
    return body;
  }
}

export const units = async () => (await yc('/s2s/v1.0/client/credit')).results.reduce((s, t) => s + t.amount_dec, 0);
export const live = async () => process.env.YOUCAM_API_KEY ? (await units().catch(() => 0)) >= FLOOR : false;

export async function upload(img) {
  const f = (await yc('/s2s/v2.0/file', { method: 'POST', body: JSON.stringify({ files: [{ content_type: 'image/jpeg', file_name: 'photo.jpg', file_size: img.length }] }) })).data.files[0];
  const put = await fetch(f.requests[0].url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: img });
  if (!put.ok) throw Object.assign(new Error('upload'), { status: 502, body: { error: 'upload_failed' } });
  return f.file_id;
}

export const logError = (route, e) => console.error(JSON.stringify({ route, status: e.status ?? null, code: e.body?.error ?? e.message }));
