import 'server-only';

import fs from 'node:fs/promises';
import {statfs} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';

import {getSettings} from './config';

const statfsAsync = promisify(statfs);

export interface ArchiveStatus {
  /** Where originals are filed. */
  archiveRoot: string;
  /** True only when the archive root exists AND is writable. */
  isReady: boolean;
  /**
   * True when the folder simply is not there yet — as opposed to being there
   * and unusable. The UI offers to create it in that case; everything else is
   * a problem the user has to look at.
   */
  isMissing: boolean;
  freeBytes: number | null;
  totalBytes: number | null;
  /** How many object folders are already in archive/. */
  archivedCount: number | null;
  /** Non-empty when ingest must be refused. */
  problem: string | null;
}

/**
 * The guard that stands between the app and half an archive in the wrong place.
 *
 * Once the archive root points at an external drive, an unplugged drive is an
 * error and never a reason to quietly write to the internal disk instead — a
 * silent fallback is how half an archive ends up in two places. Before that,
 * the folder is an ordinary directory that the Settings screen can create with
 * one click.
 */
export async function getArchiveStatus(): Promise<ArchiveStatus> {
  const {archiveRoot} = await getSettings();

  const base: ArchiveStatus = {
    archiveRoot,
    isReady: false,
    isMissing: false,
    freeBytes: null,
    totalBytes: null,
    archivedCount: null,
    problem: null,
  };

  if (!archiveRoot) {
    return {
      ...base,
      isMissing: true,
      problem: 'No archive folder chosen yet. Pick one on the Settings screen.',
    };
  }

  try {
    const stats = await fs.stat(archiveRoot);
    if (!stats.isDirectory()) {
      return {...base, problem: `${archiveRoot} exists but is not a folder.`};
    }
  } catch {
    return {
      ...base,
      isMissing: true,
      problem: `${archiveRoot} does not exist. Create it from Settings, or pick a different folder. Ingest stays disabled until it is there — if this path is on a drive that is currently unplugged, nothing will be written to the internal disk instead.`,
    };
  }

  try {
    await fs.access(archiveRoot, fs.constants.W_OK);
  } catch {
    return {...base, problem: `${archiveRoot} is not writable.`};
  }

  const [freeSpace, archivedCount] = await Promise.all([
    readFreeSpace(archiveRoot),
    countArchiveFolders(archiveRoot),
  ]);

  return {
    ...base,
    isReady: true,
    freeBytes: freeSpace?.free ?? null,
    totalBytes: freeSpace?.total ?? null,
    archivedCount,
    problem: null,
  };
}

/** Throws unless the archive is genuinely usable. Called before every write. */
export async function assertArchiveReady(): Promise<{archiveRoot: string}> {
  const status = await getArchiveStatus();
  if (!status.isReady) {
    throw new Error(status.problem ?? 'The archive folder is not available.');
  }
  return {archiveRoot: status.archiveRoot};
}

/**
 * Creates the archive folder. Only ever called from an explicit click on the
 * Settings screen — never as a silent fallback during ingest, which is the
 * whole point of the guard above.
 */
export async function createArchiveRoot(target: string): Promise<ArchiveStatus> {
  const resolved = path.resolve(target.trim());
  if (!resolved) throw new Error('No folder path given.');
  await fs.mkdir(path.join(resolved, 'archive'), {recursive: true});
  return getArchiveStatus();
}

async function readFreeSpace(
  target: string,
): Promise<{free: number; total: number} | null> {
  try {
    const info = await statfsAsync(target);
    return {
      free: Number(info.bavail) * Number(info.bsize),
      total: Number(info.blocks) * Number(info.bsize),
    };
  } catch {
    return null;
  }
}

async function countArchiveFolders(archiveRoot: string): Promise<number | null> {
  try {
    const entries = await fs.readdir(path.join(archiveRoot, 'archive'), {
      withFileTypes: true,
    });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    // archive/ has not been created yet. Zero is the honest answer.
    return 0;
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
