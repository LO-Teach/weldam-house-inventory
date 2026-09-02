/**
 * SPEC §0, the day-one question: does @anthropic-ai/claude-agent-sdk run against
 * the local Claude Code subscription credentials, or does it demand a metered
 * ANTHROPIC_API_KEY?
 *
 * If it needs a key, every appraisal costs money per image and the ingest half
 * of the app deserves a rethink. So this runs with ANTHROPIC_API_KEY explicitly
 * unset, sends one real image, and reports what came back.
 *
 *   node scripts/verify-agent-sdk.mjs
 */

import {query} from '@anthropic-ai/claude-agent-sdk';
import sharp from 'sharp';

// A plain red 640px JPEG, built on the spot. Tiny images (a 2x2 PNG, say) are
// rejected upstream with "an image could not be processed and was removed",
// which looks like an auth failure and is not one — hence a realistic size.
const RED_JPEG_BASE64 = (
  await sharp({
    create: {width: 640, height: 640, channels: 3, background: {r: 200, g: 40, b: 30}},
  })
    .jpeg({quality: 82})
    .toBuffer()
).toString('base64');

const env = {...process.env};
delete env.ANTHROPIC_API_KEY;

console.log('Running the Agent SDK with ANTHROPIC_API_KEY unset...\n');

async function* prompt() {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {type: 'base64', media_type: 'image/jpeg', data: RED_JPEG_BASE64},
        },
        {
          type: 'text',
          text: 'Reply with exactly this JSON and nothing else: {"colour":"<the dominant colour of the image, one word, lowercase>"}',
        },
      ],
    },
  };
}

const started = Date.now();
let text = '';
let ok = false;

try {
  const response = query({
    prompt: prompt(),
    options: {
      model: process.env.APPRAISAL_MODEL || 'claude-opus-5',
      systemPrompt: {type: 'custom', prompt: 'You answer with JSON only.'},
      tools: [],
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      maxTurns: 1,
      settingSources: [],
      env,
    },
  });

  for await (const message of response) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') text += block.text;
      }
    } else if (message.type === 'result') {
      ok = message.subtype === 'success';
      console.log('result subtype :', message.subtype);
      console.log('cost (usd)     :', message.total_cost_usd);
      console.log('duration (ms)  :', message.duration_ms);
    }
  }
} catch (error) {
  console.error('\n✗ The SDK threw:', error?.message ?? error);
  console.error(
    '\n  If this is an auth error, appraisal needs a metered ANTHROPIC_API_KEY.\n' +
      '  Set one in .env.local, and re-read SPEC §0 before running hundreds of items.',
  );
  process.exit(1);
}

console.log('\nreply           :', JSON.stringify(text.trim()));
console.log('elapsed (ms)    :', Date.now() - started);

if (ok && /red/i.test(text)) {
  console.log(
    '\n✓ VERIFIED. The SDK authenticated with no ANTHROPIC_API_KEY set, and the\n' +
      '  image reached the model (it read the colour correctly). Appraisal runs on\n' +
      '  the Claude Code subscription — no per-image API billing.',
  );
} else if (ok) {
  console.log(
    '\n~ Authenticated without an API key, but the reply did not name the colour.\n' +
      '  Auth is fine; check the image path before trusting appraisals.',
  );
  process.exit(1);
} else {
  console.log('\n✗ The run did not succeed. See the subtype above.');
  process.exit(1);
}
