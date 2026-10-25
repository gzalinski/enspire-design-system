/* Enspire Lab — vanilla JS, no dependencies. Reads window.LAB (built by tools/lab.js from the repo).
   Three jobs: browse components by category, exercise every variant, and retune tokens live and export
   the result as a theme file. Nothing here is hand-authored per component — add a meta.json and it appears. */
(() => {
const D = window.LAB, T = D.tokens;
const byName = Object.fromEntries(D.components.map(c => [c.name, c]));
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const store = {
  get(k, d){ try { const v = localStorage.getItem('es-lab-' + k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('es-lab-' + k, JSON.stringify(v)); } catch(e){} },
};

/* ================= colour maths (OKLCH) =================
   Lets one anchor colour regenerate a whole ramp: every stop keeps its relative lightness and
   chroma, so a 10-stop scale stays a scale instead of 10 unrelated colours. */
function parseHex(h){
  h = String(h).trim().replace('#','');
  if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) return null;
  return { r:parseInt(h.slice(0,2),16)/255, g:parseInt(h.slice(2,4),16)/255, b:parseInt(h.slice(4,6),16)/255,
           ah: h.length === 8 ? h.slice(6,8).toUpperCase() : '' };
}
const toLin = c => c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
const toGam = c => c <= 0.0031308 ? 12.92*c : 1.055*Math.pow(c, 1/2.4) - 0.055;
function rgbToOklch(c){
  const r = toLin(c.r), g = toLin(c.g), b = toLin(c.b);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  const L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
  const A = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
  const B = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s;
  let H = Math.atan2(B, A) * 180 / Math.PI; if (H < 0) H += 360;
  return { L, C: Math.hypot(A, B), H };
}
function oklchToLin(L, C, H){
  const h = H * Math.PI/180, a = C*Math.cos(h), b = C*Math.sin(h);
  const l = Math.pow(L + 0.3963377774*a + 0.2158037573*b, 3);
  const m = Math.pow(L - 0.1055613458*a - 0.0638541728*b, 3);
  const s = Math.pow(L - 0.0894841775*a - 1.2914855480*b, 3);
  return [4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
         -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
         -0.0041960863*l - 0.7034186147*m + 1.7076147010*s];
}
const inGamut = rgb => rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4);
function oklchToHex(L, C, H, ah=''){
  L = Math.min(1, Math.max(0, L)); C = Math.max(0, C);
  let rgb = oklchToLin(L, C, H);
  if (!inGamut(rgb)){ // walk chroma down until it fits sRGB, keeping lightness and hue
    let lo = 0, hi = C;
    for (let i = 0; i < 24; i++){ const mid = (lo+hi)/2; if (inGamut(oklchToLin(L, mid, H))) lo = mid; else hi = mid; }
    rgb = oklchToLin(L, lo, H);
  }
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, toGam(Math.max(0, v))))*255).toString(16).padStart(2,'0')).join('').toUpperCase() + ah;
}
const lum = hex => { const c = parseHex(hex); return c ? 0.2126*toLin(c.r) + 0.7152*toLin(c.g) + 0.0722*toLin(c.b) : 0; };
const contrast = (a,b) => { const A = lum(a), B = lum(b); return (Math.max(A,B)+0.05)/(Math.min(A,B)+0.05); };
const cleanHex = h => { const c = String(h).trim().replace('#',''); const f = (c.length===3||c.length===4) ? c.split('').map(x=>x+x).join('') : c;
  return /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(f) ? '#'+f.toUpperCase() : null; };

/* ================= state ================= */
const DENSITY = { compact:0.75, default:1, comfortable:1.25 };
const RADIUS  = { sharp:0, soft:1, round:2 };
const FONTS = {
  'System UI': "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  'Geometric sans': "'Avenir Next', Avenir, 'Nunito Sans', Corbel, 'URW Gothic', sans-serif",
  'Humanist sans': "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
  'Transitional serif': "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif",
  'Old-style serif': "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, Georgia, serif",
  'Slab serif': "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif",
  'Monospace': "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
};
const S = {
  view:      store.get('view', 'foundations'),
  chrome:    store.get('chrome', 'light'),
  theme:     store.get('theme', 'light'),
  density:   store.get('density', 'default'),
  radius:    store.get('radius', 'soft'),
  tab:       store.get('tab', 'colors'),
  anchors:   store.get('anchors', {}),   // ramp -> hex
  stopOv:    store.get('stopOv', {}),    // "naviblue.600" -> hex
  semOv:     store.get('semOv', {}),     // "--es-primary-bg" -> {light,dark}
  scaleOv:   store.get('scaleOv', {}),   // "--es-space-100" -> "9px"
  typeface:  store.get('typeface', {}),  // text|heading -> stack
  expand:    {},                          // per component: { axis: true }
  fixed:     {},                          // per component: { axis: value }
};
const save = () => ['view','chrome','theme','density','radius','tab','anchors','stopOv','semOv','scaleOv','typeface']
  .forEach(k => store.set(k, S[k]));

/* ================= token resolution ================= */
const lchCache = new Map();
const rampOf = path => path.split('.')[0];
function anchorInfo(ramp){
  const r = T.ramps[ramp];
  if (!r || !r.anchor) return null;
  const orig = T.palette[`${ramp}.${r.anchor}`];
  if (!orig) return null;
  return { orig, lch: rgbToOklch(parseHex(orig)) };
}
/** A palette stop, after the ramp's anchor shift and any direct override. */
function stopHex(path){
  if (S.stopOv[path]) return S.stopOv[path];
  const base = T.palette[path];
  if (!base) return '#FF00FF';
  const ramp = rampOf(path), a = S.anchors[ramp];
  const info = anchorInfo(ramp);
  if (!a || !info || a.toUpperCase() === info.orig.toUpperCase()) return base;
  const c = parseHex(base); if (!c) return base;
  let n = lchCache.get(a); if (!n){ n = rgbToOklch(parseHex(a)); lchCache.set(a, n); }
  const d = info.lch, o = rgbToOklch(c);
  // Map this stop's lightness onto the new anchor's, keeping its position above/below the anchor.
  const L = o.L <= d.L
    ? (d.L > 0 ? o.L * n.L / d.L : n.L)
    : n.L + (o.L - d.L) * (1 - n.L) / Math.max(1e-6, 1 - d.L);
  const C = o.C * (n.C / Math.max(d.C, 1e-4));
  return oklchToHex(L, Math.min(C, 0.37), o.H + (n.H - d.H), c.ah);
}
/** A semantic var in one mode. */
function varHex(name, mode){
  const ov = S.semOv[name]; if (ov && ov[mode]) return ov[mode];
  const ref = T.semantic[name]; if (!ref) return '#FF00FF';
  const path = ref[mode] || ref.light;
  return path ? stopHex(path) : '#FF00FF';
}
const scaleVal = name => S.scaleOv[name] ?? (T.scales[name] ? T.scales[name].value : '');
const isTouched = () => Object.keys(S.anchors).length || Object.keys(S.stopOv).length ||
  Object.keys(S.semOv).length || Object.keys(S.scaleOv).length || Object.keys(S.typeface).length;

/** Write every live value into one stylesheet that sits after the generated one. */
function applyTokens(){
  const names = Object.keys(T.semantic);
  const light = names.map(n => `${n}:${varHex(n,'light')}`).join(';');
  const dark  = names.map(n => `${n}:${varHex(n,'dark')}`).join(';');
  const scaled = [], plain = [];
  for (const n of Object.keys(S.scaleOv)){
    const meta = T.scales[n]; if (!meta) continue;
    const v = S.scaleOv[n];
    (meta.scale ? scaled : plain).push(`${n}:${meta.scale ? `calc(${v} * var(--es-${meta.scale === 'density' ? 'density' : 'radius-scale'}))` : v}`);
  }
  for (const [k, v] of Object.entries(S.typeface)) plain.push(`--es-font-${k}:${v}`);
  $('#live').textContent =
    `:root{${light}${plain.length ? ';' + plain.join(';') : ''}}` +
    (scaled.length ? `:root,[data-es-scope]{${scaled.join(';')}}` : '') +
    `:root[data-theme="dark"]{${dark}}` +
    `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${dark}}}`;
  const root = document.documentElement;
  root.dataset.theme = S.theme;
  root.dataset.chrome = S.chrome;
  root.style.setProperty('--es-density', DENSITY[S.density]);
  root.style.setProperty('--es-radius-scale', RADIUS[S.radius]);
}

/* ================= component rendering ================= */
const fill = (tpl, v) => tpl.replace(/\{([\w-]+)\}/g, (m,k) => (k in v ? v[k] : m));
function defaults(c){
  if (!S.fixed[c.name]){
    const f = {};
    Object.keys(c.variants).forEach(a => { f[a] = (c.defaults && c.defaults[a]) || c.variants[a][0]; });
    S.fixed[c.name] = f;
    S.expand[c.name] = S.expand[c.name] || {};
  }
  return S.fixed[c.name];
}
const expandedAxes = c => Object.keys(c.variants).filter(a => S.expand[c.name] && S.expand[c.name][a]);
function product(c, axes){
  return axes.reduce((rows, a) => rows.flatMap(r => c.variants[a].map(v => ({ ...r, [a]: v }))), [{}]);
}
/** The variant grid: one row per value of the first expanded axis, cells = the rest crossed. */
function stage(c){
  const fx = defaults(c), ex = expandedAxes(c);
  // The row heading already names the first expanded axis, so the caption only carries the rest.
  const cell = (extra, caption) => {
    const cap = Object.entries(caption).map(([k,v]) => `${k}=${v}`).join(' · ');
    return `<figure class="cell">${fill(c.preview, { ...fx, ...extra })}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
  };
  if (!ex.length) return `<div class="srow"><div class="cells">${cell({}, {})}</div></div>`;
  const [head, ...rest] = ex;
  return c.variants[head].map(v => {
    const cells = product(c, rest).map(combo => cell({ [head]: v, ...combo }, combo)).join('');
    return `<div class="srow"><b>${esc(head)} = ${esc(v)}</b><div class="cells">${cells}</div></div>`;
  }).join('');
}
function propsUI(c){
  const fx = defaults(c), ex = S.expand[c.name] || {};
  const axes = Object.keys(c.variants);
  if (!axes.length) return '<p class="note">No variants — this component has a single form.</p>';
  const rows = axes.map(a => {
    const vals = c.variants[a], on = !!ex[a];
    const picker = vals.length <= 7
      ? `<div class="seg">${vals.map(v => `<button type="button" data-fix="${esc(a)}" data-v="${esc(v)}" aria-pressed="${fx[a]===v}">${esc(v)}</button>`).join('')}</div>`
      : `<select class="inp" data-fix="${esc(a)}">${vals.map(v => `<option${v===fx[a]?' selected':''}>${esc(v)}</option>`).join('')}</select>`;
    return `<div class="prop"><label>${esc(a)} <span class="cnt">${vals.length}</span></label>
      <button type="button" class="exp" data-exp="${esc(a)}" aria-pressed="${on}" title="Show every ${esc(a)}">⊞</button>
      ${picker}</div>`;
  }).join('');
  const allOn = axes.every(a => ex[a]);
  return `<div class="props-h">Props <button type="button" class="btn" data-expall="${allOn?'off':'on'}">${allOn ? 'Collapse all' : 'Expand all'}</button></div>${rows}`;
}
function componentCard(c){
  const fx = defaults(c);
  return `<section class="card" id="c-${c.name}">
    <div class="card-h"><h2>${esc(c.name)}</h2><span class="lv" data-level="${c.level}">${c.level}</span>
      <code>.${esc(c.class)}</code><code>${esc(c.category)}</code></div>
    <p class="sum">${esc(c.summary)}</p>
    <div class="chips">${(c.uses||[]).map(u => `<span class="chip use">uses ${esc(u)}</span>`).join('')}${(c.tags||[]).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="props" data-props>${propsUI(c)}</div>
    <div class="stage" data-stage>${stage(c)}</div>
    <details><summary>Markup</summary><pre data-markup>${esc(fill(c.preview, fx))}</pre></details>
    ${c.slots && c.slots.length ? `<p class="a11y"><b>Slots.</b> ${esc(c.slots.join(' · '))}</p>` : ''}
    <p class="a11y"><b>A11y.</b> ${esc(c.a11y||'')}</p>
  </section>`;
}
function refreshComponent(name){
  const c = byName[name], el = document.getElementById('c-' + name); if (!el) return;
  el.querySelector('[data-props]').innerHTML = propsUI(c);
  el.querySelector('[data-stage]').innerHTML = stage(c);
  el.querySelector('[data-markup]').textContent = fill(c.preview, defaults(c));
}

/* personality compare: same markup, four looks */
const QUADS = [['Sharp · compact',0,.75], ['Round · compact',2,.75], ['Sharp · comfortable',0,1.25], ['Round · comfortable',2,1.25]];
function compareCard(c){
  if (!c) return '';
  const fx = defaults(c), ex = expandedAxes(c);
  const combos = ex.length ? product(c, [ex[0]]).slice(0,3) : [{}];
  const inner = combos.map(x => fill(c.preview, { ...fx, ...x })).join(' ');
  return `<section class="card"><div class="card-h"><h2>Personality</h2><code>data-es-scope</code></div>
    <p class="sum">Same markup four times. Each box sets only <code>--es-density</code> and <code>--es-radius-scale</code> — no component CSS changes.</p>
    <div class="quads">${QUADS.map(([t,r,d]) =>
      `<div class="quad" data-es-scope style="--es-radius-scale:${r};--es-density:${d}"><h3>${t}</h3><div class="cells">${inner}</div></div>`).join('')}</div></section>`;
}

/* ================= foundations canvas ================= */
function foundations(){
  const ramps = Object.keys(T.ramps).map(r => {
    const stops = T.ramps[r].stops.filter(s => !/^d/.test(s));
    return `<h3 style="margin-top:14px">${esc(T.ramps[r].label)} <code style="font:10px var(--c-mono);color:var(--c-ink3)">${esc(r)}</code></h3>
      <div class="fgrid">${stops.map(s => { const hex = stopHex(`${r}.${s}`);
        return `<button class="fsw" data-copy="${hex}"><i style="background:${hex}"></i><b>${esc(s)}</b><small>${hex.slice(0,7)}</small></button>`; }).join('')}</div>`;
  }).join('');

  const typeRows = ['heading-size-xl','heading-size-lg','heading-size-md','heading-size-sm','heading-size-xs','text-size-xl','text-size-lg','text-size-md','text-size-sm','text-size-xs']
    .map(k => { const n = '--es-' + k, v = scaleVal(n); if (!v) return '';
      const head = k.startsWith('heading');
      return `<div class="frow"><div style="font-family:var(--es-font-${head?'heading':'text'});font-size:${v};font-weight:${head?600:400};line-height:1.2;color:var(--es-text-primary)">The quick brown fox</div>
        <div class="m"><b>${esc(n)}</b><br>${esc(v)}</div></div>`; }).join('');

  const spaceRows = Object.keys(T.scales).filter(n => /^--es-space-\d/.test(n)).map(n => {
    const v = scaleVal(n);
    return `<div class="fspace"><b>${esc(n.replace('--es-',''))}</b><span>${esc(v)}</span><i style="width:${v}"></i></div>`; }).join('');

  const radRows = Object.keys(T.scales).filter(n => /^--es-radius-/.test(n)).map(n => {
    const v = scaleVal(n);
    return `<div><i style="border-radius:${v === '9999px' ? '999px' : `calc(${v} * ${RADIUS[S.radius]})`}"></i><b>${esc(n.replace('--es-radius-',''))}</b><span>${esc(v)}</span></div>`; }).join('');

  return `<section class="card"><div class="card-h"><h2>Colour</h2><code>${esc(T.theme.name)}</code></div>
      <p class="sum">Palette ramps as they stand now. Edit an anchor in the Colour tab and every stop moves with it.</p>${ramps}</section>
    <section class="card"><div class="card-h"><h2>Typography</h2></div><div>${typeRows}</div></section>
    <section class="card"><div class="card-h"><h2>Spacing</h2><code>density ${DENSITY[S.density]}</code></div>
      <p class="sum">Shown at the current density. The 8px base is <code>space-100</code>.</p>${spaceRows}</section>
    <section class="card"><div class="card-h"><h2>Radius</h2><code>scale ${RADIUS[S.radius]}</code></div>
      <p class="sum">Shown at the current radius personality.</p><div class="frad">${radRows}</div></section>`;
}

/* ================= menu ================= */
let query = '';
function matches(c){
  if (!query) return true;
  return (c.name + ' ' + c.class + ' ' + c.category + ' ' + (c.tags||[]).join(' ') + ' ' + c.summary).toLowerCase().includes(query);
}
function menu(){
  const hits = D.components.filter(matches);
  // Open everything while the system is small; once it is large, open only the group you are in.
  // A search always opens, or results would hide inside collapsed groups.
  const openAll = D.components.length <= 30;
  const cats = D.categories.map(cat => {
    const list = hits.filter(c => c.category === cat.id);
    if (!list.length) return '';
    return `<details class="cat"${(openAll || query || list.some(c => S.view === 'c:' + c.name)) ? ' open' : ''}>
      <summary>${esc(cat.label)}<em>${list.length}</em></summary>
      <div class="navi">${list.map(c => `<a href="#" data-go="c:${c.name}"${S.view === 'c:'+c.name ? ' aria-current="page"' : ''}>${esc(c.name)}<span class="lv">${c.level[0].toUpperCase()}</span></a>`).join('')}</div>
    </details>`;
  }).join('');
  const uncat = hits.filter(c => !D.categories.some(x => x.id === c.category));
  return `<div class="navi">
      <a href="#" data-go="foundations"${S.view==='foundations'?' aria-current="page"':''}>Foundations</a>
      <a href="#" data-go="all"${S.view==='all'?' aria-current="page"':''}>All components<span class="lv">${D.components.length}</span></a>
    </div>
    <div class="menu-h">Components <b>${hits.length}</b></div>
    ${cats || `<p class="menu-empty">${query ? 'Nothing matches.' : 'No components yet.'}</p>`}
    ${uncat.length ? `<details class="cat" open><summary>Uncategorised<em>${uncat.length}</em></summary><div class="navi">${uncat.map(c => `<a href="#" data-go="c:${c.name}">${esc(c.name)}</a>`).join('')}</div></details>` : ''}
    <div class="menu-h">Patterns <b>${D.patterns.length}</b></div>
    ${D.patterns.length ? `<div class="navi">${D.patterns.map(p => `<a href="#" data-go="p:${p.name}">${esc(p.name)}</a>`).join('')}</div>`
      : `<p class="menu-empty">None yet. A pattern is a composition of components — it lives in <code>patterns/</code> and appears here automatically.</p>`}`;
}

/* ================= token rail ================= */
const TABS = [['colors','Colour'],['type','Type'],['space','Space'],['radius','Radius'],['contrast','Contrast']];
function swatch(hex, attrs){ return `<span class="sw"><i style="background:${hex}"></i><input type="color" value="${hex.slice(0,7)}" ${attrs}></span>`; }

function paneColors(){
  const anchors = Object.keys(T.ramps).filter(r => T.ramps[r].anchor).map(r => {
    const info = anchorInfo(r), cur = S.anchors[r] || info.orig;
    const stops = T.ramps[r].stops.filter(s => !/^d/.test(s));
    return `<div class="anch">
      <div class="anch-h">${swatch(cur, `data-anchor="${r}"`)}
        <span><b>${esc(T.ramps[r].label)}</b><small>${esc(r)}.${esc(T.ramps[r].anchor)}</small></span>
        <span style="display:flex;gap:2px;align-items:center">
          <input class="hex" value="${cur.slice(0,7)}" data-anchor-hex="${r}">
          <button class="ico" data-reset-anchor="${r}" ${S.anchors[r] ? '' : 'disabled'} title="Reset">↺</button></span>
      </div>
      <div class="ramp">${stops.map(s => `<i style="background:${stopHex(`${r}.${s}`)}" title="${esc(r)}.${esc(s)}"></i>`).join('')}</div>
    </div>`;
  }).join('');

  const q = (S.tokenQuery || '').toLowerCase();
  const rows = Object.keys(T.semantic).filter(n => !q || n.toLowerCase().includes(q)).map(n => {
    const l = varHex(n,'light'), d = varHex(n,'dark'), ov = !!S.semOv[n];
    return `<div class="trow"><span class="nm">${esc(n.replace('--es-',''))}${ov ? ' <em>•</em>' : ''}</span>
      <button class="ico" data-reset-sem="${n}" ${ov ? '' : 'disabled'}>↺</button>
      <span class="pair">
        <span class="one"><span class="th">L</span>${swatch(l, `data-sem="${n}" data-mode="light"`)}<input class="hex" value="${l.slice(0,7)}" data-sem-hex="${n}" data-mode="light"></span>
        <span class="one"><span class="th">D</span>${swatch(d, `data-sem="${n}" data-mode="dark"`)}<input class="hex" value="${d.slice(0,7)}" data-sem-hex="${n}" data-mode="dark"></span>
      </span></div>`;
  }).join('');

  return `<h3>Anchors</h3>
    <p class="note">Change one colour and its whole ramp is regenerated in OKLCH — every stop keeps its relative lightness and chroma.</p>
    <div class="grp">${anchors}</div>
    <h3>Semantic tokens</h3>
    <p class="note">Overriding one here breaks it away from its ramp. Prefer an anchor.</p>
    <input class="inp" style="width:100%" placeholder="Filter tokens…" data-tokenq value="${esc(S.tokenQuery||'')}">
    <div class="grp" style="gap:0">${rows || '<p class="note">No match.</p>'}</div>`;
}

function numCtl(name, label, min, max, step, unit, note){
  const raw = String(scaleVal(name)), v = parseFloat(raw);
  return `<div class="num"><label>${esc(label)}</label>
    <span class="v"><input value="${Number.isFinite(v)?v:raw}" data-scale="${name}" data-unit="${unit}"><span>${unit}</span></span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(v)?v:0}" data-scale-range="${name}" data-unit="${unit}">
    ${note ? `<small>${esc(note)}</small>` : ''}</div>`;
}
function paneType(){
  const fam = k => `<div class="grp"><h3>${k === 'text' ? 'Body / UI' : 'Headings'}</h3>
    <select class="inp" data-font="${k}">${Object.entries(FONTS).map(([n,v]) =>
      `<option value="${esc(v)}"${(S.typeface[k]||T.typeface[k])===v?' selected':''}>${esc(n)}</option>`).join('')}
      ${Object.values(FONTS).includes(S.typeface[k]||T.typeface[k]) ? '' : `<option selected value="${esc(S.typeface[k]||T.typeface[k])}">Theme default</option>`}</select></div>`;
  const sizes = Object.keys(T.scales).filter(n => /^--es-(text|heading)-size-/.test(n))
    .map(n => numCtl(n, n.replace('--es-',''), 0.5, 5, 0.0625, 'rem', '')).join('');
  return `${fam('text')}${fam('heading')}<h3>Scale</h3>
    <p class="note">Sizes are in rem; 1rem = 16px. Type does not scale with density.</p><div class="grp">${sizes}</div>`;
}
function paneSpace(){
  const steps = Object.keys(T.scales).filter(n => /^--es-space-\d/.test(n))
    .map(n => numCtl(n, n.replace('--es-space-','space.'), 0, 160, 1, 'px', '')).join('');
  return `<h3>Density</h3>
    <p class="note">Multiplies every spacing step at runtime. The values below are the unscaled base.</p>
    <div class="seg" data-seg="density">${Object.keys(DENSITY).map(k => `<button data-v="${k}" aria-pressed="${S.density===k}">${k}</button>`).join('')}</div>
    <h3>Steps</h3><div class="grp">${steps}</div>`;
}
function paneRadius(){
  const steps = Object.keys(T.scales).filter(n => /^--es-radius-/.test(n) && !n.endsWith('full'))
    .map(n => numCtl(n, n.replace('--es-radius-',''), 0, 48, 1, 'px', '')).join('');
  const borders = Object.keys(T.scales).filter(n => /^--es-border-width-/.test(n))
    .map(n => numCtl(n, n.replace('--es-',''), 0, 8, 0.5, 'px', '')).join('');
  return `<h3>Personality</h3>
    <p class="note">Multiplies every radius step except <code>full</code>.</p>
    <div class="seg" data-seg="radius">${Object.keys(RADIUS).map(k => `<button data-v="${k}" aria-pressed="${S.radius===k}">${k}</button>`).join('')}</div>
    <h3>Steps</h3><div class="grp">${steps}</div>
    <h3>Border width</h3><div class="grp">${borders}</div>`;
}
function paneContrast(){
  const PAIRS = [
    ['--es-text-primary','--es-base-bg',4.5], ['--es-text-primary','--es-base-surface',4.5],
    ['--es-text-secondary','--es-base-surface',4.5], ['--es-text-tertiary','--es-base-surface',4.5],
    ['--es-text-muted','--es-base-surface',4.5], ['--es-link','--es-base-surface',4.5],
    ['--es-primary-text-inverted','--es-primary-bg',4.5], ['--es-secondary-text-inverted','--es-secondary-bg',4.5],
    ['--es-success-text-inverted','--es-success-bg',4.5], ['--es-warning-text-inverted','--es-warning-bg',4.5],
    ['--es-error-text-inverted','--es-error-bg',4.5],
    ['--es-primary-text','--es-primary-soft',4.5], ['--es-success-text','--es-success-soft',4.5],
    ['--es-warning-text','--es-warning-soft',4.5], ['--es-error-text','--es-error-soft',4.5],
    ['--es-neutral-strong','--es-base-surface',3], ['--es-state-focus','--es-base-bg',3],
  ];
  const mode = S.theme === 'dark' ? 'dark' : 'light';
  const rows = PAIRS.map(([fg,bg,need]) => {
    const f = varHex(fg,mode), b = varHex(bg,mode), r = contrast(f,b);
    const cls = r >= need ? 'ok' : (r >= 3 ? 'lg' : 'bad');
    const label = r >= need ? 'AA' : (r >= 3 ? 'large' : 'fail');
    return `<tr><td>${esc(fg.replace('--es-',''))}<br>on ${esc(bg.replace('--es-',''))}</td>
      <td><span class="pr" style="background:${b};color:${f}">Aa</span></td>
      <td class="ratio">${r.toFixed(2)}</td><td><span class="tag ${cls}">${label}</span></td></tr>`;
  }).join('');
  return `<h3>Contrast — ${mode}</h3>
    <p class="note">WCAG 2.1: 4.5:1 for body text, 3:1 for 24px+ text, borders, focus rings and icons. Switch the theme in the top bar to check the other mode.</p>
    <table class="ctab"><thead><tr><th>Pair</th><th>Sample</th><th>Ratio</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
const PANES = { colors:paneColors, type:paneType, space:paneSpace, radius:paneRadius, contrast:paneContrast };
function rail(){
  return `<div class="rail-tabs" role="tablist">${TABS.map(([id,l]) =>
    `<button role="tab" data-tab="${id}" aria-selected="${S.tab===id}">${l}</button>`).join('')}</div>
    <div class="pane" data-pane>${PANES[S.tab]()}</div>`;
}
const refreshRail = () => { $('[data-pane]').innerHTML = PANES[S.tab](); };

/* ================= export ================= */
function themeJSON(){
  const out = JSON.parse(JSON.stringify(D.themeFile));
  for (const [ramp, group] of Object.entries(out.palette || {})){
    if (ramp.startsWith('$')) continue;
    for (const stop of Object.keys(group)){
      if (stop.startsWith('$')) continue;
      const hex = stopHex(`${ramp}.${stop}`);
      if (hex !== T.palette[`${ramp}.${stop}`]) group[stop].$value = hex;
    }
    if (S.anchors[ramp]) group.$anchor = T.ramps[ramp].anchor; // anchor stop itself is already written above
  }
  for (const [k,v] of Object.entries(S.typeface)) if (out.typeface && out.typeface[k]) out.typeface[k].$value = v;
  out.personality.density.$value = DENSITY[S.density];
  out.personality.radiusScale.$value = RADIUS[S.radius];
  out.$name = (out.$name || 'Enspire') + (isTouched() ? ' (edited)' : '');
  return JSON.stringify(out, null, 2) + '\n';
}
function overridesCSS(){
  const names = Object.keys(T.semantic);
  const line = m => names.map(n => `  ${n}: ${varHex(n,m)};`).join('\n');
  const extra = Object.entries(S.scaleOv).map(([n,v]) => `  ${n}: ${v};`).join('\n');
  return `/* Enspire — live values from the Lab. Paste into a project to override the built tokens,\n   or save the theme JSON into tokens/themes/ and rebuild (preferred). */\n:root {\n  --es-density: ${DENSITY[S.density]};\n  --es-radius-scale: ${RADIUS[S.radius]};\n${extra ? extra + '\n' : ''}${line('light')}\n}\n\n:root[data-theme="dark"] {\n${line('dark')}\n}\n`;
}
let exportTab = 'json';
function exportDialog(){
  const body = exportTab === 'json' ? themeJSON() : overridesCSS();
  return `<div class="back" data-back><div class="dlg" role="dialog" aria-modal="true" aria-label="Export">
    <header><h2>Export</h2><button class="btn" data-close>Close</button></header>
    <div class="tabs">
      <button class="btn${exportTab==='json'?' solid':''}" data-xtab="json">Theme JSON</button>
      <button class="btn${exportTab==='css'?' solid':''}" data-xtab="css">CSS overrides</button></div>
    <p class="note">${exportTab === 'json'
      ? 'Save as <code>tokens/themes/&lt;project&gt;.json</code>, then <code>npm run build -- &lt;project&gt;</code>. This is the supported route: the token layers stay intact.'
      : 'A flat dump of every resolved value. Useful to drop into one project in a hurry, but it bypasses the palette → semantic layering, so prefer the theme JSON.'}</p>
    <pre data-xbody>${esc(body)}</pre>
    <footer><span class="note" style="margin-right:auto;padding:0">${isTouched() ? 'Includes your edits.' : 'No edits yet — this is the theme as built.'}</span>
      <button class="btn" data-copyx>Copy</button><button class="btn solid" data-dl>Download</button></footer>
  </div></div>`;
}
function toast(msg){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}
function download(name, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'text/plain' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= shell ================= */
function canvas(){
  if (S.view === 'foundations') return foundations();
  if (S.view === 'all'){
    const list = D.components.filter(matches);
    return list.length ? list.map(componentCard).join('') : '<section class="card"><p class="sum">Nothing matches that search.</p></section>';
  }
  if (S.view.startsWith('c:')){
    const c = byName[S.view.slice(2)];
    if (!c) return '<section class="card"><p class="sum">Gone. Pick another from the menu.</p></section>';
    return componentCard(c) + compareCard(c);
  }
  return '<section class="card"><p class="sum">Patterns land here once <code>patterns/</code> has something in it.</p></section>';
}
function render(){
  $('#side').innerHTML = menu();
  $('#canvas').innerHTML = canvas();
  $('#rail').innerHTML = rail();
  $('#seg-theme').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.theme));
  $('#seg-chrome').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.chrome));
}
function shell(){
  document.body.innerHTML = `<div class="app">
    <div class="bar">
      <button class="btn only-narrow" data-toggle="side" aria-label="Menu">☰</button>
      <div class="brand">Enspire Lab <span>${D.components.length} components</span></div>
      <input class="inp" id="q" type="search" placeholder="Search…" aria-label="Search components" style="width:170px">
      <div class="ctl"><span>Theme</span><div class="seg" id="seg-theme" data-seg="theme">
        ${['light','dark'].map(v => `<button data-v="${v}">${v}</button>`).join('')}</div></div>
      <div class="ctl"><span>Density</span><div class="seg" data-seg="density">
        ${Object.keys(DENSITY).map(v => `<button data-v="${v}" aria-pressed="${S.density===v}">${v}</button>`).join('')}</div></div>
      <div class="ctl"><span>Radius</span><div class="seg" data-seg="radius">
        ${Object.keys(RADIUS).map(v => `<button data-v="${v}" aria-pressed="${S.radius===v}">${v}</button>`).join('')}</div></div>
      <div class="ctl"><span class="sr">Chrome</span><div class="seg" id="seg-chrome" data-seg="chrome">
        ${['light','dark'].map(v => `<button data-v="${v}" title="Lab chrome ${v}">${v==='light'?'☀':'☾'}</button>`).join('')}</div></div>
      <button class="btn" data-export>Export</button>
      <button class="btn only-narrow" data-toggle="rail" aria-label="Tokens">⚙</button>
    </div>
    <div class="split"><aside class="side" id="side"></aside><main class="canvas" id="canvas"></main><aside class="rail" id="rail"></aside></div>
  </div><div id="dlg"></div>`;
}

/* ================= events ================= */
document.addEventListener('click', e => {
  const t = e.target, btn = t.closest('button'), link = t.closest('a[data-go]');

  if (link){ e.preventDefault(); S.view = link.dataset.go; save();
    if (innerWidth <= 860) $('#side').classList.remove('open');
    render(); $('#canvas').scrollTop = 0; return; }
  if (!btn) return;

  if (btn.dataset.toggle){ $('#' + btn.dataset.toggle).classList.toggle('open'); return; }

  const seg = btn.closest('[data-seg]');
  if (seg){
    const k = seg.dataset.seg; S[k] = btn.dataset.v; save(); applyTokens();
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === btn));
    document.querySelectorAll(`[data-seg="${k}"]`).forEach(g => g !== seg &&
      g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S[k])));
    if (k === 'theme' && S.tab === 'contrast') refreshRail();
    if ((k === 'density' || k === 'radius') && S.view === 'foundations') $('#canvas').innerHTML = foundations();
    return;
  }
  if (btn.dataset.tab){ S.tab = btn.dataset.tab; save();
    $('.rail-tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b === btn)); refreshRail(); return; }

  // component props
  const card = btn.closest('.card[id^="c-"]');
  if (card){
    const name = card.id.slice(2);
    if (btn.dataset.exp){ const ex = S.expand[name] = S.expand[name] || {}; ex[btn.dataset.exp] = !ex[btn.dataset.exp]; refreshComponent(name); return; }
    if (btn.dataset.expall){ const on = btn.dataset.expall === 'on', ex = S.expand[name] = {};
      if (on) Object.keys(byName[name].variants).forEach(a => ex[a] = true); refreshComponent(name); return; }
    if (btn.dataset.fix){ S.fixed[name][btn.dataset.fix] = btn.dataset.v; refreshComponent(name); return; }
  }

  // token rail
  if (btn.dataset.resetAnchor){ delete S.anchors[btn.dataset.resetAnchor]; save(); applyTokens(); refreshRail(); if (S.view==='foundations') $('#canvas').innerHTML = foundations(); return; }
  if (btn.dataset.resetSem){ delete S.semOv[btn.dataset.resetSem]; save(); applyTokens(); refreshRail(); return; }
  if (btn.dataset.copy){ navigator.clipboard?.writeText(btn.dataset.copy); toast(btn.dataset.copy + ' copied'); return; }

  // export dialog
  if (btn.dataset.export !== undefined){ $('#dlg').innerHTML = exportDialog(); return; }
  if (btn.dataset.close !== undefined){ $('#dlg').innerHTML = ''; return; }
  if (btn.dataset.xtab){ exportTab = btn.dataset.xtab; $('#dlg').innerHTML = exportDialog(); return; }
  if (btn.dataset.copyx !== undefined){ navigator.clipboard?.writeText($('[data-xbody]').textContent); toast('Copied'); return; }
  if (btn.dataset.dl !== undefined){
    download(exportTab === 'json' ? 'enspire-theme.json' : 'enspire-overrides.css', $('[data-xbody]').textContent);
    return; }
});
document.addEventListener('mousedown', e => { if (e.target.dataset.back !== undefined) $('#dlg').innerHTML = ''; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#dlg').innerHTML = ''; });

function liveColor(el, commit){
  const v = cleanHex(el.value); if (!v) return;
  if (el.dataset.anchor || el.dataset.anchorHex){
    S.anchors[el.dataset.anchor || el.dataset.anchorHex] = v;
  } else if (el.dataset.sem || el.dataset.semHex){
    const n = el.dataset.sem || el.dataset.semHex;
    S.semOv[n] = Object.assign({ light:varHex(n,'light'), dark:varHex(n,'dark') }, { [el.dataset.mode]: v });
  } else return;
  applyTokens();
  if (commit){ save(); refreshRail(); if (S.view === 'foundations') $('#canvas').innerHTML = foundations(); }
}
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'q'){ query = el.value.trim().toLowerCase(); const p = el.selectionStart;
    render(); const q = $('#q'); q.value = el.value; q.focus(); q.setSelectionRange(p,p); return; }
  if (el.dataset.tokenq !== undefined){ S.tokenQuery = el.value; const p = el.selectionStart;
    refreshRail(); const n = $('[data-tokenq]'); n.focus(); n.setSelectionRange(p,p); return; }
  if (el.type === 'color' || el.dataset.semHex || el.dataset.anchorHex){ liveColor(el, false); return; }
  if (el.dataset.scaleRange){ S.scaleOv[el.dataset.scaleRange] = el.value + el.dataset.unit;
    const box = el.parentElement.querySelector('[data-scale]'); if (box) box.value = el.value;
    applyTokens(); if (S.view === 'foundations') $('#canvas').innerHTML = foundations(); return; }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.type === 'color' || el.dataset.semHex || el.dataset.anchorHex){ liveColor(el, true); return; }
  if (el.dataset.font){ S.typeface[el.dataset.font] = el.value; save(); applyTokens(); return; }
  if (el.dataset.scale){ const v = parseFloat(el.value);
    if (Number.isFinite(v)){ S.scaleOv[el.dataset.scale] = v + el.dataset.unit; save(); applyTokens();
      if (S.view === 'foundations') $('#canvas').innerHTML = foundations(); } return; }
  if (el.dataset.scaleRange){ save(); return; }
  const card = el.closest('.card[id^="c-"]');
  if (card && el.dataset.fix){ S.fixed[card.id.slice(2)][el.dataset.fix] = el.value; refreshComponent(card.id.slice(2)); }
});

shell(); applyTokens(); render();
})();
