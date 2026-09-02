/**
 * The price ladder.
 *
 * Three numbers per market, not one:
 *
 *   retail  what a consumer actually pays for this piece in a curated vintage
 *           shop. The real judgement call — everything else derives from it.
 *   ask     what it goes up at. Defaults to 80% of retail: under the shop price
 *           so it looks like a find, nowhere near what a dealer would offer.
 *   floor   where the weekly markdown stops. Below this it is a lot, not a
 *           listing.
 *
 * We deliberately do NOT price to what a dealer would pay. Dealers introduce
 * themselves with a lowball offer regardless of the number on the tag, so
 * pricing for them just donates the margin to them up front.
 *
 * Then the ladder: -10% a week until it sells. That compounds, and compounding
 * has no floor of its own — week 7 is 48% of ask, week 14 is 23%, week 20 is
 * 12%. Hence `floor`, and hence `hasHitFloor`, which is the queue of things to
 * bundle into a lot rather than keep discounting toward nothing.
 *
 * Everything here is pure. scripts/test-pricing.mjs checks the arithmetic.
 */

/** Ask price as a fraction of the consumer retail estimate. */
export const ASK_RATIO = 0.8;

/** Discount applied per whole week an item has been listed. */
export const WEEKLY_MARKDOWN = 0.1;

/**
 * Default floor as a fraction of the ask. Roughly week 7 of the ladder — far
 * enough down to have given the market a real chance, high enough that the
 * piece is still worth wrapping and posting.
 */
export const DEFAULT_FLOOR_RATIO = 0.5;

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Ask from retail: 80%, rounded to a whole euro. */
export function askFromRetail(retail: number | null | undefined): number | null {
  if (retail == null || !Number.isFinite(Number(retail))) return null;
  return Math.round(Number(retail) * ASK_RATIO);
}

/** Floor from ask, rounded to a whole euro. */
export function floorFromAsk(ask: number | null | undefined): number | null {
  if (ask == null || !Number.isFinite(Number(ask))) return null;
  return Math.round(Number(ask) * DEFAULT_FLOOR_RATIO);
}

/**
 * Whole weeks an item has been listed. Partial weeks do not discount — the
 * price should change on a predictable day, not drift hourly.
 */
export function weeksListed(
  listedAt: string | Date | null | undefined,
  now: Date = new Date(),
): number {
  if (!listedAt) return 0;
  const start = listedAt instanceof Date ? listedAt : new Date(listedAt);
  if (Number.isNaN(start.getTime())) return 0;
  const elapsed = now.getTime() - start.getTime();
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / MS_PER_WEEK);
}

export interface LadderStep {
  /** Today's price after the markdown, clamped at the floor. */
  price: number | null;
  /** Whole weeks elapsed since listing. */
  weeks: number;
  /** True once the markdown has bottomed out. Decide: lot it or scrap it. */
  hasHitFloor: boolean;
  /** Whole euros off the original ask. Zero in week 0. */
  discount: number;
  /** Percentage off the ask, for the badge. */
  discountPct: number;
}

/**
 * Where an item sits on the ladder right now.
 *
 * With no ask, there is no ladder — an unpriced item is not silently discounted
 * from nothing.
 */
export function ladderStep(
  ask: number | null | undefined,
  floor: number | null | undefined,
  listedAt: string | Date | null | undefined,
  now: Date = new Date(),
): LadderStep {
  const askValue = ask == null ? null : Number(ask);
  if (askValue == null || !Number.isFinite(askValue)) {
    return {price: null, weeks: 0, hasHitFloor: false, discount: 0, discountPct: 0};
  }

  const weeks = weeksListed(listedAt, now);
  // A floor above the ask would mean an item that starts below its own floor;
  // treat that as no floor rather than as an instant "hit the floor".
  const floorValue =
    floor == null || !Number.isFinite(Number(floor)) || Number(floor) > askValue
      ? (floorFromAsk(askValue) ?? 0)
      : Number(floor);

  const raw = askValue * Math.pow(1 - WEEKLY_MARKDOWN, weeks);
  const clamped = Math.max(raw, floorValue);
  const price = Math.round(clamped);

  return {
    price,
    weeks,
    // Compare before rounding: a rounded price can equal the floor by accident
    // a week before the ladder has genuinely bottomed out.
    hasHitFloor: raw <= floorValue,
    discount: Math.round(askValue - price),
    discountPct: askValue > 0 ? Math.round(((askValue - price) / askValue) * 100) : 0,
  };
}

/** The next few weeks, for the "what happens if it doesn't sell" table in review. */
export function ladderPreview(
  ask: number | null | undefined,
  floor: number | null | undefined,
  weeksAhead = 8,
): Array<{week: number; price: number}> {
  const askValue = ask == null ? null : Number(ask);
  if (askValue == null || !Number.isFinite(askValue)) return [];

  const floorValue = floor != null && Number.isFinite(Number(floor))
    ? Number(floor)
    : (floorFromAsk(askValue) ?? 0);

  const rows: Array<{week: number; price: number}> = [];
  for (let week = 0; week <= weeksAhead; week += 1) {
    const raw = askValue * Math.pow(1 - WEEKLY_MARKDOWN, week);
    rows.push({week, price: Math.round(Math.max(raw, floorValue))});
  }
  return rows;
}
