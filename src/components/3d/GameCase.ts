import * as THREE from 'three';
import { loadTexture } from './materials';

export type GameCaseOptions = {
  width?: number;
  height?: number;
  depth?: number;
  frontUrl?: string | null;
  backUrl?: string | null;
  sideUrl?: string | null;
  caseColor?: number;
};

export class GameCase {
  public group: THREE.Group;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(options: GameCaseOptions) {
    const width = options.width ?? 0.32;
    const height = options.height ?? 0.24;
    const depth = options.depth ?? 0.02;

    this.group = new THREE.Group();

    const caseGeom = new THREE.BoxGeometry(width, height, depth);
    const caseMat = new THREE.MeshStandardMaterial({
      color: options.caseColor ?? 0xe7e1d6,
      roughness: 0.6,
      metalness: 0.05
    });
    const caseMesh = new THREE.Mesh(caseGeom, caseMat);
    this.group.add(caseMesh);

    const coverGeom = new THREE.PlaneGeometry(width * 0.96, height * 0.96);
    const spineGeom = new THREE.PlaneGeometry(height * 0.96, depth * 0.85);
    const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const backMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const spineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    const frontMesh = new THREE.Mesh(coverGeom, frontMat);
    frontMesh.position.z = depth / 2 + 0.001;
    this.group.add(frontMesh);

    const backMesh = new THREE.Mesh(coverGeom, backMat);
    backMesh.position.z = -depth / 2 - 0.001;
    backMesh.rotation.y = Math.PI;
    this.group.add(backMesh);

    const spineMesh = new THREE.Mesh(spineGeom, spineMat);
    spineMesh.position.x = -width / 2 - 0.001;
    spineMesh.rotation.set(0, -Math.PI / 2, Math.PI / 2, 'XYZ');
    this.group.add(spineMesh);

    this.geometries.push(caseGeom, coverGeom, spineGeom);
    this.materials.push(caseMat, frontMat, backMat, spineMat);

    void this.applyTexture(frontMat, options.frontUrl);
    void this.applyTexture(backMat, options.backUrl);
    void this.applyTexture(spineMat, options.sideUrl);
  }

  private async applyTexture(material: THREE.MeshStandardMaterial, url?: string | null) {
    if (!url) return;
    try {
      const texture = await loadTexture(url);
      material.map = texture;
      material.needsUpdate = true;
    } catch (err) {
      console.warn('Failed to load texture:', url, err);
    }
  }

  dispose() {
    for (const material of this.materials) {
      if ('map' in material) {
        const mat = material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.dispose();
      }
      material.dispose();
    }
    for (const geometry of this.geometries) geometry.dispose();
  }
}
