import 'server-only';

import {
  AppraisalOverloadedError,
  AppraisalParseError,
  appraise,
  isOverloaded,
} from './appraise';
import {getAppraisalConfig} from './config';
import {applyLotFolderName} from './archive-folder';
import {askFromRetail, floorFromAsk} from './pricing';
import {supabase} from './supabase';
import {
  formatDimensions,
  type AnsweredQuestion,
  type AppraisalQuestion,
  type ItemFacts,
} from './types';

/**
 * Folds this run's answers into everything answered before, newest winning on
 * a repeated id. Also absorbs answers that were only ever stored on the live
 * question list, so items created before `facts.answered` existed do not lose
 * what was already checked.
 */
function mergeAnswered(
  facts: ItemFacts,
  incoming: Array<{id?: string; question: string; answer: string}>,
): AnsweredQuestion[] {
  const byId = new Map<string, AnsweredQuestion>();

  for (const entry of facts.answered ?? []) {
    if (entry.answer?.trim()) byId.set(entry.id, entry);
  }

  for (const question of facts.questions ?? []) {
    if (!question.answer?.trim()) continue;
    if (byId.has(question.id)) continue;
    byId.set(question.id, {
      id: question.id,
      question: question.question,
      answer: question.answer,
      answered_at: new Date().toISOString(),
    });
  }

  for (const entry of incoming) {
    if (!entry.answer?.trim()) continue;
    const id = entry.id ?? entry.question.slice(0, 64);
    byId.set(id, {
      id,
      question: entry.question,
      answer: entry.answer,
      answered_at: new Date().toISOString(),
    });
  }

  return [...byId.values()];
}

/**
 * One user, one machine, one dev server. That rules out Redis and BullMQ; what
 * it does not rule out is losing the queue on a restart, so the durable part of
 * the state lives in the `appraisal_jobs` table and this module is only the
 * runner: an in-memory pump with a concurrency cap that re-adopts whatever the
 * table still says is outstanding.
 */

interface QueueEntry {
  jobId: string;
  itemId: string;
  instruction?: string | null;
  answers?: Array<{question: string; answer: string}> | null;
}

/**
 * Module state survives HMR in dev because it hangs off globalThis. Without
 * this, every save would spawn a second pump and double-run every job.
 */
const globalForQueue = globalThis as unknown as {
  __weldamQueue?: {
    pending: QueueEntry[];
    running: Set<string>;
    adopted: boolean;
  };
};

const state = (globalForQueue.__weldamQueue ??= {
  pending: [],
  running: new Set<string>(),
  adopted: false,
});

function concurrency(): number {
  const n = getAppraisalConfig().concurrency;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 8) : 2;
}

export interface EnqueueOptions {
  instruction?: string | null;
  answers?: Array<{question: string; answer: string}> | null;
}

/** Create the job row and put it in line. Returns the job id to poll. */
export async function enqueueAppraisal(
  itemId: string,
  options: EnqueueOptions = {},
): Promise<string> {
  const {data, error} = await supabase()
    .from('appraisal_jobs')
    .insert({item_id: itemId, status: 'queued'})
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Could not queue an appraisal: ${error?.message ?? 'no row returned'}`);
  }

  state.pending.push({
    jobId: data.id as string,
    itemId,
    instruction: options.instruction ?? null,
    answers: options.answers ?? null,
  });
  void pump();
  return data.id as string;
}

/**
 * Picks up jobs the table still calls queued or running. Called lazily from the
 * queue endpoints, so a dev-server restart mid-batch resumes instead of leaving
 * a dozen items stuck on "Appraising" forever.
 */
export async function adoptOrphanedJobs(): Promise<number> {
  if (state.adopted) return 0;
  state.adopted = true;

  const {data, error} = await supabase()
    .from('appraisal_jobs')
    .select('id, item_id, status')
    .in('status', ['queued', 'running']);

  if (error || !data) return 0;

  let adopted = 0;
  for (const row of data) {
    const jobId = row.id as string;
    if (state.running.has(jobId)) continue;
    if (state.pending.some((entry) => entry.jobId === jobId)) continue;
    // A job left in 'running' by a crashed process is not running anywhere.
    state.pending.push({jobId, itemId: row.item_id as string});
    adopted += 1;
  }

  if (adopted > 0) void pump();
  return adopted;
}

export function queueDepth(): {pending: number; running: number} {
  return {pending: state.pending.length, running: state.running.size};
}

function pump(): void {
  while (state.running.size < concurrency() && state.pending.length > 0) {
    const entry = state.pending.shift();
    if (!entry) break;
    state.running.add(entry.jobId);
    void runJob(entry).finally(() => {
      state.running.delete(entry.jobId);
      // Draining one slot may free the next; keep going until nothing is left.
      pump();
    });
  }
}

async function runJob(entry: QueueEntry): Promise<void> {
  const db = supabase();

  await db
    .from('appraisal_jobs')
    .update({status: 'running', error: null})
    .eq('id', entry.jobId);

  try {
    const {data: item, error: itemError} = await db
      .from('items')
      .select('id, lot_number, facts, archive_folder')
      .eq('id', entry.itemId)
      .single();

    if (itemError || !item) {
      throw new Error(`Item ${entry.itemId} is gone: ${itemError?.message ?? 'not found'}`);
    }

    const {data: images} = await db
      .from('item_images')
      .select('storage_path, sort_order, is_primary')
      .eq('item_id', entry.itemId)
      .order('is_primary', {ascending: false})
      .order('sort_order', {ascending: true});

    const storagePaths = (images ?? []).map((row) => row.storage_path as string);
    const facts = (item.facts ?? {}) as ItemFacts;

    // Everything ever answered by hand, plus whatever came in with this run.
    // Read from `facts.answered` rather than `facts.questions`, because the
    // question list empties out once the appraiser has nothing left to ask —
    // and the answers must outlive the questions that prompted them.
    const answered = mergeAnswered(facts, entry.answers ?? []);
    const answers = answered.map((entry) => ({
      question: entry.question,
      answer: entry.answer,
    }));

    const outcome = await appraise({
      lotNumber: item.lot_number as number,
      storagePaths,
      hint: facts.hint ?? null,
      instruction: entry.instruction ?? null,
      answers: answers.length > 0 ? answers : null,
    });

    const result = outcome.result;

    // The 80% / 50% rule lives in pricing.ts and nowhere else, so the model
    // only has to produce the one number that needs judgement.
    const askLocal = askFromRetail(result.retail_local);
    const askIntl = askFromRetail(result.retail_intl);

    const dimensions = formatDimensions(result);

    // A question that has already been answered keeps its answer rather than
    // arriving blank and being asked again.
    const answeredById = new Map(answered.map((entry) => [entry.id, entry.answer]));
    const questions: AppraisalQuestion[] = result.questions.map((q) => ({
      id: q.id,
      question: q.question,
      why: q.why,
      options: q.options,
      answer: answeredById.get(q.id) ?? null,
    }));

    /**
     * Nothing left to ask, and the run was driven by answers you gave: the
     * object is settled, so confirm it rather than parking it back in Review
     * for a second click that adds nothing.
     */
    const outstanding = questions.filter((q) => !q.answer?.trim()).length;
    const autoConfirm = answered.length > 0 && outstanding === 0;

    // Confirming is what names the folder on disk, so an auto-confirm has to do
    // it too or the archive quietly keeps bare lot numbers for exactly the items
    // that got the most attention.
    let renamedFolder: string | null = null;
    if (autoConfirm) {
      renamedFolder = await applyLotFolderName(
        entry.itemId,
        item.lot_number as number,
        (item.archive_folder as string | null) ?? null,
        result.title_nl,
      );
    }

    const nextFacts: ItemFacts = {
      ...facts,
      material: result.material,
      material_detail: result.material_detail,
      era: result.era,
      style: result.style,
      colour: result.colour,
      colour_detail: result.colour_detail,
      dimensions_cm: dimensions,
      dimensions_estimated: result.dimensions_estimated,
      marks_found: result.marks_found,
      marks_to_check: result.marks_to_check,
      condition: result.condition,
      condition_grade: result.condition_grade,
      shopify_category: result.shopify_category,
      maker: result.maker,
      reasoning: result.reasoning,
      questions,
      answered,
    };

    await db
      .from('items')
      .update({
        title_nl: result.title_nl,
        title_en: result.title_en,

        shopify_category: result.shopify_category,
        material: result.material,
        material_detail: result.material_detail,
        colour: result.colour,
        colour_detail: result.colour_detail,
        style: result.style,
        era: result.era,

        height_cm: result.height_cm,
        width_cm: result.width_cm,
        depth_cm: result.depth_cm,
        diameter_cm: result.diameter_cm,
        weight_g: result.weight_g,
        dimensions_cm: dimensions,

        maker: result.maker,
        marks_found: result.marks_found,
        marks_to_check: result.marks_to_check,
        condition_grade: result.condition_grade,
        condition: result.condition,
        confidence: result.confidence,

        retail_local: result.retail_local,
        ask_local: askLocal,
        floor_local: floorFromAsk(askLocal),
        retail_intl: result.retail_intl,
        ask_intl: askIntl,
        floor_intl: floorFromAsk(askIntl),

        facts: nextFacts,
        channel: result.channel,
        // An appraisal is normally a proposal, and Review is where a human
        // confirms it. The exception is an item whose questions have all been
        // answered and which the appraiser has nothing further to ask about —
        // that has already had the human pass, so a second Confirm click is
        // ceremony.
        status: autoConfirm ? 'appraised' : 'draft',
        ...(autoConfirm ? {archive_folder: renamedFolder ?? undefined} : {}),
      })
      .eq('id', entry.itemId);

    await db
      .from('appraisal_jobs')
      .update({
        status: 'done',
        error: null,
        raw_output: {
          result,
          cost_usd: outcome.costUsd,
          duration_ms: outcome.durationMs,
        },
      })
      .eq('id', entry.jobId);
  } catch (error) {
    const raw0 = error instanceof Error ? error.message : String(error);
    // The SDK can surface a capacity error either as our own typed error or as
    // a bare string from deeper down; both mean "try this lot again later"
    // rather than "something about this lot is wrong".
    const overloaded =
      error instanceof AppraisalOverloadedError || isOverloaded(raw0);
    const message = overloaded ? new AppraisalOverloadedError().message : raw0;

    // A parse failure keeps the model's raw text. Review surfaces it, because a
    // silently dropped appraisal is a lot you never look at again.
    const raw =
      error instanceof AppraisalParseError
        ? {parse_error: message, raw_output: error.raw}
        : {error: message, overloaded};

    await db
      .from('appraisal_jobs')
      .update({status: 'failed', error: message, raw_output: raw})
      .eq('id', entry.jobId);
  }
}
