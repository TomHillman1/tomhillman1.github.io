import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { pickVisibleGame } from '../src/components/3d/Ps1Picking.ts';

function box(x, z, width = 1) {
  const mesh = new Mesh(new BoxGeometry(width, 1, 0.2), new MeshBasicMaterial());
  mesh.position.set(x, 0, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function game(index, z) {
  const root = new Group();
  root.userData.caseIndex = index;
  const nested = new Group();
  nested.add(box(0, z));
  root.add(nested);
  root.updateMatrixWorld(true);
  return root;
}

const ray = () => new Raycaster(new Vector3(), new Vector3(0, 0, -1), 0, 100);

test('the nearest case is selected through nested meshes, independent of list order', () => {
  assert.equal(pickVisibleGame(ray(), [game(3, -5), game(7, -3)], []), 7);
});

test('furniture in front of a game blocks both hover and selection', () => {
  assert.equal(pickVisibleGame(ray(), [game(0, -3)], [box(0, -2)]), null);
});

test('scenery behind a game does not hide its target', () => {
  assert.equal(pickVisibleGame(ray(), [game(0, -3)], [box(0, -4)]), 0);
});

test('a visible game can be targeted through a real opening in furniture', () => {
  const furniture = new Group();
  furniture.add(box(-1, -2), box(1, -2));
  furniture.updateMatrixWorld(true);
  assert.equal(pickVisibleGame(ray(), [game(0, -3)], [furniture]), 0);
});

test('a blocked pick does not leave a short ray distance on the following pick', () => {
  const raycaster = ray();
  assert.equal(pickVisibleGame(raycaster, [game(0, -3)], [box(0, -2)]), null);
  assert.equal(raycaster.far, 100);
  assert.equal(pickVisibleGame(raycaster, [game(1, -8)], []), 1);
  assert.equal(raycaster.far, 100);
});

test('empty space and cases beyond the ray distance are not selectable', () => {
  const raycaster = ray();
  assert.equal(pickVisibleGame(raycaster, [], [box(0, -2)]), null);
  raycaster.far = 2;
  assert.equal(pickVisibleGame(raycaster, [game(0, -3)], []), null);
  raycaster.far = 100;
  raycaster.ray.direction.set(1, 0, 0);
  assert.equal(pickVisibleGame(raycaster, [game(0, -3)], []), null);
});
