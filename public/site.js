// Shared by every page: logo, theme toggle, current-page nav state.
import { icon, logoMark } from '/icons.js';
import '/reveal.js';

const root = document.documentElement;
const $ = (id) => document.getElementById(id);

document.querySelectorAll('[data-logo]').forEach((el) => { el.innerHTML = `${logoMark(26)}<span>Receipts</span>`; });
$('iconMoon').innerHTML = icon('moon', 20);
$('iconSun').innerHTML = icon('sun', 20);

// Theme swap is instant on purpose: animating it breaks Safari (see Portfolio notes).
function setTheme(t, save = true) {
  root.dataset.theme = t;
  if (save) try { localStorage.setItem('theme', t); } catch { /* private mode: still applies this session */ }
  document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#171310' : '#faf6ea';
  $('themeBtn').setAttribute('aria-label', `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`);
}
setTheme(root.dataset.theme, false);
$('themeBtn').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));

// Mark the current page in the nav.
const path = location.pathname.replace(/index\.html$/, '');
document.querySelectorAll('.nav a').forEach((a) => {
  const href = a.getAttribute('href');
  if (href === path || (href !== '/' && path.startsWith(href))) a.setAttribute('aria-current', 'page');
});
