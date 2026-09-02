import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {getItem} from '@/src/lib/items';
import {renameLotFolder} from '@/src/lib/pipeline';
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

    const db = supabase();
    const {data: existing} = await db
      .from('items')
      .select('lot_number, title_nl, title_en, archive_folder, sold_at, listed_at, status')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return jsonError('No such item.', 404);

    // Marking an item sold without a date leaves the books unreadable later.
    if (patch.status === 'sold' && patch.sold_at === undefined && !existing.sold_at) {
      patch.sold_at = new Date().toISOString();
    }

    // Moving into 'listed' starts the markdown clock. Only on the transition —
    // re-saving a listed item must not quietly reset it back to full price.
    if (
      patch.status === 'listed' &&
      existing.status !== 'listed' &&
      patch.listed_at === undefined &&
      !existing.listed_at
    ) {
      patch.listed_at = new Date().toISOString();
    }

    // Once the title is settled, the folder on disk takes its name, so the
    // archive is browsable without this app. Only the folder moves; the
    // originals inside keep their lot-numbered filenames forever.
    const nextTitle =
      (patch.title_nl as string | null | undefined) ??
      existing.title_nl ??
      (patch.title_en as string | null | undefined) ??
      existing.title_en ??
      null;

    const shouldRename =
      nextTitle &&
      (patch.status === 'appraised' ||
        patch.title_nl !== undefined ||
        patch.title_en !== undefined);

    let renameWarning: string | null = null;
    if (shouldRename) {
      try {
        const outcome = await renameLotFolder(
          existing.lot_number as number,
          (existing.archive_folder as string | null) ?? null,
          nextTitle,
        );
        if (outcome.folder !== existing.archive_folder) {
          patch.archive_folder = outcome.folder;
          if (outcome.renamed) {
            // Every stored path points inside the folder that just moved.
            await moveArchivePaths(
              id,
              (existing.archive_folder as string | null) ?? null,
              outcome.folder,
            );
          }
        }
      } catch (error) {
        // A missing archive is not a reason to refuse a database edit — the
        // rename is cosmetic and can be redone by saving again later.
        renameWarning =
          error instanceof Error ? error.message : 'Could not rename the lot folder.';
      }
    }

    const {error} = await db.from('items').update(patch).eq('id', id);
    if (error) return jsonError(error.message, 500);
    if (renameWarning) console.warn('[PATCH /api/items/[id]] rename:', renameWarning);

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

/**
 * Rewrites every archive_path for one item after its folder was renamed.
 *
 * The paths are stored relative to the archive root as archive/<folder>/<file>,
 * so only the middle segment moves. Done by rewriting each row rather than a
 * SQL replace, because a folder name can contain anything the title did.
 */
async function moveArchivePaths(
  itemId: string,
  fromFolder: string | null,
  toFolder: string,
): Promise<void> {
  const db = supabase();
  const {data} = await db
    .from('item_images')
    .select('id, archive_path')
    .eq('item_id', itemId);

  for (const row of data ?? []) {
    const current = row.archive_path as string | null;
    if (!current) continue;
    const file = current.split('/').pop();
    if (!file) continue;
    const next = ['archive', toFolder, file].join('/');
    if (next === current) continue;
    await db.from('item_images').update({archive_path: next}).eq('id', row.id);
  }
  void fromFolder;
}
