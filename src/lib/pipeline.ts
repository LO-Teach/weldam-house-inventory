import 'server-only';

import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import {WORK_DIR, getSettings} from './config';
import {assertArchiveReady} from './drive';
import {bucketName, supabase} from './supabase';

/**
 * ============================================================================
 * THE FILE PIPELINE.
 *
 * Photographs are dragged straight onto the Ingest screen from wherever they
 * live — the camera card, a download folder, the desktop. The app copies them
 * into the archive and never touches the source.
 *
 * THIS MODULE DELETES NOTHING. Not the files you dropped, not anything in the
 * archive, not anything anywhere. The only removal it can perform is
 * discardLotFolder(), which unwinds a lot folder this same run just created
 * and whose database row is being rolled back.
 *
 * The rules it does enforce:
 *
 *   1. Nothing is written unless the archive root is genuinely reachable.
 *      There is no fallback to some other directory. A missing folder is an
 *      error — that guarantee is what makes it safe to point this at an
 *      external drive later.
 *   2. Every original is written to a temporary name, moved into place, then
 *      read back and hashed. A copy whose hash does not match the source is
 *      moved to quarantine/ and the whole ingest fails loudly.
 *   3. Originals under the archive root are write-once. Nothing here modifies
 *      or renames an existing archived file.
 *   4. Only derivatives go to Supabase. Camera originals never leave the disk.
 *
 * Everything here is exercised by scripts/test-pipeline.mjs against throwaway
 * files, which is the only sane way to change it.
 * ============================================================================
 */

/** More than this in one drop almost certainly means two objects got mixed. */
export const MAX_FILES_PER_DROP = 12;
/** A camera RAW blows past this; a phone or export JPEG never does. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** What sharp can actually open. RAW is deliberately not on the list. */
export const ACCEPTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/avif',
  'image/heic',
  'image/heif',
] as const;

export interface IncomingFile {
  originalName: string;
  bytes: Buffer;
  mimeType: string;
}

export interface ArchivedImage {
  storagePath: string;
  archivePath: string;
  originalName: string;
  sha256: string;
  bytes: number;
  sortOrder: number;
  isPrimary: boolean;
  /** Set when the derivative could not be produced; the original is still safe. */
  derivativeError: string | null;
}

export interface IngestReport {
  lotNumber: number;
  images: ArchivedImage[];
  warnings: string[];
}

const SUFFIXES = 'abcdefghijkl';

export function lotFolderName(lotNumber: number): string {
  return String(lotNumber).padStart(4, '0');
}

export function validateDrop(files: IncomingFile[]): string[] {
  const problems: string[] = [];
  if (files.length === 0) problems.push('No files in the drop.');
  if (files.length > MAX_FILES_PER_DROP) {
    problems.push(
      `${files.length} files in one drop. A drop is one object — more than ${MAX_FILES_PER_DROP} shots usually means two objects got mixed together.`,
    );
  }
  for (const file of files) {
    if (!ACCEPTED_MIME.includes(file.mimeType as (typeof ACCEPTED_MIME)[number])) {
      problems.push(
        `${file.originalName} is ${file.mimeType || 'an unknown type'}. Ingest takes JPEG, PNG, WebP, TIFF, AVIF or HEIC — export camera RAW to JPEG first.`,
      );
    }
    if (file.bytes.byteLength > MAX_FILE_BYTES) {
      problems.push(
        `${file.originalName} is ${(file.bytes.byteLength / 1024 / 1024).toFixed(1)} MB, over the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`,
      );
    }
  }
  return problems;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function sha256File(filePath: string): Promise<string> {
  return sha256(await fs.readFile(filePath));
}

/**
 * Archive one dropped group, derive web copies, and upload those. Returns the
 * rows the caller should insert into item_images. Throws before touching
 * anything if the archive folder is not ready.
 */
export async function ingestGroup(
  lotNumber: number,
  files: IncomingFile[],
  primaryIndex = 0,
): Promise<IngestReport> {
  const settings = await getSettings();
  const {archiveRoot} = await assertArchiveReady();

  const lot = lotFolderName(lotNumber);
  const lotDir = path.join(archiveRoot, 'archive', lot);
  const quarantineDir = path.join(archiveRoot, 'quarantine', lot);
  const workDir = path.join(WORK_DIR, 'derivatives', lot);

  await fs.mkdir(lotDir, {recursive: true});
  await fs.mkdir(workDir, {recursive: true});

  const images: ArchivedImage[] = [];
  const warnings: string[] = [];

  for (const [index, file] of files.entries()) {
    const suffix = SUFFIXES[index] ?? `x${index}`;
    const ext = extensionFor(file.originalName, file.mimeType);
    const archiveName = `${lot}_${suffix}${ext}`;
    const destination = path.join(lotDir, archiveName);
    const sourceHash = sha256(file.bytes);

    // --- 1. copy ----------------------------------------------------------
    // Written to a .part first so a crash mid-write can never leave a
    // truncated file sitting at the real archive name looking finished.
    const partial = `${destination}.part`;
    await fs.writeFile(partial, file.bytes);
    await fs.rename(partial, destination);

    // --- 2. verify --------------------------------------------------------
    const writtenHash = await sha256File(destination);
    if (writtenHash !== sourceHash) {
      await fs.mkdir(quarantineDir, {recursive: true});
      const quarantined = path.join(quarantineDir, archiveName);
      await fs.rename(destination, quarantined).catch(() => undefined);
      throw new Error(
        `Checksum mismatch archiving ${file.originalName}. The bad copy was moved to quarantine/${lot}/${archiveName}, and the file you dropped was not touched. The drive may be failing — check it before ingesting more.`,
      );
    }

    // --- 3. derive --------------------------------------------------------
    const storagePath = `${lot}_${suffix}.jpg`;
    const derivativePath = path.join(workDir, storagePath);
    let derivativeError: string | null = null;

    try {
      await sharp(file.bytes)
        // .rotate() with no argument bakes in the EXIF orientation and then
        // drops it, which is the "strip EXIF except orientation" rule: the
        // pixels come out the right way up carrying no camera metadata.
        .rotate()
        .resize({
          width: settings.derivativeMaxPx,
          height: settings.derivativeMaxPx,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({quality: settings.derivativeQuality, mozjpeg: true})
        .toFile(derivativePath);
    } catch (error) {
      derivativeError = error instanceof Error ? error.message : String(error);
      warnings.push(
        `Could not build a web copy of ${file.originalName}: ${derivativeError}. The original is archived and safe; the appraiser will not see this shot.`,
      );
    }

    // --- 4. upload the derivative, never the original ---------------------
    if (!derivativeError) {
      const derivativeBytes = await fs.readFile(derivativePath);
      const {error} = await supabase()
        .storage.from(bucketName())
        .upload(storagePath, derivativeBytes, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (error) {
        derivativeError = error.message;
        warnings.push(
          `Upload failed for ${storagePath}: ${error.message}. The original is archived; re-run the upload later.`,
        );
      }
    }

    images.push({
      storagePath,
      archivePath: path.posix.join('archive', lot, archiveName),
      originalName: file.originalName,
      sha256: sourceHash,
      bytes: file.bytes.byteLength,
      sortOrder: index,
      isPrimary: index === primaryIndex,
      derivativeError,
    });
  }

  return {lotNumber, images, warnings};
}

function extensionFor(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName) return fromName;
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/tiff': '.tif',
    'image/avif': '.avif',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };
  return map[mimeType] ?? '.bin';
}

/**
 * Unwinds the filesystem side of a failed ingest.
 *
 * The only removal in this module, and a tightly bounded one: the lot folder
 * this same run created, for a lot whose database row is being deleted in the
 * same breath. It never runs against a lot that already existed, and the files
 * the user dropped are somewhere else entirely.
 */
export async function discardLotFolder(lotNumber: number): Promise<void> {
  try {
    const {archiveRoot} = await assertArchiveReady();
    const lot = lotFolderName(lotNumber);
    await fs.rm(path.join(archiveRoot, 'archive', lot), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(WORK_DIR, 'derivatives', lot), {
      recursive: true,
      force: true,
    });
  } catch {
    // The archive went away mid-failure. Leaving the folder is the safe outcome.
  }
}
