import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {getItem} from '@/src/lib/items';
import {itemPatchSchema} from '@/src/lib/schema';
import {bucketName, supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, ctx: RouteContext<'/api/items/[id]'>) {
  try {
    const {id} = await ctx.params;
    const item = await getItem(id);
    if (!item) return jsonError('No such item.', 404);

    // The most recent job comes along for the ride: Review needs it to show a
    // parse failure's raw output rather than pretending the appraisal never
    // happened.
    const {data: job} = await supabase()
      .from('appraisal_jobs')
      .select('*')
      .eq('item_id', id)
      .order('created_at', {ascending: false})
      .limit(1)
      .maybeSingle();

    return Response.json({item, job: job ?? null});
  } catch (error) {
    return handleRouteError('GET /api/items/[id]', error);
  }
}

export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/items/[id]'>) {
  try {
    const {id} = await ctx.params;
    const parsed = itemPatchSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid update: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      );
    }

    const patch = {...parsed.data} as Record<string, unknown>;
    if (Object.keys(patch).length === 0) {
      return jsonError('Nothing to update.');
    }

    // Marking an item sold without a date leaves the books unreadable later.
    if (patch.status === 'sold' && patch.sold_at === undefined) {
      const {data: existing} = await supabase()
        .from('items')
        .select('sold_at')
        .eq('id', id)
        .maybeSingle();
      if (!existing?.sold_at) patch.sold_at = new Date().toISOString();
    }

    const {error} = await supabase().from('items').update(patch).eq('id', id);
    if (error) return jsonError(error.message, 500);

    const item = await getItem(id);
    if (!item) return jsonError('No such item.', 404);
    return Response.json({item});
  } catch (error) {
    return handleRouteError('PATCH /api/items/[id]', error);
  }
}

/**
 * Deletes the database record and the web copies in the bucket.
 *
 * It does NOT touch the archive. Originals under ARCHIVE_ROOT are write-once;
 * removing an item here means "stop tracking this", not "destroy the
 * photographs". If the lot really should go, delete the folder by hand — that
 * way it takes a deliberate act rather than a stray click in a table.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/items/[id]'>) {
  try {
    const {id} = await ctx.params;
    const db = supabase();

    const {data: images} = await db
      .from('item_images')
      .select('storage_path')
      .eq('item_id', id);

    const paths = (images ?? []).map((row) => row.storage_path as string);
    if (paths.length > 0) {
      await db.storage.from(bucketName()).remove(paths);
    }

    // item_images and appraisal_jobs cascade from the items row.
    const {error} = await db.from('items').delete().eq('id', id);
    if (error) return jsonError(error.message, 500);

    return Response.json({
      ok: true,
      removedDerivatives: paths.length,
      note: 'The originals on the archive drive were left untouched.',
    });
  } catch (error) {
    return handleRouteError('DELETE /api/items/[id]', error);
  }
}
