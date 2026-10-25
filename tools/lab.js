#!/usr/bin/env node
/**
 * Build dist/lab.html — ONE self-contained file (tokens + every component's CSS + the Lab + its data).
 * Open it by double-click, from a phone, or publish it. Everything is generated from meta.json and
 * tokens/, so a new component needs no change here: write meta.json with a `preview` and rebuild.
 */

const fs = require('fs');
const path = require('path');
const { load, cssOf, ROOT } = require('./components');
const { sources } = require('./build');

const tokensCss = path.join(ROOT, 'dist', 'enspire-tokens.css');
if (!fs.existsSync(tokensCss)) {
  console.error('dist/enspire-tokens.css missing — run `npm run build` first.');
  process.exit(1);
}

const THEME = process.argv[2] || 'enspire-default';
const { items, order, patterns } = load();
const read = (...p) => fs.readFileSync(path.join(__dirname, 'lab', ...p), 'utf8');

const pack = (name) => {
  const { meta, level } = items.get(name);
  return {
    name: meta.name, class: meta.class, category: meta.category || '', level,
    summary: meta.summary || '', tags: meta.tags || [], uses: meta.uses || [], slots: meta.slots || [],
    variants: meta.variants || {}, defaults: meta.defaults || {}, preview: meta.preview || '', a11y: meta.a11y || '',
  };
};

const data = {
  components: order.map(pack),
  patterns: patterns.map((p) => ({ name: p.meta.name, summary: p.meta.summary || '' })),
  categories: JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json'), 'utf8')).categories,
  tokens: sources(THEME),
  themeFile: JSON.parse(fs.readFileSync(path.join(ROOT, 'tokens', 'themes', `${THEME}.json`), 'utf8')),
};

// "<" escaped so component markup inside the JSON can never close the <script> tag early.
const json = JSON.stringify(data).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enspire Lab</title>
<style>
${fs.readFileSync(tokensCss, 'utf8')}
${order.map((n) => cssOf(items.get(n))).join('\n')}
${patterns.map(cssOf).join('\n')}
${read('lab.css')}
</style>
<style id="live"></style>
</head>
<body>
<script>window.LAB = ${json};</script>
<script>
${read('lab.js')}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'dist', 'lab.html'), html);
console.log(`\x1b[32m✓\x1b[0m dist/lab.html · ${data.components.length} components · ${data.patterns.length} patterns · ${(html.length / 1024).toFixed(0)} KB`);
