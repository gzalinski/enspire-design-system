# Enspire Design System

Token-first, **CSS-only** design system. One stylesheet works in WordPress/Gutenberg, React/Next and static HTML.
No framework, no bundler, no runtime dependencies. If a change needs one, stop and ask.

## Commands

```
npm run build    # tokens/*.json  ->  dist/enspire-tokens.css + dist/tokens.json
npm run check    # lint (4 rules). Run it after EVERY component you write.
npm run verify   # both
```

## Before you build anything

1. **Read `INDEX.md` first.** One line per component. If something close exists, extend its variants — do not add a sibling.
2. **Rule of two:** do not extract a new component until the same thing is needed in 2 places.
3. Copy the nearest existing `components/*/` folder and its `*.examples.html`. Examples beat prose.

## Layout

```
tokens/core.json          structure + roles + component token contracts (brand-agnostic)
tokens/themes/*.json      palettes + personality knobs. THE ONLY place raw hex is legal.
primitives/               Box, Stack, Text, Icon-level building blocks. No business logic.
components/<name>/        meta.json  <name>.css  <name>.examples.html      (flat — no atoms/ folder)
patterns/                 compositions of components (Hero, PricingTable, AuthForm)
templates/                page skeletons with slots, no real content
bridges/                  maps third-party CSS APIs onto --es-* (e.g. Gravity Forms)
custom/                   FREE ZONE. Anything goes. Never linted.
dist/                     generated, committed. Never edit by hand.
```

## Hard rules (enforced by `npm run check`)

1. **No raw values** (`px`, `rem`, `em`, hex) outside `tokens/` and `custom/`. `0` is fine. `@media` conditions are exempt.
2. **Tokens flow one way:** palette -> semantic -> component. Palette stops are NOT emitted to CSS, so
   `var(--es-naviblue-600)` cannot exist. Components use `--es-primary-bg`, never a ramp stop.
3. **A component token must resolve through a semantic token** (`{semantic.*}`), never a palette stop or literal.
4. **Atomic level is derived, never declared by hand:** no `uses` = atom; uses only atoms = molecule; otherwise organism.
   A component's CSS may only style classes of components listed in its `uses`.

Escape hatch, reason mandatory: `/* es-disable raw-values — why */`. A bare disable is an error.
Audit all deviations: `grep -rn "es-disable" .`

## Conventions

- **Prefix everything** `es-` / `--es-`. WordPress themes collide on short names.
- **Variants are data attributes on one base class:**
  `<button class="es-btn" data-variant="primary" data-size="md" data-radius="soft">`
  Never BEM modifiers, never `es-btn-primary` classes. Maps 1:1 onto React props and Gutenberg attributes.
- **Component API != token scale.** The radius scale has 7 steps; a component exposes only 3 choices
  (`none | soft | full`) that map onto it. Keep component APIs small.
- **Context tokens for composition.** A parent customises a child by setting variables, not by overriding its classes:
  ```css
  .es-icon-box     { --_size: var(--es-icon-size, var(--es-space-300)); }   /* child reads, with fallback */
  .es-contact-info { --es-icon-size: var(--es-space-400); }                  /* parent sets context */
  ```
  Private vars start with `--_`. Context vars are `--es-<child>-<prop>`.
- **Never size things in px.** Spacing is `--es-space-*` (scales with density), corners are `--es-radius-*` (scales with personality).
- Focus ring: 2px `--es-state-focus`, offset 2px, radius = component radius + 2px.
- Dark mode is `:root[data-theme="dark"]` plus `prefers-color-scheme`. Component tokens need no dark entry — they inherit.
- Icons: Lucide, stroke-based. `Icon` is a bare glyph (atom). Anything with a container, fill or radius is `IconBox` / `IconButton`.
- One primary button per view. Visible labels always; placeholders are hints.

## `meta.json` (every component)

```json
{
  "name": "icon-box",
  "class": "es-icon-box",
  "summary": "Icon inside a styled container.",
  "tags": ["icon", "container", "decorative"],
  "uses": ["icon"],
  "variants": { "style": ["fill", "outline", "soft", "text"], "size": ["sm", "md", "lg"], "radius": ["none", "soft", "full"] },
  "slots": [],
  "a11y": "Decorative by default (aria-hidden). Provide aria-label when it conveys meaning."
}
```

`level` is derived by the linter. Do not write it. `tags` are how future-you finds it by intent ("I need an upload thing").

## Definition of done for a component

- [ ] `meta.json` complete, `uses` accurate
- [ ] `*.examples.html` renders **every** variant combination, light and dark
- [ ] `npm run verify` is clean
- [ ] Line added to `INDEX.md`
- [ ] Works at `--es-density: .75` and `1.25`, and at `--es-radius-scale: 0` and `2`

## Do not

Add Tailwind, a bundler, React-only code, a docs site, snapshot tests, an npm publish step, a Figma plugin,
or speculative components. Add a fifth lint rule only when something real has already hurt.

## Status

Faza 0 done (tokens, build, lint). `INDEX.md` is hand-maintained until `tools/index.js` exists (Faza 1).
Source material: `enspire-design-system-principles.md` in the Claude project (the original single-brand spec).
