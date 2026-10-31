// WCAG contrast check for the design tokens in public/styles.css (reads the real file, no copies).
// Text pairs need >= 4.5, UI/graphic pairs (bar fills on track, focus ring) need >= 3.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const block = (sel) => css.match(new RegExp(`${sel.replace(/[[\]"]/g, '\\$&')}\\s*\\{([^}]*)\\}`))[1];
const tokens = (b) => Object.fromEntries([...b.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
const light = tokens(block(':root'));
const dark = { ...light, ...tokens(block(':root[data-theme="dark"]')) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const TEXT = [['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['accent-ink', 'accent'], ['bg', 'ink'],
  ['match', 'match-bg'], ['partial', 'partial-bg'], ['skip', 'skip-bg'], ['match', 'surface'], ['partial', 'surface'], ['skip', 'surface'], ['accent', 'bg']];
const UI = [['match', 'track'], ['partial', 'track'], ['skip', 'track'], ['accent', 'bg'], ['accent', 'surface'], ['ink', 'bg']];

let fail = 0;
for (const [name, t] of [['light', light], ['dark', dark]]) {
  for (const [list, min, kind] of [[TEXT, 4.5, 'text'], [UI, 3, 'ui']]) {
    for (const [fg, bg] of list) {
      const r = ratio(t[fg], t[bg]);
      const ok = r >= min;
      if (!ok) fail++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(5)} ${kind.padEnd(4)} ${fg.padEnd(10)} on ${bg.padEnd(9)} ${r.toFixed(2)} (need ${min})`);
    }
  }
}
console.log(fail ? `\n${fail} pair(s) failed` : '\nall pairs pass');
process.exit(fail ? 1 : 0);
