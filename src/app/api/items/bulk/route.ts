import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {bulkPatchSchema} from '@/src/lib/schema';
import {supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bulk field update from the inventory table's selection toolbar. */
export async function PATCH(request: NextRequest) {
  try {
    const parsed = bulkPatchSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid bulk update: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      );
    }

    const {ids, patch} = parsed.data;
    const update = {...patch} as Record<string, unknown>;
    if (Object.keys(update).length === 0) return jsonError('Nothing to update.');

    if (update.status === 'sold' && update.sold_at === undefined) {
      update.sold_at = new Date().toISOString();
    }

    const {error, count} = await supabase()
      .from('items')
      .update(update, {count: 'exact'})
      .in('id', ids);

    if (error) return jsonError(error.message, 500);
    return Response.json({ok: true, updated: count ?? ids.length});
  } catch (error) {
    return handleRouteError('PATCH /api/items/bulk', error);
  }
}
