import 'server-only';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Settings resolution, in precedence order:
 *
 *   1. .work/settings.json  — written by the Settings screen
 *   2. .env.local           — the fallback, and the only place secrets live
 *   3. the defaults below
 *
 * Secrets (Supabase keys) are env-only on purpose. The Settings screen can move
 * where the archive lives; it cannot hand a service-role key to a JSON file that
 * something might later decide to log.
 */

export interface Settings {
  /**
   * Where full-resolution originals are filed. Photographs are dragged straight
   * onto the Ingest screen, so this is an output directory only — nothing is
   * ever read from it by the app, and nothing is ever deleted from it.
   */
  archiveRoot: string;
  /** Long-edge px for web copies. */
  derivativeMaxPx: number;
  /** JPEG quality for web copies. */
  derivativeQuality: number;
  /**
   * Always true. Originals under the archive root are write-once; this exists
   * so that guarantee is stated rather than assumed.
   */
  keepOriginals: true;
}

/**
 * Somewhere real, on the machine, that exists or can be created with one
 * click — rather than a drive letter that may never be plugged in. Point it at
 * the external SSD from the Settings screen once there is one.
 */
export function defaultArchiveRoot(): string {
  return path.join(os.homedir(), 'Documents', 'Weldam House Archive');
}

const DEFAULTS = {
  derivativeMaxPx: 1600,
  derivativeQuality: 82,
} as const;

/** Repo-local scratch space. Disposable: everything here regenerates from the archive. */
export const WORK_DIR = path.join(process.cwd(), '.work');
const SETTINGS_FILE = path.join(WORK_DIR, 'settings.json');

/** Settings the UI is allowed to change. */
export type SettingsPatch = Partial<Omit<Settings, 'keepOriginals'>>;

function numberFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readOverrides(): Promise<SettingsPatch> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as SettingsPatch;
  } catch {
    // No overrides yet, or the file is unreadable. Env wins either way.
    return {};
  }
}

export async function getSettings(): Promise<Settings> {
  const overrides = await readOverrides();

  return {
    archiveRoot:
      clean(overrides.archiveRoot) ??
      clean(process.env.ARCHIVE_ROOT) ??
      defaultArchiveRoot(),
    derivativeMaxPx: clampInt(
      overrides.derivativeMaxPx ??
        numberFromEnv('DERIVATIVE_MAX_PX', DEFAULTS.derivativeMaxPx),
      320,
      4096,
      DEFAULTS.derivativeMaxPx,
    ),
    derivativeQuality: clampInt(
      overrides.derivativeQuality ??
        numberFromEnv('DERIVATIVE_QUALITY', DEFAULTS.derivativeQuality),
      40,
      100,
      DEFAULTS.derivativeQuality,
    ),
    keepOriginals: true,
  };
}

export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  await fs.mkdir(WORK_DIR, {recursive: true});
  const current = await readOverrides();
  const next: SettingsPatch = {...current};

  if (patch.archiveRoot !== undefined) next.archiveRoot = patch.archiveRoot.trim();
  if (patch.derivativeMaxPx !== undefined) {
    next.derivativeMaxPx = clampInt(patch.derivativeMaxPx, 320, 4096, 1600);
  }
  if (patch.derivativeQuality !== undefined) {
    next.derivativeQuality = clampInt(patch.derivativeQuality, 40, 100, 82);
  }

  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return getSettings();
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function clampInt(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// --- Supabase (env only) ----------------------------------------------------

export interface SupabaseConfig {
  url: string;
  key: string;
  bucket: string;
  /** True when running on the service-role key, which bypasses RLS. */
  isServiceRole: boolean;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const key = serviceKey || publishable;
  if (!url || !key) return null;
  return {
    url,
    key,
    bucket: process.env.SUPABASE_BUCKET?.trim() || 'item-photos',
    isServiceRole: Boolean(serviceKey),
  };
}

// --- Appraisal --------------------------------------------------------------

export function getAppraisalConfig() {
  return {
    model: process.env.APPRAISAL_MODEL?.trim() || 'claude-opus-5',
    concurrency: numberFromEnv('APPRAISAL_CONCURRENCY', 2),
    /**
     * Empty means "use the local Claude Code CLI credentials". The Agent SDK
     * picks those up on its own; setting a key here switches to metered API
     * billing instead.
     */
    apiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
  };
}
