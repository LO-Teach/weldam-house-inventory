# Weldam House — Brand assets

Drop this folder into any project. Everything an interface needs is here.

## Identity
- **Business:** Weldam House — antique & vintage decor webshop, Ghent, ships worldwide. Third-generation estate-clearing family.
- **Direction:** "De Vondst" (The Find). Premium but warm, with a grin — never solemn, never museum.
- **Slogan:** *That's good stuff.* (always set in Instrument Serif italic)
- **Voice:** silver-tongued, warm, persuasive. Dealer's flourish anchored to true facts; showmanship never touches price or provenance. Dutch first, English second.

## Colors (tokens.css / tokens.json)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `bone` (bg) | `#F7F1E4` | page background | — |
| `surface` | `#FFFFFF` | cards | — |
| `ink` | `#211D18` | primary text, dark surfaces | 14.9:1 on bone |
| `taupe` | `#5C544A` | secondary text | 6.6:1 on bone |
| `tomato` (accent) | `#A63A1C` | CTAs, price tags, links-hover | 5.8:1 on bone; white on it 6.5:1 |
| `ochre` | `#E8B84B` | accent on DARK backgrounds only — never body text on bone | 9.1:1 on ink |
| `sand` (muted) | `#D9CDB4` | borders, muted fills | ink on sand 10.6:1 |
| `success` | `#3E6B45` | form states on white | 6.2:1 |
| `warning` | `#8A5A14` | form states on white | 5.9:1 |
| `error` | `#9C3719` | form states on white | 7.1:1 |

Rules: warm cream + near-black ink + one confident tomato. No gradients as decoration, no two-tone colored spans inside headlines.

## Type (fonts.css)
- **Display:** Instrument Serif 400 + italic (Google Fonts). Headlines, prices-adjacent flourishes, the slogan. Italic is the wink.
- **Body/UI:** Archivo 400 / 500 / 600 (Google Fonts). Everything else.
- Letter-spacing on display never tighter than -0.04em. Body 65–75 ch lines.

## Logo — the price-tag mark
A tag (pointed left end, punched hole) carrying an Instrument Serif "W", rotated −8°.
- `logo-square-light.png` / `logo-square-dark.png` — 1024×1024 full-bleed, avatars/tiles.
- `logo-horizontal-light.png` / `logo-horizontal-dark.png` — 2048w, transparent. Wordmark "Weldam House" + tag.
- `logo-horizontal-light.svg` / `logo-horizontal-dark.svg` / `logo-mono.svg` — vector masters. NOTE: they use a live Google-Fonts import for the W/wordmark; use the PNGs where fonts can't load (email, `<img>` in some contexts).
- Minimum: full lockup ≥ 44px tall; below that use the tag alone. At 16px drop the rotation and hole (see `favicon.svg`).
- Clear space: ¼ of the tag's height on all sides.
- Single-colour contexts: `logo-mono.svg` (one ink, no gradients).

## The tag as UI element (tag.css)
Prices and small badges sit on the tag shape — this is the signature; keep it.
`.wh-tag` = clip-path tag, tomato fill, white text, rotate(-4deg) for inline prices, (-8deg) for the logo mark. Sold state: `.wh-tag--sold` (taupe fill, no rotation change).

## Don'ts
- No emoji. No gradient text. No purple/blue SaaS palette.
- Ochre never on light backgrounds as text.
- Don't un-rotate the tag (except ≤16px).
- Don't set the slogan in Archivo.
