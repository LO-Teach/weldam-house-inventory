import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError} from '@/src/lib/http';
import {attachImages} from '@/src/lib/items';
import {addImagesToLot, validateDrop, type IncomingFile} from '@/src/lib/pipeline';
import {supabase} from '@/src/lib/supabase';
import type {Item} from '@/src/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Adds photographs to a lot that already exists.
 *
 * Without this the appraiser's whole questioning loop is a dead end: it says
 * "photograph the base", and the only way to comply is to delete the item and
 * re-ingest it, which burns the lot number and loses every edit. Every shot
 * added here is a copy — the file you dragged in is not moved or deleted.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/items/[id]/images'>) {
  try {
    const {id} = await ctx.params;
    const db = supabase();

    const {data: item, error: itemError} = await db
      .from('items')
      .select('id, lot_number, archive_folder')
      .eq('id', id)
      .maybeSingle();

    if (itemError) return jsonError(itemError.message, 500);
    if (!item) return jsonError('No such item.', 404);

    const form = await request.formData();
    const files: IncomingFile[] = [];
    for (const entry of form.getAll('files')) {
      if (!(entry instanceof File)) continue;
      files.push({
        originalName: entry.name,
        bytes: Buffer.from(await entry.arrayBuffer()),
        mimeType: entry.type,
      });
    }

    const problems = validateDrop(files);
    if (problems.length > 0) {
      return Response.json({error: problems.join(' '), problems}, {status: 422});
    }

    // Continue the letter sequence rather than restarting it, so a lot never
    // ends up with two files called 0001_a.jpg.
    const {data: existing} = await db
      .from('item_images')
      .select('sort_order')
      .eq('item_id', id)
      .order('sort_order', {ascending: false})
      .limit(1);

    const startIndex = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

    const report = await addImagesToLot(
      item.lot_number as number,
      (item.archive_folder as string | null) ?? null,
      files,
      startIndex,
    );

    const {error: insertError} = await db.from('item_images').insert(
      report.images.map((image) => ({
        item_id: id,
        storage_path: image.storagePath,
        archive_path: image.archivePath,
        original_name: image.originalName,
        sha256: image.sha256,
        bytes: image.bytes,
        is_primary: image.isPrimary,
        sort_order: image.sortOrder,
      })),
    );
    if (insertError) {
      return jsonError(`Could not record the new images: ${insertError.message}`, 500);
    }

    const {data: updated} = await db
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const [withImages] = await attachImages([updated as Item]);

    return Response.json(
      {item: withImages, added: report.images.length, warnings: report.warnings},
      {status: 201},
    );
  } catch (error) {
    return handleRouteError('POST /api/items/[id]/images', error);
  }
}
