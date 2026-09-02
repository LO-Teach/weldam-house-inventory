/**
 * The price ladder, checked as arithmetic.
 *
 * Imports the REAL src/lib/pricing.ts via Node type stripping, so the rules
 * under test cannot drift from the rules the app runs. What it pins is the
 * behaviour that matters commercially:
 *
 *   - ask is 80% of retail
 *   - the markdown compounds weekly and does not drift hourly
 *   - it stops dead at the floor rather than sliding toward zero
 *   - "has hit the floor" fires when the ladder genuinely bottoms out, not a
 *     week early because a rounded price happened to equal the floor
 *
 *   npm run test:pricing
 */

import {
  ASK_RATIO,
  DEFAULT_FLOOR_RATIO,
  WEEKLY_MARKDOWN,
  askFromRetail,
  floorFromAsk,
  ladderPreview,
  ladderStep,
  weeksListed,
} from '../src/lib/pricing.ts';

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function truthy(label, value, detail = '') {
  if (value) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const weeksAgo = (n) => new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000).toISOString();

console.log('Price ladder\n');

console.log('1. The 80% rule');
check('ratios are what the shop agreed', [ASK_RATIO, DEFAULT_FLOOR_RATIO, WEEKLY_MARKDOWN], [0.8, 0.5, 0.1]);
check('retail 55 asks 44', askFromRetail(55), 44);
check('retail 240 asks 192', askFromRetail(240), 192);
check('retail rounds to whole euros', askFromRetail(37), 30);
check('no retail, no ask', askFromRetail(null), null);
check('floor is half the ask', floorFromAsk(44), 22);

console.log('\n2. Weeks elapsed');
check('listed today is week 0', weeksListed(new Date().toISOString()), 0);
check('six days is still week 0', weeksListed(weeksAgo(6 / 7)), 0);
check('eight days is week 1', weeksListed(new Date(Date.now() - 8 * 864e5).toISOString()), 1);
check('never listed is week 0', weeksListed(null), 0);
check('a future date does not go negative', weeksListed(new Date(Date.now() + 864e5).toISOString()), 0);

console.log('\n3. The markdown compounds');
check('week 0 is the full ask', ladderStep(100, 40, weeksAgo(0)).price, 100);
check('week 1 is 90', ladderStep(100, 40, weeksAgo(1)).price, 90);
check('week 2 is 81', ladderStep(100, 40, weeksAgo(2)).price, 81);
check('week 5 is 59', ladderStep(100, 40, weeksAgo(5)).price, 59);
check('discount percentage is reported', ladderStep(100, 40, weeksAgo(2)).discountPct, 19);

console.log('\n4. It stops at the floor rather than sliding to zero');
check('week 10 clamps to the floor', ladderStep(100, 40, weeksAgo(10)).price, 40);
check('week 40 is still the floor', ladderStep(100, 40, weeksAgo(40)).price, 40);
truthy('week 40 reports having hit the floor', ladderStep(100, 40, weeksAgo(40)).hasHitFloor);
truthy('week 2 has NOT hit the floor', !ladderStep(100, 40, weeksAgo(2)).hasHitFloor);

// The reason hasHitFloor compares before rounding: at week 9 the raw price is
// 38.7, already under the floor, while a rounded 39 would still look above it.
truthy('the flag fires on the real value, not the rounded one', ladderStep(100, 40, weeksAgo(9)).hasHitFloor);

console.log('\n5. Degenerate inputs do not produce nonsense');
check('no ask means no price', ladderStep(null, 10, weeksAgo(5)).price, null);
truthy('no ask never claims to have hit a floor', !ladderStep(null, 10, weeksAgo(5)).hasHitFloor);
// A floor above the ask would mean an item that starts below its own floor.
check('a floor above the ask falls back to 50%', ladderStep(100, 500, weeksAgo(20)).price, 50);
check('a zero ask stays zero', ladderStep(0, 0, weeksAgo(3)).price, 0);

console.log('\n6. The preview matches the ladder');
const preview = ladderPreview(100, 40, 8);
check('preview covers weeks 0..8', preview.length, 9);
check('preview week 0', preview[0], {week: 0, price: 100});
check('preview week 4', preview[4], {week: 4, price: 66});
check(
  'preview agrees with ladderStep at every week',
  preview.every((row) => row.price === ladderStep(100, 40, weeksAgo(row.week)).price),
  true,
);

console.log('\n7. A worked example — the €55 sommerso vase');
const retail = 55;
const ask = askFromRetail(retail);
const floor = floorFromAsk(ask);
console.log(`   retail ${retail} -> ask ${ask} -> floor ${floor}`);
check('asks 44', ask, 44);
check('floors at 22', floor, 22);
check('after a month it is 29', ladderStep(ask, floor, weeksAgo(4)).price, 29);
check('after three months it sits at the floor', ladderStep(ask, floor, weeksAgo(12)).price, 22);
truthy('and is flagged for lotting', ladderStep(ask, floor, weeksAgo(12)).hasHitFloor);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
