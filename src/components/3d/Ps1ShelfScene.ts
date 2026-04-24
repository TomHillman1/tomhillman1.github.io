import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameCase } from './GameCase';
import bookshelfUrl from '../../assets/bookshelf.glb?url';
import gameBoyColorUrl from '../../assets/game_boy_color.glb?url';

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
  y: number;
  z: number;
  rotationY: number;
};

type ShelfRowSpec = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

type RowLayout = {
  minX: number;
  maxX: number;
  spacing: number;
};

export class Ps1ShelfScene {
  private static readonly gltfLoader = new GLTFLoader();

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
  private shelfObject: THREE.Object3D | null = null;
  private shelfPropObjects: THREE.Object3D[] = [];
  private shelfBounds: THREE.Box3 | null = null;
  private shelfDebugGroup: THREE.Group | null = null;
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
  private shelfLoadVersion = 0;
  private shelfGameCount = -1;
  private isDestroyed = false;
  private readonly viewAnimationDurationMs = 500;
  private readonly cameraFocusDamping = 8;
  private readonly cameraMoveSpeed = 2.4;
  private readonly cameraZoomSpeed = 0.01;
  private readonly cameraMinDistance = 1.5;
  private readonly cameraMaxDistance = 24;
  private readonly selectedCameraYOffset = 0.1;
  private readonly selectedCameraDefaultDistance = 2.1;
  private readonly selectedCameraMinDistance = 1.2;
  private readonly selectedCameraMaxDistance = 10;
  private selectedCameraDistance = 2.1;
  private readonly showShelfDebug = import.meta.env.DEV;
  private readonly targetShelfWidth = 3.8;
  private readonly caseWidth = 1.31;
  private readonly caseHeight = 1.43;
  private readonly caseDepth = 0.2;
  private readonly selectionOffsetZ = 1.2;
  private readonly selectionProgressDamping = 10;
  private readonly selectionSpinSpeed = Math.PI * 0.5;
  private readonly shelfCaseXPadding = 0.03;
  private readonly shelfCaseBottomPadding = 0.005;
  private readonly shelfCaseZPadding = 0.04;
  private readonly shelfPropGap = 0.08;
  private readonly shelfPropRowIndex = 1;
  private readonly shelfRowSpecs: ShelfRowSpec[] = [
    { minX: 0.04, maxX: 0.96, minY: 0.76, maxY: 0.985, minZ: 0.16, maxZ: 0.82 },
    { minX: 0.04, maxX: 0.96, minY: 0.52, maxY: 0.745, minZ: 0.16, maxZ: 0.82 },
    { minX: 0.04, maxX: 0.96, minY: 0.26, maxY: 0.505, minZ: 0.16, maxZ: 0.82 },
    { minX: 0.04, maxX: 0.96, minY: 0.025, maxY: 0.235, minZ: 0.16, maxZ: 0.82 }
  ];

  constructor(private container: HTMLElement, games: ShelfGame[] = []) {
    const { clientWidth, clientHeight } = this.container;

    // Core scene container and neutral background.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.TextureLoader().load('/src/assets/background.jpg');
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

    // Add the shelf model, falling back to a basic box if loading fails.
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

  private createShelf(gameCount: number) {
    this.shelfGameCount = gameCount;
    const loadVersion = ++this.shelfLoadVersion;
    void this.loadShelfModel(gameCount, loadVersion);
  }

  private async loadShelfModel(gameCount: number, loadVersion: number) {
    this.clearShelf();

    try {
      const gltf = await Ps1ShelfScene.gltfLoader.loadAsync(bookshelfUrl);
      if (this.isDestroyed || loadVersion !== this.shelfLoadVersion) {
        this.disposeObjectResources(gltf.scene);
        return;
      }

      const shelf = gltf.scene;
      shelf.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const bounds = new THREE.Box3().setFromObject(shelf);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = size.x > 0 ? this.targetShelfWidth / size.x : 1;

      shelf.scale.setScalar(scale);
      shelf.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);

      this.scene.add(shelf);
      this.shelfObject = shelf;
      this.updateShelfBoundsFromObject(shelf);
      void this.loadShelfProps(loadVersion);
      this.renderShelfDebug();
      this.applyView();
      this.updateFreeCameraFrame();
    } catch (err) {
      if (this.isDestroyed || loadVersion !== this.shelfLoadVersion) return;
      console.warn('Failed to load bookshelf.glb, falling back to a box shelf.', err);
      this.createFallbackShelf(gameCount);
    }
  }

  private createFallbackShelf(gameCount: number) {
    // Keep a basic platform so the scene still works if the model cannot load.
    const geometry = new THREE.BoxGeometry(gameCount * 0.4, 0.2, 1.2);
    const material = new THREE.MeshStandardMaterial({ color: 0xd6b07a });
    const shelf = new THREE.Mesh(geometry, material);
    shelf.position.set(0, 0.3, 0);
    shelf.receiveShadow = true;
    this.scene.add(shelf);
    this.shelfObject = shelf;
    this.updateShelfBoundsFromObject(shelf);
    void this.loadShelfProps(this.shelfLoadVersion);
    this.renderShelfDebug();
    this.applyView();
    this.updateFreeCameraFrame();
  }

  private updateShelfBoundsFromObject(object: THREE.Object3D) {
    this.shelfBounds = new THREE.Box3().setFromObject(object);
  }

  private getShelfRowBoxes() {
    if (!this.shelfBounds) return [];
    const bounds = this.shelfBounds;
    const size = bounds.getSize(new THREE.Vector3());

    return this.shelfRowSpecs.map((spec) => new THREE.Box3(
      new THREE.Vector3(
        bounds.min.x + size.x * spec.minX,
        bounds.min.y + size.y * spec.minY,
        bounds.min.z + size.z * spec.minZ
      ),
      new THREE.Vector3(
        bounds.min.x + size.x * spec.maxX,
        bounds.min.y + size.y * spec.maxY,
        bounds.min.z + size.z * spec.maxZ
      )
    ));
  }

  private renderShelfDebug() {
    this.clearShelfDebug();
    if (!this.showShelfDebug || !this.shelfBounds) return;

    const debugGroup = new THREE.Group();
    const shelfSize = this.shelfBounds.getSize(new THREE.Vector3());
    const shelfCenter = this.shelfBounds.getCenter(new THREE.Vector3());
    const outline = new THREE.Mesh(
      new THREE.BoxGeometry(shelfSize.x, shelfSize.y, shelfSize.z),
      new THREE.MeshBasicMaterial({ color: 0xff8855, wireframe: true, transparent: true, opacity: 0.2 })
    );
    outline.position.copy(shelfCenter);
    debugGroup.add(outline);

    const rowColors = [0x3b82f6, 0x10b981, 0xf59e0b, 0xef4444];
    this.getShelfRowBoxes().forEach((rowBox, index) => {
      const rowSize = rowBox.getSize(new THREE.Vector3());
      const rowCenter = rowBox.getCenter(new THREE.Vector3());
      const rowMesh = new THREE.Mesh(
        new THREE.BoxGeometry(rowSize.x, rowSize.y, rowSize.z),
        new THREE.MeshBasicMaterial({
          color: rowColors[index % rowColors.length],
          wireframe: true,
          transparent: true,
          opacity: 0.35
        })
      );
      rowMesh.position.copy(rowCenter);
      debugGroup.add(rowMesh);
    });

    this.scene.add(debugGroup);
    this.shelfDebugGroup = debugGroup;

    const size = this.shelfBounds.getSize(new THREE.Vector3());
    console.info('Bookshelf bounds after scaling', {
      min: this.shelfBounds.min.toArray(),
      max: this.shelfBounds.max.toArray(),
      size: size.toArray()
    });
  }

  private updateFreeCameraFrame() {
    const bounds = this.shelfBounds;
    if (!bounds) return;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const halfFovY = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const halfFovX = Math.atan(Math.tan(halfFovY) * this.camera.aspect);
    const distanceForHeight = (size.y * 0.55) / Math.tan(halfFovY);
    const distanceForWidth = (size.x * 0.6) / Math.tan(halfFovX || halfFovY);
    const distance = THREE.MathUtils.clamp(
      Math.max(distanceForHeight, distanceForWidth, size.z * 1.8) + 0.8,
      4,
      this.cameraMaxDistance
    );

    this.freeCameraTarget.set(center.x, center.y, center.z);
    this.freeCameraPosition.set(center.x, center.y + size.y * 0.04, center.z + distance);

    if (this.selectedIndex === null) {
      this.cameraTarget.copy(this.freeCameraTarget);
      this.cameraDesiredTarget.copy(this.freeCameraTarget);
      this.camera.position.copy(this.freeCameraPosition);
      this.cameraDesiredPosition.copy(this.freeCameraPosition);
      this.camera.lookAt(this.cameraTarget);
    }
  }

  setGames(games: ShelfGame[]) {
    if (games.length !== this.shelfGameCount) {
      this.createShelf(games.length);
    }

    this.clearCases();
    this.shelfGames = [...games];
    if (!games?.length) return;

    const width = this.caseWidth;
    const height = this.caseHeight;
    const depth = this.caseDepth;

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
      this.scene.add(gameCase.group);
      this.cases.push(gameCase);
    });

    this.baseTransforms = this.cases.map(() => ({
      x: 0,
      y: 0,
      z: 0,
      rotationY: Math.PI / 2
    }));
    this.selectionProgress = this.cases.map(() => 0);
    this.spinAngles = this.cases.map(() => 0);
    this.selectedIndex = null;
    this.applyView();
    if (this.shelfBounds) {
      void this.loadShelfProps(this.shelfLoadVersion);
    }
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
    if (view === 'spine' && this.shelfBounds) {
      return this.getShelfSpineTransforms();
    }

    return this.getDisplayTransforms(view);
  }

  private getShelfSpineTransforms(): CaseTransform[] {
    const rowBoxes = this.getShelfRowBoxes();
    if (!rowBoxes.length) return this.getDisplayTransforms('spine');

    const transforms: CaseTransform[] = [];
    const rowCounts = this.distributeGamesAcrossRows(this.cases.length, rowBoxes.length);

    rowBoxes.forEach((rowBox, rowIndex) => {
      const count = rowCounts[rowIndex] ?? 0;
      if (!count) return;

      const rowLayout = this.getShelfRowLayout(rowBox, count);
      const caseCenterY = rowBox.min.y + this.caseHeight / 2 + this.shelfCaseBottomPadding;
      const centerZ = THREE.MathUtils.clamp(
        rowBox.max.z - this.caseWidth / 2 - this.shelfCaseZPadding,
        rowBox.min.z + this.caseWidth / 2,
        rowBox.max.z - this.caseWidth / 2
      );

      for (let column = 0; column < count; column += 1) {
        transforms.push({
          x: rowLayout.minX + column * rowLayout.spacing,
          y: caseCenterY,
          z: centerZ,
          rotationY: Math.PI / 2
        });
      }
    });

    return transforms;
  }

  private getDisplayTransforms(view: ShelfView): CaseTransform[] {
    const frontSpacing = this.caseWidth * 1.1;
    const startX = -((this.cases.length - 1) * frontSpacing) / 2;
    const rotationY = view === 'front' ? 0 : view === 'back' ? Math.PI : Math.PI / 2;
    const shelfCenterY = this.shelfBounds?.getCenter(new THREE.Vector3()).y ?? this.caseHeight;
    const frontZ = (this.shelfBounds?.max.z ?? 0) + this.caseWidth * 0.65;

    return this.cases.map((_, index) => ({
      x: startX + index * frontSpacing,
      y: shelfCenterY,
      z: frontZ,
      rotationY
    }));
  }

  private distributeGamesAcrossRows(totalGames: number, rowCount: number) {
    if (rowCount <= 0) return [];
    const baseCount = Math.floor(totalGames / rowCount);
    const remainder = totalGames % rowCount;
    return Array.from({ length: rowCount }, (_, index) => baseCount + (index < remainder ? 1 : 0));
  }

  private getShelfRowLayout(rowBox: THREE.Box3, count: number): RowLayout {
    const minX = rowBox.min.x + this.caseDepth / 2 + this.shelfCaseXPadding;
    const maxX = rowBox.max.x - this.caseDepth / 2 - this.shelfCaseXPadding;
    const availableWidth = Math.max(maxX - minX, 0);
    const spacing = count > 1
      ? Math.min(this.caseDepth * 1.08, availableWidth / Math.max(count - 1, 1))
      : 0;

    return { minX, maxX, spacing };
  }

  private async loadShelfProps(loadVersion: number) {
    this.clearShelfProps();

    const rowBoxes = this.getShelfRowBoxes();
    const targetRow = rowBoxes[this.shelfPropRowIndex];
    if (!targetRow) return;

    try {
      const gameBoy = await this.loadShelfProp({
        loadVersion,
        url: gameBoyColorUrl,
        rowBox: targetRow,
        rowIndex: this.shelfPropRowIndex,
        rotationY: 0
      });

      if (gameBoy) {
        this.scene.add(gameBoy);
        this.shelfPropObjects.push(gameBoy);
      }
    } catch (err) {
      console.warn('Failed to load shelf prop:', gameBoyColorUrl, err);
    }
  }

  private async loadShelfProp(options: {
    loadVersion: number;
    url: string;
    rowBox: THREE.Box3;
    rowIndex: number;
    rotationY: number;
  }) {
    const gltf = await Ps1ShelfScene.gltfLoader.loadAsync(options.url);
    if (this.isDestroyed || options.loadVersion !== this.shelfLoadVersion) {
      this.disposeObjectResources(gltf.scene);
      return null;
    }

    const rawObject = gltf.scene;
    rawObject.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const rawBounds = new THREE.Box3().setFromObject(rawObject);
    const rawSize = rawBounds.getSize(new THREE.Vector3());
    if (!rawSize.x || !rawSize.y || !rawSize.z) {
      this.disposeObjectResources(rawObject);
      return null;
    }

    const rowCounts = this.distributeGamesAcrossRows(this.cases.length, this.shelfRowSpecs.length);
    const gamesOnRow = rowCounts[options.rowIndex] ?? 0;
    const rowLayout = this.getShelfRowLayout(options.rowBox, gamesOnRow);
    const lastGameX = gamesOnRow > 0
      ? rowLayout.minX + (gamesOnRow - 1) * rowLayout.spacing
      : options.rowBox.min.x + this.shelfCaseXPadding;
    const propStartX = gamesOnRow > 0
      ? lastGameX + this.caseDepth / 2 + this.shelfPropGap
      : options.rowBox.min.x + this.shelfCaseXPadding;
    const availableWidth = Math.max(options.rowBox.max.x - this.shelfCaseXPadding - propStartX, 0);
    if (availableWidth < 0.08) {
      this.disposeObjectResources(rawObject);
      return null;
    }

    const rowSize = options.rowBox.getSize(new THREE.Vector3());
    const targetHeight = rowSize.y * 0.8;
    const targetWidth = availableWidth;
    const targetDepth = rowSize.z * 0.7;
    const scale = Math.min(
      targetHeight / rawSize.y,
      targetWidth / rawSize.x,
      targetDepth / rawSize.z
    );

    const scaledWidth = rawSize.x * scale;
    const scaledDepth = rawSize.z * scale;
    const center = rawBounds.getCenter(new THREE.Vector3());

    rawObject.scale.setScalar(scale);
    rawObject.position.set(-center.x * scale, -rawBounds.min.y * scale, -center.z * scale);

    const anchor = new THREE.Group();
    anchor.add(rawObject);
    anchor.position.set(
      propStartX + scaledWidth / 2,
      options.rowBox.min.y,
      options.rowBox.max.z - scaledDepth / 2 - this.shelfCaseZPadding
    );
    anchor.rotation.y = options.rotationY;

    return anchor;
  }

  private getCurrentTransforms(): CaseTransform[] {
    return this.cases.map((gameCase) => ({
      x: gameCase.group.position.x,
      y: gameCase.group.position.y,
      z: gameCase.group.position.z,
      rotationY: gameCase.group.rotation.y
    }));
  }

  private applyTransforms(transforms: CaseTransform[]) {
    this.baseTransforms = transforms.map((transform) => ({ ...transform }));
    this.syncCasesToBaseTransforms();
  }

  private syncCasesToBaseTransforms() {
    this.cases.forEach((gameCase, index) => {
      const transform = this.baseTransforms[index];
      if (!transform) return;
      gameCase.group.position.set(transform.x, transform.y, transform.z);
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
        y: THREE.MathUtils.lerp(start.y, target.y, progress),
        z: THREE.MathUtils.lerp(start.z, target.z, progress),
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
      gameCase.group.position.y = baseTransform.y;
      gameCase.group.position.z = baseTransform.z + nextProgress * this.selectionOffsetZ;
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

    const maxY = (this.shelfBounds?.max.y ?? this.caseHeight * 2) + 2;
    this.freeCameraPosition.x += direction.x;
    this.freeCameraPosition.y = THREE.MathUtils.clamp(this.freeCameraPosition.y + direction.y, 0.6, Math.max(3.5, maxY));
    this.freeCameraTarget.x += direction.x;
    this.freeCameraTarget.y = THREE.MathUtils.clamp(this.freeCameraTarget.y + direction.y, 0.2, Math.max(2.9, maxY - 0.5));
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
    this.updateFreeCameraFrame();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  destroy() {
    // Cleanup GPU resources and DOM when the view unmounts.
    this.isDestroyed = true;
    this.shelfLoadVersion += 1;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.clearShelf();
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

  private clearShelf() {
    this.clearShelfDebug();
    this.clearShelfProps();
    if (!this.shelfObject) return;

    this.scene.remove(this.shelfObject);
    this.disposeObjectResources(this.shelfObject);
    this.shelfObject = null;
    this.shelfBounds = null;
  }

  private clearShelfDebug() {
    if (!this.shelfDebugGroup) return;

    this.scene.remove(this.shelfDebugGroup);
    this.disposeObjectResources(this.shelfDebugGroup);
    this.shelfDebugGroup = null;
  }

  private clearShelfProps() {
    for (const object of this.shelfPropObjects) {
      this.scene.remove(object);
      this.disposeObjectResources(object);
    }
    this.shelfPropObjects = [];
  }

  private disposeObjectResources(object: THREE.Object3D) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => this.disposeMaterialResources(material));
      } else {
        this.disposeMaterialResources(child.material);
      }
    });
  }

  private disposeMaterialResources(material: THREE.Material) {
    Object.values(material).forEach((value) => {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    });
    material.dispose();
  }
  //endregion
}
