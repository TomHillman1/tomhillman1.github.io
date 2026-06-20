import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type Ps1PostProcessingOptions = {
  pixelSize?: number;
  colorLevels?: number;
  ditherStrength?: number;
  scanlineStrength?: number;
  jitterStrength?: number;
  vignetteStrength?: number;
};

const ps1RetroShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    pixelSize: { value: 3 },
    colorLevels: { value: 32 },
    ditherStrength: { value: 0.65 },
    scanlineStrength: { value: 0.06 },
    jitterStrength: { value: 0.2 },
    vignetteStrength: { value: 0.12 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time;
    uniform float pixelSize;
    uniform float colorLevels;
    uniform float ditherStrength;
    uniform float scanlineStrength;
    uniform float jitterStrength;
    uniform float vignetteStrength;
    varying vec2 vUv;

    float hash(float value) {
      return fract(sin(value * 91.3458) * 47453.5453);
    }

    float bayer2(vec2 position) {
      vec2 cell = mod(floor(position), 2.0);

      if (cell.y < 1.0) {
        return cell.x < 1.0 ? 0.0 : 0.5;
      }

      return cell.x < 1.0 ? 0.75 : 0.25;
    }

    void main() {
      vec2 virtualResolution = max(floor(resolution / pixelSize), vec2(1.0));
      vec2 snappedUv = (floor(vUv * virtualResolution) + 0.5) / virtualResolution;

      float frame = floor(time * 15.0);
      vec2 jitter = vec2(hash(frame) - 0.5, hash(frame + 17.0) - 0.5);
      snappedUv += jitter * jitterStrength / resolution;
      snappedUv = clamp(snappedUv, vec2(0.0), vec2(1.0));

      vec4 texel = texture2D(tDiffuse, snappedUv);
      float levels = max(colorLevels - 1.0, 1.0);
      float dither = (bayer2(gl_FragCoord.xy / pixelSize) - 0.375) * ditherStrength;
      vec3 color = floor(clamp(texel.rgb, 0.0, 1.0) * levels + dither) / levels;

      float scanline = mod(floor(gl_FragCoord.y / pixelSize), 2.0);
      color *= 1.0 - scanline * scanlineStrength;

      vec2 centeredUv = vUv * 2.0 - 1.0;
      float vignette = smoothstep(0.35, 1.4, dot(centeredUv, centeredUv));
      color *= 1.0 - vignette * vignetteStrength;

      gl_FragColor = vec4(color, texel.a);
    }
  `
};

export class Ps1PostProcessing {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly retroPass: ShaderPass;
  private readonly outputPass: OutputPass;
  private readonly pixelSize: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: Ps1PostProcessingOptions = {}
  ) {
    this.pixelSize = options.pixelSize ?? 3;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.retroPass = new ShaderPass(ps1RetroShader);
    this.outputPass = new OutputPass();

    this.retroPass.uniforms.colorLevels.value = options.colorLevels ?? 32;
    this.retroPass.uniforms.ditherStrength.value = options.ditherStrength ?? 0.65;
    this.retroPass.uniforms.scanlineStrength.value = options.scanlineStrength ?? 0.06;
    this.retroPass.uniforms.jitterStrength.value = options.jitterStrength ?? 0.2;
    this.retroPass.uniforms.vignetteStrength.value = options.vignetteStrength ?? 0.12;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.retroPass);
    this.composer.addPass(this.outputPass);

    const size = renderer.getSize(new THREE.Vector2());
    this.setSize(size.x, size.y, renderer.getPixelRatio());
  }

  render(deltaSeconds: number, elapsedSeconds: number) {
    this.retroPass.uniforms.time.value = elapsedSeconds;
    this.composer.render(deltaSeconds);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.retroPass.uniforms.resolution.value.set(width * pixelRatio, height * pixelRatio);
    this.retroPass.uniforms.pixelSize.value = this.pixelSize * pixelRatio;
  }

  dispose() {
    this.renderPass.dispose();
    this.retroPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
  }
}
