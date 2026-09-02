import type {NextRequest} from 'next/server';

import {handleRouteError, readJson} from '@/src/lib/http';
import {regenerateSidecars} from '@/src/lib/sidecar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rewrites item.md across the archive from the database. Pass `itemId` to do
 * one lot. Sidecars are generated output; nothing here reads one back in.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request).catch(() => ({}))) as {itemId?: string};
    const report = await regenerateSidecars(body.itemId);
    return Response.json(report);
  } catch (error) {
    return handleRouteError('POST /api/sidecars', error);
  }
}
