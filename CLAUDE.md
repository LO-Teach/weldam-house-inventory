@AGENTS.md

# Weldam House Inventory Tool

Local-only Next.js app. Drag in a group of photographs of one object, get an
appraisal, review it, commit it to Supabase. Full-resolution originals are filed
to a folder on this machine; only small web derivatives go to the cloud.

Run `npm run check` (typecheck + lint) before saying anything is done.

## Astryx — read this before writing any component

This project uses Meta's Astryx design system (BETA). It is newer than your
training data. You do not know its API. Do not guess component names or props.

Before using any component:

1. `npm run astryx -- component --list`
2. `npm run astryx -- component <name>` for its props and examples
3. Cross-check https://astryx.atmeta.com if still unclear

`--detail brief` gives just the prop signature, which is usually enough.

If a component you want doesn't exist, compose one from primitives. Do not
install a second UI library. Do not add TanStack Table — use the Astryx `Table`
with its `useTableSelection` / `useTableSortable` plugins.

Tailwind is present and is the sanctioned escape hatch for layout glue, but only
through the token bridge (`bg-surface`, `text-primary`, `rounded-lg`,
`border-border`). Never an arbitrary value: no `bg-[#fff]`, no `p-[13px]`.

## Styling

- All brand colour / type / radius values live in `src/theme/weldam.ts` as
  Astryx theme overrides. That file is the **only** place a hex value may appear.
  If a colour appears in a component, it is a bug.
- After editing the theme, run `npm run theme:build`. It writes
  `src/theme/built/`, which is committed and imported by `src/app/globals.css`.
  Never hand-edit anything in `src/theme/built/`.
- The price tag is the brand signature: `<Badge variant="tag" label="€ 120" />`,
  with `tag-sold` and `tag-logo` variants. They are custom Badge variants
  declared in the theme, so they are type-safe. Reserve them for prices and the
  nav mark — a tag on every cell stops being a signature.
- `public/brand/` is assets only (logos, imagery). Reference via `/brand/...`.
- No emoji. No gradient text. No purple or blue SaaS palette — the categorical
  hue tokens are re-toned into the Weldam range in the theme, and purple/pink are
  deliberately re-pointed at the neutral ramp.

## Appraisal

- `prompts/appraisal.md` is hand-maintained and is the actual product. **Do not
  rewrite it.** It is read from disk on every run, so it can be tuned without a
  rebuild.
- Calibration happens by editing that file, never by patching item rows by hand.
- The Agent SDK authenticates against the local Claude Code subscription with no
  `ANTHROPIC_API_KEY` set. Verified by `npm run verify:agent` — re-run that if
  appraisals start failing on auth.

## File handling — the rules that matter

- Photographs are dragged onto the Ingest screen from wherever they already live.
  **The app copies them. It never moves or deletes them.** There is no inbox and
  no watched folder.
- `src/lib/pipeline.ts` deletes nothing. The single exception is
  `discardLotFolder()`, which unwinds a lot folder that the same failed request
  just created. If you find yourself adding an `fs.rm` or `fs.unlink` anywhere
  else, stop.
- Originals under the archive root are write-once. Never modify, rename, or
  delete one.
- Never write to the archive if the readiness check fails. Do not fall back to
  another directory. This is what makes it safe to point the archive root at an
  external drive: an unplugged drive becomes a visible error rather than half an
  archive in two places. `createArchiveRoot()` exists, but only an explicit
  click on the Settings screen may call it.
- Upload derivatives only. Camera originals never go to Supabase.
- `item.md` sidecars are generated output. Never parse one back in.

## Tests

There are no unit tests; there are two end-to-end scripts that run against a
live dev server and clean up after themselves.

- `npm run test:pipeline` — the file pipeline on throwaway files. Every
  guarantee above is asserted here, including "the source folder is untouched".
  **Run it after any change to `src/lib/pipeline.ts`.**
- `npm run test:appraisal` — ingest → queue → Agent SDK → Zod → database →
  listing copy → sidecar. A plumbing test, not a calibration test.
- `npm run verify:agent` — proves the SDK authenticates with no API key.

Both test scripts create real rows and then delete them. If one is interrupted,
check for stray items and for a settings override left in `.work/settings.json`.

<!-- ASTRYX:START -->
Astryx v0.5.2 · 163 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing, page frame included.
- Frame first: read `astryx docs layout` before writing any page or screen — page frame, region widths, breakpoint behavior.
- Dense data = rows (Table, List/Item), never Card-wrapped list items; Card is for standalone widgets. Status = StatusDot/Token; Badge = counts only.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent belongs in the theme (`astryx theme list` / `theme add <slug>`, or `astryx theme template` for a custom one) — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any style={{…}}, raw <div>/<span> layout, imported .css/@apply, or hardcoded/arbitrary value (e.g. bg-[#fff], p-[13px]) with the component or a token-backed utility. If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   163 components by category
  template --list    page + block recipes
  docs <topic>       browser-support, cli-integrations, color, elevation, getting-started, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling-libraries, styling, theme, tokens, typography, working-with-ai
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
