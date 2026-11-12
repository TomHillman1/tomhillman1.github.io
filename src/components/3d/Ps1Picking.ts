import type { Object3D, Raycaster } from 'three';

/** Share the exact visibility rules between hover feedback and click selection. */
export function pickVisibleGame(raycaster: Raycaster, cases: Object3D[], blockers: Object3D[]): number | null {
  const hit = raycaster.intersectObjects(cases, true)[0];
  if (!hit) return null;
  let object: Object3D | null = hit.object;
  while (object && typeof object.userData.caseIndex !== 'number') object = object.parent;
  if (!object) return null;

  // Only test scenery in front of the case. Empty-space mouse movement never
  // traverses the detailed room models, and distant meshes can be rejected early.
  const previousFar = raycaster.far;
  raycaster.far = Math.min(previousFar, hit.distance);
  try {
    for (const blocker of blockers) {
      const obstruction = raycaster.intersectObject(blocker, true)[0];
      if (obstruction && obstruction.distance < hit.distance - 0.0001) return null;
    }
    return object.userData.caseIndex;
  } finally {
    raycaster.far = previousFar;
  }
}
