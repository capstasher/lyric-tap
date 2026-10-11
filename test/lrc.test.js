import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// lrc.js is a plain browser script that hangs LRC off the global, so it is
// evaluated here rather than imported.
const sandbox = {};
new Function(readFileSync(join(here, '..', 'extension', 'lrc.js'), 'utf8')).call(sandbox);
const { LRC } = sandbox;

// Placeholder lyrics throughout; the tests care about timings, not words.
const line = (ms, words) => ({ startTimeMs: String(ms), words });
const payload = (syncType, lines) => ({ lyrics: { syncType, lines, provider: 'Test' } });

const sample = payload('LINE_SYNCED', [
  line(3380, 'Alpha'),
  line(5750, 'Bravo'),
  line(9290, ''),
  line(12520, 'Alpha'),
  line(16080, 'Charlie'),
  line(20000, '')
]);

test('exposes build, inspect and safeName', () => {
  assert.equal(typeof LRC.build, 'function');
  assert.equal(typeof LRC.inspect, 'function');
  assert.equal(typeof LRC.safeName, 'function');
});

test('formats timestamps as hundredths by default', () => {
  const { text } = LRC.build(payload('LINE_SYNCED', [line(0, 'Alpha'), line(63456, 'Bravo')]), {});
  assert.match(text, /^\[00:00\.00\]Alpha$/m);
  assert.match(text, /^\[01:03\.45\]Bravo$/m);
});

test('formats milliseconds when asked', () => {
  const { text } = LRC.build(payload('LINE_SYNCED', [line(0, 'Alpha'), line(63456, 'Bravo')]), { digits: 3 });
  assert.match(text, /^\[01:03\.456\]Bravo$/m);
});

test('minutes accumulate past 59 rather than rolling into hours', () => {
  const { text } = LRC.build(payload('LINE_SYNCED', [line(0, 'Alpha'), line(3725480, 'Bravo')]), {});
  assert.match(text, /^\[62:05\.48\]Bravo$/m);
});

test('inserts a lead-in blank before a late first line', () => {
  const { text } = LRC.build(sample, {});
  assert.match(text, /^\[00:00\.00\]$/m);
  assert.ok(text.indexOf('[00:00.00]\n') < text.indexOf('Alpha'));
});

test('omits the lead-in when the first line is already at the start', () => {
  const { text } = LRC.build(payload('LINE_SYNCED', [line(0, 'Alpha'), line(4000, 'Bravo')]), {});
  assert.doesNotMatch(text, /^\[00:00\.00\]$/m);
});

test('omits the lead-in below the half-second threshold', () => {
  const { text } = LRC.build(payload('LINE_SYNCED', [line(200, 'Alpha'), line(4000, 'Bravo')]), {});
  assert.doesNotMatch(text, /^\[00:00\.00\]$/m);
});

test('omits the lead-in and gap markers when gaps are off', () => {
  const { text, gaps } = LRC.build(sample, { gaps: false });
  assert.equal(gaps, 0);
  assert.doesNotMatch(text, /^\[\d\d:\d\d\.\d\d\]$/m);
});

test('stacks timestamps on repeated lines by default', () => {
  const { text } = LRC.build(sample, {});
  assert.match(text, /^\[00:03\.38\]\[00:12\.52\]Alpha$/m);
});

test('keeps repeated lines separate when stacking is off', () => {
  const { text } = LRC.build(sample, { merge: false });
  assert.match(text, /^\[00:03\.38\]Alpha$/m);
  assert.match(text, /^\[00:12\.52\]Alpha$/m);
});

test('writes only the ID tags it was given', () => {
  const { text } = LRC.build(sample, { title: 'Title', artist: 'Artist' });
  assert.match(text, /^\[ti:Title\]$/m);
  assert.match(text, /^\[ar:Artist\]$/m);
  assert.doesNotMatch(text, /^\[al:/m);
  assert.doesNotMatch(text, /^\[by:/m);
  assert.doesNotMatch(text, /^\[offset:/m);
});

test('signs a positive offset tag', () => {
  assert.match(LRC.build(sample, { offsetTag: 250 }).text, /^\[offset:\+250\]$/m);
  assert.match(LRC.build(sample, { offsetTag: -250 }).text, /^\[offset:-250\]$/m);
});

test('shifts every timestamp and clamps at zero', () => {
  const { text } = LRC.build(sample, { shiftMs: 1000, merge: false });
  assert.match(text, /^\[00:04\.38\]Alpha$/m);

  const pulled = LRC.build(sample, { shiftMs: -6000, merge: false }).text;
  assert.doesNotMatch(pulled, /\[-/);
  assert.match(pulled, /^\[00:00\.00\]Alpha$/m);
});

test('builds a filename from artist and title', () => {
  assert.equal(LRC.build(sample, { artist: 'Artist', title: 'Title' }).name, 'Artist - Title.lrc');
  assert.equal(LRC.build(sample, {}).name, 'lyrics.lrc');
});

test('strips characters Windows forbids in filenames', () => {
  const { name } = LRC.build(sample, { artist: 'A/B', title: 'C:D?E' });
  assert.equal(name, 'A_B - C_D_E.lrc');
});

test('counts sung lines and blank markers separately', () => {
  const { count, gaps } = LRC.build(sample, {});
  assert.equal(count, 4);  // Alpha, Bravo, Alpha, Charlie
  assert.equal(gaps, 3);   // lead-in plus two instrumental markers
});

test('finds the lyrics node wherever it is nested', () => {
  const buried = { a: { b: { c: { lines: [line(0, 'Alpha'), line(2000, 'Bravo')], syncType: 'LINE_SYNCED' } } } };
  assert.equal(LRC.inspect(buried).usable, true);
});

test('rejects an explicitly unsynced payload', () => {
  const unsynced = payload('UNSYNCED', [line(0, 'Alpha'), line(0, 'Bravo'), line(0, 'Charlie')]);
  assert.equal(LRC.inspect(unsynced).usable, false);
  assert.throws(() => LRC.build(unsynced, {}), /unsynced/i);
});

test('rejects a payload whose syncType lies about having timings', () => {
  const lying = payload('LINE_SYNCED', [line(0, 'Alpha'), line(0, 'Bravo')]);
  assert.equal(LRC.inspect(lying).usable, false);
});

test('rejects empty and all-blank payloads', () => {
  assert.equal(LRC.inspect(payload('LINE_SYNCED', [])).usable, false);
  assert.equal(LRC.inspect(payload('LINE_SYNCED', [line(0, ''), line(1000, '')])).usable, false);
  assert.equal(LRC.inspect(null).usable, false);
  assert.equal(LRC.inspect({}).usable, false);
});

test('trims whitespace around lyric lines', () => {
  const padded = payload('LINE_SYNCED', [line(1000, '  Alpha  '), line(4000, 'Bravo')]);
  assert.match(LRC.build(padded, {}).text, /^\[00:01\.00\]Alpha$/m);
});

test('output ends with a single trailing newline', () => {
  const { text } = LRC.build(sample, {});
  assert.ok(text.endsWith('\n'));
  assert.ok(!text.endsWith('\n\n'));
});
