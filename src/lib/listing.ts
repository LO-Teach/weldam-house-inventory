import 'server-only';

import {query, type SDKUserMessage} from '@anthropic-ai/claude-agent-sdk';

import {getAppraisalConfig} from './config';
import {
  AppraisalOverloadedError,
  extractJson,
  isOverloaded,
} from './appraise';
import {
  LISTING_CHANNEL_META,
  categoryLabel,
  type Item,
  type ItemFacts,
  type ListingChannel,
  type ListingCopy,
} from './types';

/**
 * Listing copy is generated per channel, on demand, from `facts` — never stored
 * once and reused everywhere. eBay caps titles at 80 characters, Catawiki wants
 * provenance language, 2dehands wants six words. One description cannot serve
 * all three, and copy written months before you list goes stale.
 *
 * The generated result is cached on the item so a reload does not re-spend a
 * model call, with an explicit Regenerate to throw the cache away.
 */

/**
 * How long to wait for listing copy before giving up.
 *
 * Normal generation takes ten to twenty seconds. The SDK's own retry loop on a
 * capacity error runs past three minutes, which is far too long to leave a
 * button spinning.
 */
const LISTING_TIMEOUT_MS = 90_000;

const VOICE = `You write for Weldam House, an antique and vintage dealer in Ghent.

You reply with ONE JSON object and nothing else. No preamble, no code fence, no
commentary afterwards. This holds even when the facts are thin, contradictory,
or plainly unusable: say so INSIDE the JSON — a title and description that admit
the object cannot be described yet — rather than replying in prose. A reply that
is not JSON is discarded, so it helps nobody.

Voice: silver-tongued, warm, persuasive. A dealer's flourish anchored to true
facts. The showmanship never touches price or provenance — you may make an
object sound worth looking at, you may not invent what it is.

Hard rules:
- Never state a maker, mark, date or material the facts do not contain. If the
  maker is unknown, the copy says nothing about a maker at all. Do not hedge
  with "possibly Val Saint Lambert" — that reads as a claim to a buyer.
- Never write "rare", "unique", "stunning", "beautiful", "zeldzaam", "uniek",
  "prachtig". Marketplaces rank them down and buyers skim past them.
- Name any damage the facts record. A buyer who finds an unmentioned chip
  leaves a bad review; one who was told about it bought it anyway.
- No emoji.
- Dimensions and condition go in as stated, not embellished.`;

function channelBrief(channel: ListingChannel): string {
  const meta = LISTING_CHANNEL_META[channel];
  switch (channel) {
    case '2dehands':
    case 'marktplaats':
      return `Channel: ${meta.label} (Dutch, Belgian/Dutch local market).
Title: Dutch, at most ${meta.titleMaxChars} characters, structured as object, material, style/era, size. Short and searchable — a buyer types two words into the box.
Description: Dutch, 60-120 words. Plain paragraphs, no headings, no bullet symbols. Open with what it is, then material and era, then dimensions, then condition. Close with one short line on collection or shipping from Ghent.
Price: the local price, as a whole number of euros.`;
    case 'ebay':
      return `Channel: eBay (English, international).
Title: English, HARD LIMIT ${meta.titleMaxChars} characters — count them. Front-load the searchable nouns: object, material, style, era, maker if known. No punctuation flourishes.
Description: English, 80-140 words. Buyers are abroad and cannot inspect it, so be concrete about dimensions and condition. Mention that it ships from Belgium.
Price: the international price if one is set, otherwise the local price.`;
    case 'catawiki':
      return `Channel: Catawiki (English, curated auction, reviewed by an expert).
Title: English, at most ${meta.titleMaxChars} characters. Catalogue register: object, material, maker or origin, period.
Description: English, 100-160 words in the register of an auction catalogue entry. Provenance language is welcome where the facts support it — period, region, technique, form. Where they do not, say what is observable and stop. An expert reads this before it goes live, so an overreach gets the lot rejected.
Price: the international price if one is set, otherwise the local price. This is a reserve, so it sits at the low end.`;
  }
}

export async function generateListingCopy(
  item: Item,
  channel: ListingChannel,
): Promise<ListingCopy> {
  const config = getAppraisalConfig();
  const facts = (item.facts ?? {}) as ItemFacts;
  const meta = LISTING_CHANNEL_META[channel];

  // The ask price, not retail and not the floor: what the listing goes up at.
  const suggestedPrice =
    channel === '2dehands' || channel === 'marktplaats'
      ? item.ask_local
      : (item.ask_intl ?? item.ask_local);

  const factSheet = {
    object_nl: item.title_nl,
    object_en: item.title_en,
    category: categoryLabel(item.shopify_category) ?? item.category ?? null,
    material: item.material ?? facts.material ?? null,
    // The precise trade word — "lead crystal", "sommerso cased glass". Usually
    // the most saleable phrase on the record, so it goes in ahead of the coarse
    // Shopify facet.
    material_detail: item.material_detail ?? facts.material_detail ?? null,
    style: item.style ?? facts.style ?? null,
    era: item.era ?? facts.era ?? null,
    colour: item.colour ?? facts.colour ?? null,
    colour_detail: item.colour_detail ?? facts.colour_detail ?? null,
    dimensions_cm: item.dimensions_cm ?? facts.dimensions_cm ?? null,
    dimensions_are_estimated: facts.dimensions_estimated ?? null,
    weight_g: item.weight_g,
    maker: item.maker ?? facts.maker ?? null,
    marks_found: item.marks_found ?? facts.marks_found ?? null,
    condition_grade: item.condition_grade ?? facts.condition_grade ?? null,
    condition: item.condition ?? facts.condition ?? null,
    confidence: item.confidence,
    suggested_price_eur: suggestedPrice,
  };

  const userText = `${channelBrief(channel)}

These are the only established facts about the object. Anything not listed here
is not known, and must not appear in the copy:

${JSON.stringify(factSheet, null, 2)}

Return exactly this JSON object and nothing else:

{"title": "...", "description": "...", "price": <number or null>}`;

  async function run(text: string): Promise<string> {
    async function* prompt(): AsyncIterable<SDKUserMessage> {
      yield {
        type: 'user',
        parent_tool_use_id: null,
        message: {role: 'user', content: [{type: 'text', text}]},
      };
    }

    // The drawer is an interactive button, and the SDK retries a capacity error
    // internally for over three minutes before giving up. Waiting that long on
    // a click is worse than failing in ninety seconds with something to read,
    // so this gives up first and says what to do about it.
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), LISTING_TIMEOUT_MS);

    const response = query({
      prompt: prompt(),
      options: {
        abortController,
        model: config.model,
        systemPrompt: {type: 'custom', prompt: VOICE},
        tools: [],
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        maxTurns: 1,
        settingSources: [],
        env: config.apiKey
          ? {...process.env, ANTHROPIC_API_KEY: config.apiKey}
          : process.env,
      },
    });

    let out = '';
    try {
      for await (const message of response) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'text') out += block.text;
          }
        } else if (message.type === 'result') {
          const detail = 'result' in message ? String(message.result ?? '') : '';
          // A 529 arrives as a result carrying an error string rather than as a
          // thrown error, so the text has to be checked as well as the subtype.
          if (isOverloaded(detail) || isOverloaded(out)) {
            throw new AppraisalOverloadedError();
          }
          if (message.subtype !== 'success') {
            throw new Error(`Listing copy generation failed (${message.subtype}).`);
          }
          if (!out) out = detail;
        }
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new Error(
          `Gave up after ${Math.round(LISTING_TIMEOUT_MS / 1000)}s. Anthropic is usually over capacity when this happens — try the button again in a few minutes.`,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      if (isOverloaded(message)) throw new AppraisalOverloadedError();
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    return out;
  }

  function readCopy(
    text: string,
  ): {title: string; description: string; price: number | null} | null {
    const parsed = extractJson(text) as
      | {title?: unknown; description?: unknown; price?: unknown}
      | null;
    if (
      !parsed ||
      typeof parsed.title !== 'string' ||
      typeof parsed.description !== 'string'
    ) {
      return null;
    }
    return {
      title: parsed.title,
      description: parsed.description,
      price: typeof parsed.price === 'number' ? parsed.price : null,
    };
  }

  let lastWasOverload = false;
  let text = '';
  try {
    text = await run(userText);
  } catch (error) {
    lastWasOverload = error instanceof AppraisalOverloadedError;
    throw error;
  }
  let parsed = readCopy(text);

  // Thin or contradictory facts occasionally get a prose refusal instead of the
  // JSON refusal that was asked for. One corrective pass fixes it; failing that,
  // the error carries what actually came back so it is diagnosable rather than
  // just "did not return usable JSON".
  if (!parsed && !lastWasOverload) {
    text = await run(
      `${userText}\n\nYour previous reply was not a JSON object, so it was discarded. Reply with ONLY the JSON object described above — no prose, no code fence. If the facts are too thin to write a real listing, say that inside the "title" and "description" fields.`,
    );
    parsed = readCopy(text);
  }

  if (!parsed) {
    throw new Error(
      `The listing generator did not return usable JSON, twice. It replied: ${
        text.trim().slice(0, 300) || '(nothing)'
      }`,
    );
  }

  // The title limit is a platform constraint, not a preference — enforce it here
  // rather than trusting the model to have counted.
  const title =
    parsed.title.length > meta.titleMaxChars
      ? parsed.title.slice(0, meta.titleMaxChars).trimEnd()
      : parsed.title;

  return {
    title,
    description: parsed.description,
    price: parsed.price ?? suggestedPrice,
    generated_at: new Date().toISOString(),
  };
}
