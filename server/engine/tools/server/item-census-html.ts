// Render the JSON from item-census.ts as a standalone HTML viewer with item sprites.
//   bun tools/server/item-census-html.ts <census.json> <out.html> [--sprites=https://rs-sdk-demo.fly.dev/sprite/item/] [--title=...]
// Item names come from the engine's obj config (data/pack), so run from server/engine.
import { readFileSync, writeFileSync } from 'fs';
import ObjType from '#/cache/config/ObjType.js';

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (const a of argv) {
    if (a.startsWith('--')) { const [k, ...v] = a.slice(2).split('='); flags.set(k, v.join('=') || 'true'); }
    else positional.push(a);
}
const [inPath, outPath] = positional;
if (!inPath || !outPath) { console.error('usage: item-census-html.ts <census.json> <out.html> [--sprites=URL] [--title=...]'); process.exit(1); }
const sprites = flags.get('sprites') ?? 'https://rs-sdk-demo.fly.dev/sprite/item/';
const title = flags.get('title') ?? 'Item census';
const date = flags.get('date') ?? new Date().toISOString().slice(0, 10);

ObjType.load('data/pack');
const census = JSON.parse(readFileSync(inPath, 'utf8')) as { files: number; skipped: number; geItems: number; items: Record<string, [number, number]> };

// [id, name, debugname, copies, holders, tradeable, cost, members]
const rows = Object.entries(census.items).map(([id, [c, h]]) => {
    const o = ObjType.get(+id);
    return [+id, o?.name ?? `obj${id}`, o?.debugname ?? '', c, h, o?.tradeable ? 1 : 0, o?.cost ?? 0, o?.members ? 1 : 0];
}).sort((a, b) => (a[3] as number) - (b[3] as number) || (a[4] as number) - (b[4] as number) || (a[0] as number) - (b[0] as number));

const meta = { title, date, files: census.files, skipped: census.skipped, geItems: census.geItems, distinct: rows.length, defined: ObjType.count, sprites };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${date}</title>
<style>
:root {
  color-scheme: light;
  --surface-1: #fcfcfb; --surface-2: #f3f2ef; --border: #e4e3df;
  --text-primary: #0b0b0b; --text-secondary: #52514e; --text-muted: #8a8985;
  --series-1: #2a78d6; --series-1-soft: #cde2fb; --grid: #e9e8e4;
  --tip-bg: #0b0b0b; --tip-fg: #fff;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --surface-1: #1a1a19; --surface-2: #232322; --border: #333330;
    --text-primary: #ffffff; --text-secondary: #c3c2b7; --text-muted: #8a8985;
    --series-1: #3987e5; --series-1-soft: #184f95; --grid: #2b2b29;
    --tip-bg: #f3f2ef; --tip-fg: #0b0b0b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface-1); color: var(--text-primary); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 20px 60px; }
h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
.sub { color: var(--text-secondary); margin: 0 0 20px; }
.sub b { color: var(--text-primary); font-weight: 600; }
section { margin-bottom: 28px; }
h2 { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
.h2sub { color: var(--text-secondary); font-size: 13px; margin: 0 0 10px; }
.chart-wrap { position: relative; }
svg.chart { width: 100%; height: 240px; display: block; overflow: visible; }
.chart .grid line { stroke: var(--grid); stroke-width: 1; }
.chart .axis text { fill: var(--text-secondary); font-size: 11px; }
.chart .bar rect { fill: var(--series-1); cursor: pointer; }
.chart .bar rect.dim { fill: var(--series-1-soft); }
.chart .bar .hit { fill: transparent; cursor: pointer; }
.chart .bar text { fill: var(--text-secondary); font-size: 11px; text-anchor: middle; pointer-events: none; }
.tip { position: absolute; pointer-events: none; background: var(--tip-bg); color: var(--tip-fg); padding: 6px 9px; border-radius: 6px; font-size: 12px; white-space: nowrap; transform: translate(-50%, calc(-100% - 10px)); opacity: 0; transition: opacity .08s; z-index: 5; }
.tip.on { opacity: 1; }
.tip b { font-weight: 600; }
.controls { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-bottom: 14px; }
.controls label { display: inline-flex; gap: 6px; align-items: center; color: var(--text-secondary); font-size: 13px; }
.controls input[type=search], .controls select { font: inherit; padding: 6px 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); color: var(--text-primary); }
.controls input[type=search] { min-width: 220px; }
.chip { display: inline-flex; gap: 6px; align-items: center; padding: 3px 8px 3px 10px; border-radius: 999px; background: var(--series-1-soft); color: var(--text-primary); font-size: 12px; }
.chip button { all: unset; cursor: pointer; padding: 0 4px; color: var(--text-secondary); }
.count { color: var(--text-muted); font-size: 13px; margin-left: auto; }
.view { display: inline-flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.view button { all: unset; cursor: pointer; padding: 5px 10px; font-size: 13px; color: var(--text-secondary); }
.view button[aria-pressed=true] { background: var(--surface-2); color: var(--text-primary); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; }
.card { display: grid; grid-template-columns: 40px 1fr; gap: 8px; align-items: center; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-2); min-height: 58px; }
.card img { width: 36px; height: 32px; object-fit: contain; image-rendering: pixelated; display: block; }
.card .name { font-weight: 600; font-size: 13px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .dbg { color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .stat { color: var(--text-secondary); font-size: 12px; }
.card .stat b { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }
.card .tags { color: var(--text-muted); font-size: 10px; letter-spacing: .02em; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
th { color: var(--text-secondary); font-weight: 600; font-size: 12px; position: sticky; top: 0; background: var(--surface-1); }
td.num, th.num { text-align: right; }
td img { width: 32px; height: 28px; object-fit: contain; image-rendering: pixelated; vertical-align: middle; }
.more { display: block; margin: 14px auto 0; font: inherit; padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); color: var(--text-primary); cursor: pointer; }
.hidden { display: none; }
footer { color: var(--text-muted); font-size: 12px; margin-top: 30px; }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  <p class="sub">Scanned <b id="m-files"></b> player saves (backpack, worn, bank) plus Grand Exchange escrow on <b>${date}</b>. <b id="m-distinct"></b> of <b id="m-defined"></b> item types exist with at least one copy; items with zero copies are omitted. Ground items are not counted.</p>

  <section>
    <h2>Rarity histogram</h2>
    <p class="h2sub">Number of distinct items by how many copies exist on the whole server. Click a bar to filter the list below.</p>
    <div class="chart-wrap">
      <svg class="chart" id="chart" role="img" aria-label="Histogram of distinct items per copies-on-server bucket"></svg>
      <div class="tip" id="tip"></div>
    </div>
  </section>

  <section>
    <h2>Items, rarest first</h2>
    <div class="controls">
      <input type="search" id="q" placeholder="Search name or debug name" aria-label="Search items">
      <label>Sort <select id="sort">
        <option value="rare">Rarest first</option>
        <option value="common">Most common first</option>
        <option value="holders">Fewest holders</option>
        <option value="value">Highest shop value</option>
        <option value="name">Name</option>
      </select></label>
      <label><input type="checkbox" id="noclue" checked> Hide clue scrolls</label>
      <label><input type="checkbox" id="tradeonly"> Tradeable only</label>
      <span id="bucketchip" class="chip hidden"><span id="bucketlabel"></span><button id="clearbucket" aria-label="Clear bucket filter">×</button></span>
      <span class="count" id="shown"></span>
      <span class="view" role="group" aria-label="View">
        <button id="v-grid" aria-pressed="true">Cards</button><button id="v-table" aria-pressed="false">Table</button>
      </span>
    </div>
    <div class="grid" id="grid"></div>
    <div id="tablewrap" class="hidden"><table><thead><tr><th></th><th>Item</th><th>Debug name</th><th class="num">Copies</th><th class="num">Holders</th><th class="num">Shop value</th><th>Tradeable</th></tr></thead><tbody id="tbody"></tbody></table></div>
    <button class="more hidden" id="more">Show more</button>
  </section>

  <footer>Sprites from <code id="m-sprites"></code>. Data generated by <code>server/engine/tools/server/item-census.ts</code>; page by <code>item-census-html.ts</code>.</footer>
</main>
<script id="data" type="application/json">${JSON.stringify({ meta, rows })}</script>
<script>
const { meta, rows } = JSON.parse(document.getElementById('data').textContent);
const fmt = n => n.toLocaleString('en-US');
document.getElementById('m-files').textContent = fmt(meta.files);
document.getElementById('m-distinct').textContent = fmt(meta.distinct);
document.getElementById('m-defined').textContent = fmt(meta.defined);
document.getElementById('m-sprites').textContent = meta.sprites;
const sprite = id => meta.sprites + id + '.png';
const items = rows.map(([id, name, dbg, copies, holders, trade, cost, members]) => ({ id, name, dbg, copies, holders, trade, cost, members, clue: /^trail_clue/.test(dbg) }));

// ---- histogram ----
const BUCKETS = [[1,1],[2,2],[3,3],[4,5],[6,10],[11,25],[26,100],[101,1000],[1001,10000],[10001,100000],[100001,1000000],[1000001,Infinity]];
const blabel = ([lo, hi]) => hi === Infinity ? fmt(lo) + '+' : lo === hi ? String(lo) : fmt(lo) + '–' + fmt(hi);
const compact = n => n >= 1e6 ? (n / 1e6) + 'M' : n >= 1e3 ? (n / 1e3) + 'K' : String(n);
const bshort = ([lo, hi]) => hi === Infinity ? compact(lo - 1) + '+' : lo === hi ? String(lo) : compact(lo > 1000 ? lo - 1 : lo) + '–' + compact(hi);
const bucketOf = c => BUCKETS.findIndex(([lo, hi]) => c >= lo && c <= hi);
let activeBucket = -1;
const svg = document.getElementById('chart'), tip = document.getElementById('tip');
function drawChart() {
  const counts = BUCKETS.map(() => 0);
  for (const it of items) counts[bucketOf(it.copies)]++;
  const W = svg.clientWidth || 1000, H = 240, padL = 44, padR = 8, padT = 14, padB = 34;
  const iw = W - padL - padR, ih = H - padT - padB;
  const max = Math.max(...counts);
  const step = max > 200 ? 100 : max > 80 ? 50 : 20;
  const top = Math.ceil(max / step) * step;
  const y = v => padT + ih - (v / top) * ih;
  const band = iw / BUCKETS.length, bw = Math.min(24, band * 0.6);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  let s = '<g class="grid">';
  for (let v = 0; v <= top; v += step) s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
  s += '</g><g class="axis">';
  for (let v = 0; v <= top; v += step) s += '<text x="' + (padL - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmt(v) + '</text>';
  s += '</g>';
  counts.forEach((n, i) => {
    const cx = padL + band * i + band / 2, x = cx - bw / 2, yt = y(n), h = Math.max(0, y(0) - yt), r = Math.min(4, h);
    const dim = activeBucket !== -1 && activeBucket !== i ? ' dim' : '';
    const path = 'M' + x + ' ' + y(0) + 'V' + (yt + r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + 'h' + (bw - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'V' + y(0) + 'Z';
    s += '<g class="bar" data-i="' + i + '"><rect class="hit" x="' + (padL + band * i) + '" y="' + padT + '" width="' + band + '" height="' + (ih + padB) + '"/>' +
      '<path class="' + dim.trim() + '" d="' + path + '" style="fill:' + (dim ? 'var(--series-1-soft)' : 'var(--series-1)') + '"/>' +
      (n === max || activeBucket === i ? '<text x="' + cx + '" y="' + (yt - 5) + '">' + fmt(n) + '</text>' : '') +
      '<text x="' + cx + '" y="' + (H - 12) + '">' + bshort(BUCKETS[i]) + '</text></g>';
  });
  svg.innerHTML = s;
  svg.querySelectorAll('.bar').forEach(g => {
    const i = +g.dataset.i;
    g.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      tip.innerHTML = '<b>' + fmt(counts[i]) + '</b> items with ' + blabel(BUCKETS[i]) + ' cop' + (BUCKETS[i][1] === 1 ? 'y' : 'ies');
      tip.style.left = (e.clientX - rect.left) + 'px'; tip.style.top = (e.clientY - rect.top) + 'px'; tip.classList.add('on');
    });
    g.addEventListener('mouseleave', () => tip.classList.remove('on'));
    g.addEventListener('click', () => { activeBucket = activeBucket === i ? -1 : i; drawChart(); render(); });
  });
}

// ---- list ----
const q = document.getElementById('q'), sortSel = document.getElementById('sort'), noclue = document.getElementById('noclue'), tradeonly = document.getElementById('tradeonly');
const grid = document.getElementById('grid'), tbody = document.getElementById('tbody'), tablewrap = document.getElementById('tablewrap'), more = document.getElementById('more'), shown = document.getElementById('shown');
const chip = document.getElementById('bucketchip'), chipLabel = document.getElementById('bucketlabel');
let view = 'grid', limit = 200;
const SORTS = {
  rare: (a, b) => a.copies - b.copies || a.holders - b.holders || a.id - b.id,
  common: (a, b) => b.copies - a.copies || b.holders - a.holders,
  holders: (a, b) => a.holders - b.holders || a.copies - b.copies || a.id - b.id,
  value: (a, b) => b.cost - a.cost || a.copies - b.copies,
  name: (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
};
function filtered() {
  const needle = q.value.trim().toLowerCase();
  return items.filter(it =>
    (!noclue.checked || !it.clue) &&
    (!tradeonly.checked || it.trade) &&
    (activeBucket === -1 || bucketOf(it.copies) === activeBucket) &&
    (!needle || it.name.toLowerCase().includes(needle) || it.dbg.includes(needle) || String(it.id) === needle)
  ).sort(SORTS[sortSel.value]);
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function card(it) {
  return '<div class="card" title="obj ' + it.id + '"><img loading="lazy" src="' + sprite(it.id) + '" alt="" width="36" height="32">' +
    '<div><div class="name">' + esc(it.name) + '</div><div class="dbg">' + esc(it.dbg) + '</div>' +
    '<div class="stat"><b>' + fmt(it.copies) + '</b> cop' + (it.copies === 1 ? 'y' : 'ies') + ' · <b>' + fmt(it.holders) + '</b> holder' + (it.holders === 1 ? '' : 's') + '</div>' +
    '<div class="tags">' + (it.trade ? 'tradeable' : 'untradeable') + (it.members ? ' · members' : '') + (it.cost > 1 ? ' · ' + fmt(it.cost) + ' gp' : '') + '</div></div></div>';
}
function row(it) {
  return '<tr><td><img loading="lazy" src="' + sprite(it.id) + '" alt=""></td><td>' + esc(it.name) + '</td><td style="color:var(--text-muted)">' + esc(it.dbg) + ' <span style="opacity:.6">#' + it.id + '</span></td>' +
    '<td class="num">' + fmt(it.copies) + '</td><td class="num">' + fmt(it.holders) + '</td><td class="num">' + fmt(it.cost) + '</td><td>' + (it.trade ? 'yes' : 'no') + '</td></tr>';
}
function render() {
  const list = filtered();
  const slice = list.slice(0, limit);
  if (view === 'grid') { grid.innerHTML = slice.map(card).join(''); grid.classList.remove('hidden'); tablewrap.classList.add('hidden'); }
  else { tbody.innerHTML = slice.map(row).join(''); tablewrap.classList.remove('hidden'); grid.classList.add('hidden'); }
  shown.textContent = 'Showing ' + fmt(slice.length) + ' of ' + fmt(list.length) + ' items';
  more.classList.toggle('hidden', slice.length >= list.length);
  chip.classList.toggle('hidden', activeBucket === -1);
  if (activeBucket !== -1) chipLabel.textContent = blabel(BUCKETS[activeBucket]) + ' cop' + (BUCKETS[activeBucket][1] === 1 ? 'y' : 'ies');
}
for (const el of [q, sortSel, noclue, tradeonly]) el.addEventListener('input', () => { limit = 200; render(); });
more.addEventListener('click', () => { limit += 300; render(); });
document.getElementById('clearbucket').addEventListener('click', () => { activeBucket = -1; drawChart(); render(); });
document.getElementById('v-grid').addEventListener('click', () => setView('grid'));
document.getElementById('v-table').addEventListener('click', () => setView('table'));
function setView(v) { view = v; document.getElementById('v-grid').setAttribute('aria-pressed', v === 'grid'); document.getElementById('v-table').setAttribute('aria-pressed', v === 'table'); render(); }
window.addEventListener('resize', drawChart);
drawChart(); render();
</script>
</body>
</html>
`;
writeFileSync(outPath, html);
console.log(`wrote ${outPath}: ${rows.length} items, ${(html.length / 1024).toFixed(0)} KB`);
