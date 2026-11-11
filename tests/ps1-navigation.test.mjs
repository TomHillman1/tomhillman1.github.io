import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Vector3 } from 'three';
import { Ps1Navigation } from '../src/components/3d/Ps1Navigation.ts';

const box = (min, max) => new Box3(new Vector3(...min), new Vector3(...max));
function room() {
  const navigation = new Ps1Navigation(0.25, 1.6);
  navigation.setRoom(box([-5, 0, -5], [5, 3, 5]));
  return navigation;
}

test('the player stays inside all four walls at fixed eye height', () => {
  for (const [x, z] of [[100, 0], [-100, 0], [0, 100], [0, -100]]) {
    const navigation = room();
    const position = new Vector3(0, 9, 0);
    navigation.move(position, new Vector3(x, 10, z));
    assert.equal(position.y, 1.6);
    assert.equal(Math.max(Math.abs(position.x), Math.abs(position.z)), 4.75);
    assert.ok(navigation.isFree(position));
  }
});

test('a large movement cannot tunnel through a thin object in either direction', () => {
  for (const sign of [-1, 1]) {
    const navigation = room();
    navigation.setObstacle({}, box([-2, 0, -0.01], [2, 2, 0.01]));
    const position = new Vector3(0, 1.6, -sign * 3);
    navigation.move(position, new Vector3(0, 0, sign * 6));
    assert.equal(position.z, -sign * 0.26);
    assert.ok(navigation.isFree(position));
  }
});

test('walking diagonally into furniture slides along its face', () => {
  const navigation = room();
  navigation.setObstacle({}, box([0, 0, -4], [1, 2, 4]));
  const position = new Vector3(-1, 1.6, -2);
  navigation.move(position, new Vector3(2, 0, 2));
  assert.equal(position.x, -0.25);
  assert.ok(Math.abs(position.z) < 1e-10);
  assert.ok(navigation.isFree(position));
});

test('diagonal movement stops at an enclosed corner without penetrating either wall', () => {
  const navigation = room();
  navigation.setObstacle({}, box([0, 0, -5], [1, 2, 5]));
  navigation.setObstacle({}, box([-5, 0, 0], [5, 2, 1]));
  const position = new Vector3(-1, 1.6, -1);
  navigation.move(position, new Vector3(3, 0, 3));
  assert.deepEqual(position.toArray(), [-0.25, 1.6, -0.25]);
  assert.ok(navigation.isFree(position));
});

test('low furniture blocks the body, while overhead objects and floor surfaces do not', () => {
  const navigation = room();
  navigation.setObstacle({}, box([-5, -0.02, -5], [5, 0.018, 5]));
  navigation.setObstacle({}, box([-5, 2, -5], [5, 3, 5]));
  const position = new Vector3(-2, 1.6, 0);
  navigation.move(position, new Vector3(4, 0, 0));
  assert.equal(position.x, 2);
  navigation.setObstacle({}, box([-0.5, 0, -1], [0.5, 0.5, 1]));
  navigation.move(position, new Vector3(-4, 0, 0));
  assert.equal(position.x, 0.75);
});

test('an asynchronously loaded object gets a new safe spawn without moving a valid one', () => {
  const navigation = room();
  const preferred = new Vector3(0, 1.6, 0);
  assert.deepEqual(navigation.findFreePosition(preferred).toArray(), preferred.toArray());
  navigation.setObstacle({}, box([-1, 0, -1], [1, 2, 1]));
  const safe = navigation.findFreePosition(preferred);
  assert.ok(safe && navigation.isFree(safe));
  assert.equal(safe.distanceTo(preferred), 1.25);
  assert.deepEqual(preferred.toArray(), [0, 1.6, 0]);
});

test('updating and removing an object leaves no stale collision bounds', () => {
  const navigation = room();
  const owner = {};
  const position = new Vector3(0, 1.6, 0);
  navigation.setObstacle(owner, box([-1, 0, -1], [1, 2, 1]));
  assert.equal(navigation.isFree(position), false);
  navigation.setObstacle(owner, box([2, 0, 2], [3, 2, 3]));
  assert.equal(navigation.isFree(position), true);
  navigation.removeObstacle(owner);
  assert.equal(navigation.isFree(new Vector3(2.5, 1.6, 2.5)), true);
});

test('rebuilding the room clears obstacles and requires fresh room bounds', () => {
  const navigation = room();
  navigation.setObstacle({}, box([-1, 0, -1], [1, 2, 1]));
  navigation.clear();
  assert.equal(navigation.findFreePosition(new Vector3()), null);
  navigation.setRoom(box([-5, 0, -5], [5, 3, 5]));
  assert.ok(navigation.isFree(new Vector3(0, 1.6, 0)));
});

test('a fully occupied room cannot provide a valid spawn', () => {
  const navigation = room();
  navigation.setObstacle({}, box([-5, 0, -5], [5, 3, 5]));
  assert.equal(navigation.findFreePosition(new Vector3(0, 1.6, 0)), null);
});
