#!/usr/bin/env node
/**
 * Enspire build — tokens JSON -> CSS custom properties.
 * Zero dependencies. Node 18+.
 *
 * Usage:  node tools/build.js [themeName]
 *         node tools/build.js enspire-default
 *
 * Two deliberate architectural choices live in this file:
 *
 * 1. Palette stops are NEVER emitted as CSS variables.
 *    The primitive layer is compile-time only, so UI physically cannot
 *    reference `naviblue-600` from CSS — it does not exist at runtime.
 *    This enforces "UI never references primitives" by construction.
 *
 * 2. A token that references another EMITTED token compiles to var(),
 *    not to the resolved value. That is why component tokens need no
 *    dark-mode entry: they inherit through the cascade automatically.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PREFIX = '--es-';

// Groups whose tokens become CSS variables. Anything else resolves inline.
const EMITTED = new Set(['scale', 'semantic', 'component', 'font']);
// Top-level group names stripped from the variable name.
const STRIPPED = new Set(['scale', 'semantic', 'component']);
// Explicit name overrides, applied after the generic rules.
const ALIASES = { 'link-default': 'link' };

const META = new Set(['$value', '$dark', '$type', '$scale', '$description', '$use', '$note', '$name', '$convention']);

function die(msg) {
  console.error(`\x1b[31mbuild failed:\x1b[0m ${msg}`);
  process.exit(1);
}

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    die(`cannot read ${path.relative(ROOT, p)} — ${e.message}`);
  }
}

const isToken = (node) =>
  node && typeof node === 'object' && !Array.isArray(node) && '$value' in node;

/**
 * Natural sort so "025" lands before "100" instead of after "1000".
 * JS object key order puts canonical integers first, which scrambles the scales.
 */
function naturalKeys(node) {
  return Object.keys(node)
    .filter((k) => !k.startsWith('$'))
    .sort((a, b) => {
      const na = parseFloat(a.replace(/^0+(?=\d)/, ''));
      const nb = parseFloat(b.replace(/^0+(?=\d)/, ''));
      const bothNumeric = !Number.isNaN(na) && !Number.isNaN(nb);
      return bothNumeric ? na - nb : 0; // non-numeric keys keep authored order
    });
}

/** Walk the token tree, yielding [pathArray, tokenNode, inheritedScale]. */
function* walk(node, trail = [], scale = null) {
  if (!node || typeof node !== 'object') return;
  const groupScale = node.$scale || scale;
  for (const key of naturalKeys(node)) {
    const child = node[key];
    const next = [...trail, key];
    if (isToken(child)) {
      yield [next, child, child.$scale || groupScale];
    } else {
      yield* walk(child, next, groupScale);
    }
  }
}

/** scale.text-size.md -> --es-text-size-md   |   semantic.link.default -> --es-link */
function cssName(trail) {
  const parts = STRIPPED.has(trail[0]) ? trail.slice(1) : trail;
  const joined = parts.join('-');
  return PREFIX + (ALIASES[joined] || joined);
}

/** Resolve a dotted path like palette.naviblue.600 against the merged tree. */
function lookup(tree, dotted) {
  let node = tree;
  for (const seg of dotted.split('.')) {
    if (!node || typeof node !== 'object' || !(seg in node)) return null;
    node = node[seg];
  }
  return node;
}

/**
 * Turn a raw $value into its CSS output.
 * A reference to an emitted token becomes var(); anything else resolves inline.
 */
function resolve(tree, raw, mode, seen = new Set()) {
  if (typeof raw !== 'string') return String(raw);

  const ref = raw.match(/^\{([^}]+)\}$/);
  if (!ref) return raw;

  const dotted = ref[1];
  if (seen.has(dotted)) die(`circular reference at {${dotted}}`);
  seen.add(dotted);

  const target = lookup(tree, dotted);
  if (!target) die(`unresolved reference {${dotted}}`);
  if (!isToken(target)) die(`{${dotted}} points at a group, not a token`);

  const top = dotted.split('.')[0];
  if (EMITTED.has(top)) {
    return `var(${cssName(dotted.split('.'))})`;
  }
  // Primitive layer: inline the literal. Honour $dark when building dark mode.
  const literal = mode === 'dark' && target.$dark ? target.$dark : target.$value;
  return resolve(tree, literal, mode, seen);
}

function applyScale(value, scale) {
  if (!scale || scale === 'none') return value;
  if (/^-?0(px|rem|em)?$/.test(String(value).trim())) return value; // 0 stays 0
  const knob = scale === 'density' ? `${PREFIX}density` : `${PREFIX}radius-scale`;
  return `calc(${value} * var(${knob}))`;
}

function build(themeName) {
  const corePath = path.join(ROOT, 'tokens', 'core.json');
  const themePath = path.join(ROOT, 'tokens', 'themes', `${themeName}.json`);
  if (!fs.existsSync(themePath)) die(`no theme at tokens/themes/${themeName}.json`);

  const core = readJSON(corePath);
  const theme = readJSON(themePath);
  const tree = { ...theme, ...core };

  const light = [];
  const dark = [];
  const flat = {};
  let count = 0;

  for (const [trail, token, scale] of walk(core)) {
    const name = cssName(trail);
    const lightValue = applyScale(resolve(tree, token.$value, 'light'), scale);
    light.push(`  ${name}: ${lightValue};`);
    flat[name] = { light: lightValue, group: trail[0], path: trail.join('.') };
    count++;

    if (token.$dark) {
      const darkValue = applyScale(resolve(tree, token.$dark, 'dark'), scale);
      dark.push(`  ${name}: ${darkValue};`);
      flat[name].dark = darkValue;
    }
  }

  const density = lookup(tree, 'personality.density').$value;
  const radiusScale = lookup(tree, 'personality.radiusScale').$value;

  const knobs = [
    `  /* Personality knobs — override these per project, nothing else. */`,
    `  ${PREFIX}density: ${density};`,
    `  ${PREFIX}radius-scale: ${radiusScale};`,
  ].join('\n');

  const css = `/* Enspire tokens — generated by tools/build.js. Do not edit by hand. */
/* Theme: ${theme.$name || themeName} · ${count} tokens · ${new Date().toISOString().slice(0, 10)} */

:root {
${knobs}

${light.join('\n')}
}

:root[data-theme="dark"] {
${dark.join('\n')}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${dark.map((l) => '  ' + l).join('\n')}
  }
}
`;

  const outDir = path.join(ROOT, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'enspire-tokens.css'), css);
  fs.writeFileSync(path.join(outDir, 'tokens.json'), JSON.stringify(flat, null, 2));

  console.log(`\x1b[32m✓\x1b[0m ${count} tokens · ${dark.length} dark overrides · theme "${theme.$name || themeName}"`);
  console.log(`  dist/enspire-tokens.css`);
  console.log(`  dist/tokens.json`);
}

build(process.argv[2] || 'enspire-default');
