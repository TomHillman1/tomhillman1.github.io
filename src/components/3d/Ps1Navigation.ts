import { Box3, Vector3 } from 'three';

/** Static room collisions for a grounded player. Positions refer to eye level. */
export class Ps1Navigation {
  readonly radius: number;
  readonly eyeHeight: number;
  private readonly bodyHeight: number;
  private room: Box3 | null = null;
  private obstacles = new Map<object, Box3>();

  constructor(radius: number, eyeHeight: number) {
    this.radius = radius;
    this.eyeHeight = eyeHeight;
    this.bodyHeight = eyeHeight + radius;
  }

  setRoom(bounds: Box3) {
    this.room = bounds.clone();
  }

  setObstacle(owner: object, bounds: Box3) {
    if (!bounds.isEmpty()) this.obstacles.set(owner, bounds.clone());
  }

  removeObstacle(owner: object) {
    this.obstacles.delete(owner);
  }

  clear() {
    this.obstacles.clear();
    this.room = null;
  }

  private blocksPlayer(box: Box3) {
    return box.max.y > 0.02 && box.min.y < this.bodyHeight;
  }

  isFree(position: Vector3) {
    const room = this.room;
    const r = this.radius;
    if (!room || position.x < room.min.x + r || position.x > room.max.x - r ||
        position.z < room.min.z + r || position.z > room.max.z - r) return false;

    for (const box of this.obstacles.values()) {
      if (this.blocksPlayer(box) &&
          position.x > box.min.x - r && position.x < box.max.x + r &&
          position.z > box.min.z - r && position.z < box.max.z + r) return false;
    }
    return true;
  }

  /** Recover a safe position after an asynchronously loaded prop overlaps the player. */
  findFreePosition(preferred: Vector3): Vector3 | null {
    if (!this.room) return null;
    const candidate = preferred.clone();
    candidate.y = this.eyeHeight;
    if (this.isFree(candidate)) return candidate;

    let nearest: Vector3 | null = null;
    let nearestDistance = Infinity;
    const step = this.radius;
    for (let x = this.room.min.x + this.radius; x <= this.room.max.x - this.radius; x += step) {
      for (let z = this.room.min.z + this.radius; z <= this.room.max.z - this.radius; z += step) {
        candidate.set(x, this.eyeHeight, z);
        const distance = candidate.distanceToSquared(preferred);
        if (distance < nearestDistance && this.isFree(candidate)) {
          nearest = candidate.clone();
          nearestDistance = distance;
        }
      }
    }
    return nearest;
  }

  /** Sweep each horizontal axis, allowing movement along the face of an obstacle. */
  move(position: Vector3, displacement: Vector3) {
    if (!this.room) return;
    // Small steps avoid cutting diagonally across a corner. Axis sweeps also stop
    // large movements from tunnelling through thin objects.
    const steps = Math.max(1, Math.ceil(Math.hypot(displacement.x, displacement.z) / (this.radius / 2)));
    for (let step = 0; step < steps; step++) {
      this.moveAxis(position, 'x', displacement.x / steps);
      this.moveAxis(position, 'z', displacement.z / steps);
    }
    position.y = this.eyeHeight;
  }

  private moveAxis(position: Vector3, axis: 'x' | 'z', amount: number) {
    if (!amount || !this.room) return;
    const other = axis === 'x' ? 'z' : 'x';
    const r = this.radius;
    const start = position[axis];
    let end = Math.max(this.room.min[axis] + r, Math.min(this.room.max[axis] - r, start + amount));
    for (const box of this.obstacles.values()) {
      if (!this.blocksPlayer(box) || position[other] <= box.min[other] - r ||
          position[other] >= box.max[other] + r) continue;

      const near = box.min[axis] - r;
      const far = box.max[axis] + r;
      if (amount > 0 && start <= near && end > near) end = near;
      if (amount < 0 && start >= far && end < far) end = far;
    }
    position[axis] = end;
  }
}
