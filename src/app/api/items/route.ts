import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError} from '@/src/lib/http';
import {attachImages, listItems} from '@/src/lib/items';
import {
  ingestGroup,
  discardLotFolder,
  validateDrop,
  type IncomingFile,
} from '@/src/lib/pipeline';
import {enqueueAppraisal} from '@/src/lib/queue';
import {listItemsQuerySchema} from '@/src/lib/schema';
import {supabase} from '@/src/lib/supabase';
import type {Item, ItemFacts} from '@/src/lib/types';

// The pipeline touches the filesystem and spawns sharp; nothing here can run on
// the edge or be prerendered.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const parsed = listItemsQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    if (!parsed.success) {
      return jsonError(`Bad query: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
    }
    return Response.json(await listItems(parsed.data));
  } catch (error) {
    return handleRouteError('GET /api/items', error);
  }
}

/**
 * Ingest. Takes a multipart drop of one object's photographs and runs the whole
 * file pipeline: allocate a lot, archive the originals, verify by checksum,
 * clear the matching inbox files, derive web copies, upload those, record the
 * rows, and queue the appraisal.
 *
 * The lot number comes from inserting the item first — `lot_number` is a serial,
 * so the database is what allocates it and two concurrent drops cannot collide.
 * If the file work then fails, the row is deleted again rather than left behind
 * as a phantom draft.
 */
export async function POST(request: NextRequest) {
  let lotNumber: number | null = null;
  let itemId: string | null = null;

  try {
    const form = await request.formData();
    const entries = form.getAll('files');
    const hint = String(form.get('hint') ?? '').trim();
    const primaryIndex = Number(form.get('primaryIndex') ?? 0) || 0;
    const shouldAppraise = String(form.get('appraise') ?? 'true') !== 'false';

    const files: IncomingFile[] = [];
    for (const entry of entries) {
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

    const db = supabase();
    const facts: ItemFacts = hint ? {hint} : {};

    const {data: created, error: createError} = await db
      .from('items')
      .insert({status: 'draft', facts})
      .select('*')
      .single();

    if (createError || !created) {
      return jsonError(
        `Could not create the draft item: ${createError?.message ?? 'no row returned'}`,
        500,
      );
    }

    itemId = created.id as string;
    lotNumber = created.lot_number as number;

    const report = await ingestGroup(lotNumber, files, primaryIndex);

    const {error: imageError} = await db.from('item_images').insert(
      report.images.map((image) => ({
        item_id: itemId,
        storage_path: image.storagePath,
        archive_path: image.archivePath,
        original_name: image.originalName,
        sha256: image.sha256,
        bytes: image.bytes,
        is_primary: image.isPrimary,
        sort_order: image.sortOrder,
      })),
    );
    if (imageError) throw new Error(`Could not record images: ${imageError.message}`);

    // Appraise against the derivatives, not the originals: at appraisal
    // resolution a 10 MB file buys nothing and costs time on every request.
    let jobId: string | null = null;
    if (shouldAppraise && report.images.some((image) => !image.derivativeError)) {
      jobId = await enqueueAppraisal(itemId);
    }

    const [item] = await attachImages([created as Item]);

    return Response.json(
      {item, jobId, lotNumber, warnings: report.warnings},
      {status: 201},
    );
  } catch (error) {
    // Roll back the draft row and the lot folder this run created. The files
    // the user dropped are untouched — they were copied, never moved.
    if (itemId) {
      await supabase().from('items').delete().eq('id', itemId).then(
        () => undefined,
        () => undefined,
      );
    }
    if (lotNumber != null) await discardLotFolder(lotNumber);
    return handleRouteError('POST /api/items', error);
  }
}
