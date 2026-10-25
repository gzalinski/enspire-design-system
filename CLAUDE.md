# Enspire Design System

Token-first, **CSS-only** design system. One stylesheet works in WordPress/Gutenberg, React/Next and static HTML.
No framework, no bundler, no runtime dependencies. If a change needs one, stop and ask.

## Commands

```
npm run verify   # build tokens -> icons -> lint -> INDEX.md -> dist/lab.html. Run after EVERY component.
npm run build    # tokens/*.json -> dist/enspire-tokens.css + dist/tokens.json
npm run icons    # components/icon/svg/*.svg -> glyphs.css (+ icon list in meta.json)
npm run check    # lint (4 rules)
npm run index    # INDEX.md, generated from meta.json — never edit it by hand
npm run lab      # dist/lab.html: the Lab — menu, every variant, live token editing, export
```

**The Lab is the main tool.** `dist/lab.html` is one self-contained file: browse by category, flip every
variant, retune tokens live (anchors regenerate a whole ramp in OKLCH), check contrast, and export the
result as a theme. Open it from disk or publish it; it needs no server. Everything in it is generated from
`meta.json` and `tokens/` — never hand-edit `dist/`.

## Before you build anything

1. **Read `INDEX.md` first.** One line per component. If something close exists, extend its variants — do not add a sibling.
2. **Rule of two:** do not extract a new component until the same thing is needed in 2 places.
3. Copy the nearest `components/<name>/` folder. Its `meta.json` `preview` is the canonical markup.

## Layout

```
tokens/core.json          structure + roles + component token contracts (brand-agnostic)
tokens/themes/*.json      palettes + personality knobs. THE ONLY place raw hex is legal.
primitives/               layout helpers (Box, Stack, Text). No business logic.
components/<name>/        meta.json  <name>.css        (flat — no atoms/ folder; level is derived)
tools/categories.json     the menu's category list. A component names one of these ids.
patterns/                 compositions of components (Hero, PricingTable, AuthForm)
templates/                page skeletons with slots, no real content
bridges/                  maps third-party CSS APIs onto --es-* (e.g. Gravity Forms)
custom/                   FREE ZONE. Anything goes. Never linted.
dist/                     generated, committed. Never edit by hand.
```

## Hard rules (enforced by `npm run check`)

1. **No raw values** (`px`, `rem`, `em`, hex) outside `tokens/` and `custom/`. `0` is fine. `@media` conditions and `url()` are exempt.
2. **Tokens flow one way:** palette -> semantic -> component. Palette stops are NOT emitted to CSS, so
   `var(--es-naviblue-600)` cannot exist. Components use `--es-primary-bg`, never a ramp stop.
3. **A component token must resolve through a semantic token** (`{semantic.*}`), never a palette stop or literal.
4. **Atomic level is derived, never declared:** no `uses` = atom; uses only atoms = molecule; otherwise organism.
   A component's CSS may only style classes of components listed in its `uses`.
5. **meta.json must be usable:** a `category` from `tools/categories.json`, a `preview`, and `defaults`
   that name real variant values. Without them a component silently vanishes from the Lab menu.

Escape hatch, reason mandatory: `/* es-disable raw-values — why */`. A bare disable is an error.
Audit all deviations: `grep -rn "es-disable" .`

## Conventions

- **Prefix everything** `es-` / `--es-`. WordPress themes collide on short names.
- **Variants are data attributes on one base class:**
  `<span class="es-icon-box" data-style="soft" data-size="md" data-radius="full" data-tone="primary">`
  Never BEM modifiers. Child *elements* may use `es-<name>__part` (`es-contact-info__label`).
- **Component API != token scale.** The radius scale has 7 steps; a component exposes only 3 choices
  (`none | soft | full`) that map onto it. Keep component APIs small.
- **Context tokens for composition.** A parent customises a child by setting variables, never by overriding its classes:
  ```css
  .es-icon-box     { --_box: var(--es-icon-box-size, var(--es-space-500)); }  /* child reads, with fallback */
  .es-contact-info { --es-icon-box-size: var(--es-space-600); }               /* parent sets context */
  ```
  Context carries **continuous values** (size, radius). **Attributes do not inherit**, so variants (style, tone)
  are set on each child. An explicit `data-size` on the child beats inherited context.
  Hooks a component *accepts* are listed in its `meta.json` `context` — the linter reads that list.
  Private vars start with `--_`. Context vars are `--es-<component>-<prop>`.
- **Personality** = `--es-density` (compact .75 / default 1 / comfortable 1.25) and `--es-radius-scale`
  (sharp 0 / soft 1 / round 2). On `:root` they need nothing else. **To change them on an inner region, add
  `data-es-scope` to it** — `var()` resolves where it is declared, so without the attribute the override does nothing.
- **Never size in px.** Spacing is `--es-space-*`, corners are `--es-radius-*`. Both scale with the knobs.
- Focus ring: 2px `--es-state-focus`, offset 2px, radius = component radius + 2px.
- Dark mode is `:root[data-theme="dark"]` plus `prefers-color-scheme`. Component tokens need no dark entry — they inherit.
- Icons: Lucide, drawn as CSS masks: `<span class="es-icon" data-name="mail" aria-hidden="true"></span>`. `Icon` is a bare
  glyph (atom); anything with a container, fill or radius is `IconBox` / `IconButton`. **Lucide v1 has no brand logos**
  (Facebook, Instagram, LinkedIn, YouTube) — add those as SVGs from another source into `components/icon/svg/`.
- One primary button per view. Visible labels always; placeholders are hints.

## `meta.json` (every component)

```json
{
  "name": "icon-box", "class": "es-icon-box", "category": "media",
  "summary": "One sentence.", "tags": ["icon", "container"],
  "uses": ["icon"], "css": ["icon-box.css"],
  "variants": { "style": ["fill", "outline", "soft", "text"], "size": ["sm", "md", "lg"] },
  "defaults": { "style": "fill", "size": "md" },
  "context": ["--es-icon-box-size"],
  "slots": ["default: one .es-icon"], "a11y": "…",
  "preview": "<span class=\"es-icon-box\" data-style=\"{style}\" data-size=\"{size}\">…</span>"
}
```

`{axis}` placeholders in `preview` are filled per variant by the Lab. There is no `level` field (derived).
`category` must be an id from `tools/categories.json` — it decides where the component sits in the menu.
`tags` are how future-you finds it by intent ("I need an upload thing"). `defaults` must match the CSS defaults.

## Definition of done for a component

- [ ] `meta.json` complete (`uses`, `defaults`, `context`, `preview`, `a11y`)
- [ ] `npm run verify` is clean (lint, INDEX.md and Lab all regenerate)
- [ ] Opened in the Lab: hit **Expand all** and check every combination in light **and** dark, at density
      compact/comfortable and radius sharp/round
- [ ] Mobile: no horizontal overflow at 320px

## Do not

Add Tailwind, a bundler, React-only code, a docs site, snapshot tests, an npm publish step, a Figma plugin,
or speculative components. Add a fifth lint rule only when something real has already hurt.

## Status

Faza 0 (tokens, build, lint) and Faza 1 (Icon -> IconBox -> ContactInfo, Lab, INDEX generator) done.
Lab v2 adds the category menu, live token editing and export.
Next: Faza 2, Gravity Forms bridge. Source material: `enspire-design-system-principles.md` in the Claude project.
