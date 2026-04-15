import * as THREE from 'three';
import { GameCase } from './GameCase';

export type ShelfGame = {
  id: string;
  frontUrl?: string | null;
  backUrl?: string | null;
  sideUrl?: string | null;
};

export type ShelfView = 'front' | 'spine' | 'back';

type CaseTransform = {
  x: number;
  rotationY: number;
};

export class Ps1ShelfScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private frameId: number | null = null;
  private shelfMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;
  private cases: GameCase[] = [];
  private view: ShelfView = 'front';
  private viewAnimation: {
    startTime: number;
    durationMs: number;
    from: CaseTransform[];
    to: CaseTransform[];
  } | null = null;
  private readonly viewAnimationDurationMs = 500;

  constructor(private container: HTMLElement, games: ShelfGame[] = []) {
    const { clientWidth, clientHeight } = this.container;

    // Core scene container and neutral background.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.TextureLoader().load('/public/background.jpg');
    this.scene.backgroundBlurriness = 0.9;

    // Camera framing: slightly above and in front of the shelf.
    this.camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, 0.1, 100);
    this.camera.position.set(0, 1.2, 4);
    this.camera.lookAt(0, 0.6, 0);

    // WebGL renderer bound to the provided DOM container.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    // Basic lighting so the shelf has visible shading.
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(2, 4, 3);
    this.scene.add(ambient, keyLight);

    // Add a single shelf mesh to start with.
    this.createShelf(games.length);
    // Add GameCases for each game on the shelf.
    this.setGames(games);
    // Start a simple render loop.
    this.start();

    // Keep the renderer and camera in sync with container size.
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  private createShelf(gameCount: number ) {
    // A simple box stands in for the shelf.
    const geometry = new THREE.BoxGeometry(gameCount * 1.31 + 2, 0.2, 1.2);
    const material = new THREE.MeshStandardMaterial({ color: 0xd6b07a });
    const shelf = new THREE.Mesh(geometry, material);
    shelf.position.set(0, 0.3, 0);
    shelf.receiveShadow = true;
    this.scene.add(shelf);
    this.shelfMesh = shelf;
  }

  setGames(games: ShelfGame[]) {
    this.clearCases();
    if (!games?.length) return;

    const width = 1.31;
    const height = 1.43;
    const depth = 0.2;
    const spacing = width * 1.1;
    const startX = -((games.length - 1) * spacing) / 2;
    const shelfTopY = 0.3 + 0.1;

    games.forEach((game, index) => {
      const gameCase = new GameCase({
        width,
        height,
        depth,
        frontUrl: game.frontUrl ?? null,
        backUrl: game.backUrl ?? null,
        sideUrl: game.sideUrl ?? null
      });
      gameCase.group.position.set(startX + index * spacing, shelfTopY + height / 2, 0);
      this.scene.add(gameCase.group);
      this.cases.push(gameCase);
    });

    this.applyView();
  }

  cycleView() {
    if (this.view === 'front') this.view = 'spine';
    else if (this.view === 'spine') this.view = 'back';
    else this.view = 'front';

    this.applyView(true);
    return this.view;
  }

  getView() {
    return this.view;
  }

  private applyView(animate = false) {
    if (!this.cases.length) return;

    const to = this.getViewTransforms(this.view);

    if (!animate) {
      this.viewAnimation = null;
      this.applyTransforms(to);
      return;
    }

    this.viewAnimation = {
      startTime: performance.now(),
      durationMs: this.viewAnimationDurationMs,
      from: this.getCurrentTransforms(),
      to
    };
  }

  private getViewTransforms(view: ShelfView): CaseTransform[] {
    const frontSpacing = 1.31 * 1.1;
    const spineSpacing = 0.2 * 1.8;
    const spacing = view === 'spine' ? spineSpacing : frontSpacing;
    const startX = -((this.cases.length - 1) * spacing) / 2;
    const rotationY = view === 'front'
      ? 0
      : view === 'spine'
        ? Math.PI / 2
        : Math.PI;

    return this.cases.map((_, index) => ({
      x: startX + index * spacing,
      rotationY
    }));
  }

  private getCurrentTransforms(): CaseTransform[] {
    return this.cases.map((gameCase) => ({
      x: gameCase.group.position.x,
      rotationY: gameCase.group.rotation.y
    }));
  }

  private applyTransforms(transforms: CaseTransform[]) {
    this.cases.forEach((gameCase, index) => {
      const transform = transforms[index];
      if (!transform) return;
      gameCase.group.position.x = transform.x;
      gameCase.group.rotation.y = transform.rotationY;
    });
  }

  private updateViewAnimation() {
    if (!this.viewAnimation) return;

    const elapsedMs = performance.now() - this.viewAnimation.startTime;
    const rawProgress = Math.min(elapsedMs / this.viewAnimation.durationMs, 1);
    const progress = this.easeInOut(rawProgress);
    const transforms = this.viewAnimation.to.map((target, index) => {
      const start = this.viewAnimation!.from[index] ?? target;
      return {
        x: THREE.MathUtils.lerp(start.x, target.x, progress),
        rotationY: THREE.MathUtils.lerp(start.rotationY, target.rotationY, progress)
      };
    });

    this.applyTransforms(transforms);

    if (rawProgress >= 1) {
      this.applyTransforms(this.viewAnimation.to);
      this.viewAnimation = null;
    }
  }

  private easeInOut(t: number) {
    return t * t * (3 - 2 * t);
  }

  private start() {
    // Continuous render loop used for both rendering and view animations.
    const animate = () => {
      this.frameId = requestAnimationFrame(animate);
      this.updateViewAnimation();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  //region Cleanup and generic utilities
  private onResize() {
    // Resize handler to keep the aspect ratio correct.
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  destroy() {
    // Cleanup GPU resources and DOM when the view unmounts.
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onResize);
    if (this.shelfMesh) {
      this.shelfMesh.geometry.dispose();
      this.shelfMesh.material.dispose();
    }
    this.clearCases();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  private clearCases() {
    for (const gameCase of this.cases) {
      this.scene.remove(gameCase.group);
      gameCase.dispose();
    }
    this.cases = [];
  }
  //endregion
}
