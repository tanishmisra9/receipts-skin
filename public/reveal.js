// Scroll reveal (same blur-fade as Telogify's ScrollReveal): only things below the fold start hidden,
// so nothing visible ever waits on this script. No JS or reduced motion: everything just shows.
// Each page calls reveal() after its first render, because most sections are filled in by fetch.
const ok = 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const done = new WeakSet();

const io = ok && new IntersectionObserver((entries) => {
  entries.filter((e) => e.isIntersecting).forEach((e, i) => {
    e.target.style.transitionDelay = `${Math.min(i, 4) * 60}ms`; // Telogify's 0.06s stagger
    e.target.classList.add('in');
    io.unobserve(e.target);
  });
});

export function reveal(root = document) {
  if (!ok) return;
  root.querySelectorAll('[data-reveal]').forEach((el) => {
    if (done.has(el)) return;
    done.add(el);
    if (el.getBoundingClientRect().top < innerHeight) return; // in view, or already scrolled past
    el.classList.add('rv');
    // Once faded in, drop the hidden-state classes so no filter or layer lingers while scrolling on.
    el.addEventListener('transitionend', (e) => {
      if (e.target !== el || e.propertyName !== 'opacity') return;
      el.classList.remove('rv', 'in'); el.style.transitionDelay = '';
    }, { once: false });
    io.observe(el);
  });
}
