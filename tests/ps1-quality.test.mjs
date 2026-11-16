import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getRenderSize, Ps1Quality } from '../src/components/3d/Ps1Quality.ts';

test('render buffers are bounded, preserve orientation and never exceed the viewport', () => {
  assert.deepEqual(getRenderSize(1920, 1080, 'high'), { width: 640, height: 360 });
  assert.deepEqual(getRenderSize(1080, 1920, 'high'), { width: 360, height: 640 });
  assert.deepEqual(getRenderSize(200, 100, 'high'), { width: 200, height: 100 });
  assert.deepEqual(getRenderSize(0, 0, 'low'), { width: 1, height: 1 });
  assert.deepEqual(getRenderSize(1920, 1080, 'ultra'), { width: 1280, height: 720 });
  assert.deepEqual(getRenderSize(1080, 1920, 'ultra'), { width: 720, height: 1280 });
  assert.deepEqual(getRenderSize(800, 450, 'ultra'), { width: 800, height: 450 });
  const low = getRenderSize(1920, 1080, 'low');
  assert.ok(low.width <= 426 && low.height <= 240);
  assert.ok(Math.abs(low.width / low.height - 16 / 9) < 0.01);
});

const sample = (quality, count, ms, ready = true) => {
  let changes = 0;
  for (let i = 0; i < count; i++) changes += Number(quality.sample(ms, ready));
  return changes;
};

test('auto ignores loading and warmup then downgrades sustained slow rendering only once', () => {
  const quality = new Ps1Quality();
  assert.equal(sample(quality, 200, 50, false), 0);
  assert.equal(sample(quality, 60, 50), 0);
  assert.equal(sample(quality, 40, 50), 1);
  assert.equal(quality.low, true);
  assert.equal(sample(quality, 200, 50), 0);
});

test('fast frames and an isolated stall do not downgrade; resuming starts fresh', () => {
  const quality = new Ps1Quality();
  sample(quality, 400, 16);
  quality.sample(200, true);
  sample(quality, 200, 16);
  assert.equal(quality.low, false);
  quality.sample(5000, true);
  assert.equal(sample(quality, 60, 50), 0);
});

test('manual modes override adaptation and Auto permits a fresh quality trial', () => {
  const quality = new Ps1Quality();
  quality.setMode('high');
  sample(quality, 300, 50);
  assert.equal(quality.low, false);
  quality.setMode('low');
  sample(quality, 400, 8);
  assert.equal(quality.low, true);
  quality.setMode('ultra');
  sample(quality, 300, 50);
  assert.equal(quality.low, false);
  assert.equal(quality.mode, 'ultra');
  quality.setMode('auto');
  assert.equal(quality.low, false);
  assert.equal(sample(quality, 100, 50), 1);
});
