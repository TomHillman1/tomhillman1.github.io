import { Box3, MathUtils, Vector3 } from 'three';

/** Compose the case and TV at the default zoom; wheel zoom must not move either. */
export function getInspectionFrame(tvBounds: Box3, caseSize: Vector3, aspect: number, fov = 45) {
  const tvCenter = tvBounds.getCenter(new Vector3());
  const tvSize = tvBounds.getSize(new Vector3());
  const tanY = Math.tan(MathUtils.degToRad(fov / 2));
  const tanX = tanY * Math.max(aspect, 0.25);
  const portrait = aspect < 1.1;
  // Account for the full silhouette of a spinning case, not only its front face.
  const caseDiameter = Math.hypot(caseSize.x, caseSize.z);
  const caseDistance = Math.max(
    caseSize.y / (2 * tanY * (portrait ? 0.36 : 0.58)),
    caseDiameter / (2 * tanX * (portrait ? 0.66 : 0.38))
  ) + caseDiameter / 2;
  const tvDistance = Math.max(
    tvSize.y / (2 * tanY * (portrait ? 0.32 : 0.62)),
    tvSize.x / (2 * tanX * (portrait ? 0.72 : 0.38)),
    caseDistance + 1.5
  );
  const cameraPosition = new Vector3(
    tvCenter.x - (portrait ? 0 : tvDistance * tanX * 0.48),
    tvCenter.y + (portrait ? tvDistance * tanY * 0.48 : 0),
    tvBounds.max.z + tvDistance
  );
  const casePosition = cameraPosition.clone().add(new Vector3(
    portrait ? 0 : -caseDistance * tanX * 0.45,
    // Leave space above the foreground case for a two-line game title.
    portrait ? caseDistance * tanY * 0.28 : 0,
    -caseDistance
  ));
  return {
    cameraPosition,
    cameraTarget: cameraPosition.clone().add(new Vector3(0, 0, -1)),
    casePosition
  };
}
