import {z} from 'zod';

import {CHANNELS, CONFIDENCES, LISTING_CHANNELS, STATUSES} from './types';

/**
 * The contract with the appraiser. If the model's JSON does not satisfy this,
 * the job is marked failed and the raw output is kept — never coerced, never
 * silently dropped. A wrong price you can see is fixable; one you cannot is not.
 */
export const appraisalSchema = z.object({
  title_nl: z.string().min(1),
  title_en: z.string().min(1),
  category: z.string().min(1),
  material: z.string().nullable(),
  era: z.string().nullable(),
  colour: z.string().nullable(),
  dimensions_cm: z.string().nullable(),
  maker: z.string().nullable(),
  marks_found: z.string().nullable(),
  marks_to_check: z.string().nullable(),
  condition: z.string().nullable(),
  price_local: z.number().nonnegative().nullable(),
  price_intl: z.number().nonnegative().nullable(),
  channel: z.enum(CHANNELS),
  confidence: z.enum(CONFIDENCES),
  reasoning: z.string().nullable(),
});

export type AppraisalResult = z.infer<typeof appraisalSchema>;

/** Fields the UI is allowed to write back onto an item. */
export const itemPatchSchema = z
  .object({
    title_nl: z.string().nullable(),
    title_en: z.string().nullable(),
    category: z.string().nullable(),
    material: z.string().nullable(),
    era: z.string().nullable(),
    colour: z.string().nullable(),
    dimensions_cm: z.string().nullable(),
    maker: z.string().nullable(),
    marks_found: z.string().nullable(),
    marks_to_check: z.string().nullable(),
    condition: z.string().nullable(),
    price_local: z.number().nonnegative().nullable(),
    price_intl: z.number().nonnegative().nullable(),
    channel: z.enum(CHANNELS).nullable(),
    confidence: z.enum(CONFIDENCES).nullable(),
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
  confidence: z.enum(CONFIDENCES).optional(),
  lotGroup: z.string().optional(),
  hasMaker: z.enum(['yes', 'no']).optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  q: z.string().optional(),
  /**
   * The sleepers preset: not certain, has something to check on the base, and
   * already appraised. Two seconds with a torch can move these a price bracket.
   */
  preset: z.enum(['sleepers']).optional(),
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
});
