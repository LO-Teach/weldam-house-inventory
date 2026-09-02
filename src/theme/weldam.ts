/**
 * Weldam House — Astryx theme.
 *
 * This is the ONLY file in the project allowed to contain a hex value.
 * Every colour, type and radius decision the brand makes lives here, expressed
 * as Astryx token overrides. Components reference tokens, never colours.
 *
 * Source of truth for the values: public/brand/tokens.json + public/brand/README.md.
 *
 * After editing, run:  npm run theme:build
 * That regenerates weldam.css / weldam.js, which src/app/layout.tsx imports.
 */

import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

// --- brand palette (public/brand/tokens.json) -------------------------------
const BONE = '#F7F1E4'; // page background
const SURFACE = '#FFFFFF'; // cards
const INK = '#211D18'; // primary text / dark surfaces
const TAUPE = '#5C544A'; // secondary text
const TOMATO = '#A63A1C'; // accent: CTAs, tags, hovers
const OCHRE = '#E8B84B'; // accent on dark bg ONLY
const SAND = '#D9CDB4'; // borders, muted fills
const SUCCESS = '#3E6B45';
const WARNING = '#8A5A14';
const ERROR = '#9C3719';

// --- dark-mode counterparts -------------------------------------------------
// The brand is a warm-light identity; dark mode is the same room with the
// lights off. Ink becomes the ground, ochre takes over as the accent (the
// brand rule: ochre on dark only), and every text tone is re-picked to clear
// 4.5:1 against its own surface rather than reused from the light ramp.
const INK_BODY = '#1A1713';
const INK_SURFACE = '#26221C';
const INK_RAISED = '#302B23';
const BONE_TEXT = '#F0E9DA';
const BONE_MUTED = '#B5AB9A';
const BONE_DISABLED = '#7E766A';
const INK_BORDER = '#3C352C';
const INK_BORDER_STRONG = '#584F42';

export const weldamTheme = defineTheme({
  name: 'weldam',
  extends: neutralTheme,

  // Seeds the neutral ramp warm, off the tomato accent. Explicit token
  // overrides below win wherever the generated value is not the brand's.
  color: {
    accent: [TOMATO, OCHRE],
    neutralStyle: 'warm',
    contrast: 'standard',
  },

  // Instrument Serif for display, Archivo for everything else.
  //
  // The families are wired to the CSS variables next/font publishes in
  // src/app/layout.tsx (see the --font-family-* token overrides below) rather
  // than named literally here, so the fonts are self-hosted and hashed by Next
  // instead of fetched from Google at render time.
  //
  // 15px base keeps an inventory table dense without going squinty.
  typography: {
    scale: {base: 15, ratio: 1.2},
    heading: {
      // Instrument Serif ships 400 only. Asking for semibold gets a synthesised
      // faux-bold that ruins the letterforms.
      weight: 'normal',
      weights: {1: 'normal', 2: 'normal', 3: 'normal', 4: 'normal', 5: 'normal', 6: 'normal'},
    },
  },

  // The tag mark is angular; soft SaaS pills fight it.
  radius: {base: 3, multiplier: 1},

  motion: {fast: 150, medium: 320, slow: 800, ratio: 0.75},

  tokens: {
    // --- type ---------------------------------------------------------------
    // next/font defines these variables on <html>; the fallbacks after them are
    // what renders in the split second before the font file lands.
    '--font-family-body':
      'var(--font-archivo), "Segoe UI", system-ui, -apple-system, sans-serif',
    '--font-family-heading':
      'var(--font-instrument-serif), Georgia, "Times New Roman", serif',
    '--font-family-code':
      'ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace',

    // --- accent -------------------------------------------------------------
    '--color-accent': [TOMATO, OCHRE],
    // Ochre is a light accent, so its label has to be ink, not white.
    '--color-on-accent': ['#FFFFFF', INK],
    '--color-accent-muted': ['#A63A1C1F', '#E8B84B29'],
    '--color-text-accent': [TOMATO, OCHRE],
    '--color-icon-accent': [TOMATO, OCHRE],
    '--focus-outline-color': 'var(--color-accent)',

    // --- surfaces -----------------------------------------------------------
    '--color-background-body': [BONE, INK_BODY],
    '--color-background-surface': [SURFACE, INK_SURFACE],
    '--color-background-card': [SURFACE, INK_SURFACE],
    '--color-background-popover': [SURFACE, INK_RAISED],
    '--color-background-inverted': [INK, BONE],
    '--color-background-muted': ['#5C544A0F', '#F7F1E40A'],
    '--color-overlay': ['#211D1899', '#0F0D0ABF'],
    '--color-overlay-hover': ['#5C544A0F', '#F7F1E40F'],
    '--color-overlay-pressed': ['#5C544A1C', '#F7F1E41C'],
    '--color-tint-hover': [INK, BONE],

    // --- text & icon --------------------------------------------------------
    '--color-text-primary': [INK, BONE_TEXT],
    '--color-text-secondary': [TAUPE, BONE_MUTED],
    '--color-text-disabled': ['#9A9184', BONE_DISABLED],
    '--color-icon-primary': [INK, BONE_TEXT],
    '--color-icon-secondary': [TAUPE, BONE_MUTED],
    '--color-icon-disabled': ['#9A9184', BONE_DISABLED],

    // --- lines --------------------------------------------------------------
    '--color-border': [SAND, INK_BORDER],
    '--color-border-emphasized': ['#C3B393', INK_BORDER_STRONG],
    '--color-skeleton': ['#E8DFCB', '#332E26'],
    '--color-track': ['#E8DFCB', '#3A342B'],
    '--color-shadow': ['rgba(33, 29, 24, 0.14)', 'rgba(0, 0, 0, 0.5)'],

    // --- status -------------------------------------------------------------
    '--color-success': [SUCCESS, '#7FA886'],
    '--color-success-muted': ['#3E6B4524', '#7FA88629'],
    '--color-on-success': ['#FFFFFF', INK],
    '--color-warning': [WARNING, '#D9A441'],
    '--color-warning-muted': ['#8A5A1424', '#D9A44129'],
    '--color-on-warning': ['#FFFFFF', INK],
    '--color-error': [ERROR, '#D4674A'],
    '--color-error-muted': ['#9C371924', '#D4674A29'],
    '--color-on-error': ['#FFFFFF', INK],
    '--color-background-error-inverted': [ERROR, '#D4674A'],

    // --- categorical hues ---------------------------------------------------
    // Astryx ships a stock palette with a bright SaaS blue and purple in it.
    // The brand forbids that, and these tokens feed Badge and Token, so every
    // hue the app can reach is re-toned into the Weldam range. Any hue not
    // listed here is one the app must not use.
    '--color-background-gray': ['#5C544A1F', '#D9CDB41A'],
    '--color-border-gray': ['#8C8477', '#6E6558'],
    '--color-icon-gray': [TAUPE, BONE_MUTED],
    '--color-text-gray': [INK, BONE_TEXT],

    '--color-background-green': ['#3E6B451F', '#3E6B4538'],
    '--color-border-green': [SUCCESS, '#6E9B76'],
    '--color-icon-green': [SUCCESS, '#7FA886'],
    '--color-text-green': ['#2B4B31', '#B9D8BE'],

    '--color-background-yellow': ['#E8B84B3D', '#E8B84B29'],
    '--color-border-yellow': ['#B8862A', '#C9A24A'],
    '--color-icon-yellow': [WARNING, OCHRE],
    '--color-text-yellow': ['#5A3B0D', '#F2DCA6'],

    '--color-background-orange': ['#C4642A24', '#C4642A38'],
    '--color-border-orange': ['#B4551F', '#C57A4A'],
    '--color-icon-orange': ['#B4551F', '#DE9163'],
    '--color-text-orange': ['#6B3211', '#F0C3A5'],

    '--color-background-red': ['#9C37191F', '#9C371938'],
    '--color-border-red': [ERROR, '#C4664C'],
    '--color-icon-red': [ERROR, '#D4674A'],
    '--color-text-red': ['#6B2411', '#F0B7A5'],

    // The one cool tone in the system, kept desaturated so it reads as a warm
    // slate rather than a product blue. Used for "in progress" states only.
    '--color-background-teal': ['#3F5D631F', '#3F5D6338'],
    '--color-border-teal': ['#3F5D63', '#6B8E95'],
    '--color-icon-teal': ['#3F5D63', '#7FA5AC'],
    '--color-text-teal': ['#26383C', '#B3D0D5'],

    '--color-background-blue': ['#3F5D631F', '#3F5D6338'],
    '--color-border-blue': ['#3F5D63', '#6B8E95'],
    '--color-icon-blue': ['#3F5D63', '#7FA5AC'],
    '--color-text-blue': ['#26383C', '#B3D0D5'],

    '--color-background-cyan': ['#3F5D631F', '#3F5D6338'],
    '--color-border-cyan': ['#3F5D63', '#6B8E95'],
    '--color-icon-cyan': ['#3F5D63', '#7FA5AC'],
    '--color-text-cyan': ['#26383C', '#B3D0D5'],

    // Purple and pink have no place in this identity. Re-pointed at the
    // neutral ramp so a stray hue prop degrades to grey instead of shouting.
    '--color-background-purple': ['#5C544A1F', '#D9CDB41A'],
    '--color-border-purple': ['#8C8477', '#6E6558'],
    '--color-icon-purple': [TAUPE, BONE_MUTED],
    '--color-text-purple': [INK, BONE_TEXT],
    '--color-background-pink': ['#5C544A1F', '#D9CDB41A'],
    '--color-border-pink': ['#8C8477', '#6E6558'],
    '--color-icon-pink': [TAUPE, BONE_MUTED],
    '--color-text-pink': [INK, BONE_TEXT],
  },

  components: {
    // Headings are the brand's display voice. Instrument Serif wants to be set
    // large and let the letterforms breathe, so tighten tracking a touch —
    // never past the -0.04em the brand guide sets as the floor.
    heading: {
      base: {letterSpacing: '-0.02em'},
    },

    // Buttons keep the tag's squared geometry rather than rounding into pills.
    button: {
      base: {
        borderRadius: 'var(--radius-element)',
        fontWeight: 'var(--font-weight-semibold)',
        letterSpacing: '0.01em',
      },
    },

    // Tables are the screen the user lives in. Header row gets the sand wash so
    // columns stay findable when scrolled deep into 500 rows.
    'table-header-cell': {
      base: {
        backgroundColor: 'var(--color-background-body)',
        fontWeight: 'var(--font-weight-semibold)',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        fontSize: 'var(--font-size-2xs)',
        color: 'var(--color-text-secondary)',
      },
    },

    // Banners carry the marks-to-check warning, which must not be skimmable.
    banner: {
      base: {borderRadius: 'var(--radius-element)'},
    },

    // ---------------------------------------------------------------------
    // The price tag — the brand signature (public/brand/tag.css).
    //
    // Declared as custom Badge variants rather than a hand-written stylesheet,
    // so `astryx theme build` type-augments <Badge variant="tag" /> and the app
    // still owns zero CSS files. Reserved for prices; a tag on every cell stops
    // being a signature and starts being noise.
    // ---------------------------------------------------------------------
    badge: {
      'variant:tag': {
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
        fontFamily: 'var(--font-family-body)',
        fontWeight: 'var(--font-weight-semibold)',
        fontVariantNumeric: 'tabular-nums',
        padding: '0.3em 0.7em 0.3em 0.95em',
        borderRadius: '0',
        clipPath: 'polygon(0 50%, 12% 0, 100% 0, 100% 100%, 12% 100%)',
        transform: 'rotate(-4deg)',
        whiteSpace: 'nowrap',
      },
      // The logo mark: the same tag carrying an Instrument Serif "W", steeper
      // rotation, punched hole. The brand rule is that the full lockup needs
      // 44px of height and anything smaller uses the tag alone — which is
      // exactly the situation in a nav bar, so this is what sits there.
      'variant:tag-logo': {
        backgroundColor: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
        fontFamily: 'var(--font-family-heading)',
        fontWeight: 'var(--font-weight-normal)',
        fontSize: 'var(--font-size-lg)',
        lineHeight: '1',
        padding: '0.18em 0.42em 0.18em 0.5em',
        borderRadius: '0',
        clipPath: 'polygon(0 50%, 16% 0, 100% 0, 100% 100%, 16% 100%)',
        transform: 'rotate(-8deg)',
        WebkitMask:
          'radial-gradient(circle 0.1em at 0.3em 50%, transparent 97%, #000 100%)',
        mask: 'radial-gradient(circle 0.1em at 0.3em 50%, transparent 97%, #000 100%)',
        whiteSpace: 'nowrap',
      },
      // Sold: taupe fill, same geometry. The brand keeps the rotation.
      'variant:tag-sold': {
        backgroundColor: 'var(--color-text-secondary)',
        color: 'var(--color-background-body)',
        fontFamily: 'var(--font-family-body)',
        fontWeight: 'var(--font-weight-semibold)',
        fontVariantNumeric: 'tabular-nums',
        padding: '0.3em 0.7em 0.3em 0.95em',
        borderRadius: '0',
        clipPath: 'polygon(0 50%, 12% 0, 100% 0, 100% 100%, 12% 100%)',
        transform: 'rotate(-4deg)',
        whiteSpace: 'nowrap',
      },
    },
  },
});

export default weldamTheme;
