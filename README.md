# Weldam House — Inventory

Drag a group of photographs of one object onto the Ingest screen. It files the
originals, uploads small web copies, appraises the object, and drops it into a
review queue. You confirm or correct the appraisal, then manage the whole
inventory from a table and generate marketplace copy on demand.

Runs on `localhost` only. No auth, no hosting, no deployment.

---

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

Everything is already configured in `.env.local` (gitignored): the Supabase
project, the storage bucket, and the archive folder. Appraisal runs on your
Claude Code subscription — there is no metered API key to set up.

Check the Settings screen once. If the archive folder shows a green
**Archive folder ready**, you are done.

---

## The two tiers

| | Where it lives | Size |
|---|---|---|
| **Originals** | `<archive folder>/archive/0001/0001_a.jpg` on this machine | whatever the camera made |
| **Web copies** | Supabase storage, bucket `item-photos`, private | 1600px JPEG, ~300 KB |

Only the web copies go to the cloud. Five hundred objects at three shots each is
under 2 GB — a couple of euros a month. Camera originals never leave the machine.

The web copies are also the de facto backup. If the disk holding the originals
dies, a dead drive costs you resolution, not the business.

---

## How photographs get in

You drag them onto the Ingest screen from wherever they already are — the camera
card, a downloads folder, the desktop.

**The app copies them. It never moves or deletes them.** There is no inbox, no
watched folder, and nothing for you to tidy up afterwards. Your originals stay
exactly where you put them.

Each drop is treated as **one object**. Up to 12 shots, JPEG/PNG/WebP/TIFF/HEIC,
15 MB each. Camera RAW is refused — export to JPEG first.

For every file, the pipeline:

1. writes it to a temporary name in the lot folder, then moves it into place
2. reads it back and compares SHA-256 against what you dropped
3. on a mismatch, moves the bad copy to `quarantine/` and fails the whole ingest
4. builds a 1600px JPEG derivative (EXIF stripped, orientation baked in)
5. uploads only that derivative
6. records both paths and the checksum in the database
7. queues the appraisal against the derivative

### The archive folder

Set it on the Settings screen — there is a **Browse…** button that opens the real
Windows folder chooser.

Point it at an external drive whenever you get one. From that moment, an
unplugged drive stops ingest with a visible error rather than quietly filing
originals somewhere else. That refusal is deliberate: a silent fallback is how
half an archive ends up in two places.

---

## The screens

**Inventory** (`/`) — the table you live in. Inline edit on price, channel,
status and lot group. Filters on everything. Row selection with bulk actions.
A summary bar with counts and totals for the *filtered* set.

The **Sleepers** preset is the one worth knowing: appraised items that are not
`certain` and still have something to check on the base. Two seconds with a
torch can move one of these a whole price bracket.

**Ingest** (`/ingest`) — the drop zone, plus a live queue strip along the
bottom. Nothing waits for the appraisal; drop the next object immediately.

**Review** (`/review`) — one item at a time, keyboard driven:

| Key | |
|---|---|
| `J` / `K` | next / previous lot |
| `Enter` | confirm and advance |
| `R` | re-appraise |
| `←` / `→` | page the gallery |

Anything in `marks_to_check` shows as a warning banner above every field, so it
cannot be confirmed past without being read.

**Listing drawer** — opens from any inventory row. Generates channel-specific
copy from the item's stored facts: 2dehands and Marktplaats in Dutch, eBay and
Catawiki in English, each sized for that platform's title limit.

Neither Dutch marketplace has a public listing API, so the honest ceiling is
copy-to-clipboard plus a button that opens their new-listing form. eBay and
Shopify could be automated later; the drawer says which is which.

---

## Appraisal

`prompts/appraisal.md` is the actual product — the app is a wrapper around it.
It is read from disk on every run, so you can tune it and the next appraisal
picks it up. No rebuild.

The rules it enforces, and the ones worth knowing when a result looks wrong:

- Price what clears locally in two weeks, not what people ask
- `price_intl` only when the item is worth >2× more abroad after shipping
- Under €15 and not a sleeper → `channel: lot`
- **No visible mark → `maker` stays null and confidence is `guessing`.** Style is
  never enough to name a maker
- A possible sleeper with no base shot → `channel: hold`, with a specific
  instruction in `marks_to_check`
- `title_nl` is a real marketplace title: object, material, era, size. No
  adjectives

Output is validated with Zod. A parse failure marks the job failed and keeps the
model's raw text, which Review shows you — a silently dropped appraisal is a lot
you never look at again.

### Calibration

After the first 30 items, search each on 2dehands, filter to sold or
long-listed, and compare. Then adjust `prompts/appraisal.md` — **never patch
item rows by hand.** Repeat at 100.

---

## Commands

```bash
npm run dev              # dev server
npm run build            # production build
npm run check            # typecheck + lint

npm run test:pipeline    # file pipeline on throwaway files (dev server must be up)
npm run test:appraisal   # ingest -> appraise -> listing -> sidecar, end to end
npm run verify:agent     # proves the Agent SDK works with no API key

npm run theme:build      # rebuild src/theme/built/ after editing the theme
npm run astryx -- component <Name>    # Astryx component docs
```

Both test scripts create real rows and delete them again on the way out.

---

## Sidecars

`item.md` sits beside each set of originals so the archive is readable in ten
years without this app, a database, or an internet connection.

It is an **export**, regenerated from the database. Nothing reads one back in —
the moment a price can be edited in two places, they diverge and neither is
trustworthy. Editing one changes nothing.

**Regenerate sidecars** on the Inventory or Settings screen rewrites them all.

---

## Notes on the setup

- **Supabase RLS.** Migration `0002` grants `anon` full access to the three
  inventory tables, so the app works on the publishable key out of the box. All
  access is server-side; the key never reaches the browser. To lock it down, drop
  those four policies and put a `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` —
  the app prefers it automatically.
- **Astryx** is in beta and newer than any model's training data. The CLI is the
  only source of truth for its API. See `CLAUDE.md`.
- **The theme** (`src/theme/weldam.ts`) is the only file allowed to contain a hex
  value. `src/theme/built/` is generated — run `npm run theme:build`, never edit
  it by hand.

Deferred on purpose: eBay API, Shopify sync, public webshop, auth, hosting,
multi-user.
