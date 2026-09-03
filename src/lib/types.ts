/**
 * Shared vocabulary. Imported by both server routes and client components, so
 * nothing in here may touch node: modules or secrets.
 */

export {
  MATERIALS,
  COLOURS,
  STYLES,
  CONDITIONS,
  CONDITION_LABELS,
  SHOPIFY_CATEGORIES,
  CATEGORY_IDS,
  categoryById,
  categoryLabel,
} from './taxonomy';
export type {
  Material,
  Colour,
  Style,
  ConditionGrade,
  ShopifyCategory,
} from './taxonomy';

export const CHANNELS = [
  'local',
  'ebay',
  'catawiki',
  'shopify',
  'lot',
  'hold',
  'scrap',
] as const;
export type Channel = (typeof CHANNELS)[number];

export const STATUSES = [
  'draft',
  'appraised',
  'listed',
  'sold',
  'scrapped',
] as const;
export type Status = (typeof STATUSES)[number];

export const CONFIDENCES = ['certain', 'likely', 'guessing'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface ItemImage {
  id: string;
  item_id: string;
  storage_path: string;
  archive_path: string | null;
  original_name: string | null;
  sha256: string | null;
  bytes: number | null;
  is_primary: boolean;
  sort_order: number;
}

/** An image row plus the short-lived signed URL the browser can actually load. */
export interface ItemImageWithUrl extends ItemImage {
  url: string | null;
}

/**
 * A thing the appraiser wants checked by the person holding the object.
 * Answering one is what turns `guessing` into `certain` and moves a price
 * bracket, so the answers are fed straight back into a re-appraisal.
 */
export interface AppraisalQuestion {
  id: string;
  question: string;
  why: string | null;
  /**
   * Suggested answers, phrased as the person holding the object would say them
   * — "Smooth all the way round", "There's a mould seam". Rendered as buttons.
   * Empty means the question really is a yes/no and the UI offers those.
   */
  options?: string[] | null;
  /** Filled in on the Review screen. Null until answered. */
  answer?: string | null;
}

/** A question that has been answered by hand. Kept forever. */
export interface AnsweredQuestion {
  id: string;
  question: string;
  answer: string;
  answered_at: string;
}

export interface Item {
  id: string;
  lot_number: number;
  title_nl: string | null;
  title_en: string | null;

  // --- categorisation ------------------------------------------------------
  /** Legacy free-text category. Superseded by shopify_category. */
  category: string | null;
  /** Shopify taxonomy id, e.g. 'hg-3-67'. Drives the storefront filter. */
  shopify_category: string | null;
  /** Shopify Material enum value — coarse, for filtering. */
  material: string | null;
  /** Free text: 'lead crystal', 'sommerso cased glass'. Often sets the price. */
  material_detail: string | null;
  /** Shopify Color enum value. */
  colour: string | null;
  colour_detail: string | null;
  /** Period/movement, e.g. 'Mid-century modern'. */
  style: string | null;
  era: string | null;

  // --- dimensions ----------------------------------------------------------
  height_cm: number | null;
  width_cm: number | null;
  depth_cm: number | null;
  diameter_cm: number | null;
  weight_g: number | null;
  /** Human-readable summary, derived from the numbers above. */
  dimensions_cm: string | null;

  // --- identification ------------------------------------------------------
  maker: string | null;
  marks_found: string | null;
  marks_to_check: string | null;
  condition_grade: string | null;
  condition: string | null;
  confidence: Confidence | null;

  // --- the price ladder ----------------------------------------------------
  /** What a consumer pays. The judgement everything else derives from. */
  retail_local: number | null;
  /** Launch price, 80% of retail. */
  ask_local: number | null;
  /** Where the weekly markdown stops. */
  floor_local: number | null;
  retail_intl: number | null;
  ask_intl: number | null;
  floor_intl: number | null;
  /** When the markdown clock started. */
  listed_at: string | null;

  // --- consignment ---------------------------------------------------------
  owner_name: string;
  owner_contact: string | null;
  owner_split_pct: number | null;
  owner_notes: string | null;

  // --- workflow ------------------------------------------------------------
  facts: ItemFacts | null;
  channel: Channel | null;
  lot_group: string | null;
  status: Status;
  sold_price: number | null;
  sold_at: string | null;
  notes: string | null;
  /** Folder name on disk under archive/. Renamed to include the title. */
  archive_folder: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemWithImages extends Item {
  images: ItemImageWithUrl[];
}

/**
 * `facts` is the source of truth listing copy is generated from. It holds what
 * the appraiser observed, plus whatever the listing generator has cached —
 * never prose the user is expected to keep in sync by hand.
 */
export interface ItemFacts {
  material?: string | null;
  material_detail?: string | null;
  era?: string | null;
  style?: string | null;
  colour?: string | null;
  colour_detail?: string | null;
  dimensions_cm?: string | null;
  dimensions_estimated?: boolean | null;
  marks_found?: string | null;
  marks_to_check?: string | null;
  condition?: string | null;
  condition_grade?: string | null;
  category?: string | null;
  shopify_category?: string | null;
  maker?: string | null;
  /** One line, shown on hover only. Why the appraiser landed where it did. */
  reasoning?: string | null;
  /** Free-text nudge the user typed at ingest. Never treated as fact. */
  hint?: string | null;
  /** What the appraiser currently wants checked. Replaced on every re-run. */
  questions?: AppraisalQuestion[];
  /**
   * Everything ever answered by hand, accumulated and never discarded.
   *
   * This is separate from `questions` on purpose. `questions` is whatever the
   * appraiser is asking right now, so it empties out once it has nothing left
   * to ask — and if the answers lived only there, finishing the checklist would
   * delete the very facts you just established. These are fed back into every
   * later re-appraisal, so nobody is asked to check the same base twice.
   */
  answered?: AnsweredQuestion[];
  /** Per-channel listing copy, cached so it survives a reload. */
  listings?: Partial<Record<ListingChannel, ListingCopy>>;
}

export interface AppraisalJob {
  id: string;
  item_id: string;
  status: JobStatus;
  error: string | null;
  raw_output: unknown;
  created_at: string;
}

// --- Listing ----------------------------------------------------------------

export const LISTING_CHANNELS = [
  '2dehands',
  'marktplaats',
  'ebay',
  'catawiki',
] as const;
export type ListingChannel = (typeof LISTING_CHANNELS)[number];

export interface ListingCopy {
  title: string;
  description: string;
  price: number | null;
  /** ISO timestamp of generation, so the drawer can say how stale the copy is. */
  generated_at: string;
}

export const LISTING_CHANNEL_META: Record<
  ListingChannel,
  {
    label: string;
    language: 'nl' | 'en';
    /** eBay caps at 80. The others are softer, but long titles get truncated. */
    titleMaxChars: number;
    /** Where the user finishes the job by hand. No Dutch marketplace has an API. */
    newListingUrl: string;
    /** Shown in the drawer so it is obvious which buttons can and cannot automate. */
    note: string;
  }
> = {
  '2dehands': {
    label: '2dehands',
    language: 'nl',
    titleMaxChars: 60,
    newListingUrl: 'https://www.2dehands.be/sy/plaats-zoekertje/',
    note: 'No public listing API. Copy the fields, paste them into the form.',
  },
  marktplaats: {
    label: 'Marktplaats',
    language: 'nl',
    titleMaxChars: 60,
    newListingUrl: 'https://www.marktplaats.nl/sya/',
    note: 'No public listing API. Copy the fields, paste them into the form.',
  },
  ebay: {
    label: 'eBay',
    language: 'en',
    titleMaxChars: 80,
    newListingUrl: 'https://www.ebay.com/sl/sell',
    note: 'The Sell API could automate this later. For now: copy and paste.',
  },
  catawiki: {
    label: 'Catawiki',
    language: 'en',
    titleMaxChars: 80,
    newListingUrl: 'https://www.catawiki.com/en/s/sell',
    note: 'Auction submission is reviewed by an expert. Copy and paste.',
  },
};

// --- Display helpers --------------------------------------------------------

export const CHANNEL_LABELS: Record<Channel, string> = {
  local: 'Local',
  ebay: 'eBay',
  catawiki: 'Catawiki',
  shopify: 'Shopify',
  lot: 'Lot',
  hold: 'Hold',
  scrap: 'Scrap',
};

export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  appraised: 'Appraised',
  listed: 'Listed',
  sold: 'Sold',
  scrapped: 'Scrapped',
};

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  certain: 'Certain',
  likely: 'Likely',
  guessing: 'Guessing',
};

/**
 * Badge hues. Every value here is re-toned in src/theme/weldam.ts into the
 * Weldam range, so none of these are the stock Astryx colours.
 */
export const STATUS_HUE: Record<Status, 'gray' | 'teal' | 'yellow' | 'green' | 'red'> = {
  draft: 'gray',
  appraised: 'teal',
  listed: 'yellow',
  sold: 'green',
  scrapped: 'red',
};

export const CONFIDENCE_HUE: Record<Confidence, 'green' | 'yellow' | 'orange'> = {
  certain: 'green',
  likely: 'yellow',
  guessing: 'orange',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Appraising',
  done: 'Ready',
  failed: 'Failed',
};

/** Builds the human-readable dimension summary from the numeric fields. */
export function formatDimensions(item: {
  height_cm?: number | null;
  width_cm?: number | null;
  depth_cm?: number | null;
  diameter_cm?: number | null;
}): string | null {
  const n = (value: number | null | undefined) =>
    value == null ? null : String(Number(value)).replace(/\.0$/, '');

  const height = n(item.height_cm);
  const diameter = n(item.diameter_cm);
  const width = n(item.width_cm);
  const depth = n(item.depth_cm);

  if (diameter && height) return `${height} cm high x ${diameter} cm diameter`;
  if (diameter) return `${diameter} cm diameter`;

  const box = [height, width, depth].filter(Boolean);
  if (box.length === 3) return `${box.join(' x ')} cm (h x w x d)`;
  if (box.length > 0) return `${box.join(' x ')} cm`;
  return null;
}
