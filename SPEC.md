# Weldam House — Inventory Management Tool

Local-only Next.js application. Drag in a group of photos for one object, get an appraisal, review it, commit it to Supabase. Full-resolution originals are archived to an external SSD; only small web derivatives go to the cloud. Then manage the whole inventory from a table.

Repo: `weldam-house-inventory`

---

## 0. The honest constraints

Read these before building. Several of them change what the app can do.

- **[Certain]** Astryx is **in beta** and post-dates the training data of any model you'll use to build this. Claude Code will hallucinate component names and props. The only sources of truth are the CLI (`npm run astryx -- component --list`, `npm run astryx -- component <name>`) and https://astryx.atmeta.com. This must be enforced in `CLAUDE.md`.
- **[Certain]** Astryx requires **React 19+** and ships 150+ components plus **table page patterns** — use those for the inventory grid rather than adding TanStack Table. Two grid systems will fight.
- **[Certain]** `@astryxdesign/charts` and `@astryxdesign/vega` are canary-only, no stable release. Don't plan any charting on them.
- **[Likely]** 2dehands and Marktplaats have no public listing API. "Send to 2dehands" cannot create a listing. What you get is: copy title, copy description, copy price, and open a prefilled new-listing tab you finish by hand. Design for clipboard, not automation.
- **[Certain]** eBay (Sell API) and Shopify (Admin API) both support programmatic listing creation. Those buttons are real, later.
- **[Likely]** `@anthropic-ai/claude-agent-sdk` can run against your existing Claude Code subscription via the local `claude` CLI credentials rather than a metered API key. **Verify this on day one.** If it needs a separate API key, every appraisal costs money per image and you should reconsider the ingest half of the app.
- Appraisal is slow — 15–40s per item with several images. The UI must be async and queue-based, never a blocking spinner.
- **[Likely]** Cloud storage cost is a non-issue at the derivative tier. A 1600px JPEG at q82 runs ~300KB; 500 items × 3 shots is under 2GB — a couple of euros a month at most. What *would* be expensive is uploading 10MB camera originals, and there is no reason to. Two tiers solves it.
- **[Certain]** A single external SSD holding the only copy of the inventory is one hardware failure from wiping months of work, and SSDs fail without warning. The derivatives in Supabase are the de facto backup: a dead drive then costs resolution, not the business.

---

## 1. Stack

- Next.js (App Router), TypeScript, `localhost` only
- **Astryx** (`@astryxdesign/core`, a theme package, `@stylexjs/stylex`, `@astryxdesign/cli` as devDep)
- React 19+, Node 22+
- Supabase JS client, service-role key server-side only
- `@anthropic-ai/claude-agent-sdk` in a server route
- `sharp` for derivative generation, `exifr` for EXIF reads
- No auth, no hosting, no deployment

### Astryx setup

```bash
npm install @astryxdesign/core @astryxdesign/theme-neutral @stylexjs/stylex
npm install -D @astryxdesign/cli
```

Add to `package.json` so the CLI resolves reliably when an agent invokes it:

```json
"scripts": {
  "astryx": "node node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs"
}
```

Setup is CSS imports plus a `<Theme>` provider — no build plugin, no PostCSS or Babel config. Follow the Next.js section of the `@astryxdesign/core` README rather than improvising.

---

## 2. Branding

You will drop a `brand/` folder into `public/`. Expect logos, wordmarks, and possibly a favicon and some texture/imagery.

**Rules:**

- `public/brand/` holds **assets only** — logos, marks, imagery. Reference via `/brand/...`.
- Brand **colours, type scale, and radii** go into a custom Astryx theme (`src/theme/weldam.ts`), built as CSS custom property overrides. Astryx themes are designed for exactly this — no forking or wrapping component source.
- Start from `@astryxdesign/theme-neutral` and override. Do not hardcode hex values in components. If a colour appears in a component file, it's a bug.
- Logo goes in the Astryx `AppShell` top-nav slot. Favicon from `public/brand/`.
- If the brand folder isn't present yet, build against the neutral theme and swap later — that's the whole point of the theme layer.

---

## 3. File architecture

Two tiers. Originals never leave the machine; derivatives never exceed a few hundred KB.

### Paths

```
/Volumes/WELDAM/                     <- external SSD, configurable
  inbox/                             <- you dump the camera card here
  archive/
    0001/
      0001_a.CR3                     <- untouched original
      0001_b.CR3
      item.md                        <- generated export, not source of truth
    0002/
  quarantine/                        <- failed or ambiguous imports
```

The app also keeps a small working directory under the repo (`.work/`, gitignored) for derivatives awaiting upload. That directory is disposable — anything in it can be regenerated from `archive/`.

### Configuration

A `Settings` screen (and `.env.local` fallback) holds:

| Key | Meaning |
| --- | --- |
| `ARCHIVE_ROOT` | Path to the SSD archive root |
| `INBOX_PATH` | Where camera dumps land |
| `DERIVATIVE_MAX_PX` | Long-edge px for web copies (default 1600) |
| `DERIVATIVE_QUALITY` | JPEG quality (default 82) |
| `KEEP_ORIGINALS` | Always true; exists so the destructive path is explicit |

If `ARCHIVE_ROOT` is unreachable at startup (drive unplugged), the app refuses ingest and shows an error `Banner`. It must never silently fall back to the internal disk — that's how half your archive ends up in two places.

### Ingest file pipeline

For each dropped group:

1. Allocate the next `lot_number` from the database.
2. **Copy** originals to `archive/{lot_number:04d}/`, renamed `{lot}_{a,b,c}.{ext}` in drop order.
3. **Verify** — compare SHA-256 of source and destination.
4. Only after a verified copy, delete the source from `inbox/`. Never move-and-hope. On mismatch, leave the source alone and move the partial into `quarantine/`.
5. Generate derivatives with `sharp` into `.work/` — long edge `DERIVATIVE_MAX_PX`, JPEG, strip EXIF except orientation.
6. Upload derivatives to Supabase `item-photos`, path `{lot}_{a,b,c}.jpg`.
7. Insert `item_images` rows with **both** `storage_path` (cloud) and `archive_path` (SSD).
8. Enqueue the appraisal job against the derivatives, not the originals — 10MB files are slower and buy nothing at appraisal resolution.

**Never point the app at the camera card.** Import to `inbox/` yourself, then let it work on that. Anything that deletes files should only ever touch `inbox/`.

### Markdown sidecars

`item.md` in each archive folder is an **export**, regenerated from the database on demand. It exists so the archive is human-readable in ten years without the app.

It is not a source of truth. The moment you can edit a price in the app and in a text file, they diverge and neither of you knows which is right. The app never reads `item.md` back in. A `Regenerate sidecars` action rewrites them all from the database.

---

## 4. Database

```sql
create table public.items (
  id             uuid primary key default gen_random_uuid(),
  lot_number     serial unique,
  title_nl       text,
  title_en       text,
  category       text,
  material       text,
  era            text,
  colour         text,
  dimensions_cm  text,
  maker          text,
  marks_found    text,
  marks_to_check text,
  condition      text,
  facts          jsonb,          -- structured appraisal output, source of truth for copy
  price_local    numeric(10,2),
  price_intl     numeric(10,2),
  channel        text default 'local'
                 check (channel in ('local','ebay','catawiki','shopify','lot','hold','scrap')),
  confidence     text check (confidence in ('certain','likely','guessing')),
  lot_group      text,
  status         text default 'draft'
                 check (status in ('draft','appraised','listed','sold','scrapped')),
  sold_price     numeric(10,2),
  sold_at        timestamptz,
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table public.item_images (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references public.items(id) on delete cascade,
  storage_path  text not null,        -- derivative in Supabase storage
  archive_path  text,                 -- original on the SSD, relative to ARCHIVE_ROOT
  original_name text,                 -- camera filename, for tracing back
  sha256        text,                 -- checksum of the original, verified on copy
  bytes         integer,              -- size of the original
  is_primary    boolean default false,
  sort_order    integer default 0
);

create table public.appraisal_jobs (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid references public.items(id) on delete cascade,
  status     text default 'queued'
             check (status in ('queued','running','done','failed')),
  error      text,
  raw_output jsonb,
  created_at timestamptz default now()
);

create index on public.items (status);
create index on public.items (channel);
create index on public.items (category);
create index on public.items (lot_group);
create index on public.item_images (item_id);
create index on public.appraisal_jobs (status);
```

**Store facts, not prose.** `facts` holds material, era, marks, dimensions, condition, colour. Listing copy is generated per channel at listing time — eBay caps titles at 80 chars, Catawiki wants provenance language, 2dehands wants six words. One stored description cannot serve all three, and copy written months before you list it goes stale.

**Storage:** bucket `item-photos`, private, signed URLs. Derivatives only — never originals. Path `{lot_number:04d}_{a,b,c}.jpg`. Create the bucket manually in the dashboard; it isn't in the migration.

---

## 5. Screens

Wrap everything in the Astryx `AppShell` with the Weldam House logo in the top-nav slot. Three nav entries: Inventory, Ingest, Review.

### 5.1 Ingest (`/ingest`)

The capture surface. Deliberately thin.

- Full-page drop zone. A multi-file selection = **one object**.
- On drop: thumbnails render immediately, first image auto-marked primary (click any to change).
- Optional one-line hint field ("ruby cut-to-clear vase") — passed to the appraiser as a nudge, never treated as fact.
- **Add to queue**: runs the file pipeline in section 3 (archive → verify → derive → upload), creates a `draft` item + `queued` job, clears the zone.
- Header shows archive drive status: mounted, free space, item count. Ingest is disabled when the drive is missing.
- Drop the next object immediately. Never block on appraisal.
- Live queue strip along the bottom: thumbnail + Astryx `Badge` per job (queued / appraising / ready / failed). Click a ready one to jump to review.

Rejects: >12 files in one drop (probably multiple objects), non-image files, files >15MB. Surface these with an Astryx `Banner`.

### 5.2 Review (`/review`)

Where appraised drafts get confirmed. One item at a time, keyboard-driven.

- Left: image gallery, arrow keys to page, click to zoom (mark shots need real magnification).
- Right: every model-produced field, editable. Confidence renders as a colour-coded `Badge`.
- `marks_to_check` renders as a warning `Banner` at the top when non-empty — "check base for VSL acid stamp" must be seen before you commit.
- Price fields side by side, local and international. Model reasoning on hover only.
- Channel selector: local / eBay / Catawiki / Shopify / lot / hold / scrap.
- If channel = lot: a `lot_group` combobox, free text or existing group.
- Actions: **Confirm** (→ `appraised`, advance), **Re-appraise** (requeue with an added instruction), **Skip**, **Scrap**.
- Keyboard: `J`/`K` next/prev, `Enter` confirm, `R` re-appraise. You'll process hundreds; mouse-only will hurt.

### 5.3 Inventory (`/`) — the primary screen

The table you actually live in. Build on the Astryx **table page pattern**.

- Columns: thumb, lot #, title_nl, category, maker, price_local, price_intl, channel, confidence, lot_group, status.
- Inline edit on price, channel, status, lot_group. No modal.
- Filters: status, channel, category, confidence, has-maker, price range, free-text search.
- Row selection with bulk actions: set channel, assign lot_group, mark listed, mark sold, export CSV.
- Summary bar: item count, total `price_local`, total `price_intl`, count by status.
- **Sleepers** filter preset: `confidence != 'certain' AND marks_to_check IS NOT NULL AND status = 'appraised'` — items where two seconds looking at the base could change the price bracket.

### 5.4 Listing drawer

Opens from any inventory row. Generates channel-specific copy on demand from `facts`.

- Channel tabs: 2dehands (NL), Marktplaats (NL), eBay (EN), Catawiki (EN).
- Each tab: generated title, description, suggested price — all editable.
- **Copy title** / **Copy description** / **Copy all**.
- **Open listing page** — opens the marketplace's new-listing URL in a tab. You paste. This is the realistic ceiling for the Dutch sites.
- Copy is cached on the item, with a **Regenerate** button.
- Marking listed sets `status = 'listed'`.

---

## 6. API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/items` | GET | List with filters/pagination |
| `/api/items` | POST | Create draft + upload images |
| `/api/items/[id]` | PATCH | Update fields |
| `/api/items/[id]` | DELETE | Delete item + images |
| `/api/items/bulk` | PATCH | Bulk field update |
| `/api/appraise` | POST | Enqueue appraisal job |
| `/api/appraise/[jobId]` | GET | Poll job status |
| `/api/listing/[id]` | POST | Generate channel copy |
| `/api/export` | GET | CSV export |

Queue: in-memory, concurrency 2, jobs persisted in `appraisal_jobs` so a dev-server restart doesn't lose state. No Redis, no BullMQ — one user, one machine.

---

## 7. Appraisal integration

Server route spawns the Agent SDK with images as content blocks and a system prompt loaded from `prompts/appraisal.md` — a file on disk, not a string in code, so you can tune it without a rebuild.

Strict JSON output:

```json
{
  "title_nl": "Kristallen vaas met bloemmotief, jaren 60",
  "title_en": "Cut crystal vase, floral motif, 1960s",
  "category": "glass",
  "material": "lead crystal",
  "era": "1960s",
  "colour": "clear",
  "dimensions_cm": "24 x 12 (estimated)",
  "maker": null,
  "marks_found": "none visible",
  "marks_to_check": "check base for acid-etched VSL stamp",
  "condition": "no visible chips or clouding",
  "price_local": 12,
  "price_intl": null,
  "channel": "lot",
  "confidence": "guessing",
  "reasoning": "one short line, shown on hover only"
}
```

Validate with Zod. On parse failure, mark the job failed and surface raw output in review — never silently drop it.

### Appraisal rules (`prompts/appraisal.md`)

Write this file by hand. It is the actual product; the app is a wrapper around it. If you let Claude Code invent it, you get generic ceiling-price output.

- Default channel is a local Belgian/Dutch marketplace with a **two-week** time-to-sell. Price what clears, not what people ask. Listed prices on those platforms run 2–4x above clearing prices.
- Set `price_intl` and an international channel only when the item is worth >2x more abroad after shipping. Otherwise null.
- Items under €15 that aren't sleepers get `channel: "lot"`.
- **No mark visible → `maker` stays null and `confidence` is `guessing`.** Never infer a maker from style alone.
- Fill `marks_to_check` whenever a mark would change the price bracket.
- Sleeper categories — never lot without a base shot: signed bronzes, named-house crystal (Val Saint Lambert, Baccarat, Saint-Louis, Daum, Lalique), art glass with polished pontil or original label, Art Deco / mid-century lighting and hardware, porcelain with an underglaze factory mark, anything numbered or editioned.
- `title_nl` is a real marketplace title: object, material, style/era, size. No adjectives, no "beautiful", no "rare".

---

## 8. `CLAUDE.md` (repo root)

Non-negotiable content:

```markdown
# Weldam House Inventory Tool

## Astryx — read this before writing any component

This project uses Meta's Astryx design system (BETA). It is newer than your
training data. You do not know its API. Do not guess component names or props.

Before using any component:
1. `npm run astryx -- component --list`
2. `npm run astryx -- component <name>` for its props and examples
3. Cross-check https://astryx.atmeta.com if still unclear

If a component you want doesn't exist, compose one from primitives. Do not
install a second UI library. Do not add TanStack Table — use the Astryx
table page pattern.

## Styling
- All brand colour/type/radius values live in `src/theme/weldam.ts` as theme overrides.
- Never hardcode a hex value in a component.
- `public/brand/` is assets only (logos, imagery).

## Appraisal
- `prompts/appraisal.md` is hand-maintained. Do not rewrite it.

## File handling — destructive operations
- Originals under ARCHIVE_ROOT are write-once. Never modify, rename, or delete them.
- The only directory anything may delete from is INBOX_PATH, and only after a
  SHA-256 verified copy into the archive.
- Never write to the archive if the drive check fails. Do not fall back to the
  internal disk.
- Upload derivatives only. Camera originals never go to Supabase.
- `item.md` sidecars are generated output. Never parse them back in.
```

---

## 9. Build order

1. Repo + `.gitignore` with `.env.local` **before the first commit** (the service-role key bypasses RLS; once it's in history it's a rewrite to remove).
2. Supabase project, migration, bucket.
3. Next.js scaffold + Astryx + neutral theme. Render one page with `AppShell` and a `Button` to prove the setup.
4. Inventory table over hand-inserted rows. Prove the schema before automating anything.
5. Settings screen + drive detection. Then the file pipeline (archive → verify → derive → upload) as a standalone script, tested on 5 throwaway files **before** it's wired to a UI. This is the only code in the project that deletes anything; test it in isolation.
6. Ingest screen on top of that pipeline, no appraisal — items land as `draft`.
7. Agent SDK route + queue. **Verify subscription auth here.**
8. Review screen.
9. Listing drawer with clipboard.
10. Sidecar generation.
11. Swap in the Weldam theme once `public/brand/` lands.
12. Stop. Run 100 items through it before building anything else.

Feed Claude Code steps 1–4 first. Don't paste the whole spec at once — one-shotting gets you 3,000 lines you don't understand.

Explicitly deferred: eBay API, Shopify sync, public webshop, auth, hosting, multi-user.

---

## 10. Calibration loop

The prices will be wrong at first. After the first 30 items, search each on 2dehands, filter to sold or long-listed, compare. Then adjust `prompts/appraisal.md` — never patch items by hand. Repeat at 100.
