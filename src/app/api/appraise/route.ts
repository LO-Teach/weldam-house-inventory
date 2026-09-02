import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {appraiseRequestSchema} from '@/src/lib/schema';
import {adoptOrphanedJobs, enqueueAppraisal, queueDepth} from '@/src/lib/queue';
import {signPaths, supabase} from '@/src/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Enqueue an appraisal. Re-appraisal passes an instruction to address. */
export async function POST(request: NextRequest) {
  try {
    const parsed = appraiseRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid request: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }

    const {itemId, instruction, answers} = parsed.data;

    const {data: item} = await supabase()
      .from('items')
      .select('id')
      .eq('id', itemId)
      .maybeSingle();
    if (!item) return jsonError('No such item.', 404);

    const jobId = await enqueueAppraisal(itemId, {
      instruction: instruction ?? null,
      answers: answers?.map((a) => ({question: a.question, answer: a.answer})) ?? null,
    });
    return Response.json({jobId, queue: queueDepth()}, {status: 202});
  } catch (error) {
    return handleRouteError('POST /api/appraise', error);
  }
}

/**
 * Feeds the live queue strip on the Ingest screen.
 *
 * Adopting orphans here means a dev-server restart mid-batch resumes the moment
 * the screen is open again, rather than leaving a dozen items stuck on
 * "Appraising" forever.
 */
export async function GET() {
  try {
    await adoptOrphanedJobs();
    const db = supabase();

    const {data, error} = await db
      .from('appraisal_jobs')
      .select('id, item_id, status, error, created_at, items(lot_number, title_nl)')
      .order('created_at', {ascending: false})
      .limit(30);

    if (error) return jsonError(error.message, 500);

    const jobs = data ?? [];
    const itemIds = [...new Set(jobs.map((job) => job.item_id as string))];

    // One thumbnail per job, so the strip is scannable by picture rather than
    // by lot number. Primary shot first, falling back to the first image.
    const thumbs = new Map<string, string>();
    if (itemIds.length > 0) {
      const {data: images} = await db
        .from('item_images')
        .select('item_id, storage_path, is_primary, sort_order')
        .in('item_id', itemIds)
        .order('is_primary', {ascending: false})
        .order('sort_order', {ascending: true});

      const firstPath = new Map<string, string>();
      for (const image of images ?? []) {
        const key = image.item_id as string;
        if (!firstPath.has(key)) firstPath.set(key, image.storage_path as string);
      }
      const signed = await signPaths([...firstPath.values()]);
      for (const [itemId, storagePath] of firstPath) {
        const url = signed.get(storagePath);
        if (url) thumbs.set(itemId, url);
      }
    }

    return Response.json({
      jobs: jobs.map((job) => ({
        ...job,
        thumbUrl: thumbs.get(job.item_id as string) ?? null,
      })),
      queue: queueDepth(),
    });
  } catch (error) {
    return handleRouteError('GET /api/appraise', error);
  }
}
