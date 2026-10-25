/**
 * Shared loader for tools/index.js and tools/lab.js.
 * Reads components/<name>/meta.json and derives each component's atomic level from its `uses`:
 *   no uses -> atom · uses only atoms -> molecule · anything else -> organism
 * (The linter enforces the same rules; it is the one that reports problems.)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function load() {
  const dir = path.join(ROOT, 'components');
  const items = new Map();

  for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(dir, entry.name, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    items.set(meta.name || entry.name, { dir: path.join(dir, entry.name), meta, path: `components/${entry.name}/` });
  }

  const cache = new Map();
  const levelOf = (name, trail = []) => {
    if (cache.has(name)) return cache.get(name);
    if (trail.includes(name)) return 'atom'; // cycles are reported by the linter
    const uses = (items.get(name).meta.uses || []).filter((u) => items.has(u));
    const level = uses.length === 0
      ? 'atom'
      : uses.every((u) => levelOf(u, [...trail, name]) === 'atom') ? 'molecule' : 'organism';
    cache.set(name, level);
    return level;
  };
  for (const [name, item] of items) item.level = levelOf(name);

  // Dependencies first, so the Lab and the CSS bundle never depend on alphabetical luck.
  const order = [];
  const visit = (name) => {
    if (order.includes(name) || !items.has(name)) return;
    (items.get(name).meta.uses || []).forEach(visit);
    order.push(name);
  };
  [...items.keys()].sort().forEach(visit);

  // Patterns are compositions of components. Same meta.json shape, their own folder and menu group.
  const patterns = [];
  const pdir = path.join(ROOT, 'patterns');
  for (const entry of fs.existsSync(pdir) ? fs.readdirSync(pdir, { withFileTypes: true }) : []) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(pdir, entry.name, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    patterns.push({ dir: path.join(pdir, entry.name), meta, path: `patterns/${entry.name}/`, level: 'pattern' });
  }

  return { items, order, patterns, ROOT };
}

/** Concatenate a component's CSS files in the order meta.json lists them. */
function cssOf(item) {
  return (item.meta.css || [])
    .map((f) => fs.readFileSync(path.join(item.dir, f), 'utf8'))
    .join('\n');
}

module.exports = { load, cssOf, ROOT };
