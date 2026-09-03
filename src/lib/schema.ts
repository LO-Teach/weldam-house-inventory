import {z} from 'zod';

import {CHANNELS, CONFIDENCES, LISTING_CHANNELS, STATUSES} from './types';
import {CATEGORY_IDS, COLOURS, CONDITIONS, MATERIALS, STYLES} from './taxonomy';

/**
 * The contract with the appraiser. If the model's JSON does not satisfy this,
 * the job is marked failed and the raw output is kept — never coerced, never
 * silently dropped. A wrong price you can see is fixable; one you cannot is not.
 *
 * The enum fields are strict on purpose. A storefront filter is only as good as
 * its vocabulary, and "Brass" / "brass" / "gepolijst messing" is three facets
 * for one material. If the model invents a value the job fails loudly and the
 * raw output shows exactly what it tried to say.
 */

const questionSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().min(1),
  why: z.string().nullable(),
  /**
   * The answers worth offering as buttons, written in the voice of the person
   * holding the object. "Is there a mould seam?" is not a yes/no question, and
   * forcing it into one throws away the answer — so the appraiser supplies the
   * options along with the question. Empty falls back to Yes/No in the UI.
   */
  options: z
    .array(z.string().min(1).max(80))
    .max(5)
    .nullable()
    .optional()
    .transform((value) => value ?? []),
  answer: z.string().nullable().optional(),
});

/** cm, one decimal, and nothing absurd — a 4 m vase is a hallucinated decimal. */
const cm = z.number().positive().max(500).nullable();

export const appraisalSchema = z.object({
  title_nl: z.string().min(1),
  title_en: z.string().min(1),

  shopify_category: z.enum(CATEGORY_IDS as [string, ...string[]]),
  material: z.enum(MATERIALS).nullable(),
  material_detail: z.string().nullable(),
  colour: z.enum(COLOURS).nullable(),
  colour_detail: z.string().nullable(),
  style: z.enum(STYLES).nullable(),
  era: z.string().nullable(),

  height_cm: cm,
  width_cm: cm,
  depth_cm: cm,
  diameter_cm: cm,
  weight_g: z.number().positive().max(500_000).nullable(),
  dimensions_estimated: z.boolean().nullable(),

  maker: z.string().nullable(),
  marks_found: z.string().nullable(),
  marks_to_check: z.string().nullable(),
  condition_grade: z.enum(CONDITIONS).nullable(),
  condition: z.string().nullable(),

  // Only the consumer retail figures come from the model. ask and floor are
  // computed in src/lib/pricing.ts so the 80% / 50% rule lives in exactly one
  // place and cannot drift with the model's arithmetic.
  retail_local: z.number().nonnegative().nullable(),
  retail_intl: z.number().nonnegative().nullable(),

  channel: z.enum(CHANNELS),
  confidence: z.enum(CONFIDENCES),
  questions: z.array(questionSchema).max(6).default([]),
  reasoning: z.string().nullable(),
});

export type AppraisalResult = z.infer<typeof appraisalSchema>;

/** Fields the UI is allowed to write back onto an item. */
export const itemPatchSchema = z
  .object({
    title_nl: z.string().nullable(),
    title_en: z.string().nullable(),

    category: z.string().nullable(),
    shopify_category: z.string().nullable(),
    material: z.string().nullable(),
    material_detail: z.string().nullable(),
    colour: z.string().nullable(),
    colour_detail: z.string().nullable(),
    style: z.string().nullable(),
    era: z.string().nullable(),

    height_cm: z.number().nonnegative().nullable(),
    width_cm: z.number().nonnegative().nullable(),
    depth_cm: z.number().nonnegative().nullable(),
    diameter_cm: z.number().nonnegative().nullable(),
    weight_g: z.number().nonnegative().nullable(),
    dimensions_cm: z.string().nullable(),

    maker: z.string().nullable(),
    marks_found: z.string().nullable(),
    marks_to_check: z.string().nullable(),
    condition_grade: z.enum(CONDITIONS).nullable(),
    condition: z.string().nullable(),
    confidence: z.enum(CONFIDENCES).nullable(),

    retail_local: z.number().nonnegative().nullable(),
    ask_local: z.number().nonnegative().nullable(),
    floor_local: z.number().nonnegative().nullable(),
    retail_intl: z.number().nonnegative().nullable(),
    ask_intl: z.number().nonnegative().nullable(),
    floor_intl: z.number().nonnegative().nullable(),
    listed_at: z.string().nullable(),

    owner_name: z.string().min(1),
    owner_contact: z.string().nullable(),
    owner_split_pct: z.number().min(0).max(100).nullable(),
    owner_notes: z.string().nullable(),

    channel: z.enum(CHANNELS).nullable(),
    lot_group: z.string().nullable(),
    status: z.enum(STATUSES),
    sold_price: z.number().nonnegative().nullable(),
    sold_at: z.string().nullable(),
    notes: z.string().nullable(),
    facts: z.record(z.string(), z.unknown()).nullable(),
  })
  .partial();

export type ItemPatch = z.infer<typeof itemPatchSchema>;

export const bulkPatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  patch: itemPatchSchema,
});

export const listItemsQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  channel: z.enum(CHANNELS).optional(),
  category: z.string().optional(),
  shopifyCategory: z.string().optional(),
  material: z.string().optional(),
  style: z.string().optional(),
  colour: z.string().optional(),
  owner: z.string().optional(),
  confidence: z.enum(CONFIDENCES).optional(),
  lotGroup: z.string().optional(),
  hasMaker: z.enum(['yes', 'no']).optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  q: z.string().optional(),
  /**
   * Saved views.
   *   sleepers  — not certain, something to check on the base, already appraised
   *   floor     — listed and the weekly markdown has bottomed out: lot or scrap
   *   questions — has unanswered questions from the appraiser
   */
  preset: z.enum(['sleepers', 'floor', 'questions']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const settingsPatchSchema = z.object({
  archiveRoot: z.string().optional(),
  derivativeMaxPx: z.coerce.number().int().min(320).max(4096).optional(),
  derivativeQuality: z.coerce.number().int().min(40).max(100).optional(),
});

export const listingRequestSchema = z.object({
  channel: z.enum(LISTING_CHANNELS),
  /** Ignore the cached copy and ask the model again. */
  regenerate: z.boolean().optional(),
});

export const appraiseRequestSchema = z.object({
  itemId: z.string().uuid(),
  /** Appended to the prompt on a re-appraisal: "look again at the base". */
  instruction: z.string().max(2000).optional(),
  /** Answers to the appraiser's own questions, fed back as established fact. */
  answers: z
    .array(z.object({id: z.string(), question: z.string(), answer: z.string()}))
    .optional(),
});

/** Re-appraise a whole set at once — used after tuning prompts/appraisal.md. */
export const bulkAppraiseRequestSchema = z.object({
  ids: z.array(z.string().uuid()).max(1000).optional(),
  status: z.enum(STATUSES).optional(),
  instruction: z.string().max(2000).optional(),
});

export const lotProposalRequestSchema = z.object({
  /** Only consider items at or below this local retail figure. */
  maxRetail: z.coerce.number().positive().default(20),
  /** Aim for roughly this many pieces per lot. */
  targetSize: z.coerce.number().int().min(2).max(20).default(6),
});

export const applyLotRequestSchema = z.object({
  lotGroup: z.string().min(1).max(120),
  ids: z.array(z.string().uuid()).min(1).max(200),
});
