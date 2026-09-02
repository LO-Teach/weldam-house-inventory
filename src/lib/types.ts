/**
 * Shared vocabulary. Imported by both server routes and client components, so
 * nothing in here may touch node: modules or secrets.
 */

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

export interface Item {
  id: string;
  lot_number: number;
  title_nl: string | null;
  title_en: string | null;
  category: string | null;
  material: string | null;
  era: string | null;
  colour: string | null;
  dimensions_cm: string | null;
  maker: string | null;
  marks_found: string | null;
  marks_to_check: string | null;
  condition: string | null;
  facts: ItemFacts | null;
  price_local: number | null;
  price_intl: number | null;
  channel: Channel | null;
  confidence: Confidence | null;
  lot_group: string | null;
  status: Status;
  sold_price: number | null;
  sold_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemWithImages extends Item {
  images: ItemImageWithUrl[];
}

/**
 * `facts` is the source of truth listing copy is generated from. It holds what
 * the appraiser observed, plus whatever the listing generator has cached — never
 * prose the user is expected to keep in sync by hand.
 */
export interface ItemFacts {
  material?: string | null;
  era?: string | null;
  colour?: string | null;
  dimensions_cm?: string | null;
  marks_found?: string | null;
  marks_to_check?: string | null;
  condition?: string | null;
  category?: string | null;
  maker?: string | null;
  /** One line, shown on hover only. Why the appraiser landed where it did. */
  reasoning?: string | null;
  /** Free-text nudge the user typed at ingest. Never treated as fact. */
  hint?: string | null;
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
    /** eBay caps at 80. The others are softer, but long titles get truncated in list views. */
    titleMaxChars: number;
    /** Where the user finishes the job by hand. No Dutch marketplace has a listing API. */
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
