// A receipt as a shareable 1080 x 1350 image. Verdicts and prices only: no face, no mask.
// rows: [{name, verdict, price|null}]  summary: {title, label, keep, skipCount, note}
const W = 1080, H = 1350;
const INK = '#1b1712', MUTED = '#6b6254', PAPER = '#faf6ea', LINE = '#d8cfbb';
const COLOR = { match: '#14663f', partial: '#8a5200', skip: '#3a455e', close: '#6e3a70', inconclusive: '#6b6254' };
const WORD = { match: 'MATCH', partial: 'PARTIAL', skip: 'SKIP', close: 'TOO CLOSE', inconclusive: 'UNCLEAR' };
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  while (text.length > 1 && ctx.measureText(`${text}...`).width > max) text = text.slice(0, -1);
  return `${text.trimEnd()}...`;
}

export async function makeCard({ label, rows, keep, skipCount, note }) {
  await Promise.all(['700 40px "Space Mono"', '400 28px "Space Mono"', '500 34px "Instrument Sans"'].map((f) => document.fonts.load(f).catch(() => null)));
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = c.getContext('2d');
  const mono = (w, s) => { x.font = `${w} ${s}px "Space Mono", ui-monospace, Menlo, monospace`; };
  const sans = (w, s) => { x.font = `${w} ${s}px "Instrument Sans", system-ui, sans-serif`; };

  x.fillStyle = '#efe7d3'; x.fillRect(0, 0, W, H);
  x.fillStyle = PAPER; x.strokeStyle = INK; x.lineWidth = 4;
  x.fillRect(60, 60, W - 120, H - 120); x.strokeRect(60, 60, W - 120, H - 120);

  x.fillStyle = INK; x.textBaseline = 'alphabetic';
  mono(700, 40); x.fillText('RECEIPTS', 110, 150);
  mono(400, 24); x.fillStyle = MUTED; x.textAlign = 'right'; x.fillText(label.toUpperCase(), W - 110, 150); x.textAlign = 'left';
  sans(500, 34); x.fillStyle = INK; x.fillText("Skincare advice that's allowed to say no.", 110, 215);
  x.strokeStyle = LINE; x.lineWidth = 2; x.setLineDash([8, 8]); x.beginPath(); x.moveTo(110, 250); x.lineTo(W - 110, 250); x.stroke(); x.setLineDash([]);

  const shown = rows.slice(0, 9);
  let y = 320;
  for (const r of shown) {
    mono(700, 26); x.fillStyle = COLOR[r.verdict]; x.fillText(WORD[r.verdict], 110, y);
    sans(500, 34); x.fillStyle = INK; x.fillText(fit(x, r.name, 520), 330, y);
    if (r.price !== null) { mono(400, 28); x.textAlign = 'right'; x.fillText(money(r.price), W - 110, y); x.textAlign = 'left'; }
    y += 76;
  }
  if (rows.length > shown.length) { sans(400, 28); x.fillStyle = MUTED; x.fillText(`and ${rows.length - shown.length} more`, 330, y - 20); }

  x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); x.moveTo(110, 1000); x.lineTo(W - 110, 1000); x.stroke();
  mono(700, 30); x.fillStyle = INK; x.fillText(skipCount ? `SKIP ${skipCount}, YOU KEEP` : 'NOTHING TO SKIP', 110, 1075);
  if (skipCount) { mono(700, 96); x.fillStyle = COLOR.match; x.textAlign = 'right'; x.fillText(money(keep), W - 110, 1190); x.textAlign = 'left'; }
  sans(400, 26); x.fillStyle = MUTED; x.fillText(note, 110, 1130);
  mono(400, 24); x.fillText('receipts-skin.vercel.app', 110, 1255);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image.'))), 'image/png'));
}
