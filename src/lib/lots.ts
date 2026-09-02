import 'server-only';

import {ladderStep} from './pricing';
import {supabase} from './supabase';
import {categoryById} from './taxonomy';
import type {Item} from './types';

/**
 * Proposing lots.
 *
 * Deliberately NOT a model call. Grouping cheap items by what they have in
 * common is arithmetic, and doing it in code makes it instant, free, repeatable
 * and — most importantly — explainable: every proposal can say exactly why
 * those six things are in a box together. A model would write nicer lot titles
 * and occasionally put a candlestick in with the teacups.
 *
 * Nothing here writes. It proposes; applying a lot is a separate, explicit act.
 */

export interface LotCandidate {
  id: string;
  lot_number: number;
  title_nl: string | null;
  shopify_category: string | null;
  material: string | null;
  colour: string | null;
  style: string | null;
  era: string | null;
  retail_local: number | null;
  ask_local: number | null;
  thumbUrl?: string | null;
}

export interface LotProposal {
  /** Suggested lot_group value. */
  key: string;
  title: string;
  /** Why these belong together, in one line. */
  rationale: string;
  items: LotCandidate[];
  /** Sum of the individual ask prices. */
  sumIndividual: number;
  /**
   * What to ask for the bundle. A lot sells at a discount to the sum of its
   * parts — that discount is the whole reason a buyer takes six things instead
   * of one — but not below what the best piece alone would fetch.
   */
  suggestedPrice: number;
}

/** A lot is worth this fraction of its parts. Bundles trade at a discount. */
const BUNDLE_RATIO = 0.7;

export interface ProposeOptions {
  /** Only consider items at or below this local retail figure. */
  maxRetail: number;
  /** Aim for roughly this many pieces per lot. */
  targetSize: number;
}

/**
 * Everything cheap enough to be worth bundling and not already in a lot.
 *
 * Sold and scrapped items are out, obviously. Items that have bottomed out on
 * the markdown ladder are IN regardless of their retail figure — that is the
 * whole point of the floor: a piece that has been discounted for two months and
 * still has not sold is a lot item now, whatever it was appraised at.
 */
export async function proposeLots(options: ProposeOptions): Promise<LotProposal[]> {
  const {data, error} = await supabase()
    .from('items')
    .select(
      'id, lot_number, title_nl, shopify_category, material, colour, style, era, retail_local, ask_local, floor_local, listed_at, status, channel, lot_group',
    )
    .in('status', ['draft', 'appraised', 'listed'])
    .is('lot_group', null)
    .order('lot_number');

  if (error) throw new Error(error.message);

  const eligible = (data ?? []).filter((row) => {
    const item = row as unknown as Item;
    if (item.channel === 'scrap') return false;

    const cheap =
      item.retail_local != null && Number(item.retail_local) <= options.maxRetail;
    const explicitlyLot = item.channel === 'lot';
    const bottomedOut =
      item.status === 'listed' &&
      ladderStep(item.ask_local, item.floor_local, item.listed_at).hasHitFloor;

    return cheap || explicitlyLot || bottomedOut;
  }) as unknown as LotCandidate[];

  // Group on what a buyer would recognise as "a box of similar things". Category
  // is the strongest signal; material separates a box of glass from a box of
  // brass within the same category.
  const buckets = new Map<string, LotCandidate[]>();
  for (const item of eligible) {
    const key = [item.shopify_category ?? 'other', item.material ?? 'mixed'].join('|');
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  const proposals: LotProposal[] = [];

  for (const [key, bucket] of buckets) {
    // A "lot" of one is just an item. Fold the stragglers into a mixed lot
    // rather than proposing a bundle nobody would buy.
    if (bucket.length < 2) continue;

    for (const chunk of chunkEvenly(bucket, options.targetSize)) {
      if (chunk.length < 2) continue;
      proposals.push(buildProposal(key, chunk));
    }
  }

  // Whatever was too lonely to group: one mixed lot, if there is enough of it.
  const grouped = new Set(proposals.flatMap((p) => p.items.map((i) => i.id)));
  const leftovers = eligible.filter((item) => !grouped.has(item.id));
  if (leftovers.length >= 3) {
    for (const chunk of chunkEvenly(leftovers, options.targetSize)) {
      if (chunk.length < 2) continue;
      proposals.push(buildProposal('mixed|mixed', chunk, true));
    }
  }

  return proposals.sort((a, b) => b.suggestedPrice - a.suggestedPrice);
}

function buildProposal(
  key: string,
  items: LotCandidate[],
  isMixed = false,
): LotProposal {
  const [categoryId, material] = key.split('|');
  const category = categoryById(categoryId);

  const sumIndividual = items.reduce(
    (total, item) => total + Number(item.ask_local ?? 0),
    0,
  );
  const best = items.reduce(
    (max, item) => Math.max(max, Number(item.ask_local ?? 0)),
    0,
  );

  const eras = unique(items.map((item) => item.era).filter(Boolean) as string[]);
  const styles = unique(items.map((item) => item.style).filter(Boolean) as string[]);
  const colours = unique(items.map((item) => item.colour).filter(Boolean) as string[]);

  const noun = isMixed
    ? 'Mixed vintage lot'
    : `${category?.label ?? 'Assorted'} lot`;
  const materialWord = !isMixed && material && material !== 'mixed' ? material : null;
  const eraWord = eras.length === 1 ? eras[0] : styles.length === 1 ? styles[0] : null;

  // Built by joining clauses rather than by interpolating a sentence, so a
  // missing material or era leaves no dangling comma behind it.
  const title =
    [noun, materialWord ? `— ${materialWord.toLowerCase()}` : null]
      .filter(Boolean)
      .join(' ') +
    (eraWord ? `, ${eraWord}` : '') +
    ` (${items.length} pieces)`;

  const rationale = isMixed
    ? `${items.length} low-value pieces with nothing else in common — worth more as one box than as ${items.length} listings.`
    : [
        `${items.length} ${pluralise(category?.label ?? 'item', items.length).toLowerCase()}`,
        materialWord ? ` in ${materialWord.toLowerCase()}` : '',
        eraWord ? `, ${eraWord}` : '',
        colours.length === 1 ? `, all ${colours[0].toLowerCase()}` : '',
      ].join('') + '.';

  return {
    key: slugifyLotKey(title),
    title,
    rationale,
    items,
    sumIndividual: Math.round(sumIndividual),
    // Never price the bundle below its best single piece — otherwise a dealer
    // buys the lot for the one thing in it and bins the rest.
    suggestedPrice: Math.max(Math.round(sumIndividual * BUNDLE_RATIO), Math.round(best)),
  };
}

/**
 * Splits into chunks as close to `size` as possible without leaving an orphan.
 * Seven items at a target of six is two lots of three or four, not a six and a
 * one.
 */
function chunkEvenly<T>(items: T[], size: number): T[][] {
  if (items.length <= size) return [items];
  const count = Math.ceil(items.length / size);
  const perChunk = Math.ceil(items.length / count);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += perChunk) {
    chunks.push(items.slice(i, i + perChunk));
  }
  return chunks;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Enough pluralisation for the category labels this actually sees. The awkward
 * ones in the list are "Bookends" and "Napkin rings", which are already plural,
 * and "Ashtray"/"Vase"/"Mirror", which just take an s.
 */
function pluralise(label: string, count: number): string {
  if (count === 1) return label;
  if (/s$/i.test(label)) return label;
  if (/(ch|sh|x|z)$/i.test(label)) return `${label}es`;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

function slugifyLotKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
