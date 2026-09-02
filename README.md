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

You can add photographs to a lot later, from the Review screen — which is what
you do when the appraiser asks for a shot of the base.

For every file, the pipeline:

1. writes it to a temporary name in the lot folder, then moves it into place
2. reads it back and compares SHA-256 against what you dropped
3. on a mismatch, moves the bad copy to `quarantine/` and fails the whole ingest
4. builds a 1600px JPEG derivative (EXIF stripped, orientation baked in)
5. uploads only that derivative
6. records both paths and the checksum in the database
7. queues the appraisal against the derivative

### Folder names

A lot starts as `0001/` and is renamed at Confirm to carry its title:

```
0001 - Amberkleurige gegoten glazen vaas, sommerso, jaren 60/
```

Number first so the directory still sorts in lot order. The files inside keep
their `0001_a.jpg` names forever — only the folder moves, and the database
follows it.

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

## Pricing

Six numbers, because one could not carry both "what it's worth" and "what it's
listed at".

| | |
|---|---|
| **retail** | what a consumer actually pays. The only figure the appraiser estimates. |
| **ask** | 80% of retail — the launch price. Attractive, not a giveaway. |
| **floor** | where the weekly markdown stops. |

Each of those exists for **local** (2dehands, Marktplaats, the shop) and
**international** (eBay, Etsy, Catawiki). International is now always estimated,
even when it is lower — the decision about whether posting is worth it is yours
to make with both numbers in front of you.

We do not price to what a dealer would pay. Dealers introduce themselves with a
lowball offer whatever the tag says, so pricing for them up front just donates
the margin.

### The markdown ladder

Once an item is marked **listed**, the clock starts: **−10% a week**, compounding,
stopping dead at the floor. The **Today** column shows the current price with the
original ask struck through beside it.

That compounding is why the floor matters — week 7 is 48% of ask, week 14 is 23%,
week 20 is 12%. The **Hit the floor** view collects everything that has bottomed
out, which is the moment to bundle it into a lot rather than keep discounting
toward nothing.

## Categorisation

Everything a Shopify storefront needs to offer real filters:

- **Product type** — a real Shopify taxonomy category (`hg-3-67` = Vases)
- **Material** — Shopify's Material enum, plus `material_detail` free text
- **Colour** — Shopify's Color enum, plus `colour_detail`
- **Style** — Art Deco, Mid-century modern, Brutalist…
- **Size** — real numbers: height, width, depth, diameter, weight

The two-layer material is deliberate. Shopify has no *crystal*, *silver* or
*pewter*, so lead crystal is `Glass` + "lead crystal". The enum drives the
filter; the detail is the phrase that sells it.

## Owners

Selling on behalf of family is the normal case for an estate clearer, so every
item carries `owner_name` (defaulting to Weldam House), a contact, and their
split. Filter the table by owner to see what is out on consignment and what is
owed.

## Appraisal

`prompts/appraisal.md` is the actual product — the app is a wrapper around it.
It is read from disk on every run, so you can tune it and the next appraisal
picks it up. No rebuild.

The rules it enforces, and the ones worth knowing when a result looks wrong:

- Price at consumer retail, then ask 80% of it
- `retail_intl` is always estimated, never left null for a saleable object
- Under €20 retail and not a sleeper → `channel: lot`
- **No visible mark → `maker` stays null and confidence is `guessing`.** Style is
  never enough to name a maker
- A possible sleeper with no base shot → `channel: hold`, with a specific
  instruction in `marks_to_check`
- `title_nl` is a real marketplace title: object, material, era, size. No
  adjectives

Output is validated with Zod. A parse failure marks the job failed and keeps the
model's raw text, which Review shows you — a silently dropped appraisal is a lot
you never look at again.

The prompt also emits **questions** — things only someone holding the object can
answer ("Is there a polished dimple in the centre of the base?"). Review shows
them as a checklist; answering re-appraises with your answers as established
fact, which is what turns a `guessing` vase into a priced one.

### Calibration

After the first 30 items, search each on 2dehands, filter to sold or
long-listed, and compare. Then adjust `prompts/appraisal.md` and hit
**Re-appraise drafts** on the Inventory screen — **never patch item rows by
hand.** Editing the prompt does nothing to items already in the table until you
re-run them. Repeat at 100.

The calibration anchors near the top of `prompts/appraisal.md` are the fastest
lever: a table of worked examples ("unmarked mid-century sommerso vase, 20-25cm
→ €55 local, €90 intl"). Correct those against what things actually fetch and
every future appraisal moves with them.

---

## Commands

```bash
npm run dev              # dev server
npm run build            # production build
npm run check            # typecheck + lint

npm run test:pipeline    # file pipeline on throwaway files (dev server must be up)
npm run test:appraisal   # ingest -> appraise -> listing -> sidecar, end to end
npm run test:pricing     # the price ladder and markdown arithmetic
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
