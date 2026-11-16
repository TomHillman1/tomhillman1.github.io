export type Ps1QualityMode = 'auto' | 'high' | 'low';

/** Bound the long and short edges, including portrait viewports. Never upscale internally. */
export function getRenderSize(width: number, height: number, low: boolean) {
  const longEdge = low ? 426 : 640;
  const shortEdge = low ? 240 : 360;
  const scale = Math.min(1, longEdge / Math.max(width, height, 1), shortEdge / Math.max(Math.min(width, height), 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Auto downgrades once per selection; explicit Auto retries high quality. */
export class Ps1Quality {
  mode: Ps1QualityMode = 'auto';
  low = false;
  private warmup = 3000;
  private elapsed = 0;
  private frames = 0;

  setMode(mode: Ps1QualityMode) {
    this.mode = mode;
    this.low = mode === 'low';
    this.resetSamples();
  }

  resetSamples() {
    this.warmup = 3000;
    this.elapsed = 0;
    this.frames = 0;
  }

  sample(frameMs: number, ready: boolean) {
    if (!ready || frameMs <= 0 || frameMs > 1000) {
      this.resetSamples();
      return false;
    }
    if (this.mode !== 'auto' || this.low) return false;
    if (this.warmup > 0) {
      this.warmup -= frameMs;
      return false;
    }
    this.elapsed += frameMs;
    this.frames++;
    if (this.elapsed < 2000) return false;
    const slow = this.elapsed / this.frames > 1000 / 40;
    this.elapsed = 0;
    this.frames = 0;
    if (slow) this.low = true;
    return slow;
  }
}
