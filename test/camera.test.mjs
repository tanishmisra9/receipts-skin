import test from 'node:test';
import assert from 'node:assert/strict';
import { cropWindow, cameraError } from '../public/camera.js';

test('cropWindow: a landscape frame is cropped to a centred 3:4 window; a portrait frame keeps its width', () => {
  const [sx, sy, sw, sh] = cropWindow(1280, 720);
  assert.equal(sh, 720); assert.equal(sw, 540); assert.equal(sx, 370); assert.equal(sy, 0);
  const [px, py, pw, ph] = cropWindow(720, 1280);
  assert.equal(pw, 720); assert.equal(ph, 960); assert.equal(px, 0); assert.equal(py, 160);
  const [, , w, h] = cropWindow(640, 480); assert.equal(w / h, 0.75);
});

test('cameraError: each failure gets a plain message that points back to choosing a photo', () => {
  for (const name of ['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError', undefined])
    assert.match(cameraError({ name }), /photo/);
  assert.match(cameraError(null), /photo/);
});
