/**
 * Browser-side API helpers. Everything the UI knows about the server goes
 * through here, so error handling is written once and the components stay
 * about the screen rather than about fetch.
 */

import type {
  AppraisalJob,
  Item,
  ItemWithImages,
  ListingChannel,
  ListingCopy,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : {'content-type': 'application/json', ...(init?.headers ?? {})},
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as {error: unknown}).error)
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

// --- items ------------------------------------------------------------------

export interface ItemsResponse {
  items: ItemWithImages[];
  total: number;
  summary: {
    count: number;
    totalLocal: number;
    totalIntl: number;
    byStatus: Record<string, number>;
  };
}

export function fetchItems(params: URLSearchParams): Promise<ItemsResponse> {
  return request<ItemsResponse>(`/api/items?${params.toString()}`);
}

export function fetchItem(
  id: string,
): Promise<{item: ItemWithImages; job: AppraisalJob | null}> {
  return request(`/api/items/${id}`);
}

export function patchItem(
  id: string,
  patch: Partial<Item>,
): Promise<{item: ItemWithImages}> {
  return request(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteItem(id: string): Promise<{ok: true}> {
  return request(`/api/items/${id}`, {method: 'DELETE'});
}

export function bulkPatch(
  ids: string[],
  patch: Partial<Item>,
): Promise<{ok: true; updated: number}> {
  return request('/api/items/bulk', {
    method: 'PATCH',
    body: JSON.stringify({ids, patch}),
  });
}

// --- ingest -----------------------------------------------------------------

export interface IngestResponse {
  item: ItemWithImages;
  jobId: string | null;
  lotNumber: number;
  warnings: string[];
}

export function ingest(
  files: File[],
  options: {hint?: string; primaryIndex?: number} = {},
): Promise<IngestResponse> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  if (options.hint) form.append('hint', options.hint);
  form.append('primaryIndex', String(options.primaryIndex ?? 0));
  return request('/api/items', {method: 'POST', body: form});
}

// --- appraisal --------------------------------------------------------------

export interface QueueJob extends AppraisalJob {
  items: {lot_number: number; title_nl: string | null} | null;
  /** Signed URL for the primary derivative, so the strip is scannable by eye. */
  thumbUrl: string | null;
}

export function fetchQueue(): Promise<{
  jobs: QueueJob[];
  queue: {pending: number; running: number};
}> {
  return request('/api/appraise');
}

export function requeueAppraisal(
  itemId: string,
  instruction?: string,
): Promise<{jobId: string}> {
  return request('/api/appraise', {
    method: 'POST',
    body: JSON.stringify({itemId, instruction}),
  });
}

// --- listing ----------------------------------------------------------------

export function generateListing(
  itemId: string,
  channel: ListingChannel,
  regenerate = false,
): Promise<{copy: ListingCopy; cached: boolean}> {
  return request(`/api/listing/${itemId}`, {
    method: 'POST',
    body: JSON.stringify({channel, regenerate}),
  });
}

export function saveListing(
  itemId: string,
  channel: ListingChannel,
  copy: {title: string; description: string; price: number | null},
): Promise<{ok: true}> {
  return request(`/api/listing/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({channel, ...copy}),
  });
}

// --- system -----------------------------------------------------------------

export interface ArchiveStatus {
  archiveRoot: string;
  isReady: boolean;
  isMissing: boolean;
  freeBytes: number | null;
  totalBytes: number | null;
  archivedCount: number | null;
  problem: string | null;
}

export function fetchArchiveStatus(): Promise<ArchiveStatus> {
  return request('/api/drive');
}

export interface AppSettings {
  archiveRoot: string;
  derivativeMaxPx: number;
  derivativeQuality: number;
  keepOriginals: true;
}

export interface SettingsResponse {
  settings: AppSettings;
  archive: ArchiveStatus;
  supabase: {
    configured: boolean;
    url: string | null;
    bucket: string | null;
    keyKind: 'service_role' | 'publishable' | null;
  };
  appraisal: {model: string; auth: 'api_key' | 'claude_code_subscription'};
  platform: string;
}

export function fetchSettings(): Promise<SettingsResponse> {
  return request('/api/settings');
}

export function saveSettings(
  patch: Partial<AppSettings>,
): Promise<{settings: AppSettings; archive: ArchiveStatus}> {
  return request('/api/settings', {method: 'PATCH', body: JSON.stringify(patch)});
}

/**
 * Opens the operating system's own folder chooser. The dialog is shown by the
 * server process — a browser can never hand back an absolute path — which works
 * because the server and the person clicking are the same machine.
 *
 * Resolves with `path: null` when the dialog was cancelled.
 */
export function browseForFolder(
  startFrom?: string,
): Promise<{path: string | null; unsupported?: string}> {
  return request('/api/settings', {
    method: 'POST',
    body: JSON.stringify({action: 'pick', path: startFrom}),
  });
}

/** Creates the archive folder. Explicit click only — ingest never does this. */
export function createArchiveFolder(
  target: string,
): Promise<{archive: ArchiveStatus}> {
  return request('/api/settings', {
    method: 'POST',
    body: JSON.stringify({action: 'create', path: target}),
  });
}

export function fetchMeta(): Promise<{categories: string[]; lotGroups: string[]}> {
  return request('/api/meta');
}

export function regenerateSidecars(
  itemId?: string,
): Promise<{written: number; skipped: Array<{lot: number; reason: string}>}> {
  return request('/api/sidecars', {
    method: 'POST',
    body: JSON.stringify(itemId ? {itemId} : {}),
  });
}

/** Copies text and reports whether it landed, so the UI can say so. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
