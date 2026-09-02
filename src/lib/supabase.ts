import 'server-only';

import {createClient, type SupabaseClient} from '@supabase/supabase-js';

import {getSupabaseConfig} from './config';

/**
 * One server-side client for the whole app. The key never crosses to the
 * browser: every read and write goes through a route handler.
 */
let cached: SupabaseClient | null = null;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Set SUPABASE_URL and either ' +
        'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PUBLISHABLE_KEY in .env.local.',
    );
    this.name = 'SupabaseNotConfiguredError';
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function supabase(): SupabaseClient {
  if (cached) return cached;
  const config = getSupabaseConfig();
  if (!config) throw new SupabaseNotConfiguredError();

  cached = createClient(config.url, config.key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });
  return cached;
}

export function bucketName(): string {
  return getSupabaseConfig()?.bucket ?? 'item-photos';
}

/** Signed URLs for a batch of derivative paths. Private bucket, so nothing is public. */
export async function signPaths(
  paths: string[],
  expiresInSeconds = 60 * 60,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return signed;

  const {data, error} = await supabase()
    .storage.from(bucketName())
    .createSignedUrls(unique, expiresInSeconds);

  if (error || !data) return signed;
  for (const entry of data) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}
