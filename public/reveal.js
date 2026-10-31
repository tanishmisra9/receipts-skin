// Scroll reveal (same blur-fade as Telogify's ScrollReveal): only things below the fold start hidden,
// so nothing visible at load ever waits on this script. No JS or reduced motion: everything just shows.
const items = [...document.querySelectorAll('[data-reveal]')];
if (items.length && 'IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e, i) => {
      e.target.style.transitionDelay = `${Math.min(i, 4) * 60}ms`; // Telogify's 0.06s stagger
      e.target.classList.add('in');
      io.unobserve(e.target);
    });
  });
  items.forEach((el) => {
    if (el.getBoundingClientRect().top < innerHeight) return; // in view, or already scrolled past
    el.classList.add('rv');
    io.observe(el);
  });
}
