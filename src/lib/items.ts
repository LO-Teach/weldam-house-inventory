import 'server-only';

import {ladderStep} from './pricing';
import {signPaths, supabase} from './supabase';
import type {ListItemsQuery} from './schema';
import type {
  Item,
  ItemImage,
  ItemImageWithUrl,
  ItemWithImages,
} from './types';

const SORTABLE = new Set([
  'lot_number',
  'title_nl',
  'shopify_category',
  'material',
  'style',
  'maker',
  'retail_local',
  'ask_local',
  'retail_intl',
  'ask_intl',
  'owner_name',
  'channel',
  'confidence',
  'lot_group',
  'status',
  'listed_at',
  'created_at',
  'updated_at',
]);

export interface ItemListResult {
  items: ItemWithImages[];
  total: number;
  /** Totals over the whole filtered set, not just this page. */
  summary: {
    count: number;
    /** Sum of ask_local across the filtered set. */
    totalLocal: number;
    /** Sum of ask_intl. */
    totalIntl: number;
    /** Sum of retail_local — what the stock is notionally worth at full price. */
    totalRetail: number;
    byStatus: Record<string, number>;
  };
}

export async function listItems(query: ListItemsQuery): Promise<ItemListResult> {
  const db = supabase();
  let builder = db.from('items').select('*', {count: 'exact'});

  builder = applyFilters(builder, query);

  const sort = query.sort && SORTABLE.has(query.sort) ? query.sort : 'lot_number';
  builder = builder.order(sort, {
    ascending: query.dir !== 'desc',
    nullsFirst: false,
  });

  const {data, error, count} = await builder.range(
    query.offset,
    query.offset + query.limit - 1,
  );
  if (error) throw new Error(error.message);

  let items = (data ?? []) as Item[];

  // Two presets need arithmetic Postgres was not asked for. `floor` depends on
  // elapsed weeks against each item's own ask and floor, and `questions` on
  // whether any question inside the facts JSON is still unanswered. Both are
  // finished here, against a set the SQL has already narrowed.
  if (query.preset === 'floor') {
    items = items.filter(
      (item) =>
        ladderStep(item.ask_local, item.floor_local, item.listed_at).hasHitFloor,
    );
  }
  if (query.preset === 'questions') {
    items = items.filter((item) =>
      (item.facts?.questions ?? []).some((question) => !question.answer?.trim()),
    );
  }

  const withImages = await attachImages(items);

  // The summary bar reports the filtered set, not the visible page — a total
  // that changes as you scroll is worse than no total. Totals are of the ASK
  // prices: what the inventory is currently up for, not what it might retail at.
  let summaryBuilder = db
    .from('items')
    .select('ask_local, ask_intl, retail_local, status');
  summaryBuilder = applyFilters(summaryBuilder, query);
  const {data: summaryRows} = await summaryBuilder;

  const summary = {
    count: count ?? items.length,
    totalLocal: 0,
    totalIntl: 0,
    totalRetail: 0,
    byStatus: {} as Record<string, number>,
  };
  for (const row of summaryRows ?? []) {
    summary.totalLocal += Number(row.ask_local ?? 0);
    summary.totalIntl += Number(row.ask_intl ?? 0);
    summary.totalRetail += Number(row.retail_local ?? 0);
    const status = String(row.status ?? 'draft');
    summary.byStatus[status] = (summary.byStatus[status] ?? 0) + 1;
  }

  // A post-filtered preset invalidates the SQL count, so report what survived.
  const total =
    query.preset === 'floor' || query.preset === 'questions'
      ? items.length
      : (count ?? items.length);
  if (query.preset === 'floor' || query.preset === 'questions') {
    summary.count = items.length;
  }

  return {items: withImages, total, summary};
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the Supabase filter
   builder's generic type changes shape with each chained call, and pinning it
   here buys nothing: every value going in is already validated by Zod. */
function applyFilters(builder: any, query: ListItemsQuery): any {
  let next = builder;

  if (query.preset === 'sleepers') {
    // Not certain, something worth checking on the base, already appraised:
    // the items where two seconds with a torch could move the price bracket.
    next = next
      .neq('confidence', 'certain')
      .not('marks_to_check', 'is', null)
      .neq('marks_to_check', '')
      .eq('status', 'appraised');
  }

  if (query.preset === 'floor') {
    // Listed long enough that the weekly markdown has bottomed out. The actual
    // "has it hit the floor" arithmetic needs the dates, so it is finished in
    // JS after the fetch; this just narrows to things that could have.
    next = next.eq('status', 'listed').not('listed_at', 'is', null);
  }

  if (query.preset === 'questions') {
    // The appraiser asked something nobody has answered yet.
    next = next.not('facts->questions', 'is', null);
  }

  if (query.status) next = next.eq('status', query.status);
  if (query.channel) next = next.eq('channel', query.channel);
  if (query.category) next = next.eq('category', query.category);
  if (query.shopifyCategory) next = next.eq('shopify_category', query.shopifyCategory);
  if (query.material) next = next.eq('material', query.material);
  if (query.style) next = next.eq('style', query.style);
  if (query.colour) next = next.eq('colour', query.colour);
  if (query.owner) next = next.eq('owner_name', query.owner);
  if (query.confidence) next = next.eq('confidence', query.confidence);
  if (query.lotGroup) next = next.eq('lot_group', query.lotGroup);
  if (query.hasMaker === 'yes') next = next.not('maker', 'is', null);
  if (query.hasMaker === 'no') next = next.is('maker', null);
  if (query.priceMin != null) next = next.gte('ask_local', query.priceMin);
  if (query.priceMax != null) next = next.lte('ask_local', query.priceMax);

  if (query.q) {
    const term = `%${query.q.replace(/[%_,()]/g, ' ').trim()}%`;
    next = next.or(
      [
        `title_nl.ilike.${term}`,
        `title_en.ilike.${term}`,
        `maker.ilike.${term}`,
        `category.ilike.${term}`,
        `material.ilike.${term}`,
        `material_detail.ilike.${term}`,
        `style.ilike.${term}`,
        `owner_name.ilike.${term}`,
        `marks_found.ilike.${term}`,
        `lot_group.ilike.${term}`,
        `notes.ilike.${term}`,
      ].join(','),
    );
  }

  return next;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getItem(id: string): Promise<ItemWithImages | null> {
  const {data, error} = await supabase()
    .from('items')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const [withImages] = await attachImages([data as Item]);
  return withImages ?? null;
}

/**
 * Attaches image rows plus one-hour signed URLs. The bucket is private, so an
 * unsigned storage path is useless to the browser.
 */
export async function attachImages(items: Item[]): Promise<ItemWithImages[]> {
  if (items.length === 0) return [];

  const {data: imageRows} = await supabase()
    .from('item_images')
    .select('*')
    .in(
      'item_id',
      items.map((item) => item.id),
    )
    .order('sort_order', {ascending: true});

  const images = (imageRows ?? []) as ItemImage[];
  const signed = await signPaths(images.map((image) => image.storage_path));

  const byItem = new Map<string, ItemImageWithUrl[]>();
  for (const image of images) {
    const list = byItem.get(image.item_id) ?? [];
    list.push({...image, url: signed.get(image.storage_path) ?? null});
    byItem.set(image.item_id, list);
  }

  return items.map((item) => ({
    ...item,
    images: (byItem.get(item.id) ?? []).sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
    ),
  }));
}

/** Distinct lot groups, for the combobox on the Review screen. */
export async function listLotGroups(): Promise<string[]> {
  const {data} = await supabase()
    .from('items')
    .select('lot_group')
    .not('lot_group', 'is', null);

  const groups = new Set<string>();
  for (const row of data ?? []) {
    const value = String(row.lot_group ?? '').trim();
    if (value) groups.add(value);
  }
  return [...groups].sort((a, b) => a.localeCompare(b));
}

/** Distinct owners, so consigned stock can be filtered and settled up. */
export async function listOwners(): Promise<string[]> {
  const {data} = await supabase().from('items').select('owner_name');
  const owners = new Set<string>();
  for (const row of data ?? []) {
    const value = String(row.owner_name ?? '').trim();
    if (value) owners.add(value);
  }
  return [...owners].sort((a, b) => a.localeCompare(b));
}

/** Distinct categories, for the inventory filter bar. */
export async function listCategories(): Promise<string[]> {
  const {data} = await supabase()
    .from('items')
    .select('category')
    .not('category', 'is', null);

  const categories = new Set<string>();
  for (const row of data ?? []) {
    const value = String(row.category ?? '').trim();
    if (value) categories.add(value);
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}
