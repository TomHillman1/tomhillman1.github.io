import * as THREE from 'three';
import { GameCase } from './GameCase';

export type ShelfGame = {
  id: string;
  frontUrl?: string | null;
  backUrl?: string | null;
};

export class Ps1ShelfScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private frameId: number | null = null;
  private shelfMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;
  private cases: GameCase[] = [];

  constructor(private container: HTMLElement, games: ShelfGame[] = []) {
    const { clientWidth, clientHeight } = this.container;

    // Core scene container and neutral background.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f1e8);

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
    this.createShelf();
    //Add GameCases for each game on the shelf.
    this.setGames(games);
    // Start a simple render loop.
    this.start();

    // Keep the renderer and camera in sync with container size.
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  private createShelf() {
    // A simple box stands in for the shelf.
    const geometry = new THREE.BoxGeometry(4.5, 0.2, 1.2);
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

    const width = 0.32;
    const height = 0.24;
    const depth = 0.02;
    const spacing = width * 1.1;
    const startX = -((games.length - 1) * spacing) / 2;
    const shelfTopY = 0.3 + 0.1;

    games.forEach((game, index) => {
      const gameCase = new GameCase({
        width,
        height,
        depth,
        frontUrl: game.frontUrl ?? null,
        backUrl: game.backUrl ?? null
      });
      gameCase.group.position.set(startX + index * spacing, shelfTopY + height / 2, 0);
      this.scene.add(gameCase.group);
      this.cases.push(gameCase);
    });
  }

  private start() {
    // Continuous render loop (no animations yet).
    const animate = () => {
      this.frameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

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
}
