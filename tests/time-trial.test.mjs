import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { Track, GRID_POSITION } = await server.ssrLoadModule('/src/track.ts');
const { PersonalBest, TimeTrial } = await server.ssrLoadModule('/src/time-trial.ts');
const track = new Track();

test('all six ordered checkpoints unlock one timed finish at the forward line', () => {
  const trial = new TimeTrial(track, GRID_POSITION, 0);
  const cleared = [];
  for (let position = GRID_POSITION + 1; position < track.length + 2; position++) {
    const before = trial.cleared;
    trial.advance(track.at(position).distance, (position - GRID_POSITION) * 20);
    if (before !== trial.cleared) cleared.push(trial.cleared);
    if (position < track.length) assert.equal(trial.finishTime, null);
  }
  assert.deepEqual(cleared, [1, 2, 3, 4, 5, 6]);
  assert.equal(trial.finishTime, Math.round((track.length - GRID_POSITION) * 20));
  assert.equal(trial.elapsed(60_000), trial.finishTime);
  const retry = new TimeTrial(track, GRID_POSITION, 60_000);
  assert.equal(retry.cleared, 0);
  assert.equal(retry.elapsed(60_000), 0);
  assert.equal(retry.finishTime, null);
});

test('a skipped checkpoint blocks the finish and a reverse crossing removes gate credit', () => {
  const first = track.checkpoints[0].distance;
  const trial = new TimeTrial(track, first - 1, 0);
  trial.advance(first + 1, 40);
  assert.equal(trial.cleared, 1);
  trial.advance(first - 1, 80);
  assert.equal(trial.cleared, 0);
  trial.advance(first + 6, 120);
  assert.equal(trial.cleared, 0, 'a single oversized step cannot clear a gate');
  for (let position = first + 7; position < track.length + 2; position++) {
    trial.advance(track.at(position).distance, 120 + (position - first - 6) * 20);
  }
  assert.equal(trial.cleared, 0, 'following gates must wait for the skipped one');
  assert.equal(trial.finishTime, null);
  assert.equal(trial.feedback.text, 'Checkpoint missed');
});

test('pause freezes elapsed time and prevents checkpoint advances until resume', () => {
  const gate = track.checkpoints[0].distance;
  const trial = new TimeTrial(track, gate - 1, 1_000);
  trial.pause(1_250);
  trial.advance(gate + 1, 4_000);
  assert.equal(trial.cleared, 0);
  assert.equal(trial.elapsed(4_000), 250);
  trial.resume(4_000);
  trial.advance(gate + 1, 4_020);
  assert.equal(trial.cleared, 1);
  assert.equal(trial.elapsed(4_020), 270);
});

test('personal best survives a new instance and rejects slower, tied, and invalid times', t => {
  const values = new Map([['neon-drift:afterdark:best-ms', '0x123']]);
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    }
  };
  t.after(() => delete globalThis.window);

  const best = new PersonalBest();
  assert.equal(best.time, null);
  for (const malformed of [0, -1, NaN, Infinity, 12.5]) assert.equal(best.submit(malformed), false);
  assert.equal(best.submit(26_000), true);
  assert.equal(best.submit(26_000), false);
  assert.equal(best.submit(26_300), false);
  assert.equal(best.submit(25_900), true);
  assert.equal(new PersonalBest().time, 25_900);
});

test('blocked browser storage still allows an in-session record', t => {
  globalThis.window = {
    get localStorage() { throw new Error('Storage is unavailable'); }
  };
  t.after(() => delete globalThis.window);
  const best = new PersonalBest();
  assert.equal(best.time, null);
  assert.equal(best.submit(27_000), true);
  assert.equal(best.submit(28_000), false);
  assert.equal(best.time, 27_000);
});
