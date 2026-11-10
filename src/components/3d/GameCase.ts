import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadTexture } from './materials';

export type GameCaseOptions = {
  width?: number;
  height?: number;
  depth?: number;
  frontUrl?: string | null;
  backUrl?: string | null;
  sideUrl?: string | null;
  caseColor?: number;
  /** Shared reflection map owned by the scene, not by this case. */
  environmentMap?: THREE.Texture;
  trackAssetLoad?: <T>(promise: Promise<T>) => Promise<T>;
};

/** Closed PAL jewel case: moulded tray, two clear shells and recessed paper inserts. */
export class GameCase {
  public group = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private disposed = false;
  private readonly trackAssetLoad?: <T>(promise: Promise<T>) => Promise<T>;

  constructor(options: GameCaseOptions) {
    const width = options.width ?? 0.125;
    const height = options.height ?? 0.142;
    const depth = options.depth ?? 0.017;
    const rim = Math.min(width, height) * 0.009;
    const hingeWidth = width * 0.072;
    const paperZ = depth * 0.37;
    this.trackAssetLoad = options.trackAssetLoad;
    this.group.name = 'pal-ps1-jewel-case';

    const trayMaterial = new THREE.MeshPhysicalMaterial({
      color: options.caseColor ?? 0x181a1d,
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.3,
      clearcoatRoughness: 0.26,
      envMap: options.environmentMap ?? null,
      envMapIntensity: 0.45
    });
    const edgeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xdce7ed,
      roughness: 0.16,
      metalness: 0,
      ior: 1.49,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      envMap: options.environmentMap ?? null,
      envMapIntensity: 0.85
    });
    const windowMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.085,
      metalness: 0,
      ior: 1.49,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      envMap: options.environmentMap ?? null,
      envMapIntensity: 0.7
    });
    // Thin plastic needs reflection, but almost no refraction. Composite the physical
    // specular term over the paper with Fresnel coverage, avoiding a transmission pass
    // that would render the entire furnished bedroom a second time every frame.
    windowMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', /* glsl */`
        float facing = saturate(dot(normal, geometryViewDir));
        float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
        gl_FragColor = vec4(totalSpecular, fresnel);
      `);
    };
    windowMaterial.customProgramCacheKey = () => 'jewel-case-thin-plastic-v1';
    this.materials.push(trayMaterial, edgeMaterial, windowMaterial);

    const tray: THREE.BufferGeometry[] = [];
    const edges: THREE.BufferGeometry[] = [];
    const windows: THREE.BufferGeometry[] = [];
    const box = (parts: THREE.BufferGeometry[], w: number, h: number, d: number,
      x: number, y: number, z: number, radius = rim * 0.3) => {
      const geometry = new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 2, h / 2, d / 2));
      geometry.translate(x, y, z);
      parts.push(geometry);
    };

    // An opaque inner tray gives the clear perimeter real depth and dark seams.
    box(tray, width - rim * 3, height - rim * 3, depth * 0.68, 0, 0, 0);
    box(tray, hingeWidth, height - rim * 3, depth * 0.78,
      -width / 2 + rim * 1.5 + hingeWidth / 2, 0, depth * 0.05);

    // Fine moulded ribs on the hinge strip, visible through the front lid.
    for (let i = 0; i < 7; i++) {
      box(tray, rim * 0.35, height - rim * 5, rim * 0.6,
        -width / 2 + rim * 2 + (hingeWidth - rim * 2) * i / 6, 0, depth * 0.445);
    }

    // Two separate shell rims leave a narrow closing seam around the case.
    for (const sign of [-1, 1]) {
      const shellDepth = depth * 0.47;
      const shellZ = sign * depth * 0.265;
      for (const side of [-1, 1]) {
        box(edges, width, rim, shellDepth, 0, side * (height - rim) / 2, shellZ);
        // Only the edge bead is solid here; the broad side wall is a clear window.
        // A full-depth rail would overlap that window and cloud the spine artwork.
        box(edges, rim, height - rim * 2, rim,
          side * (width - rim) / 2, 0, sign * (depth - rim) / 2);
      }

      // Single outward-facing surfaces avoid layering both sides of a closed box.
      const window = new THREE.PlaneGeometry(width - rim * 2, height - rim * 2);
      if (sign < 0) window.rotateY(Math.PI);
      window.translate(0, 0, sign * depth / 2);
      windows.push(window);

      // Raised lid lip catches a thin highlight above the recessed artwork.
      for (const side of [-1, 1]) {
        box(edges, width - rim * 2, rim * 0.45, rim * 0.6,
          0, side * (height / 2 - rim * 1.3), sign * (depth / 2 - rim * 0.3));
      }
    }

    // Clear spine walls sit outside the printed paper, just like the cover windows.
    for (const sign of [-1, 1]) {
      const spineWindow = new THREE.PlaneGeometry(depth - rim * 2, height - rim * 2);
      spineWindow.rotateY(sign * Math.PI / 2);
      spineWindow.translate(sign * width / 2, 0, 0);
      windows.push(spineWindow);
    }

    for (const sign of [-1, 1]) {
      // Hinge knuckles and small booklet retaining tabs remain within the case bounds.
      box(edges, hingeWidth * 0.7, height * 0.055, depth * 0.92,
        -width / 2 + hingeWidth * 0.55, sign * height * 0.41, 0);
      box(edges, width * 0.038, rim * 1.8, rim,
        width * 0.15, sign * (height / 2 - rim * 2.5), depth * 0.43);
      box(tray, rim * 0.8, height * 0.065, depth * 0.26,
        width / 2 - rim * 1.4, sign * height * 0.32, 0);
    }

    this.addParts('black-disc-tray-and-hinge', tray, trayMaterial, true);
    this.addParts('clear-moulded-rims-and-clips', edges, edgeMaterial);
    this.addParts('clear-lid-back-and-spine', windows, windowMaterial);

    const paperMaterial = () => {
      const material = new THREE.MeshStandardMaterial({
        color: 0xf4f1e9,
        roughness: 0.92,
        metalness: 0
      });
      this.materials.push(material);
      return material;
    };
    const frontMaterial = paperMaterial();
    const backMaterial = paperMaterial();
    const spineMaterial = paperMaterial();

    // Preserve each supplied image in full; inset it rather than cropping to the shell.
    const front = this.addPaper('front-booklet', width - hingeWidth - rim * 5,
      height - rim * 5, frontMaterial);
    front.position.set(hingeWidth / 2, 0, paperZ);
    const back = this.addPaper('rear-paper-inlay', width - rim * 5, height - rim * 5, backMaterial);
    back.position.z = -paperZ;
    back.rotation.y = Math.PI;

    const spine = this.addPaper('spine-paper-inlay', height - rim * 5, depth * 0.72, spineMaterial);
    spine.position.x = -width / 2 + rim * 1.15;
    // Keep the existing horizontal spine-image orientation used by the collection.
    spine.rotation.set(0, -Math.PI / 2, -Math.PI / 2, 'XYZ');

    void this.applyTexture(frontMaterial, options.frontUrl);
    void this.applyTexture(backMaterial, options.backUrl);
    void this.applyTexture(spineMaterial, options.sideUrl);
  }

  private addParts(name: string, parts: THREE.BufferGeometry[], material: THREE.Material, castShadow = false) {
    // Batch mouldings by material: extra detail does not mean a draw call for every rib.
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = castShadow;
    this.group.add(mesh);
  }

  private addPaper(name: string, width: number, height: number, material: THREE.Material) {
    const geometry = new THREE.PlaneGeometry(width, height);
    this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    this.group.add(mesh);
    return mesh;
  }

  private async applyTexture(material: THREE.MeshStandardMaterial, url?: string | null) {
    if (!url) return;
    try {
      const texturePromise = this.trackAssetLoad ? this.trackAssetLoad(loadTexture(url)) : loadTexture(url);
      const texture = await texturePromise;
      if (this.disposed) {
        texture.dispose();
        return;
      }
      material.color.set(0xffffff);
      material.map = texture;
      material.needsUpdate = true;
    } catch (err) {
      console.warn('Failed to load texture:', url, err);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials) {
      if ('map' in material) (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
  }
}
