import type {NextRequest} from 'next/server';

import {handleRouteError, jsonError, readJson} from '@/src/lib/http';
import {generateListingCopy} from '@/src/lib/listing';
import {listingRequestSchema} from '@/src/lib/schema';
import {supabase} from '@/src/lib/supabase';
import type {Item, ItemFacts} from '@/src/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Generate channel-specific listing copy from `facts`.
 *
 * The result is cached on the item so reopening the drawer costs nothing, and
 * `regenerate: true` throws the cache away. Copy is never generated at appraisal
 * time: it would be stale by the time the item is actually listed.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/listing/[id]'>) {
  try {
    const {id} = await ctx.params;
    const parsed = listingRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return jsonError(
        `Invalid request: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }

    const {channel, regenerate} = parsed.data;
    const db = supabase();

    const {data, error} = await db
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return jsonError(error.message, 500);
    if (!data) return jsonError('No such item.', 404);

    const item = data as Item;
    const facts = (item.facts ?? {}) as ItemFacts;
    const cached = facts.listings?.[channel];

    if (cached && !regenerate) {
      return Response.json({copy: cached, cached: true});
    }

    if (!item.title_nl && !item.title_en) {
      return jsonError(
        'This item has not been appraised yet, so there are no facts to write copy from.',
        409,
      );
    }

    const copy = await generateListingCopy(item, channel);

    const nextFacts: ItemFacts = {
      ...facts,
      listings: {...(facts.listings ?? {}), [channel]: copy},
    };
    await db.from('items').update({facts: nextFacts}).eq('id', id);

    return Response.json({copy, cached: false});
  } catch (error) {
    return handleRouteError('POST /api/listing/[id]', error);
  }
}

/** Save hand-edited copy back onto the item without re-running the model. */
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/listing/[id]'>) {
  try {
    const {id} = await ctx.params;
    const body = (await readJson(request)) as {
      channel?: string;
      title?: string;
      description?: string;
      price?: number | null;
    };

    if (!body.channel || typeof body.title !== 'string' || typeof body.description !== 'string') {
      return jsonError('channel, title and description are required.');
    }

    const db = supabase();
    const {data} = await db.from('items').select('facts').eq('id', id).maybeSingle();
    if (!data) return jsonError('No such item.', 404);

    const facts = (data.facts ?? {}) as ItemFacts;
    const nextFacts: ItemFacts = {
      ...facts,
      listings: {
        ...(facts.listings ?? {}),
        [body.channel]: {
          title: body.title,
          description: body.description,
          price: typeof body.price === 'number' ? body.price : null,
          generated_at: new Date().toISOString(),
        },
      },
    };

    const {error} = await db.from('items').update({facts: nextFacts}).eq('id', id);
    if (error) return jsonError(error.message, 500);
    return Response.json({ok: true});
  } catch (error) {
    return handleRouteError('PATCH /api/listing/[id]', error);
  }
}
