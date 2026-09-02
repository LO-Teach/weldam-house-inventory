/**
 * The file pipeline, tested in isolation on throwaway files BEFORE it is
 * trusted with anything real.
 *
 * Photographs are dragged onto the Ingest screen from wherever they live, and
 * the app copies them into the archive. So the guarantees under test are:
 *
 *   1. originals land in archive/{lot}/ under the right names
 *   2. every archived byte matches the source's SHA-256
 *   3. NOTHING IS EVER DELETED — the files you dropped are untouched, and so is
 *      every folder they came from
 *   4. a missing archive folder refuses the whole operation and does not
 *      quietly file the originals somewhere else
 *   5. derivatives come out at the configured long edge, EXIF stripped
 *   6. rejections (too many files, wrong type) happen before anything is written
 *   7. archived originals stay byte-identical through all of the above
 *
 * It drives the real HTTP endpoint rather than importing the module, because
 * that is what actually runs — and because src/lib/pipeline.ts is server-only.
 *
 * Everything it creates is cleaned up: the temp archive, the items, the
 * derivatives in the bucket, and the settings override.
 *
 *   npm run dev            # in one terminal
 *   npm run test:pipeline
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';

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

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function makeJpeg(seed, size = 900) {
  return sharp({
    create: {
      width: size,
      height: Math.round(size * 0.75),
      channels: 3,
      background: {r: (seed * 37) % 256, g: (seed * 91) % 256, b: (seed * 53) % 256},
    },
  })
    .jpeg({quality: 90})
    .toBuffer();
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

async function postDrop(files, hint) {
  const form = new FormData();
  for (const file of files) {
    form.append('files', new Blob([file.bytes], {type: 'image/jpeg'}), file.name);
  }
  if (hint) form.append('hint', hint);
  // Appraisal is a separate concern and costs 15-40s per item; the file
  // pipeline is what is under test here.
  form.append('appraise', 'false');
  return api('/api/items', {method: 'POST', body: form});
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Every file under a directory, with its hash. Used to prove nothing changed. */
async function snapshot(dir) {
  const out = new Map();
  async function walk(current) {
    const entries = await fs.readdir(current, {withFileTypes: true}).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.set(path.relative(dir, full), sha256(await fs.readFile(full)));
    }
  }
  await walk(dir);
  return out;
}

function sameSnapshot(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

async function main() {
  console.log(`Pipeline test against ${BASE}\n`);

  const health = await api('/api/settings').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(
      `Could not reach ${BASE}/api/settings. Start the dev server first:\n\n  npm run dev\n`,
    );
    process.exit(1);
  }
  const original = health.body.settings;
  console.log(`Remembered current archive folder: ${original.archiveRoot || '(none)'}\n`);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weldam-pipeline-'));
  // Stands in for wherever the user's photographs actually live — a camera
  // card, a downloads folder, the desktop. The app must never touch it.
  const sourceFolder = path.join(root, 'my-photos');
  const archiveRoot = path.join(root, 'archive-root');
  await fs.mkdir(sourceFolder, {recursive: true});
  await fs.mkdir(archiveRoot, {recursive: true});

  try {
    // ---------------------------------------------------------------------
    console.log('1. Point the app at a throwaway archive folder');
    // ---------------------------------------------------------------------
    const configured = await api('/api/settings', {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({archiveRoot, derivativeMaxPx: 640}),
    });
    check('settings accepted', configured.status === 200);
    check('archive reports ready', configured.body?.archive?.isReady === true,
      configured.body?.archive?.problem ?? '');

    // ---------------------------------------------------------------------
    console.log('\n2. Happy path — three shots of one object');
    // ---------------------------------------------------------------------
    const group = [];
    for (let i = 0; i < 3; i += 1) {
      const bytes = await makeJpeg(i + 1);
      const name = `IMG_100${i}.jpg`;
      await fs.writeFile(path.join(sourceFolder, name), bytes);
      group.push({name, bytes, hash: sha256(bytes)});
    }

    const sourceBefore = await snapshot(sourceFolder);

    const drop = await postDrop(group, 'throwaway test object');
    check('ingest returned 201', drop.status === 201, JSON.stringify(drop.body).slice(0, 200));

    const lot = drop.body?.lotNumber;
    if (drop.body?.item?.id) createdItemIds.push(drop.body.item.id);
    check('a lot number was allocated', Number.isInteger(lot));

    const lotDir = path.join(archiveRoot, 'archive', String(lot).padStart(4, '0'));
    const suffixes = ['a', 'b', 'c'];

    for (const [i, file] of group.entries()) {
      const archived = path.join(
        lotDir,
        `${String(lot).padStart(4, '0')}_${suffixes[i]}.jpg`,
      );
      check(`original ${i + 1} filed as ${path.basename(archived)}`, await exists(archived));
      if (await exists(archived)) {
        const onDisk = await fs.readFile(archived);
        check(
          `original ${i + 1} is byte-identical to the source`,
          sha256(onDisk) === file.hash,
        );
      }
    }

    check(
      'no .part files were left behind',
      (await fs.readdir(lotDir)).every((name) => !name.endsWith('.part')),
    );

    check('three image rows were recorded', drop.body?.item?.images?.length === 3);
    check(
      'the first shot is primary',
      drop.body?.item?.images?.some((image) => image.is_primary) === true,
    );
    check(
      'image rows carry both a storage path and an archive path',
      drop.body?.item?.images?.every(
        (image) => image.storage_path && image.archive_path,
      ) === true,
    );
    check(
      'archive paths are relative to the archive root',
      drop.body?.item?.images?.every((image) =>
        image.archive_path?.startsWith('archive/'),
      ) === true,
    );
    check(
      'checksums were persisted',
      drop.body?.item?.images?.every((image) => image.sha256?.length === 64) === true,
    );

    // ---------------------------------------------------------------------
    console.log('\n3. The source folder is untouched — nothing is ever deleted');
    // ---------------------------------------------------------------------
    const sourceAfter = await snapshot(sourceFolder);
    check(
      'every file you dropped is still there, byte for byte',
      sameSnapshot(sourceBefore, sourceAfter),
      `${sourceBefore.size} before, ${sourceAfter.size} after`,
    );
    check(
      'nothing new was written into the source folder either',
      sourceAfter.size === 3,
    );

    // ---------------------------------------------------------------------
    console.log('\n4. Derivatives — resized, re-encoded, EXIF stripped');
    // ---------------------------------------------------------------------
    const derivativeDir = path.join(
      process.cwd(),
      '.work',
      'derivatives',
      String(lot).padStart(4, '0'),
    );
    const derivativeFiles = await fs.readdir(derivativeDir).catch(() => []);
    check('three web copies were written to .work/', derivativeFiles.length === 3);

    if (derivativeFiles.length > 0) {
      const meta = await sharp(path.join(derivativeDir, derivativeFiles[0])).metadata();
      check('web copy is JPEG', meta.format === 'jpeg');
      check(
        `web copy long edge is 640px, not the 900px original (got ${Math.max(meta.width, meta.height)})`,
        Math.max(meta.width, meta.height) === 640,
      );
      check('web copy carries no EXIF block', !meta.exif);
      const stat = await fs.stat(path.join(derivativeDir, derivativeFiles[0]));
      check(
        `web copy is small enough for the cloud tier (${Math.round(stat.size / 1024)} KB)`,
        stat.size < 500 * 1024,
      );
    }

    check(
      'signed URLs came back for the uploaded derivatives',
      drop.body?.item?.images?.every((image) => typeof image.url === 'string') === true,
    );

    // ---------------------------------------------------------------------
    console.log('\n5. A second drop of the same filenames does not disturb the first lot');
    // ---------------------------------------------------------------------
    const firstLotBefore = await snapshot(lotDir);
    const second = await postDrop([{name: 'IMG_1000.jpg', bytes: await makeJpeg(50)}]);
    check('ingest succeeded', second.status === 201);
    if (second.body?.item?.id) createdItemIds.push(second.body.item.id);
    check('it got its own lot number', second.body?.lotNumber !== lot);
    check(
      'the first lot is exactly as it was',
      sameSnapshot(firstLotBefore, await snapshot(lotDir)),
    );

    // ---------------------------------------------------------------------
    console.log('\n6. Rejections happen before anything is written');
    // ---------------------------------------------------------------------
    const archiveBefore = await snapshot(archiveRoot);

    const tooMany = [];
    for (let i = 0; i < 13; i += 1) {
      tooMany.push({name: `BULK_${i}.jpg`, bytes: await makeJpeg(i + 200, 200)});
    }
    const rejected = await postDrop(tooMany);
    check('a 13-file drop is refused', rejected.status === 422, `got ${rejected.status}`);
    check(
      'and the reason names the one-object rule',
      String(rejected.body?.error ?? '').includes('one object'),
    );

    const notAnImage = new FormData();
    notAnImage.append(
      'files',
      new Blob([Buffer.from('this is not an image')], {type: 'text/plain'}),
      'notes.txt',
    );
    notAnImage.append('appraise', 'false');
    const nonImage = await api('/api/items', {method: 'POST', body: notAnImage});
    check('a non-image is refused', nonImage.status === 422, `got ${nonImage.status}`);

    check(
      'neither refusal wrote anything into the archive',
      sameSnapshot(archiveBefore, await snapshot(archiveRoot)),
    );

    // ---------------------------------------------------------------------
    console.log('\n7. A missing archive folder refuses ingest outright');
    // ---------------------------------------------------------------------
    const missingRoot = path.join(root, 'definitely-not-here', 'nested');
    await api('/api/settings', {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({archiveRoot: missingRoot}),
    });

    const blocked = await postDrop([{name: 'BLOCKED.jpg', bytes: await makeJpeg(3)}]);
    check('ingest is refused', blocked.status >= 400, `got ${blocked.status}`);
    check(
      'the error names the missing folder rather than filing it elsewhere',
      String(blocked.body?.error ?? '').includes('does not exist'),
      String(blocked.body?.error ?? '').slice(0, 120),
    );
    check(
      'no archive directory was invented at the missing path',
      !(await exists(missingRoot)),
    );
    check(
      'and nothing leaked into the previously configured archive',
      sameSnapshot(archiveBefore, await snapshot(archiveRoot)),
    );
    check('no phantom draft was left behind', blocked.body?.item === undefined);

    // ---------------------------------------------------------------------
    console.log('\n8. Creating the folder is an explicit act, and then it works');
    // ---------------------------------------------------------------------
    const created = await api('/api/settings', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({action: 'create', path: missingRoot}),
    });
    check('create returned ok', created.status === 200);
    check('the folder is now ready', created.body?.archive?.isReady === true);

    const afterCreate = await postDrop([{name: 'AFTER.jpg', bytes: await makeJpeg(11)}]);
    check('ingest now succeeds', afterCreate.status === 201, `got ${afterCreate.status}`);
    if (afterCreate.body?.item?.id) createdItemIds.push(afterCreate.body.item.id);

    // ---------------------------------------------------------------------
    console.log('\n9. The first lot survived everything above');
    // ---------------------------------------------------------------------
    for (const [i, file] of group.entries()) {
      const archived = path.join(
        lotDir,
        `${String(lot).padStart(4, '0')}_${suffixes[i]}.jpg`,
      );
      if (await exists(archived)) {
        const onDisk = await fs.readFile(archived);
        check(`original ${i + 1} is still byte-identical`, sha256(onDisk) === file.hash);
      }
    }
    check(
      'and the source folder is STILL untouched',
      sameSnapshot(sourceBefore, await snapshot(sourceFolder)),
    );
  } finally {
    // -----------------------------------------------------------------------
    console.log('\nCleanup');
    // -----------------------------------------------------------------------
    // Restore the real settings first, so a failure halfway through does not
    // leave the app pointed at a temp directory that is about to vanish.
    await api('/api/settings', {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        archiveRoot: original.archiveRoot,
        derivativeMaxPx: original.derivativeMaxPx,
        derivativeQuality: original.derivativeQuality,
      }),
    }).catch(() => undefined);
    console.log('  settings restored');

    for (const id of createdItemIds) {
      await api(`/api/items/${id}`, {method: 'DELETE'}).catch(() => undefined);
    }
    console.log(`  ${createdItemIds.length} test item(s) and their derivatives removed`);

    await fs.rm(root, {recursive: true, force: true}).catch(() => undefined);
    console.log('  temp folders removed');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nThe test itself threw:', error);
  process.exit(1);
});
