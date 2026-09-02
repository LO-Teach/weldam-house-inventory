import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {bulkAppraiseRequestSchema} from '@/src/lib/schema';
import {enqueueAppraisal, queueDepth} from '@/src/lib/queue';
import {supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Re-appraise a whole set in one go.
 *
 * This is the other half of the calibration loop: tuning prompts/appraisal.md
 * is worth nothing until the existing inventory has been run through the new
 * prompt. Without this the only options are re-appraising a hundred items by
 * hand or living with two generations of pricing in one table.
 *
 * Answers already given to the appraiser's questions ride along automatically —
 * the queue reads them off each item — so nobody re-checks a base they have
 * already checked.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bulkAppraiseRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid request: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }

    const {ids, status, instruction} = parsed.data;
    if (!ids?.length && !status) {
      return jsonError('Pass either a list of ids or a status to re-appraise.');
    }

    let builder = supabase().from('items').select('id').order('lot_number');
    if (ids?.length) builder = builder.in('id', ids);
    if (status) builder = builder.eq('status', status);

    const {data, error} = await builder;
    if (error) return jsonError(error.message, 500);

    const targets = (data ?? []).map((row) => row.id as string);
    const jobIds: string[] = [];
    for (const itemId of targets) {
      jobIds.push(await enqueueAppraisal(itemId, {instruction: instruction ?? null}));
    }

    return Response.json(
      {queued: jobIds.length, jobIds, queue: queueDepth()},
      {status: 202},
    );
  } catch (error) {
    return handleRouteError('POST /api/appraise/bulk', error);
  }
}
