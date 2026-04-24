import * as THREE from 'three';
import { GameCase } from './GameCase';

export type ShelfGame = {
  id: string;
  name: string;
  frontUrl?: string | null;
  backUrl?: string | null;
  sideUrl?: string | null;
};

export type ShelfView = 'front' | 'spine' | 'back';
export type ShelfSelectionChangeDetail = { game: ShelfGame | null };
export const PS1_SELECTION_CHANGE_EVENT = 'ps1-selection-change';

type CaseTransform = {
  x: number;
  rotationY: number;
};

export class Ps1ShelfScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private cameraTarget = new THREE.Vector3(0, 0.6, 0);
  private freeCameraPosition = new THREE.Vector3(0, 1.2, 4);
  private freeCameraTarget = new THREE.Vector3(0, 0.6, 0);
  private cameraDesiredPosition = new THREE.Vector3(0, 1.2, 4);
  private cameraDesiredTarget = new THREE.Vector3(0, 0.6, 0);
  private frameId: number | null = null;
  private lastFrameTime = performance.now();
  private shelfMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> | null = null;
  private shelfGames: ShelfGame[] = [];
  private cases: GameCase[] = [];
  private baseTransforms: CaseTransform[] = [];
  private selectionProgress: number[] = [];
  private spinAngles: number[] = [];
  private selectedIndex: number | null = null;
  private view: ShelfView = 'spine';
  private pressedKeys = new Set<string>();
  private viewAnimation: {
    startTime: number;
    durationMs: number;
    from: CaseTransform[];
    to: CaseTransform[];
  } | null = null;
  private readonly viewAnimationDurationMs = 500;
  private readonly cameraFocusDamping = 8;
  private readonly cameraMoveSpeed = 2.4;
  private readonly cameraZoomSpeed = 0.01;
  private readonly cameraMinDistance = 1.5;
  private readonly cameraMaxDistance = 10;
  private readonly selectedCameraYOffset = 0.1;
  private readonly selectedCameraDefaultDistance = 2.1;
  private readonly selectedCameraMinDistance = 1.2;
  private readonly selectedCameraMaxDistance = 6;
  private selectedCameraDistance = 2.1;
  private readonly selectionOffsetZ = 1.2;
  private readonly selectionProgressDamping = 10;
  private readonly selectionSpinSpeed = Math.PI * 0.5;

  constructor(private container: HTMLElement, games: ShelfGame[] = []) {
    const { clientWidth, clientHeight } = this.container;

    // Core scene container and neutral background.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.TextureLoader().load('/public/background.jpg');
    this.scene.backgroundBlurriness = 0.9;

    // Camera framing: slightly above and in front of the shelf.
    this.camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, 0.1, 100);
    this.camera.position.copy(this.freeCameraPosition);
    this.camera.lookAt(this.cameraTarget);

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
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onClick = this.onClick.bind(this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.renderer.domElement.addEventListener('click', this.onClick);
  }

  private createShelf(gameCount: number ) {
    // A simple box stands in for the shelf.
    const geometry = new THREE.BoxGeometry(gameCount * 0.4, 0.2, 1.2);
    const material = new THREE.MeshStandardMaterial({ color: 0xd6b07a });
    const shelf = new THREE.Mesh(geometry, material);
    shelf.position.set(0, 0.3, 0);
    shelf.receiveShadow = true;
    this.scene.add(shelf);
    this.shelfMesh = shelf;
  }

  setGames(games: ShelfGame[]) {
    this.clearCases();
    this.shelfGames = [...games];
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
      gameCase.group.userData.caseIndex = index;
      gameCase.group.position.set(startX + index * spacing, shelfTopY + height / 2, 0);
      this.scene.add(gameCase.group);
      this.cases.push(gameCase);
    });

    this.baseTransforms = this.cases.map((gameCase) => ({
      x: gameCase.group.position.x,
      rotationY: gameCase.group.rotation.y
    }));
    this.selectionProgress = this.cases.map(() => 0);
    this.spinAngles = this.cases.map(() => 0);
    this.selectedIndex = null;
    this.applyView();
    this.dispatchSelectionChange();
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
    this.baseTransforms = transforms.map((transform) => ({ ...transform }));
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

  private updateSelectionAnimation(deltaSeconds: number) {
    this.cases.forEach((gameCase, index) => {
      const baseTransform = this.baseTransforms[index];
      if (!baseTransform) return;

      const isSelected = this.selectedIndex === index;
      const currentProgress = this.selectionProgress[index] ?? 0;
      const nextProgress = THREE.MathUtils.damp(
        currentProgress,
        isSelected ? 1 : 0,
        this.selectionProgressDamping,
        deltaSeconds
      );

      this.selectionProgress[index] = nextProgress;

      if (isSelected) {
        this.spinAngles[index] = (this.spinAngles[index] ?? 0) + this.selectionSpinSpeed * deltaSeconds;
      } else if (nextProgress < 0.001) {
        this.spinAngles[index] = 0;
      }

      gameCase.group.position.x = baseTransform.x;
      gameCase.group.position.z = nextProgress * this.selectionOffsetZ;
      gameCase.group.rotation.y = baseTransform.rotationY + nextProgress * (this.spinAngles[index] ?? 0);
    });
  }

  private updateCameraFocus(deltaSeconds: number) {
    if (this.selectedIndex !== null) {
      const selectedCase = this.cases[this.selectedIndex];
      if (selectedCase) {
        this.cameraDesiredTarget.copy(selectedCase.group.position);
        this.cameraDesiredTarget.y = selectedCase.group.position.y;
        this.cameraDesiredPosition.copy(this.cameraDesiredTarget);
        this.cameraDesiredPosition.y += this.selectedCameraYOffset;
        this.cameraDesiredPosition.z += this.selectedCameraDistance;
      }
    } else {
      this.cameraDesiredPosition.copy(this.freeCameraPosition);
      this.cameraDesiredTarget.copy(this.freeCameraTarget);
    }

    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      this.cameraDesiredPosition.x,
      this.cameraFocusDamping,
      deltaSeconds
    );
    this.camera.position.y = THREE.MathUtils.damp(
      this.camera.position.y,
      this.cameraDesiredPosition.y,
      this.cameraFocusDamping,
      deltaSeconds
    );
    this.camera.position.z = THREE.MathUtils.damp(
      this.camera.position.z,
      this.cameraDesiredPosition.z,
      this.cameraFocusDamping,
      deltaSeconds
    );

    this.cameraTarget.x = THREE.MathUtils.damp(
      this.cameraTarget.x,
      this.cameraDesiredTarget.x,
      this.cameraFocusDamping,
      deltaSeconds
    );
    this.cameraTarget.y = THREE.MathUtils.damp(
      this.cameraTarget.y,
      this.cameraDesiredTarget.y,
      this.cameraFocusDamping,
      deltaSeconds
    );
    this.cameraTarget.z = THREE.MathUtils.damp(
      this.cameraTarget.z,
      this.cameraDesiredTarget.z,
      this.cameraFocusDamping,
      deltaSeconds
    );

    this.camera.lookAt(this.cameraTarget);
  }

  private easeInOut(t: number) {
    return t * t * (3 - 2 * t);
  }

  private start() {
    // Continuous render loop used for both rendering and view animations.
    const animate = () => {
      this.frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const deltaSeconds = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      this.updateCameraMovement(deltaSeconds);
      this.updateViewAnimation();
      this.updateSelectionAnimation(deltaSeconds);
      this.updateCameraFocus(deltaSeconds);
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  //region Cleanup and generic utilities
  private onKeyDown(event: KeyboardEvent) {
    const key = this.mapMovementKey(event.key);
    if (!key || this.isTypingTarget(event.target)) return;

    if (this.selectedIndex !== null) {
      this.releaseSelectionToCurrentCamera();
    }

    this.pressedKeys.add(key);
    event.preventDefault();
  }

  private onKeyUp(event: KeyboardEvent) {
    const key = this.mapMovementKey(event.key);
    if (!key) return;
    this.pressedKeys.delete(key);
  }

  private mapMovementKey(key: string) {
    const normalized = key.toLowerCase();
    if (normalized === 'arrowup' || normalized === 'w') return 'up';
    if (normalized === 'arrowdown' || normalized === 's') return 'down';
    if (normalized === 'arrowleft' || normalized === 'a') return 'left';
    if (normalized === 'arrowright' || normalized === 'd') return 'right';
    return null;
  }

  private isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  private updateCameraMovement(deltaSeconds: number) {
    if (this.selectedIndex !== null || !this.pressedKeys.size) return;

    const direction = new THREE.Vector2(
      (this.pressedKeys.has('right') ? 1 : 0) - (this.pressedKeys.has('left') ? 1 : 0),
      (this.pressedKeys.has('up') ? 1 : 0) - (this.pressedKeys.has('down') ? 1 : 0)
    );

    if (!direction.lengthSq()) return;

    direction.normalize().multiplyScalar(this.cameraMoveSpeed * deltaSeconds);

    this.freeCameraPosition.x += direction.x;
    this.freeCameraPosition.y = THREE.MathUtils.clamp(this.freeCameraPosition.y + direction.y, 0.6, 3.5);
    this.freeCameraTarget.x += direction.x;
    this.freeCameraTarget.y = THREE.MathUtils.clamp(this.freeCameraTarget.y + direction.y, 0.2, 2.9);
  }

  private onWheel(event: WheelEvent) {
    event.preventDefault();

    if (this.selectedIndex !== null) {
      this.selectedCameraDistance = THREE.MathUtils.clamp(
        this.selectedCameraDistance + event.deltaY * this.cameraZoomSpeed,
        this.selectedCameraMinDistance,
        this.selectedCameraMaxDistance
      );
      return;
    }

    const cameraOffset = this.freeCameraPosition.clone().sub(this.freeCameraTarget);
    const currentDistance = cameraOffset.length();
    if (!currentDistance) return;

    const nextDistance = THREE.MathUtils.clamp(
      currentDistance + event.deltaY * this.cameraZoomSpeed,
      this.cameraMinDistance,
      this.cameraMaxDistance
    );

    cameraOffset.setLength(nextDistance);
    this.freeCameraPosition.copy(this.freeCameraTarget.clone().add(cameraOffset));
  }

  private onClick(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(this.cases.map((gameCase) => gameCase.group), true);
    const hit = intersections
      .map((intersection) => this.getCaseIndexFromObject(intersection.object))
      .find((index): index is number => index !== null);

    this.setSelectedIndex(hit ?? null);
  }

  private setSelectedIndex(index: number | null) {
    if (this.selectedIndex === index) return;
    this.selectedIndex = index;
    if (index !== null) {
      this.selectedCameraDistance = this.selectedCameraDefaultDistance;
    }
    this.dispatchSelectionChange();
  }

  private releaseSelectionToCurrentCamera() {
    this.freeCameraPosition.copy(this.camera.position);
    this.freeCameraTarget.copy(this.cameraTarget);
    this.setSelectedIndex(null);
  }

  private dispatchSelectionChange() {
    const game = this.selectedIndex === null ? null : this.shelfGames[this.selectedIndex] ?? null;
    this.container.dispatchEvent(new CustomEvent<ShelfSelectionChangeDetail>(PS1_SELECTION_CHANGE_EVENT, {
      detail: { game }
    }));
  }

  private getCaseIndexFromObject(object: THREE.Object3D | null) {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (typeof current.userData.caseIndex === 'number') return current.userData.caseIndex;
      current = current.parent;
    }
    return null;
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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.renderer.domElement.removeEventListener('click', this.onClick);
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
    this.shelfGames = [];
    this.baseTransforms = [];
    this.selectionProgress = [];
    this.spinAngles = [];
    this.selectedIndex = null;
  }
  //endregion
}
