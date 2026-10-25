#!/usr/bin/env node
/**
 * Enspire lint — four rules, nothing else. Zero dependencies.
 *
 *   raw-values     Raw px/rem/em/hex in a strict zone. Values live in tokens/.
 *   token-ref      var(--es-*) that is a palette stop (not emitted) or unknown.
 *   token-layer    A component token in core.json that skips the semantic layer.
 *   atom-deps      meta.json level/uses disagree with the real dependency graph.
 *
 * Strict zones: primitives/ components/ patterns/ templates/ bridges/
 * Free zone:    custom/   (never checked — this is where marketing lives)
 *
 * Escape hatch (reason is mandatory, a bare disable is itself an error):
 *     /* es-disable raw-values — hero campaign Q4, client-approved gradient *​/
 * Applies to its own line and the line below. Audit all with:
 *     grep -rn "es-disable" .
 *
 * Usage: node tools/check.js [--quiet]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STRICT = ['primitives', 'components', 'patterns', 'templates', 'bridges'];
const PALETTE_GROUPS = ['naviblue', 'verdant', 'green', 'amber', 'red', 'slate', 'canvas', 'ink', 'violet', 'alpha'];
const quiet = process.argv.includes('--quiet');

const problems = [];
const report = (file, line, rule, msg) =>
  problems.push({ file: path.relative(ROOT, file), line, rule, msg });

/* ---------- helpers ---------- */

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
  }
  return out;
}

/** Collect es-disable directives. Returns Map<rule, Set<lineNumber>>; reports bare ones. */
function readDisables(file, lines) {
  const allowed = new Map();
  lines.forEach((text, i) => {
    const m = text.match(/es-disable\s+([a-z-]+)\s*(?:[—–-]+\s*(.+?))?\s*\*\//);
    if (!m) return;
    if (!m[2] || m[2].trim().length < 3) {
      report(file, i + 1, m[1], 'es-disable without a reason. Write why: /* es-disable rule — reason */');
      return;
    }
    if (!allowed.has(m[1])) allowed.set(m[1], new Set());
    allowed.get(m[1]).add(i + 1).add(i + 2);
  });
  return allowed;
}

/** Blank out comments and url(...)/data: payloads while keeping line numbers intact. */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/url\([^)]*\)/g, (m) => 'url()' + ' '.repeat(Math.max(0, m.length - 5)));
}

/* ---------- known tokens ---------- */

const tokensPath = path.join(ROOT, 'dist', 'tokens.json');
if (!fs.existsSync(tokensPath)) {
  console.error('dist/tokens.json missing — run `node tools/build.js` first.');
  process.exit(2);
}
const emitted = new Set(Object.keys(JSON.parse(fs.readFileSync(tokensPath, 'utf8'))));
emitted.add('--es-density');
emitted.add('--es-radius-scale');

// Context tokens and component-private vars are declared inside strict-zone CSS.
const cssFiles = STRICT.flatMap((z) => walkFiles(path.join(ROOT, z), ['.css']));
const declared = new Set();
for (const f of cssFiles) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(--es-[a-z0-9-]+)\s*:/g)) declared.add(m[1]);
}

// Context hooks a component accepts from its parents are declared in meta.json ("context": [...]).
// That keeps them greppable and stops a typo'd token from hiding behind a var() fallback.
for (const f of walkFiles(path.join(ROOT, 'components'), ['meta.json'])) {
  try {
    for (const v of JSON.parse(fs.readFileSync(f, 'utf8')).context || []) declared.add(v);
  } catch (e) { /* reported by rule 4 */ }
}

/* ---------- rules 1 + 2: raw-values, token-ref ---------- */

const RAW = /(?<![\w#-])(-?\d*\.?\d+)(px|rem|em)\b|#[0-9a-fA-F]{3,8}\b/g;

for (const file of cssFiles) {
  const original = fs.readFileSync(file, 'utf8').split('\n');
  const allowed = readDisables(file, original);
  const clean = stripNoise(original.join('\n')).split('\n');

  clean.forEach((text, i) => {
    const ln = i + 1;
    if (/^\s*@media|^\s*@container/.test(text)) return; // vars cannot be used in media queries

    if (!allowed.get('raw-values')?.has(ln)) {
      for (const m of text.matchAll(RAW)) {
        if (m[1] !== undefined && parseFloat(m[1]) === 0) continue; // 0px is just 0
        report(file, ln, 'raw-values', `"${m[0]}" — use a token (var(--es-*)).`);
      }
    }

    if (!allowed.get('token-ref')?.has(ln)) {
      for (const m of text.matchAll(/var\(\s*(--es-[a-z0-9-]+)/g)) {
        const name = m[1];
        const stop = PALETTE_GROUPS.find((g) => name.startsWith(`--es-${g}-`));
        if (stop) {
          report(file, ln, 'token-ref', `${name} is a palette stop. UI never references primitives — use a semantic token.`);
        } else if (!emitted.has(name) && !declared.has(name)) {
          report(file, ln, 'token-ref', `${name} is not defined anywhere (typo, or the token does not exist).`);
        }
      }
    }
  });
}

/* ---------- rule 3: token-layer ---------- */

const corePath = path.join(ROOT, 'tokens', 'core.json');
const coreLines = fs.readFileSync(corePath, 'utf8').split('\n');
let inComponent = false;
coreLines.forEach((text, i) => {
  if (/^\s{2}"component"\s*:/.test(text)) inComponent = true;
  else if (inComponent && /^\s{2}"[a-z-]+"\s*:/.test(text)) inComponent = false;
  if (!inComponent) return;
  const m = text.match(/"\$(?:value|dark)"\s*:\s*"\{([^}]+)\}"/);
  if (m && !m[1].startsWith('semantic.')) {
    report(corePath, i + 1, 'token-layer', `component token resolves to {${m[1]}} — must go through a semantic.* token.`);
  }
  if (/"\$(?:value|dark)"\s*:\s*"(?!\{)/.test(text)) {
    report(corePath, i + 1, 'token-layer', 'component token holds a literal — must reference a semantic.* token.');
  }
});

/* ---------- rule 4: atom-deps ---------- */

const metas = new Map(); // name -> { file, meta }
for (const f of walkFiles(path.join(ROOT, 'components'), ['meta.json'])) {
  try {
    const meta = JSON.parse(fs.readFileSync(f, 'utf8'));
    metas.set(meta.name || path.basename(path.dirname(f)), { file: f, meta });
  } catch (e) {
    report(f, 1, 'atom-deps', `invalid JSON — ${e.message}`);
  }
}

const levelCache = new Map();
function computeLevel(name, trail = []) {
  if (levelCache.has(name)) return levelCache.get(name);
  if (trail.includes(name)) {
    report(metas.get(name).file, 1, 'atom-deps', `circular dependency: ${[...trail, name].join(' → ')}`);
    return 'atom';
  }
  const uses = metas.get(name).meta.uses || [];
  let level = 'atom';
  if (uses.length) {
    const childLevels = uses.filter((u) => metas.has(u)).map((u) => computeLevel(u, [...trail, name]));
    level = childLevels.every((l) => l === 'atom') ? 'molecule' : 'organism';
  }
  levelCache.set(name, level);
  return level;
}

for (const [name, { file, meta }] of metas) {
  for (const u of meta.uses || []) {
    if (!metas.has(u)) report(file, 1, 'atom-deps', `uses "${u}" but no such component exists.`);
  }
  const computed = computeLevel(name);
  if (meta.level && meta.level !== computed) {
    report(file, 1, 'atom-deps', `declares level "${meta.level}" but its dependencies make it a ${computed}. Fix "uses", or drop "level" (it is derived).`);
  }
}

// A component's CSS may only style its own classes — other components' classes must be declared in "uses".
const classOwner = new Map();
for (const [name, { meta }] of metas) classOwner.set(meta.class || `es-${name}`, name);
for (const [name, { file, meta }] of metas) {
  const dir = path.dirname(file);
  for (const cssFile of walkFiles(dir, ['.css'])) {
    stripNoise(fs.readFileSync(cssFile, 'utf8')).split('\n').forEach((text, i) => {
      for (const m of text.matchAll(/\.(es-[a-z0-9]+)(?![a-z0-9_-])/g)) {
        const owner = classOwner.get(m[1]);
        if (owner && owner !== name && !(meta.uses || []).includes(owner)) {
          report(cssFile, i + 1, 'atom-deps', `styles .${m[1]} (${owner}) without declaring it in "uses".`);
        }
      }
    });
  }
}

/* ---------- output ---------- */

if (problems.length === 0) {
  if (!quiet) console.log(`\x1b[32m✓\x1b[0m lint clean · ${cssFiles.length} css files · ${metas.size} components`);
  process.exit(0);
}

const byFile = new Map();
for (const p of problems) {
  if (!byFile.has(p.file)) byFile.set(p.file, []);
  byFile.get(p.file).push(p);
}
for (const [file, list] of byFile) {
  console.log(`\n\x1b[4m${file}\x1b[0m`);
  for (const p of list) console.log(`  ${String(p.line).padStart(4)}  \x1b[31m${p.rule.padEnd(11)}\x1b[0m ${p.msg}`);
}
console.log(`\n\x1b[31m✗ ${problems.length} problem${problems.length === 1 ? '' : 's'}\x1b[0m\n`);
process.exit(1);
