export type Ps1QualityMode = 'auto' | 'ultra' | 'high' | 'low';

/** Bound the long and short edges, including portrait viewports. Never upscale internally. */
export function getRenderSize(width: number, height: number, quality: Exclude<Ps1QualityMode, 'auto'>) {
  const longEdge = quality === 'ultra' ? 1280 : quality === 'low' ? 426 : 640;
  const shortEdge = quality === 'ultra' ? 720 : quality === 'low' ? 240 : 360;
  const scale = Math.min(1, longEdge / Math.max(width, height, 1), shortEdge / Math.max(Math.min(width, height), 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Renderer strings are hints, not a reliable browser acceleration setting. */
export function initialQuality(renderer: unknown): 'ultra' | 'high' {
  if (typeof renderer !== 'string' || /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b|lavapipe/i.test(renderer)) return 'high';
  return /nvidia|geforce|quadro|radeon|\bamd\b|intel|apple|adreno|mali|powervr|vivante/i.test(renderer) ? 'ultra' : 'high';
}

export function detectInitialQuality(gl: WebGLRenderingContext | WebGL2RenderingContext): 'ultra' | 'high' {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? initialQuality(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'high';
  } catch {
    return 'high';
  }
}

/** Auto steps down after sustained slow frames; reselecting Auto retries its initial tier. */
export class Ps1Quality {
  mode: Ps1QualityMode = 'auto';
  private initial: 'ultra' | 'high';
  private automatic: 'ultra' | 'high' | 'low';
  private warmup = 3000;
  private elapsed = 0;
  private frames = 0;

  constructor(initial: 'ultra' | 'high' = 'high') {
    this.initial = initial;
    this.automatic = initial;
  }

  get level(): Exclude<Ps1QualityMode, 'auto'> {
    return this.mode === 'auto' ? this.automatic : this.mode;
  }

  get low() { return this.level === 'low'; }

  setMode(mode: Ps1QualityMode) {
    this.mode = mode;
    this.automatic = this.initial;
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
    if (slow) {
      this.automatic = this.automatic === 'ultra' ? 'high' : 'low';
      this.resetSamples();
    }
    return slow;
  }
}
