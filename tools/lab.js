#!/usr/bin/env node
/**
 * Build dist/lab.html — ONE self-contained file (tokens + every component's CSS + Lab UI + data).
 * Open it by double-click, from a phone, or publish it. It is generated from meta.json, so adding a
 * component needs no Lab change: write meta.json (with a `preview` template) and rebuild.
 */

const fs = require('fs');
const path = require('path');
const { load, cssOf, ROOT } = require('./components');

const tokensPath = path.join(ROOT, 'dist', 'enspire-tokens.css');
if (!fs.existsSync(tokensPath)) {
  console.error('dist/enspire-tokens.css missing — run `npm run build` first.');
  process.exit(1);
}

const { items, order } = load();
const read = (...p) => fs.readFileSync(path.join(__dirname, 'lab', ...p), 'utf8');

const components = order.map((n) => {
  const { meta, level } = items.get(n);
  return {
    name: meta.name, class: meta.class, level, summary: meta.summary, tags: meta.tags || [], uses: meta.uses || [],
    variants: meta.variants || {}, defaults: meta.defaults || {}, preview: meta.preview || '', a11y: meta.a11y || '',
  };
});

// "<" escaped so component markup inside the JSON can never close the <script> tag.
const data = JSON.stringify({ components }).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enspire Lab</title>
<style>
${fs.readFileSync(tokensPath, 'utf8')}
${order.map((n) => cssOf(items.get(n))).join('\n')}
${read('lab.css')}
</style>
</head>
<body>
<div id="app"></div>
<script>window.LAB = ${data};</script>
<script>
${read('lab.js')}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'dist', 'lab.html'), html);
console.log(`\x1b[32m✓\x1b[0m dist/lab.html · ${components.length} components · ${(html.length / 1024).toFixed(0)} KB`);
