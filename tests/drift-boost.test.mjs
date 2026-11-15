import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { Controls } = await server.ssrLoadModule('/src/controls.ts');
const { Track, GRID_POSITION } = await server.ssrLoadModule('/src/track.ts');
const { Vehicle, MAX_FORWARD, MIN_BOOST_CHARGE } = await server.ssrLoadModule('/src/vehicle.ts');
const track = new Track();
const step = 1 / 120;
const neutral = { throttle: false, brake: false, steer: 0, drift: false, boost: false };

function movingCraft(speed, distance = 23) {
  const craft = new Vehicle(track);
  const sample = track.at(distance);
  craft.reset(sample.distance);
  craft.velocityX = sample.tx * speed;
  craft.velocityZ = sample.tz * speed;
  return craft;
}

function drive(craft, input, frames = 1) {
  for (let i = 0; i < frames; i++) craft.update(step, { ...neutral, ...input });
}

test('Left Shift is held for drift, while a Space tap queues one boost during gameplay', t => {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });
  let racing = true;
  const controls = new Controls(() => racing, () => {}, () => {}, () => {}, () => {});
  function key(type, code, repeat = false) {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  key('keydown', 'ShiftRight');
  assert.equal(controls.read().drift, false);
  key('keydown', 'ShiftLeft');
  key('keydown', 'KeyD');
  assert.equal(controls.read().drift, true);
  assert.equal(controls.read().steer, 1);
  key('keyup', 'ShiftLeft');
  assert.equal(controls.read().drift, false);

  assert.equal(key('keydown', 'Space'), true);
  key('keyup', 'Space');
  assert.equal(controls.read().boost, true, 'release before a physics step preserves the request');
  assert.equal(controls.read().boost, false);
  assert.equal(key('keydown', 'Space', true), true);
  assert.equal(controls.read().boost, false, 'key repeat cannot fire another burst');
  key('keydown', 'Space');
  controls.clear();
  assert.equal(controls.read().boost, false);
  assert.equal(controls.read().steer, 0);
  racing = false;
  assert.equal(key('keydown', 'Space'), false, 'menu buttons keep native Space activation');
  assert.equal(controls.read().boost, false);
});

test('moving, steering drifts build slip and charge without changing normal steering', () => {
  const stationary = new Vehicle(track);
  drive(stationary, { steer: 1, drift: true }, 12);
  assert.equal(stationary.drifting, false);
  assert.equal(stationary.boost, 0);

  const normal = movingCraft(26);
  const drift = movingCraft(26);
  drive(drift, { drift: true });
  assert.equal(drift.drifting, false, 'Shift alone does not enter drift');

  const cornering = { throttle: true, steer: 0.7 };
  drive(normal, cornering, 24);
  drive(drift, { ...cornering, drift: true }, 24);
  assert.equal(drift.drifting, true);
  assert.ok(Math.abs(drift.slip) > Math.abs(normal.slip));
  assert.equal(normal.boost, 0);
  const partial = drift.boost;
  assert.ok(partial > 0 && partial < MIN_BOOST_CHARGE);
  drive(drift, { ...cornering, drift: true }, 30);
  assert.ok(drift.boost >= MIN_BOOST_CHARGE, 'a clean early drift earns usable charge');
  const charged = drift.boost;
  drive(drift, cornering);
  assert.equal(drift.drifting, false);
  assert.equal(drift.boost, charged);
  assert.ok(Math.abs(drift.slip) > 0, 'release keeps lateral momentum as grip returns');

  const againstRail = movingCraft(26);
  againstRail.x += 8;
  drive(againstRail, { ...cornering, drift: true }, 12);
  assert.equal(againstRail.boost, 0, 'scraping along the rail earns no charge');
});

test('Space starts a speed burst that consumes charge and ends at empty or under braking', () => {
  const craft = movingCraft(MAX_FORWARD);
  const normal = movingCraft(MAX_FORWARD);
  drive(craft, { boost: true });
  drive(normal, {});
  assert.equal(craft.boosting, false);
  assert.equal(craft.speed, normal.speed);
  craft.boost = MIN_BOOST_CHARGE / 2;
  drive(craft, { boost: true });
  assert.equal(craft.boosting, false);
  assert.equal(craft.boost, MIN_BOOST_CHARGE / 2);
  craft.boost = 0.25;
  drive(craft, { boost: true });
  const remaining = craft.boost;
  assert.equal(craft.boosting, true);
  drive(craft, {}, 28);
  assert.equal(craft.boosting, true, 'a single tap lasts after release');
  assert.ok(craft.speed > MAX_FORWARD + 5);
  assert.ok(craft.boost < remaining);
  drive(craft, { brake: true });
  assert.equal(craft.boosting, false);
  const afterBrake = craft.boost;
  drive(craft, {});
  assert.equal(craft.boost, afterBrake);

  const charged = movingCraft(20);
  charged.boost = MIN_BOOST_CHARGE;
  drive(charged, { boost: true });
  drive(charged, {}, 40);
  assert.equal(charged.boost, 0);
  assert.equal(charged.boosting, false);
});

test('recovery clears active effects and restart empties boost and allows the next drift', () => {
  const craft = movingCraft(26);
  drive(craft, { throttle: true, drift: true, steer: 0.7 }, 54);
  const earned = craft.boost;
  assert.ok(earned >= MIN_BOOST_CHARGE);
  craft.reset();
  assert.equal(craft.boost, earned);
  assert.equal(craft.drifting, false);
  assert.equal(craft.charging, false);
  drive(craft, { boost: true });
  assert.equal(craft.boosting, true);
  craft.restart();
  assert.equal(craft.boost, 0);
  assert.equal(craft.speed, 0);
  assert.equal(craft.boosting, false);
  assert.equal(craft.slip, 0);
  assert.equal(craft.distance, track.at(GRID_POSITION).distance);
  drive(craft, { throttle: true }, 115);
  drive(craft, { throttle: true, drift: true, steer: 0.7 }, 54);
  assert.equal(craft.drifting, true);
  assert.ok(craft.boost >= MIN_BOOST_CHARGE);
});
