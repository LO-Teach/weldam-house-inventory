import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError} from '@/src/lib/http';
import {queueDepth} from '@/src/lib/queue';
import {supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Poll one job. `raw_output` carries the model's text when parsing failed. */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<'/api/appraise/[jobId]'>,
) {
  try {
    const {jobId} = await ctx.params;
    const {data, error} = await supabase()
      .from('appraisal_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) return jsonError(error.message, 500);
    if (!data) return jsonError('No such job.', 404);
    return Response.json({job: data, queue: queueDepth()});
  } catch (error) {
    return handleRouteError('GET /api/appraise/[jobId]', error);
  }
}
