/* Enspire Lab — vanilla JS, no dependencies. Reads window.LAB (built from every meta.json). */
(() => {
  const DATA = window.LAB;
  const byName = Object.fromEntries(DATA.components.map((c) => [c.name, c]));

  // ---- tiny helpers ----
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get: (k, d) => { try { return localStorage.getItem('es-lab-' + k) || d; } catch (e) { return d; } },
    set: (k, v) => { try { localStorage.setItem('es-lab-' + k, v); } catch (e) { /* storage is a convenience only */ } },
  };
  const fill = (tpl, values) => tpl.replace(/\{([\w-]+)\}/g, (m, k) => (k in values ? values[k] : m));

  // ---- global look: theme x density x radius ----
  const DENSITY = { compact: 0.75, default: 1, comfortable: 1.25 };
  const RADIUS = { sharp: 0, soft: 1, round: 2 };
  const global = {
    theme: store.get('theme', 'auto'),
    density: store.get('density', 'default'),
    radius: store.get('radius', 'soft'),
  };
  function applyGlobal() {
    const root = document.documentElement;
    if (global.theme === 'auto') root.removeAttribute('data-theme'); else root.dataset.theme = global.theme;
    root.style.setProperty('--es-density', DENSITY[global.density]);
    root.style.setProperty('--es-radius-scale', RADIUS[global.radius]);
  }

  // ---- per-component state ----
  const state = {};
  function stateOf(c) {
    if (state[c.name]) return state[c.name];
    const axes = Object.keys(c.variants);
    const defaults = {};
    axes.forEach((a) => { defaults[a] = (c.defaults && c.defaults[a]) || c.variants[a][0]; });
    return (state[c.name] = { rows: axes[0] || '', cols: axes[1] || '', fixed: defaults, defaults });
  }
  const valuesFor = (c, s, extra) => ({ ...s.fixed, ...extra });
  const renderOne = (c, s, extra) => fill(c.preview, valuesFor(c, s, extra));

  function stage(c, s) {
    const rowVals = s.rows ? c.variants[s.rows] : [null];
    const colVals = s.cols ? c.variants[s.cols] : [null];
    const captions = colVals.length <= 8;
    return rowVals.map((r) => {
      const cells = colVals.map((v) => {
        const extra = {};
        if (s.rows) extra[s.rows] = r;
        if (s.cols) extra[s.cols] = v;
        const label = [s.rows && `${s.rows}=${r}`, s.cols && `${s.cols}=${v}`].filter(Boolean).join(' · ');
        return `<figure class="lab-cell" title="${esc(label)}">${renderOne(c, s, extra)}${captions && v ? `<figcaption>${esc(v)}</figcaption>` : ''}</figure>`;
      }).join('');
      return `<div class="lab-row">${s.rows ? `<div class="lab-rowlabel">${esc(s.rows)} = ${esc(r)}</div>` : ''}${cells}</div>`;
    }).join('');
  }

  function controls(c, s) {
    const axes = Object.keys(c.variants);
    const opt = (list, cur, none) => (none ? `<option value="">— none —</option>` : '') +
      list.map((a) => `<option value="${esc(a)}"${a === cur ? ' selected' : ''}>${esc(a)}</option>`).join('');
    let html = '';
    if (axes.length) {
      html += `<div class="lab-axis"><label>Rows</label><select class="lab-select" data-c="${c.name}" data-k="rows">${opt(axes, s.rows, true)}</select></div>`;
      html += `<div class="lab-axis"><label>Columns</label><select class="lab-select" data-c="${c.name}" data-k="cols">${opt(axes, s.cols, true)}</select></div>`;
    }
    axes.filter((a) => a !== s.rows && a !== s.cols).forEach((a) => {
      const vals = c.variants[a];
      html += `<div class="lab-axis"><span>${esc(a)}</span>` + (vals.length <= 6
        ? `<div class="lab-seg">${vals.map((v) => `<button type="button" aria-pressed="${s.fixed[a] === v}" data-c="${c.name}" data-fix="${esc(a)}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>`
        : `<select class="lab-select" data-c="${c.name}" data-fix="${esc(a)}">${opt(vals, s.fixed[a], false)}</select>`) + `</div>`;
    });
    return html;
  }

  function card(c) {
    const s = stateOf(c);
    const sample = renderOne(c, s, {});
    return `<section class="lab-card" id="c-${c.name}" data-name="${c.name}">
      <div class="lab-card__head"><h2>${esc(c.name)}</h2><span class="lab-level" data-level="${c.level}">${c.level}</span><code class="lab-class">.${esc(c.class)}</code></div>
      <p class="lab-summary">${esc(c.summary)}</p>
      <div class="lab-meta">${(c.uses || []).map((u) => `<span class="lab-chip lab-chip--uses">uses ${esc(u)}</span>`).join('')}${(c.tags || []).map((t) => `<span class="lab-chip">${esc(t)}</span>`).join('')}</div>
      <div class="lab-controls" data-controls>${controls(c, s)}</div>
      <div class="lab-stage" data-stage>${stage(c, s)}</div>
      <details><summary>Markup (current defaults)</summary><pre data-markup>${esc(sample)}</pre></details>
      <p class="lab-a11y"><strong>A11y.</strong> ${esc(c.a11y || '')}</p>
    </section>`;
  }

  function refresh(name) {
    const c = byName[name], s = stateOf(c);
    const root = document.getElementById('c-' + name);
    root.querySelector('[data-controls]').innerHTML = controls(c, s);
    root.querySelector('[data-stage]').innerHTML = stage(c, s);
    root.querySelector('[data-markup]').textContent = renderOne(c, s, {});
  }

  // ---- personality compare: the same component under four looks at once ----
  const QUADS = [
    ['Sharp · compact', 0, 0.75], ['Round · compact', 2, 0.75],
    ['Sharp · comfortable', 0, 1.25], ['Round · comfortable', 2, 1.25],
  ];
  let compareName = store.get('compare', DATA.components.length ? DATA.components[DATA.components.length - 1].name : '');
  if (!byName[compareName]) compareName = DATA.components[0] && DATA.components[0].name;

  function compare() {
    const c = byName[compareName]; if (!c) return '';
    const s = stateOf(c);
    const first = s.rows;
    const rowVals = first ? c.variants[first].slice(0, 4) : [null];
    const inner = rowVals.map((r) => `<div class="lab-row">${renderOne(c, s, first ? { [first]: r } : {})}</div>`).join('');
    return `<section class="lab-card" id="compare">
      <div class="lab-card__head"><h2>Compare personalities</h2><code class="lab-class">data-es-scope</code></div>
      <p class="lab-summary">Same component, same markup, four looks. Each box sets only <code>--es-density</code> and <code>--es-radius-scale</code>.</p>
      <div class="lab-controls"><div class="lab-axis"><label for="cmp">Component</label>
        <select class="lab-select" id="cmp">${DATA.components.map((x) => `<option value="${x.name}"${x.name === compareName ? ' selected' : ''}>${x.name}</option>`).join('')}</select></div></div>
      <div class="lab-compare">${QUADS.map(([t, r, d]) =>
        `<div class="lab-quad" data-es-scope style="--es-radius-scale:${r};--es-density:${d}"><h3>${t}</h3>${inner}</div>`).join('')}</div>
    </section>`;
  }

  // ---- shell ----
  function seg(id, label, options, current) {
    return `<div class="lab-ctl"><span>${label}</span><div class="lab-seg" data-seg="${id}">${options.map((o) =>
      `<button type="button" data-v="${o}" aria-pressed="${o === current}">${o}</button>`).join('')}</div></div>`;
  }

  let query = '';
  function build() {
    const list = DATA.components.filter((c) => !query ||
      (c.name + ' ' + (c.tags || []).join(' ') + ' ' + c.summary).toLowerCase().includes(query));
    document.getElementById('app').innerHTML = `
      <header class="lab-bar"><div class="lab-bar__inner">
        <div class="lab-brand">Enspire Lab <small>${DATA.components.length} components</small></div>
        <input class="lab-input" id="q" type="search" placeholder="Search name, tag…" value="${esc(query)}" aria-label="Search components">
        ${seg('theme', 'Theme', ['auto', 'light', 'dark'], global.theme)}
        ${seg('density', 'Density', Object.keys(DENSITY), global.density)}
        ${seg('radius', 'Radius', Object.keys(RADIUS), global.radius)}
      </div></header>
      <main class="lab-main">
        <nav class="lab-nav" aria-label="Components">${list.map((c) => `<a href="#c-${c.name}">${c.name}</a>`).join('')}<a href="#compare">compare</a></nav>
        ${list.length ? list.map(card).join('') : '<p class="lab-empty">No component matches.</p>'}
        ${compare()}
      </main>`;
  }

  // ---- events (delegated, so re-rendering a card never loses them) ----
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const seg = b.closest('[data-seg]');
    if (seg) {
      global[seg.dataset.seg] = b.dataset.v; store.set(seg.dataset.seg, b.dataset.v); applyGlobal();
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      return;
    }
    if (b.dataset.fix) { stateOf(byName[b.dataset.c]).fixed[b.dataset.fix] = b.dataset.v; refresh(b.dataset.c); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'cmp') { compareName = t.value; store.set('compare', t.value); document.getElementById('compare').outerHTML = compare(); return; }
    if (!t.dataset.c) return;
    const s = stateOf(byName[t.dataset.c]);
    if (t.dataset.k) s[t.dataset.k] = t.value; else if (t.dataset.fix) s.fixed[t.dataset.fix] = t.value;
    refresh(t.dataset.c);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'q') return;
    query = e.target.value.trim().toLowerCase();
    const pos = e.target.selectionStart; build(); const q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos);
  });

  applyGlobal();
  build();
})();
