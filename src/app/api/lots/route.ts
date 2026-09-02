import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {proposeLots} from '@/src/lib/lots';
import {applyLotRequestSchema, lotProposalRequestSchema} from '@/src/lib/schema';
import {signPaths, supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Propose bundles. Reads only — applying one is a separate, explicit act. */
export async function GET(request: NextRequest) {
  try {
    const parsed = lotProposalRequestSchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) return jsonError('Bad query.');

    const proposals = await proposeLots(parsed.data);

    // One thumbnail per candidate, so a proposal can be judged by eye rather
    // than by reading fourteen lot numbers.
    const itemIds = proposals.flatMap((p) => p.items.map((i) => i.id));
    const thumbs = new Map<string, string>();
    if (itemIds.length > 0) {
      const {data: images} = await supabase()
        .from('item_images')
        .select('item_id, storage_path, is_primary, sort_order')
        .in('item_id', itemIds)
        .order('is_primary', {ascending: false})
        .order('sort_order', {ascending: true});

      const firstPath = new Map<string, string>();
      for (const image of images ?? []) {
        const key = image.item_id as string;
        if (!firstPath.has(key)) firstPath.set(key, image.storage_path as string);
      }
      const signed = await signPaths([...firstPath.values()]);
      for (const [itemId, storagePath] of firstPath) {
        const url = signed.get(storagePath);
        if (url) thumbs.set(itemId, url);
      }
    }

    return Response.json({
      proposals: proposals.map((proposal) => ({
        ...proposal,
        items: proposal.items.map((item) => ({
          ...item,
          thumbUrl: thumbs.get(item.id) ?? null,
        })),
      })),
    });
  } catch (error) {
    return handleRouteError('GET /api/lots', error);
  }
}

/** Accept a proposal: stamps the lot group onto every item in it. */
export async function POST(request: NextRequest) {
  try {
    const parsed = applyLotRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid request: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }

    const {lotGroup, ids} = parsed.data;
    const {error, count} = await supabase()
      .from('items')
      .update({lot_group: lotGroup, channel: 'lot'}, {count: 'exact'})
      .in('id', ids);

    if (error) return jsonError(error.message, 500);
    return Response.json({ok: true, updated: count ?? ids.length, lotGroup});
  } catch (error) {
    return handleRouteError('POST /api/lots', error);
  }
}
