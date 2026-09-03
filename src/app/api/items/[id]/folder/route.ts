import path from 'node:path';

import type {NextRequest} from 'next/server';

import {assertArchiveReady} from '@/src/lib/drive';
import {handleRouteError, jsonError} from '@/src/lib/http';
import {lotFolderName} from '@/src/lib/pipeline';
import {revealFolder} from '@/src/lib/reveal';
import {supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opens this lot's photo folder in Explorer, so the photographs can be dragged
 * from there into a marketplace uploader.
 *
 * The path is resolved here from the archive root and the lot's own folder
 * name. Nothing path-shaped is accepted from the browser, which is what keeps
 * an endpoint that shells out from being a way to open anything on the disk.
 */
export async function POST(
  _request: NextRequest,
  // Spelled out rather than `RouteContext<'/api/items/[id]/folder'>` like its
  // siblings: that registry is generated at dev-server start, so a route added
  // while the server is up does not typecheck until it is restarted.
  ctx: {params: Promise<{id: string}>},
) {
  try {
    const {id} = await ctx.params;

    const {data: item, error} = await supabase()
      .from('items')
      .select('id, lot_number, archive_folder')
      .eq('id', id)
      .maybeSingle();

    if (error) return jsonError(error.message, 500);
    if (!item) return jsonError('No such item.', 404);

    const {archiveRoot} = await assertArchiveReady();
    const folder =
      (item.archive_folder as string | null) ||
      lotFolderName(item.lot_number as number);
    const target = path.join(archiveRoot, 'archive', folder);

    try {
      await revealFolder(target);
      return Response.json({path: target});
    } catch {
      // The lot folder is missing — renamed by hand, or the archive moved.
      // Opening its parent is more use than an error with nothing to click.
      const parent = path.join(archiveRoot, 'archive');
      await revealFolder(parent);
      return Response.json({
        path: parent,
        note: `No folder called "${folder}" — opened the archive instead.`,
      });
    }
  } catch (error) {
    return handleRouteError('POST /api/items/[id]/folder', error);
  }
}
