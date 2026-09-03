import 'server-only';

import {renameLotFolder} from './pipeline';
import {supabase} from './supabase';

/**
 * Names a lot's folder after its title and moves every stored path with it.
 *
 * Two callers need this and must not drift apart: the item PATCH route, when a
 * human hits Confirm, and the appraisal queue, when an item auto-confirms
 * because its questions have all been answered. Before this was shared, the
 * auto-confirmed items — the ones that got the most human attention — were
 * exactly the ones left with bare lot numbers on disk.
 *
 * Returns the folder name the database should record, or null when nothing
 * needed doing. Never throws: a missing archive is a reason to skip a cosmetic
 * rename, not to fail the save that triggered it.
 */
export async function applyLotFolderName(
  itemId: string,
  lotNumber: number,
  currentFolder: string | null,
  title: string | null,
): Promise<string | null> {
  if (!title?.trim()) return null;

  try {
    const outcome = await renameLotFolder(lotNumber, currentFolder, title);
    if (outcome.folder === currentFolder) return null;
    if (outcome.renamed) await moveArchivePaths(itemId, outcome.folder);
    return outcome.folder;
  } catch (error) {
    console.warn(
      `[archive-folder] could not rename lot ${lotNumber}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Rewrites every archive_path for one item after its folder moved.
 *
 * Paths are stored relative to the archive root as `archive/<folder>/<file>`,
 * so only the middle segment changes. Done row by row rather than with a SQL
 * replace, because a folder name can contain anything the title did.
 */
export async function moveArchivePaths(
  itemId: string,
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
}
