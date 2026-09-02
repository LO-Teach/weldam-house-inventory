/**
 * End-to-end check of the appraisal loop, from a dropped photograph to a
 * validated record in the database.
 *
 * This is a PLUMBING test, not a calibration test. The image it sends is a
 * synthetic shape on a neutral ground, so the appraisal it comes back with is
 * meaningless as an appraisal — what it proves is that:
 *
 *   - the ingest pipeline hands the derivatives to the queue
 *   - the queue actually runs the job and respects its concurrency cap
 *   - the Agent SDK authenticates and receives the images
 *   - prompts/appraisal.md is loaded from disk on each run
 *   - the reply parses, validates against the Zod schema, and lands on the item
 *   - a failure is recorded as a failure with its raw output intact
 *
 * Calibration is a separate job, done against real objects with real prices —
 * see SPEC §10.
 *
 *   npm run dev            # in one terminal
 *   node scripts/test-appraisal.mjs
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TIMEOUT_MS = 180_000;

let passed = 0;
let failed = 0;
const createdItemIds = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(pathname, init) {
  const response = await fetch(`${BASE}${pathname}`, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return {status: response.status, body};
}

/** A tall dark shape on a warm ground. Object-like enough to appraise. */
async function makeObjectPhoto() {
  const ground = sharp({
    create: {width: 1200, height: 1600, channels: 3, background: {r: 236, g: 231, b: 219}},
  });
  const shape = await sharp({
    create: {width: 420, height: 780, channels: 4, background: {r: 62, g: 84, b: 96, alpha: 1}},
  })
    .png()
    .toBuffer();

  return ground
    .composite([{input: shape, top: 420, left: 390}])
    .jpeg({quality: 88})
    .toBuffer();
}

async function main() {
  console.log(`Appraisal loop test against ${BASE}\n`);

  const settings = await api('/api/settings').catch(() => null);
  if (!settings || settings.status !== 200) {
    console.error(`Could not reach ${BASE}. Start the dev server: npm run dev`);
    process.exit(1);
  }

  check(
    'appraisal is authenticated',
    settings.body?.appraisal?.auth === 'claude_code_subscription' ||
      settings.body?.appraisal?.auth === 'api_key',
    JSON.stringify(settings.body?.appraisal),
  );
  if (settings.body?.appraisal?.auth === 'claude_code_subscription') {
    console.log('    (running on the Claude Code subscription — no per-image API billing)');
  }

  const original = settings.body.settings;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weldam-appraise-'));
  await fs.mkdir(path.join(root, 'archive'), {recursive: true});

  try {
    console.log('\n1. Ingest one object and queue an appraisal');
    await api('/api/settings', {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({archiveRoot: root}),
    });

    const photo = await makeObjectPhoto();
    const form = new FormData();
    form.append('files', new Blob([photo], {type: 'image/jpeg'}), 'OBJECT_0001.jpg');
    form.append('hint', 'tall dark vessel, test object');

    const drop = await api('/api/items', {method: 'POST', body: form});
    check('ingest returned 201', drop.status === 201, JSON.stringify(drop.body).slice(0, 200));
    if (drop.body?.item?.id) createdItemIds.push(drop.body.item.id);

    const jobId = drop.body?.jobId;
    const itemId = drop.body?.item?.id;
    check('an appraisal job was queued', typeof jobId === 'string');
    if (!jobId || !itemId) throw new Error('Nothing to poll — stopping here.');

    console.log('\n2. Wait for the queue to run it (15-40s is normal)');
    const started = Date.now();
    let job = null;
    for (;;) {
      const poll = await api(`/api/appraise/${jobId}`);
      job = poll.body?.job ?? null;
      if (job && (job.status === 'done' || job.status === 'failed')) break;
      if (Date.now() - started > TIMEOUT_MS) {
        check('job finished within the timeout', false, `still ${job?.status ?? 'unknown'}`);
        break;
      }
      process.stdout.write(`    ${job?.status ?? '…'} (${Math.round((Date.now() - started) / 1000)}s)\r`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log(`    finished in ${Math.round((Date.now() - started) / 1000)}s          `);

    if (job?.status === 'failed') {
      // A failure is a legitimate outcome to verify: what must not happen is a
      // failure that loses the model's output.
      console.log('\n  The job failed. Checking that it failed HONESTLY:');
      check('the error was recorded', typeof job.error === 'string' && job.error.length > 0);
      check('the raw output was kept for review', job.raw_output != null);
      console.log(`    error: ${String(job.error).slice(0, 300)}`);
    } else {
      check('the job succeeded', job?.status === 'done');
    }

    console.log('\n3. The result landed on the item, validated');
    const {body} = await api(`/api/items/${itemId}`);
    const item = body?.item;

    if (job?.status === 'done') {
      check('title_nl was written', typeof item?.title_nl === 'string' && item.title_nl.length > 0);
      check('title_en was written', typeof item?.title_en === 'string' && item.title_en.length > 0);
      check('a category was assigned', typeof item?.category === 'string');
      check(
        'the channel is one the schema allows',
        ['local', 'ebay', 'catawiki', 'shopify', 'lot', 'hold', 'scrap'].includes(item?.channel),
        String(item?.channel),
      );
      check(
        'the confidence is one the schema allows',
        ['certain', 'likely', 'guessing'].includes(item?.confidence),
        String(item?.confidence),
      );
      check(
        'no maker was invented from an unmarked object',
        item?.maker === null,
        `got ${JSON.stringify(item?.maker)}`,
      );
      check(
        'confidence is "guessing" when there is no mark',
        item?.confidence === 'guessing',
        `got ${item?.confidence}`,
      );
      check('facts were stored for the listing generator', item?.facts != null);
      check('the ingest hint was preserved on facts', typeof item?.facts?.hint === 'string');
      check(
        'a one-line reasoning was captured',
        typeof item?.facts?.reasoning === 'string',
      );
      check(
        'the item is still a draft, awaiting human confirmation',
        item?.status === 'draft',
        `got ${item?.status}`,
      );

      console.log('\n    What it said:');
      console.log(`      title_nl   ${item?.title_nl}`);
      console.log(`      category   ${item?.category}`);
      console.log(`      material   ${item?.material}`);
      console.log(`      price      €${item?.price_local}  (intl: ${item?.price_intl ?? 'null'})`);
      console.log(`      channel    ${item?.channel}`);
      console.log(`      confidence ${item?.confidence}`);
      console.log(`      to check   ${item?.marks_to_check ?? '—'}`);
      console.log(`      reasoning  ${item?.facts?.reasoning ?? '—'}`);

      console.log('\n4. Listing copy generates from those facts');
      const listing = await api(`/api/listing/${itemId}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({channel: '2dehands'}),
      });
      check('copy was generated', listing.status === 200, JSON.stringify(listing.body).slice(0, 200));
      check('it has a title', typeof listing.body?.copy?.title === 'string');
      check('it has a description', typeof listing.body?.copy?.description === 'string');
      check(
        'the title fits the 2dehands budget',
        (listing.body?.copy?.title?.length ?? 999) <= 60,
        `${listing.body?.copy?.title?.length} chars`,
      );

      const cachedCall = await api(`/api/listing/${itemId}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({channel: '2dehands'}),
      });
      check('a second request is served from cache, not regenerated', cachedCall.body?.cached === true);

      if (listing.body?.copy) {
        console.log(`\n      title  ${listing.body.copy.title}`);
        console.log(`      body   ${String(listing.body.copy.description).slice(0, 160)}…`);
      }

      console.log('\n5. Sidecar export');
      const sidecar = await api('/api/sidecars', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({itemId}),
      });
      check('a sidecar was written', sidecar.body?.written === 1, JSON.stringify(sidecar.body));

      const lot = String(drop.body.lotNumber).padStart(4, '0');
      const sidecarPath = path.join(root, 'archive', lot, 'item.md');
      const markdown = await fs.readFile(sidecarPath, 'utf8').catch(() => '');
      check('item.md sits beside the originals', markdown.length > 0);
      check(
        'it says plainly that it is generated output',
        markdown.includes('Do not edit') && markdown.includes('never reads item.md back in'),
      );
      check('it carries the checksums', markdown.includes('SHA-256'));
    }
  } finally {
    console.log('\nCleanup');
    await api('/api/settings', {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        archiveRoot: original.archiveRoot,
        derivativeMaxPx: original.derivativeMaxPx,
        derivativeQuality: original.derivativeQuality,
      }),
    }).catch(() => undefined);
    for (const id of createdItemIds) {
      await api(`/api/items/${id}`, {method: 'DELETE'}).catch(() => undefined);
    }
    await fs.rm(root, {recursive: true, force: true}).catch(() => undefined);
    console.log('  settings restored, test items and derivatives removed, temp archive gone');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nThe test itself threw:', error);
  process.exit(1);
});
