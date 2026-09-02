import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';

import {query, type SDKUserMessage} from '@anthropic-ai/claude-agent-sdk';

import {WORK_DIR, getAppraisalConfig} from './config';
import {appraisalSchema, type AppraisalResult} from './schema';
import {bucketName, supabase} from './supabase';
import {
  COLOURS,
  CONDITIONS,
  MATERIALS,
  SHOPIFY_CATEGORIES,
  STYLES,
} from './taxonomy';

/**
 * The allowed values, sent with every request.
 *
 * These live in the user message rather than the system prompt because they are
 * the half most likely to change — adding a category should not mean rewriting
 * prompts/appraisal.md. The Zod schema enforces the same lists on the way back,
 * so a value that is not here fails the job loudly instead of quietly poisoning
 * a storefront filter.
 */
function vocabularyBlock(): string {
  const categories = SHOPIFY_CATEGORIES.map(
    (category) => `  ${category.id} = ${category.label}`,
  ).join('\n');

  return [
    'Use EXACTLY these values for the enum fields. Copy them character for character.',
    '',
    `shopify_category (pick one id):\n${categories}`,
    '',
    `material: ${MATERIALS.join(' | ')}`,
    '',
    `colour: ${COLOURS.join(' | ')}`,
    '',
    `style: ${STYLES.join(' | ')}`,
    '',
    `condition_grade: ${CONDITIONS.join(' | ')}`,
  ].join('\n');
}

const PROMPT_PATH = path.join(process.cwd(), 'prompts', 'appraisal.md');

/**
 * Loaded from disk on every run, never bundled. prompts/appraisal.md is the
 * actual product — the calibration loop means editing it weekly — and it would
 * be miserable if every tweak needed a rebuild.
 */
export async function loadAppraisalPrompt(): Promise<string> {
  return fs.readFile(PROMPT_PATH, 'utf8');
}

export interface AppraisalInput {
  lotNumber: number;
  /** Storage paths of the derivatives, in sort order, primary first. */
  storagePaths: string[];
  /** The one-line nudge typed at ingest. A pointer, never a fact. */
  hint?: string | null;
  /** Extra instruction on a re-appraisal ("look again at the base"). */
  instruction?: string | null;
  /**
   * Answers the user gave to the appraiser's own questions. These ARE
   * established fact — the person answering had the object in their hands and
   * a torch, which beats any amount of squinting at a photograph.
   */
  answers?: Array<{question: string; answer: string}> | null;
}

export interface AppraisalOutcome {
  result: AppraisalResult;
  raw: string;
  costUsd: number | null;
  durationMs: number;
}

export class AppraisalParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'AppraisalParseError';
    this.raw = raw;
  }
}

/**
 * Reads a derivative back as base64. Prefers the local .work/ copy — it is the
 * same bytes we uploaded and costs no round trip — and falls back to the bucket
 * when .work/ has been cleared, which it is designed to survive.
 */
async function loadImage(
  lotNumber: number,
  storagePath: string,
): Promise<string | null> {
  const lot = String(lotNumber).padStart(4, '0');
  const local = path.join(WORK_DIR, 'derivatives', lot, storagePath);
  try {
    return (await fs.readFile(local)).toString('base64');
  } catch {
    // Not in the working directory. Pull it from the bucket instead.
  }

  const {data, error} = await supabase()
    .storage.from(bucketName())
    .download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}

export async function appraise(input: AppraisalInput): Promise<AppraisalOutcome> {
  const started = Date.now();
  const config = getAppraisalConfig();
  const systemPrompt = await loadAppraisalPrompt();

  const images = (
    await Promise.all(
      input.storagePaths.map((storagePath) => loadImage(input.lotNumber, storagePath)),
    )
  ).filter((value): value is string => value !== null);

  if (images.length === 0) {
    throw new Error(
      `No web copies available for lot ${input.lotNumber}. The originals are archived, but the derivatives are missing from both .work/ and the bucket, so there is nothing to appraise.`,
    );
  }

  const lines: string[] = [
    `Appraise the object in these ${images.length} photograph${images.length === 1 ? '' : 's'}. They are all of the same object; the first is the primary shot.`,
    vocabularyBlock(),
  ];
  if (input.hint?.trim()) {
    lines.push(
      `The person holding the object wrote: "${input.hint.trim()}". Treat it as a pointer to look at something, not as established fact.`,
    );
  }
  if (input.answers?.length) {
    // Answers outrank the photographs. Someone had the object in their hands.
    lines.push(
      'The person holding the object answered your previous questions. These are ESTABLISHED FACT and override anything you think you see in the photographs:\n' +
        input.answers
          .map((entry) => `- ${entry.question}\n  ANSWER: ${entry.answer}`)
          .join('\n'),
    );
  }
  if (input.instruction?.trim()) {
    lines.push(
      `Re-appraisal. The previous result was rejected with this instruction: "${input.instruction.trim()}". Address it directly.`,
    );
  }
  lines.push('Return the JSON object and nothing else.');

  const userMessage: SDKUserMessage = {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        ...images.map(
          (data) =>
            ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: 'image/jpeg' as const,
                data,
              },
            }),
        ),
        {type: 'text' as const, text: lines.join('\n\n')},
      ],
    },
  };

  async function* prompt(): AsyncIterable<SDKUserMessage> {
    yield userMessage;
  }

  const response = query({
    prompt: prompt(),
    options: {
      model: config.model,
      systemPrompt: {type: 'custom', prompt: systemPrompt},
      // An appraiser has no business reading the filesystem or running commands.
      // No tools at all also means no tool-permission prompts to deadlock on.
      tools: [],
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      maxTurns: 1,
      // SDK isolation: do not inherit this repo's CLAUDE.md, settings, or hooks
      // into an appraisal. The prompt file is the whole instruction set.
      settingSources: [],
      env: config.apiKey
        ? {...process.env, ANTHROPIC_API_KEY: config.apiKey}
        : // No key: the SDK falls through to the local `claude` CLI credentials,
          // i.e. the Claude Code subscription. Verified by scripts/verify-agent-sdk.mjs.
          process.env,
    },
  });

  let text = '';
  let costUsd: number | null = null;

  for await (const message of response) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') text += block.text;
      }
    } else if (message.type === 'result') {
      costUsd = 'total_cost_usd' in message ? message.total_cost_usd : null;
      if (message.subtype !== 'success') {
        throw new AppraisalParseError(
          `Appraisal run failed (${message.subtype}).`,
          text || JSON.stringify(message),
        );
      }
      if (!text && 'result' in message) text = message.result;
    }
  }

  const parsed = extractJson(text);
  if (!parsed) {
    throw new AppraisalParseError(
      'The appraiser did not return a JSON object.',
      text,
    );
  }

  const validated = appraisalSchema.safeParse(parsed);
  if (!validated.success) {
    throw new AppraisalParseError(
      `Appraisal JSON failed validation: ${validated.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'} — ${issue.message}`)
        .join('; ')}`,
      text,
    );
  }

  return {
    result: validated.data,
    raw: text,
    costUsd,
    durationMs: Date.now() - started,
  };
}

/**
 * Pulls the JSON object out of the reply. The prompt asks for bare JSON, but
 * models fence it often enough that refusing a fenced answer would just throw
 * away good appraisals.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], trimmed].filter(
    (value): value is string => typeof value === 'string',
  );

  for (const candidate of candidates) {
    const direct = tryParse(candidate);
    if (direct) return direct;

    // Last resort: the outermost {...} span in the text.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const span = tryParse(candidate.slice(start, end + 1));
      if (span) return span;
    }
  }
  return null;
}

function tryParse(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value.trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
