import 'server-only';

import {SupabaseNotConfiguredError} from './supabase';

/**
 * One error shape for every route, so the client only has to understand
 * `{ error: string }`. Nothing here leaks a stack trace to the browser; the
 * full error still goes to the terminal, which is where the one person running
 * this app is looking anyway.
 */
export function jsonError(message: string, status = 400): Response {
  return Response.json({error: message}, {status});
}

export function handleRouteError(context: string, error: unknown): Response {
  if (error instanceof SupabaseNotConfiguredError) {
    return jsonError(error.message, 503);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, error);
  return jsonError(message, 500);
}

/** Reads and parses a JSON body, turning malformed input into a 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error('Request body was not valid JSON.');
  }
}
