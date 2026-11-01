// Take a selfie in the browser. The frame never leaves the page until the user takes the photo, and every camera track is stopped
// on capture, cancel, error, page hide or a hidden tab. The preview is mirrored (CSS only); the captured frame is not.
// The capture is cropped to the same 3:4 window the preview shows, so the face fills the frame as YouCam asks (over 60% of its width).
export const cameraSupported = () => !!navigator.mediaDevices?.getUserMedia && isSecureContext;

const RATIO = 3 / 4, SECONDS = 3;

// Plain-language message for a getUserMedia failure.
export function cameraError(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Camera access was blocked. Allow it in your browser, or choose a photo instead.';
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'We could not find a camera. Choose a photo instead.';
  if (e?.name === 'NotReadableError') return 'Another app is using the camera. Close it, or choose a photo instead.';
  return 'The camera did not start. Choose a photo instead.';
}

// Largest centred window of the video with the preview's 3:4 shape: [sx, sy, sw, sh].
export function cropWindow(vw, vh) {
  const sw = vw / vh > RATIO ? vh * RATIO : vw, sh = vw / vh > RATIO ? vh : vw / RATIO;
  return [(vw - sw) / 2, (vh - sh) / 2, sw, sh];
}

// Resolves to a JPEG File, or null if the user cancelled / the signal aborted / the tab was hidden. Rejects if the camera cannot start or stops
// working (a lost track, an empty frame), so the caller can say so instead of closing silently.
export async function captureSelfie({ video, count, shoot, cancel, onReady, signal }) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
  return new Promise((resolve, reject) => {
    let timer = null, finished = false;
    const end = (file, err) => {
      if (finished) return; finished = true;
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null; count.textContent = '';
      shoot.removeEventListener('click', go); cancel.removeEventListener('click', quit);
      signal?.removeEventListener('abort', quit); removeEventListener('pagehide', quit); document.removeEventListener('visibilitychange', onVisibility);
      err ? reject(err) : resolve(file);
    };
    const quit = () => end(null);
    const fail = () => end(null, Object.assign(new Error('The camera stopped.'), { name: 'EmptyFrame' }));
    const onVisibility = () => { if (document.hidden) quit(); }; // pagehide does not fire for a hidden tab or a locked phone
    function go() {
      shoot.disabled = true; let n = SECONDS; count.textContent = String(n);
      timer = setInterval(() => {
        if (--n > 0) { count.textContent = String(n); return; }
        clearInterval(timer);
        if (!video.videoWidth || !video.videoHeight) return fail();
        const [sx, sy, sw, sh] = cropWindow(video.videoWidth, video.videoHeight);
        const k = Math.min(1, 1280 / sh), c = document.createElement('canvas');
        c.width = Math.round(sw * k); c.height = Math.round(sh * k);
        c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
        c.toBlob((b) => b ? end(new File([b], 'selfie.jpg', { type: 'image/jpeg' })) : fail(), 'image/jpeg', .92);
      }, 1000);
    }
    shoot.addEventListener('click', go); cancel.addEventListener('click', quit);
    signal?.addEventListener('abort', quit); addEventListener('pagehide', quit); document.addEventListener('visibilitychange', onVisibility);
    stream.getTracks().forEach((t) => t.addEventListener('ended', fail)); // unplugged, or access taken away
    if (signal?.aborted || document.hidden) return quit();
    video.srcObject = stream; shoot.disabled = false;
    video.play().then(() => { if (!finished) onReady?.(); }, fail);
  });
}
