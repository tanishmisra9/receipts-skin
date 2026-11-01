// One reveal for the whole site, Telogify's BlurFade and ScrollReveal: blur 10px and a 10px rise, a spring curve, top down.
// [data-reveal] blocks are hidden before first paint (the inline <head> script adds `lo`), so nothing snaps in. They start once the
// fonts are ready (no font swap mid-fade). Blocks that are in view fade in top down; the rest fade in as they scroll into view.
// A page with [data-wait] blocks (filled by a fetch) holds everything below its header until its script calls reveal() (or 2.5 s),
// so an empty shell is never shown and the order stays top down.
// No JS or reduced motion: nothing is ever hidden. Never put data-reveal on .btn, .card or .sample: they own a hover transform.
const html = document.documentElement;
const ok = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches;
clearTimeout(window.__lo); // the module started, so the "page is stuck" rescue timer is not needed
if (!ok) html.classList.remove('lo');

const STEP = 70, CAP = 8, FONTS_MS = 700, WAIT_MS = 2500, FADE_MS = 520; // Telogify steps its blocks 60 to 80 ms apart
const done = new WeakSet();
const fontsReady = Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, FONTS_MS))]);

// Drop the attribute when the fade ends, so no filter, transition or layer lingers. A timer backs up transitionend, which never
// fires if the tab is hidden mid-fade.
const finish = (el) => { el.removeAttribute('data-reveal'); el.removeAttribute('data-wait'); el.classList.remove('in'); el.style.transitionDelay = ''; };
function play(el, delay) {
  el.style.transitionDelay = `${delay}ms`;
  el.classList.add('in');
  el.addEventListener('transitionend', (e) => { if (e.target === el && e.propertyName === 'opacity') finish(el); });
  setTimeout(() => finish(el), delay + FADE_MS + 300);
}

const io = ok && new IntersectionObserver((entries) => {
  entries.filter((e) => e.isIntersecting).forEach((e, i) => { play(e.target, Math.min(i, 4) * 60); io.unobserve(e.target); });
});

function run(root, all) {
  if (!ok) return;
  const els = [...root.querySelectorAll('[data-reveal]')]
    .filter((el) => !done.has(el) && !el.closest('[hidden]') && (all || !el.hasAttribute('data-wait')));
  const seen = [], later = [];
  for (const el of els) {
    done.add(el);
    const top = el.getBoundingClientRect().top;
    (top < innerHeight ? seen : later).push([top, el]); // in view, or already scrolled past
  }
  seen.sort((a, b) => a[0] - b[0]).forEach(([, el], i) => play(el, Math.min(i, CAP) * STEP));
  later.forEach(([, el]) => io.observe(el));
}

// reveal(): call after a page (or a step) has rendered its content. Safe to call again: it only touches blocks not yet handled.
export const reveal = (root = document) => fontsReady.then(() => run(root, true));

// Start: a page with fetched blocks fades its header in at once and holds the rest for its reveal() (or WAIT_MS), so everything below
// arrives together, top down, never one block ahead of a block above it. A page with none just starts.
fontsReady.then(() => {
  if (!document.querySelector('[data-wait]')) return run(document, true);
  const header = document.querySelector('.site-header');
  if (header) run(header, true);
  setTimeout(() => run(document, true), WAIT_MS);
});
