import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { getInspectionFrame } from '../src/components/3d/Ps1Inspection.ts';

const tv = new Box3(new Vector3(1, 1.4, 0), new Vector3(2.3, 2.5, 0.8));
const size = new Vector3(0.47, 0.51, 0.07);

function projectBox(box, camera) {
  const projected = new Box3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        projected.expandByPoint(new Vector3(x, y, z).project(camera));
      }
    }
  }
  return projected;
}

for (const aspect of [16 / 9, 4 / 3, 1, 9 / 16]) {
  test(`inspection frames the spinning case and TV without overlap at aspect ${aspect}`, () => {
    const frame = getInspectionFrame(tv, size, aspect);
    const camera = new PerspectiveCamera(45, aspect, 0.1, 100);
    camera.position.copy(frame.cameraPosition);
    camera.lookAt(frame.cameraTarget);
    camera.updateMatrixWorld(true);
    const diameter = Math.hypot(size.x, size.z);
    // Every rotation about Y stays inside this conservative box.
    const caseBounds = new Box3().setFromCenterAndSize(frame.casePosition, new Vector3(diameter, size.y, diameter));
    const projectedCase = projectBox(caseBounds, camera);
    const projectedTv = projectBox(tv, camera);
    for (const bounds of [projectedCase, projectedTv]) {
      assert.ok(bounds.min.x > -1 && bounds.max.x < 1, 'fits horizontally');
      assert.ok(bounds.min.y > -1 && bounds.max.y < 1, 'fits vertically');
      assert.ok(bounds.min.z > -1 && bounds.max.z < 1, 'inside camera clipping planes');
    }
    assert.ok(caseBounds.min.z > tv.max.z, 'case is in front of TV');
    if (aspect >= 1.1) assert.ok(projectedCase.max.x < projectedTv.min.x, 'TV is visible beside the case');
    else assert.ok(projectedTv.max.y < projectedCase.min.y, 'TV is visible below the case');
  });
}

test('moving the TV moves the whole inspection composition by the same amount', () => {
  const offset = new Vector3(2, 0.5, 1);
  const initial = getInspectionFrame(tv, size, 16 / 9);
  const moved = getInspectionFrame(tv.clone().translate(offset), size, 16 / 9);
  for (const key of ['cameraPosition', 'cameraTarget', 'casePosition']) {
    assert.ok(moved[key].distanceTo(initial[key].clone().add(offset)) < 1e-10);
  }
});

test('calculating a composition preserves the supplied model bounds and case dimensions', () => {
  const originalBounds = tv.clone();
  const originalSize = size.clone();
  getInspectionFrame(tv, size, 16 / 9);
  assert.ok(tv.equals(originalBounds));
  assert.ok(size.equals(originalSize));
});
