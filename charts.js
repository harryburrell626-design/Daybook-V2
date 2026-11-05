// Small, dependency-free SVG charts. Each chart re-renders to its container's real width so text stays readable on phones.
import { h, s, clear, parse, shortDate, dayNum } from './util.js';

function responsive(draw) {
  const box = h('div', { class: 'chart' });
  let w = 0;
  const render = () => { const nw = Math.floor(box.clientWidth); if (!nw || nw === w) return; w = nw; clear(box); box.append(draw(nw)); };
  new ResizeObserver(render).observe(box);
  requestAnimationFrame(render);
  return box;
}
const nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v || 1))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

// data: [{x:'YYYY-MM-DD', y:number|null}]  (x spans from `from` to `to`)
export function lineChart({ data, from, to, yMin = 0, yMax = 10, height = 200, ticks = [yMin, (yMin + yMax) / 2, yMax], fmt = (v) => v, ref = null, accentLast = true }) {
  return responsive((W) => {
    const L = 30, R = 10, T = 12, B = 26, Hh = height, iw = W - L - R, ih = Hh - T - B;
    const t0 = parse(from).getTime(), t1 = parse(to).getTime(), span = Math.max(1, t1 - t0);
    const X = (d) => L + ((parse(d).getTime() - t0) / span) * iw, Y = (v) => T + ih - ((v - yMin) / (yMax - yMin)) * ih;
    const svg = s('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'Line chart', height: Hh });
    for (const t of ticks) { svg.append(s('line', { class: 'grid', x1: L, x2: W - R, y1: Y(t), y2: Y(t) }), s('text', { x: L - 8, y: Y(t) + 4, 'text-anchor': 'end' }, fmt(t))); }
    if (ref != null) svg.append(s('line', { class: 'ref', x1: L, x2: W - R, y1: Y(ref), y2: Y(ref) }));
    const pts = data.filter((p) => p.y != null).map((p) => ({ ...p, px: X(p.x), py: Y(p.y) }));
    if (pts.length > 1) {
      svg.append(s('path', { class: 'area', d: `M${pts[0].px},${Y(yMin)} ` + pts.map((p) => `L${p.px},${p.py}`).join(' ') + ` L${pts.at(-1).px},${Y(yMin)}Z` }));
      svg.append(s('path', { class: 'line', d: pts.map((p, i) => `${i ? 'L' : 'M'}${p.px},${p.py}`).join(' ') }));
    }
    pts.forEach((p, i) => { const last = accentLast && i === pts.length - 1; svg.append(s('circle', { class: last ? 'accent' : 'dot', cx: p.px, cy: p.py, r: last ? 5 : pts.length > 45 ? 0 : 3 }, s('title', null, `${shortDate(p.x)}: ${fmt(p.y)}`))); });
    const mid = new Date((t0 + t1) / 2); const midStr = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, '0')}-${String(mid.getDate()).padStart(2, '0')}`;
    [[from, 'start'], [midStr, 'middle'], [to, 'end']].forEach(([d, a]) => svg.append(s('text', { x: a === 'start' ? L : a === 'end' ? W - R : X(d), y: Hh - 6, 'text-anchor': a }, shortDate(d))));
    if (!pts.length) svg.append(s('text', { x: W / 2, y: Hh / 2, 'text-anchor': 'middle' }, 'Nothing recorded in this period yet'));
    return svg;
  });
}

// items: [{label, value|null, hl?}]
export function columnChart({ items, max, height = 190, fmt = (v) => String(Math.round(v * 10) / 10), ref = null, refLabel = '' }) {
  return responsive((W) => {
    const L = 8, R = 8, T = 22, B = 26, Hh = height, iw = W - L - R, ih = Hh - T - B;
    const m = max || nice(Math.max(1, ...items.map((i) => i.value || 0)));
    const step = iw / items.length, bw = Math.min(46, step * 0.62);
    const svg = s('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': 'Bar chart', height: Hh });
    svg.append(s('line', { class: 'axis', x1: L, x2: W - R, y1: T + ih, y2: T + ih }));
    items.forEach((it, i) => {
      const cx = L + step * i + step / 2;
      if (it.value != null) {
        const bh = Math.max(2, (it.value / m) * ih);
        svg.append(s('rect', { class: 'bar' + (it.hl ? '' : ' soft'), x: cx - bw / 2, y: T + ih - bh, width: bw, height: bh, rx: 5 }, s('title', null, `${it.label}: ${fmt(it.value)}`)));
        if (items.length <= 16) svg.append(s('text', { class: 'tt', x: cx, y: T + ih - bh - 6, 'text-anchor': 'middle' }, fmt(it.value)));
      }
      if (items.length <= 16 || i % Math.ceil(items.length / 8) === 0) svg.append(s('text', { x: cx, y: Hh - 7, 'text-anchor': 'middle' }, it.label));
    });
    if (ref != null) { const y = T + ih - (ref / m) * ih; svg.append(s('line', { class: 'ref', x1: L, x2: W - R, y1: y, y2: y }), s('text', { x: W - R, y: y - 5, 'text-anchor': 'end' }, refLabel)); }
    return svg;
  });
}

// Horizontal bars as simple HTML (reads best on narrow screens)
export function hbars(items, { max, color } = {}) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  return h('div', null, items.map((it) => h('div', { class: 'hbar' },
    h('div', { class: 'lb', title: it.label }, it.label),
    h('div', { class: 'tr' }, h('i', { style: { width: `${Math.max(2, (it.value / m) * 100)}%`, background: it.color || color || '' } })),
    h('div', { class: 'num muted small' }, it.text ?? it.value))));
}

export function sparkline(values, { w = 120, hgt = 36, min = 1, max = 10 } = {}) {
  const pts = values.map((v, i) => (v == null ? null : [ (i / Math.max(1, values.length - 1)) * (w - 6) + 3, hgt - 4 - ((v - min) / (max - min)) * (hgt - 8) ])).filter(Boolean);
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, 'aria-hidden': 'true', style: 'overflow:visible' });
  if (pts.length > 1) svg.append(s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  if (pts.length) svg.append(s('circle', { cx: pts.at(-1)[0], cy: pts.at(-1)[1], r: 3.5, fill: 'var(--warm)' }));
  return svg;
}
export { dayNum };
