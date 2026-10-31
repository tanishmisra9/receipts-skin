// Local dev server for public/. Unlike `python3 -m http.server`, it sends `Cache-Control: no-store`,
// so the browser can never reuse a stale stylesheet or script. Run: npm run dev
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../public/', import.meta.url).pathname;
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};
const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = normalize(decodeURIComponent(url.pathname));
  if (path.includes('..')) return send(res, 400, 'Bad path');
  if (path.startsWith('/api/')) return send(res, 503, JSON.stringify({ message: 'Live scans are not available on the local server. Try a sample face.' }), 'application/json');
  let file = join(ROOT, path);
  const s = await stat(file).catch(() => null);
  if (s?.isDirectory()) {
    if (!path.endsWith('/')) return send(res, 308, '', 'text/plain', { Location: `${path}/${url.search}` }); // same as Vercel
    file = join(file, 'index.html');
  }
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] ?? 'application/octet-stream');
  } catch {
    console.log(`404 ${url.pathname}`);
    send(res, 404, 'Not found');
  }
}).listen(PORT, () => console.log(`Receipts dev server (no-store cache): http://localhost:${PORT}`));
