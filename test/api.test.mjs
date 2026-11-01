import test from 'node:test';
import assert from 'node:assert/strict';

process.env.YOUCAM_API_KEY = 'test-key';
const { yc, FLOOR, live } = await import('../lib/youcam.js');
const scan = (await import('../api/scan.js')).default;
const sim = (await import('../api/simulate.js')).default;

// Replace fetch with a queue of canned responses; returns the list of requested URLs.
function stub(...responses) {
  const calls = []; const real = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(String(url)); const r = responses.shift(); if (!r) throw new Error('unexpected extra fetch'); return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 }); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const credit = (n) => ({ body: { results: [{ amount_dec: n }] } });

test('the live floor defaults to 48 units (a video retake, a smoke test and a buffer)', () => assert.equal(FLOOR, 48));

test('yc retries a 429 once, and only a 429', async () => {
  let s = stub({ status: 429 }, { body: { ok: 1 } });
  try { assert.deepEqual(await yc('/x'), { ok: 1 }); assert.equal(s.calls.length, 2); } finally { s.restore(); }
  s = stub({ status: 429 }, { status: 429, body: { error: 'rate' } });
  try { await assert.rejects(yc('/x'), (e) => e.status === 429 && e.body.error === 'rate'); assert.equal(s.calls.length, 2); } finally { s.restore(); }
  s = stub({ status: 500, body: { error: 'boom' } });
  try { await assert.rejects(yc('/x'), (e) => e.status === 500); assert.equal(s.calls.length, 1); } finally { s.restore(); } // a 500 may have been processed: never retried
});

test('capacity: live only while the balance is at or above the floor; a failing balance call reads as paused', async () => {
  let s = stub(credit(FLOOR));
  try { assert.equal(await live(), true); } finally { s.restore(); }
  s = stub(credit(FLOOR - 1));
  try { assert.equal(await live(), false); } finally { s.restore(); }
  s = stub({ status: 500 });
  try { assert.equal(await live(), false); } finally { s.restore(); }
});

test('GET /api/scan?capacity=1 answers {live} and never throws', async () => {
  const s = stub(credit(500));
  try { assert.deepEqual(await (await scan.fetch(new Request('http://x/api/scan?capacity=1'))).json(), { live: true }); } finally { s.restore(); }
});

test('/api/simulate: unknown concerns and oversize photos are refused before any YouCam call; below the floor it pauses', async () => {
  const s = stub(); // any fetch would throw "unexpected extra fetch"
  try {
    const bad = await sim.fetch(new Request('http://x/api/simulate?concern=firmness', { method: 'POST', body: new Uint8Array(10) }));
    assert.equal(bad.status, 400);
    assert.equal((await sim.fetch(new Request('http://x/api/simulate?concern=__proto__', { method: 'POST', body: new Uint8Array(10) }))).status, 400);
    assert.equal((await sim.fetch(new Request('http://x/api/simulate?concern=pore', { method: 'POST', body: new Uint8Array(4_000_001) }))).status, 413);
    assert.equal((await sim.fetch(new Request('http://x/api/simulate?concern=pore', { method: 'POST', body: new Uint8Array(0) }))).status, 413);
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
  const low = stub(credit(FLOOR - 1));
  try { assert.equal((await sim.fetch(new Request('http://x/api/simulate?concern=pore', { method: 'POST', body: new Uint8Array(10) }))).status, 503); } finally { low.restore(); }
});

test('/api/simulate: a finished task returns the image URL; a failed one returns a message', async () => {
  let s = stub({ body: { data: { task_status: 'success', results: { url: 'https://cdn.example/p.jpg' } } } });
  try { assert.deepEqual(await (await sim.fetch(new Request('http://x/api/simulate?task=abcdefghij1234'))).json(), { status: 'success', url: 'https://cdn.example/p.jpg' }); } finally { s.restore(); }
  s = stub({ body: { data: { task_status: 'error', error: 'error_no_face' } } });
  try { assert.match((await (await sim.fetch(new Request('http://x/api/simulate?task=abcdefghij1234'))).json()).message, /find a face/); } finally { s.restore(); }
});

test('the browser list of simulable concerns equals the server list', async () => {
  const { SIM_KEY } = await import('../lib/sim.js'); const { SIM_CONCERNS } = await import('../public/sim.js');
  assert.deepEqual([...SIM_CONCERNS].sort(), Object.keys(SIM_KEY).sort());
});
