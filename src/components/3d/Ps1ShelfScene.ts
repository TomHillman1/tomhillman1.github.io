import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GameCase } from './GameCase';
import { loadTexture } from './materials';
import { Ps1PostProcessing } from './Ps1PostProcessing';
import { Ps1Navigation } from './Ps1Navigation';
import { getInspectionFrame } from './Ps1Inspection';
import { pickVisibleGame } from './Ps1Picking';
import bookshelfUrl from '../../assets/bookshelf.glb?url';
import gameBoyColorUrl from '../../assets/game_boy_color.glb?url';
import nokiaUrl from '../../assets/nokia_6230.glb?url';
import discmanUrl from '../../assets/sony_discman_d-181.glb?url';
import tamagotchiURl from '../../assets/tamagotchi.glb?url';
import backgroundUrl from '../../assets/background.jpg?url';

const roomModelUrls = import.meta.glob([
  '../../assets/room/bed.glb',
  '../../assets/room/nightstand.glb',
  '../../assets/room/baseballhat.glb',
  '../../assets/room/desk.glb',
  '../../assets/room/computer.glb',
  '../../assets/room/deskfan.glb',
  '../../assets/room/trashcan.glb',
  '../../assets/room/chair.glb',
  '../../assets/room/crt_tv.glb',
  '../../assets/room/psone.glb',
  '../../assets/room/floor_lamp.glb',
  '../../assets/room/beanbag.glb'
], {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>;

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
export type ShelfGamePressDetail = { game: ShelfGame };
export const PS1_GAME_PRESS_EVENT = 'ps1-game-press';
export type ShelfLoadingProgressDetail = {
  active: boolean;
  loaded: number;
  total: number;
  progress: number;
};
export const PS1_LOADING_PROGRESS_EVENT = 'ps1-loading-progress';
export type Ps1CameraMode = 'navigate' | 'inspect';
export type Ps1NavigationChangeDetail = { locked: boolean; mode: Ps1CameraMode; returning: boolean; error: string };
export const PS1_NAVIGATION_CHANGE_EVENT = 'ps1-navigation-change';
export type ShelfHoverChangeDetail = { game: ShelfGame | null };
export const PS1_HOVER_CHANGE_EVENT = 'ps1-hover-change';

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

type RoomPropConfig = {
  filename: string;
  label: string;
  position: THREE.Vector3;
  targetSize: THREE.Vector3;
  scaleMode?: 'fit' | 'height';
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  alignToFloor?: boolean;
};

export class Ps1ShelfScene {
  private static readonly gltfLoader = new GLTFLoader();

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private postProcessing: Ps1PostProcessing;
  private controls: PointerLockControls;
  private cameraMode: Ps1CameraMode = 'navigate';
  private navigationOrientation = new THREE.Quaternion();
  private inspectionFrame: ReturnType<typeof getInspectionFrame> | null = null;
  private returnAnimation: { position: THREE.Vector3; orientation: THREE.Quaternion; elapsed: number } | null = null;
  private readonly returnDuration = 0.65;
  private caseRotation = new THREE.Quaternion();
  private navigationInitialized = false;
  private navigationError = '';
  private lockRequested = false;
  private movementForward = new THREE.Vector3();
  private movementRight = new THREE.Vector3();
  private movementDelta = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerClient = new THREE.Vector2();
  private pointerInside = false;
  private hoveredIndex: number | null = null;
  private hoverElapsed = 0;
  private resizeObserver: ResizeObserver;
  private cameraTarget = new THREE.Vector3(0, 0.6, 0);
  private freeCameraPosition = new THREE.Vector3(0, 1.2, 4);
  private cameraDesiredPosition = new THREE.Vector3(0, 1.2, 4);
  private cameraDesiredTarget = new THREE.Vector3(0, 0.6, 0);
  private frameId: number | null = null;
  private lastFrameTime = performance.now();
  private backgroundTexture: THREE.Texture | null = null;
  private caseEnvironment: THREE.WebGLRenderTarget;
  private roomGroup: THREE.Group | null = null;
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
  private roomLoadVersion = 0;
  private shelfGameCount = -1;
  private isDestroyed = false;
  private trackedPendingLoads = 0;
  private trackedBatchTotalLoads = 0;
  private trackedBatchLoadedLoads = 0;
  private readonly viewAnimationDurationMs = 500;
  private readonly cameraFocusDamping = 8;
  private readonly cameraMoveSpeed = 2.4;
  private readonly defaultFov = 45;
  private readonly showShelfDebug = false;
  private readonly roomDepth = 9.5;
  private readonly roomMinWidth = 11;
  // Treat the wall as eight feet high, with a three-foot game shelf.
  private readonly roomHeight = 6.5;
  private readonly navigation = new Ps1Navigation(0.28, this.roomHeight * 0.64);
  private readonly targetShelfHeight = this.roomHeight * 3 / 8;
  private readonly referenceShelfWidth = 2.53;
  private shelfContentScale = 1;
  private get caseWidth() { return 0.87 * this.shelfContentScale; }
  private get caseHeight() { return 0.94 * this.shelfContentScale; }
  private get caseDepth() { return 0.13 * this.shelfContentScale; }
  private readonly selectionProgressDamping = 10;
  private readonly selectionSpinSpeed = Math.PI * 0.5;
  private get shelfCaseXPadding() { return 0.03 * this.shelfContentScale; }
  private get shelfCaseBottomPadding() { return 0.005 * this.shelfContentScale; }
  private get shelfCaseZPadding() { return 0.04 * this.shelfContentScale; }
  private get shelfPropGap() { return 0.08 * this.shelfContentScale; }
  private readonly shelfPropRowIndex = 1;
  private readonly shelfRowSpecs: ShelfRowSpec[] = [
    { minX: 0.04, maxX: 0.96, minY: 0.76, maxY: 0.985, minZ: 0.16, maxZ: 0.82 },
    { minX: 0.04, maxX: 0.96, minY: 0.52, maxY: 0.745, minZ: 0.16, maxZ: 0.82 },
    { minX: 0.04, maxX: 0.96, minY: 0.26, maxY: 0.505, minZ: 0.16, maxZ: 0.82 },
    { minX: 0.04, maxX: 0.96, minY: 0.025, maxY: 0.235, minZ: 0.16, maxZ: 0.82 }
  ];

  constructor(private container: HTMLElement, games: ShelfGame[] = []) {
    const { clientWidth, clientHeight } = this.container;

    // Core scene container and dark fallback background.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080604);
    void this.loadBackground();

    // The grounded spawn is assigned once the shelf establishes the room bounds.
    this.camera = new THREE.PerspectiveCamera(this.defaultFov, clientWidth / Math.max(clientHeight, 1), 0.1, 100);
    this.camera.position.copy(this.freeCameraPosition);
    this.camera.lookAt(this.cameraTarget);

    // WebGL renderer bound to the provided DOM container.
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // One shared indoor reflection map gives the clear cases moving highlights.
    // Assign it only to case plastic so the bedroom's existing lighting is preserved.
    const reflectionRoom = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.caseEnvironment = pmrem.fromScene(reflectionRoom, 0.02);
    reflectionRoom.dispose();
    pmrem.dispose();
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'PS1 room. Click to navigate with WASD and mouse. C toggles crouching. Escape releases the mouse.');
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.controls.minPolarAngle = 0.1;
    this.controls.maxPolarAngle = Math.PI - 0.1;
    this.controls.pointerSpeed = 0.75;
    this.postProcessing = new Ps1PostProcessing(this.renderer, this.scene, this.camera, {
      pixelSize: 1,
      colorLevels: 24,
      ditherStrength: 0.65,
      scanlineStrength: 0.06,
      jitterStrength: 0.2,
      vignetteStrength: 0.12
    });

    this.addRoomLighting();

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
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.renderer.domElement.addEventListener('click', this.onClick);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.pauseNavigation);
  }

  private async loadBackground() {
    try {
      const texture = await this.trackAssetLoad(loadTexture(backgroundUrl));
      if (this.isDestroyed) {
        texture.dispose();
        return;
      }

      this.backgroundTexture?.dispose();
      this.backgroundTexture = texture;
      this.rebuildRoom();
    } catch (err) {
      console.warn('Failed to load scene background texture.', err);
    }
  }

  private addRoomLighting() {
    const ambient = new THREE.AmbientLight(0xfff6e6, 0.62);
    const hemisphere = new THREE.HemisphereLight(0xfff2d5, 0x7a6348, 0.85);
    const frontFill = new THREE.DirectionalLight(0xfff0d0, 0.45);
    frontFill.position.set(0, 2.4, 6);
    this.scene.add(ambient, hemisphere, frontFill);
  }

  private rebuildRoom() {
    this.clearRoom();
    if (!this.shelfBounds) return;

    const loadVersion = ++this.roomLoadVersion;
    const group = new THREE.Group();
    group.name = 'ps1-bedroom-room';

    const room = this.getRoomMetrics();
    this.navigation.setRoom(new THREE.Box3(
      new THREE.Vector3(room.leftX, 0, room.rearZ),
      new THREE.Vector3(room.rightX, room.height, room.frontZ)
    ));
    if (this.shelfObject) this.registerObstacle(this.shelfObject);
    this.shelfPropObjects.forEach((object) => this.registerObstacle(object));
    this.cases.forEach((gameCase) => this.registerObstacle(gameCase.group));
    this.createRoomShell(group, room);
    this.createCeilingLight(group, room);
    this.createBuiltInRoomFurniture(group, room);

    this.scene.add(group);
    this.roomGroup = group;
    void this.loadRoomProps(loadVersion, group, room);
  }

  private getRoomMetrics() {
    const bounds = this.shelfBounds!;
    const shelfSize = bounds.getSize(new THREE.Vector3());
    const shelfCenter = bounds.getCenter(new THREE.Vector3());
    const width = Math.max(this.roomMinWidth, shelfSize.x * 3.5);
    const height = this.roomHeight;
    const rearZ = bounds.min.z - 0.08;
    const depth = this.roomDepth;
    const centerX = shelfCenter.x;
    const centerZ = rearZ + depth / 2;

    return {
      width,
      height,
      depth,
      centerX,
      centerZ,
      rearZ,
      frontZ: rearZ + depth,
      leftX: centerX - width / 2,
      rightX: centerX + width / 2,
      shelfCenter,
      shelfSize
    };
  }

  private createRoomShell(group: THREE.Group, room: ReturnType<Ps1ShelfScene['getRoomMetrics']>) {
    const wallMaterial = this.createWallpaperMaterial(room.width / 2.4, room.height / 1.8);
    const leftWallMaterial = this.createWallpaperMaterial(room.depth / 2.4, room.height / 1.8);
    const rightWallMaterial = this.createWallpaperMaterial(room.depth / 2.4, room.height / 1.8);
    const carpetMaterial = this.createCarpetMaterial();
    const ceilingMaterial = this.createPopcornCeilingMaterial();
    const baseboardMaterial = new THREE.MeshStandardMaterial({
      color: 0xa87445,
      roughness: 0.82,
      metalness: 0.02
    });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), wallMaterial);
    backWall.name = 'wallpaper-back-wall';
    backWall.position.set(room.centerX, room.height / 2, room.rearZ);
    backWall.receiveShadow = true;
    group.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.height), wallMaterial.clone());
    frontWall.name = 'wallpaper-front-wall';
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(room.centerX, room.height / 2, room.frontZ);
    frontWall.receiveShadow = true;
    group.add(frontWall);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.depth), carpetMaterial);
    floor.name = 'low-pile-carpet';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.centerX, -0.015, room.centerZ);
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(room.width, room.depth), ceilingMaterial);
    ceiling.name = 'popcorn-ceiling';
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(room.centerX, room.height + 0.015, room.centerZ);
    ceiling.receiveShadow = true;
    group.add(ceiling);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, room.height), leftWallMaterial);
    leftWall.name = 'left-wall';
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(room.leftX, room.height / 2, room.centerZ);
    leftWall.receiveShadow = true;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(room.depth, room.height), rightWallMaterial);
    rightWall.name = 'right-wall';
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(room.rightX, room.height / 2, room.centerZ);
    rightWall.receiveShadow = true;
    group.add(rightWall);

    const backBaseboard = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.08, 0.05), baseboardMaterial);
    backBaseboard.position.set(room.centerX, 0.04, room.rearZ + 0.03);
    backBaseboard.castShadow = true;
    backBaseboard.receiveShadow = true;
    group.add(backBaseboard);

    const frontBaseboard = backBaseboard.clone();
    frontBaseboard.geometry = backBaseboard.geometry.clone();
    frontBaseboard.material = baseboardMaterial.clone();
    frontBaseboard.position.z = room.frontZ - 0.03;
    group.add(frontBaseboard);

    const leftBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, room.depth), baseboardMaterial.clone());
    leftBaseboard.position.set(room.leftX + 0.03, 0.04, room.centerZ);
    leftBaseboard.castShadow = true;
    leftBaseboard.receiveShadow = true;
    group.add(leftBaseboard);

    const rightBaseboard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, room.depth), baseboardMaterial.clone());
    rightBaseboard.position.set(room.rightX - 0.03, 0.04, room.centerZ);
    rightBaseboard.castShadow = true;
    rightBaseboard.receiveShadow = true;
    group.add(rightBaseboard);

    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0xc69a67,
      roughness: 0.78,
      metalness: 0.02
    });
    const backCeilingTrim = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.06, 0.06), trimMaterial);
    backCeilingTrim.position.set(room.centerX, room.height - 0.03, room.rearZ + 0.035);
    backCeilingTrim.castShadow = true;
    backCeilingTrim.receiveShadow = true;
    group.add(backCeilingTrim);

    const frontCeilingTrim = backCeilingTrim.clone();
    frontCeilingTrim.geometry = backCeilingTrim.geometry.clone();
    frontCeilingTrim.material = trimMaterial.clone();
    frontCeilingTrim.position.z = room.frontZ - 0.035;
    group.add(frontCeilingTrim);

    const leftCeilingTrim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, room.depth), trimMaterial.clone());
    leftCeilingTrim.position.set(room.leftX + 0.035, room.height - 0.03, room.centerZ);
    leftCeilingTrim.castShadow = true;
    leftCeilingTrim.receiveShadow = true;
    group.add(leftCeilingTrim);

    const rightCeilingTrim = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, room.depth), trimMaterial.clone());
    rightCeilingTrim.position.set(room.rightX - 0.035, room.height - 0.03, room.centerZ);
    rightCeilingTrim.castShadow = true;
    rightCeilingTrim.receiveShadow = true;
    group.add(rightCeilingTrim);
  }

  private createCeilingLight(group: THREE.Group, room: ReturnType<Ps1ShelfScene['getRoomMetrics']>) {
    const lightX = room.shelfCenter.x;
    const lightZ = room.rearZ + room.depth * 0.48 + 0.7;
    const fixtureMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff2d8,
      emissive: 0xffdfa0,
      emissiveIntensity: 1.2,
      roughness: 0.35
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x6d604f,
      roughness: 0.55,
      metalness: 0.2
    });

    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.08, 24), trimMaterial);
    trim.position.set(lightX, room.height - 0.04, lightZ);
    trim.castShadow = true;
    group.add(trim);

    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 10), fixtureMaterial);
    globe.scale.y = 0.45;
    globe.position.set(lightX, room.height - 0.12, lightZ);
    group.add(globe);

    const pointLight = new THREE.PointLight(0xffe0ad, 4.2, room.depth * 1.35, 1.45);
    pointLight.position.set(lightX, room.height - 0.22, lightZ);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(512, 512);
    pointLight.shadow.bias = -0.00035;
    pointLight.shadow.radius = 4;
    group.add(pointLight);

    const spotLight = new THREE.SpotLight(0xffedd0, 1.05, room.depth * 1.15, Math.PI / 2.8, 0.75, 1.4);
    spotLight.position.set(lightX, room.height - 0.18, lightZ);
    spotLight.target.position.set(room.shelfCenter.x, 0.75, room.shelfCenter.z + 1.1);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.set(512, 512);
    spotLight.shadow.bias = -0.0004;
    spotLight.shadow.radius = 5;
    group.add(spotLight, spotLight.target);

    const shelfFill = new THREE.PointLight(0xffefd5, 1.2, room.depth * 0.75, 1.6);
    shelfFill.position.set(room.centerX, 2.1, room.frontZ - 1.2);
    group.add(shelfFill);
  }

  private createBuiltInRoomFurniture(group: THREE.Group, room: ReturnType<Ps1ShelfScene['getRoomMetrics']>) {
    const stand = this.getTvStandMetrics(room);
    const rugMaterial = new THREE.MeshStandardMaterial({
      color: 0x66798a,
      roughness: 0.95
    });

    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9), rugMaterial);
    rug.name = 'small-bedroom-rug';
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(stand.centerX, 0.018, room.rearZ + room.depth * 0.54 + 1);
    rug.receiveShadow = true;
    group.add(rug);

    this.createTvStand(group, room);
  }

  private getTvStandMetrics(room: ReturnType<Ps1ShelfScene['getRoomMetrics']>) {
    const width = 1.85;
    const depth = 1.25;
    const height = this.targetShelfHeight - 1;
    const boardThickness = 0.08;
    return {
      width,
      depth,
      height,
      boardThickness,
      centerX: room.shelfCenter.x + room.shelfSize.x / 2 + 0.15 + width / 2,
      centerZ: room.rearZ + 0.12 + depth / 2,
      consoleShelfY: height * 0.55
    };
  }

  private createTvStand(group: THREE.Group, room: ReturnType<Ps1ShelfScene['getRoomMetrics']>) {
    const stand = this.getTvStandMetrics(room);
    const cabinet = new THREE.Group();
    cabinet.name = 'tv-stand';
    cabinet.position.set(stand.centerX, 0, stand.centerZ);
    const material = new THREE.MeshStandardMaterial({ color: 0x704522, roughness: 0.82 });
    const addBoard = (name: string, width: number, height: number, depth: number, x: number, y: number, z = 0) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      board.name = name;
      board.position.set(x, y, z);
      board.castShadow = true;
      board.receiveShadow = true;
      cabinet.add(board);
    };
    const t = stand.boardThickness;
    addBoard('tv-stand-top', stand.width, t, stand.depth, 0, stand.height - t / 2);
    addBoard('tv-stand-base', stand.width, t, stand.depth, 0, t / 2);
    addBoard('tv-stand-console-shelf', stand.width - t * 2, t, stand.depth, 0, stand.consoleShelfY - t / 2);
    for (const side of [-1, 1]) {
      addBoard('tv-stand-side', t, stand.height - t * 2, stand.depth, side * (stand.width - t) / 2, stand.height / 2);
    }
    addBoard('tv-stand-back', stand.width - t * 2, stand.height - t * 2, t, 0, stand.height / 2, -(stand.depth - t) / 2);
    group.add(cabinet);
    this.registerObstacle(cabinet);
  }

  private createWallpaperMaterial(repeatX: number, repeatY: number) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.DoubleSide
    });

    if (this.backgroundTexture) {
      const texture = this.backgroundTexture.clone();
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
      texture.needsUpdate = true;
      material.map = texture;
    }

    return material;
  }

  private createCarpetMaterial() {
    const texture = this.createCanvasTexture(128, (ctx, size) => {
      ctx.fillStyle = '#8c7f70';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2200; i += 1) {
        const shade = 102 + Math.floor(Math.random() * 54);
        ctx.fillStyle = `rgb(${shade + 22}, ${shade + 16}, ${shade + 8})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1);
      }
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = '#66594d';
      for (let y = 0; y < size; y += 6) {
        ctx.beginPath();
        ctx.moveTo(0, y + Math.random() * 2);
        ctx.lineTo(size, y + Math.random() * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
    texture.repeat.set(10, 7);

    const bump = this.createCanvasTexture(64, (ctx, size) => {
      ctx.fillStyle = '#999';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 1800; i += 1) {
        const shade = 110 + Math.floor(Math.random() * 80);
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
      }
    });
    bump.colorSpace = THREE.NoColorSpace;
    bump.repeat.set(14, 10);

    return new THREE.MeshStandardMaterial({
      color: 0xc1aa8d,
      map: texture,
      bumpMap: bump,
      bumpScale: 0.025,
      roughness: 0.96,
      metalness: 0,
      side: THREE.DoubleSide
    });
  }

  private createPopcornCeilingMaterial() {
    const texture = this.createCanvasTexture(128, (ctx, size) => {
      ctx.fillStyle = '#eee7d8';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 1400; i += 1) {
        const radius = 0.5 + Math.random() * 1.8;
        const shade = 205 + Math.floor(Math.random() * 38);
        ctx.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 8})`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    texture.repeat.set(12, 8);

    const bump = texture.clone();
    bump.colorSpace = THREE.NoColorSpace;
    bump.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      color: 0xfff8e9,
      map: texture,
      bumpMap: bump,
      bumpScale: 0.05,
      roughness: 0.98,
      metalness: 0,
      side: THREE.DoubleSide
    });
  }

  private createCanvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) paint(ctx, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  private async loadRoomProps(
    loadVersion: number,
    group: THREE.Group,
    room: ReturnType<Ps1ShelfScene['getRoomMetrics']>
  ) {
    const props = this.getRoomPropConfigs(room);
    await Promise.all(props.map(async (config) => {
      const object = await this.loadRoomProp(config, loadVersion, group);
      if (object && config.label === 'desk') {
        await Promise.all(this.getDeskPropConfigs(object).map((deskProp) =>
          this.loadRoomProp(deskProp, loadVersion, group)
        ));
      } else if (object && config.label === 'nightstand') {
        await this.loadRoomProp(this.getNightstandHatConfig(object), loadVersion, group);
      }
    }));
  }

  private async loadRoomProp(config: RoomPropConfig, loadVersion: number, group: THREE.Group) {
    const url = this.getRoomModelUrl(config.filename);
    if (!url) {
      console.warn(`Room model not found: src/assets/room/${config.filename}`);
      return null;
    }

    try {
      const gltf = await this.trackAssetLoad(Ps1ShelfScene.gltfLoader.loadAsync(url));
      if (this.isDestroyed || loadVersion !== this.roomLoadVersion || group !== this.roomGroup) {
        this.disposeObjectResources(gltf.scene);
        return null;
      }

      const object = this.normalizeRoomProp(gltf.scene, config);
      object.name = config.label;
      group.add(object);
      this.registerObstacle(object);
      if (config.label === 'crt-tv' && this.cameraMode === 'inspect') this.updateInspectionFrame();
      return object;
    } catch (err) {
      console.warn(`Failed to load room model: ${config.filename}`, err);
      return null;
    }
  }

  private getNightstandHatConfig(nightstand: THREE.Object3D): RoomPropConfig {
    const bounds = new THREE.Box3().setFromObject(nightstand);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    return {
      filename: 'baseballhat.glb',
      label: 'nightstand-baseball-hat',
      position: new THREE.Vector3(center.x, bounds.max.y - 0.175, center.z),
      targetSize: new THREE.Vector3(size.x * 0.8, 0.3, size.z * 0.8).multiplyScalar(1.5),
      rotationX: -Math.PI / 4,
      rotationY: -Math.PI / 10
    };
  }

  private getDeskPropConfigs(desk: THREE.Object3D): RoomPropConfig[] {
    // Use the fitted desk's actual top, since its target height is only a size limit.
    const bounds = new THREE.Box3().setFromObject(desk);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    return [
      {
        filename: 'computer.glb',
        label: 'desk-computer',
        position: new THREE.Vector3(center.x + 0.3, bounds.max.y, center.z - size.z * 0.18),
        targetSize: new THREE.Vector3(size.x - 0.16, 1.15, size.z * 0.58),
      },
      {
        filename: 'deskfan.glb',
        label: 'desk-fan',
        position: new THREE.Vector3(center.x, bounds.max.y, center.z + size.z * 0.32),
        targetSize: new THREE.Vector3(size.x - 0.2, 0.9, size.z * 0.24),
        rotationY: -Math.PI / 2
      },
      {
        filename: 'trashcan.glb',
        label: 'desk-trashcan',
        position: new THREE.Vector3(center.x, 0, bounds.max.z + 0.45),
        targetSize: new THREE.Vector3(0.65, 0.85, 0.65),
        rotationY: 0
      }
    ];
  }

  private getRoomModelUrl(filename: string) {
    return roomModelUrls[`../../assets/room/${filename}`];
  }

  private getRoomPropConfigs(room: ReturnType<Ps1ShelfScene['getRoomMetrics']>): RoomPropConfig[] {
    const stand = this.getTvStandMetrics(room);
    const furnitureReferenceHeight = 1.43;
    const deskWidth = 2.75;
    const bedWidth = 2.7;
    const bedX = room.leftX + bedWidth / 2 + 0.08;
    const deskDepth = 1.35;
    const deskX = room.rightX - deskDepth / 2 - 0.25;
    const bedZ = room.rearZ + 2.08;
    const deskZ = room.rearZ + stand.depth + 1.75;

    return [
      {
        filename: 'bed.glb',
        label: 'bed',
        position: new THREE.Vector3(bedX, 0, bedZ),
        targetSize: new THREE.Vector3(bedWidth, furnitureReferenceHeight * 1.32, 4.15),
        rotationY: 0
      },
      {
        filename: 'nightstand.glb',
        label: 'nightstand',
        position: new THREE.Vector3(bedX + bedWidth / 2 + 0.55, 0, bedZ - 1.15),
        targetSize: new THREE.Vector3(0.82, 0.86, 0.82),
      },
      {
        filename: 'desk.glb',
        label: 'desk',
        position: new THREE.Vector3(deskX, 0, deskZ),
        targetSize: new THREE.Vector3(deskDepth, furnitureReferenceHeight * 1.16, deskWidth),
        rotationY: -Math.PI / 2
      },
      {
        filename: 'chair.glb',
        label: 'desk-chair',
        position: new THREE.Vector3(deskX -0.5, 0, deskZ -0.5),
        targetSize: new THREE.Vector3(1.2, furnitureReferenceHeight * 1.2, 1.2),
        rotationY: Math.PI / 2
      },
      {
        filename: 'crt_tv.glb',
        label: 'crt-tv',
        position: new THREE.Vector3(stand.centerX, stand.height, stand.centerZ),
        targetSize: new THREE.Vector3(stand.width - 0.2, 1.5, stand.depth - 0.2).multiplyScalar(0.75),
        rotationY: Math.PI
      },
      {
        filename: 'psone.glb',
        label: 'psone-console',
        position: new THREE.Vector3(stand.centerX, stand.consoleShelfY, stand.centerZ + 0.3),
        targetSize: new THREE.Vector3(0.76, 0.18, 0.54),
        scaleMode: 'height',
        rotationY: 0
      },
      {
        filename: 'floor_lamp.glb',
        label: 'floor-lamp',
        position: new THREE.Vector3(room.rightX - 0.8, 0, room.rearZ + 0.75),
        targetSize: new THREE.Vector3(0.62, 2.4, 0.62).multiplyScalar(2.25),
        rotationY: -Math.PI / 4
      },
      {
        filename: 'beanbag.glb',
        label: 'beanbag',
        position: new THREE.Vector3(stand.centerX, 0, room.rearZ + room.depth * 0.54 + 1),
        targetSize: new THREE.Vector3(1.25, 0.7, 1.25).multiplyScalar(2),
        rotationY: -Math.PI / 6
      }
    ];
  }

  private normalizeRoomProp(rawObject: THREE.Object3D, config: RoomPropConfig) {
    this.applyObjectShadows(rawObject);
    // Apply pitch/roll before yaw, then measure the rotated model for fitting and grounding.
    rawObject.rotation.set(
      config.rotationX ?? rawObject.rotation.x,
      config.rotationY ?? 0,
      config.rotationZ ?? rawObject.rotation.z,
      'YXZ'
    );
    rawObject.updateMatrixWorld(true);

    const rawBounds = new THREE.Box3().setFromObject(rawObject);
    const rawSize = rawBounds.getSize(new THREE.Vector3());
    if (!rawSize.x || !rawSize.y || !rawSize.z) return rawObject;

    const scale = config.scaleMode === 'height'
      ? config.targetSize.y / rawSize.y
      : Math.min(
        config.targetSize.x / rawSize.x,
        config.targetSize.y / rawSize.y,
        config.targetSize.z / rawSize.z
      );
    rawObject.scale.setScalar(scale);
    rawObject.updateMatrixWorld(true);

    const scaledBounds = new THREE.Box3().setFromObject(rawObject);
    const scaledCenter = scaledBounds.getCenter(new THREE.Vector3());
    const yAnchor = (config.alignToFloor ?? true) ? scaledBounds.min.y : scaledCenter.y;
    rawObject.position.sub(new THREE.Vector3(scaledCenter.x, yAnchor, scaledCenter.z));
    rawObject.updateMatrixWorld(true);

    const anchor = new THREE.Group();
    anchor.add(rawObject);
    anchor.position.copy(config.position);
    return anchor;
  }

  private applyObjectShadows(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private trackAssetLoad<T>(promise: Promise<T>) {
    this.beginTrackedLoad();
    return promise.finally(() => {
      this.finishTrackedLoad();
    });
  }

  private beginTrackedLoad() {
    if (this.trackedPendingLoads === 0) {
      this.trackedBatchTotalLoads = 0;
      this.trackedBatchLoadedLoads = 0;
    }

    this.trackedPendingLoads += 1;
    this.trackedBatchTotalLoads += 1;
    this.dispatchLoadingProgress();
  }

  private finishTrackedLoad() {
    if (this.trackedPendingLoads > 0) {
      this.trackedPendingLoads -= 1;
    }
    this.trackedBatchLoadedLoads = Math.min(
      this.trackedBatchLoadedLoads + 1,
      this.trackedBatchTotalLoads
    );
    this.dispatchLoadingProgress();
  }

  private dispatchLoadingProgress() {
    const total = this.trackedBatchTotalLoads;
    const loaded = this.trackedBatchLoadedLoads;
    const progress = total === 0 ? 1 : Math.min(loaded / total, 1);

    this.container.dispatchEvent(new CustomEvent<ShelfLoadingProgressDetail>(PS1_LOADING_PROGRESS_EVENT, {
      detail: {
        active: this.trackedPendingLoads > 0,
        loaded,
        total,
        progress
      }
    }));
  }

  private createShelf(gameCount: number) {
    this.shelfGameCount = gameCount;
    const loadVersion = ++this.shelfLoadVersion;
    void this.loadShelfModel(loadVersion);
  }

  private async loadShelfModel(loadVersion: number) {
    this.clearShelf();

    try {
      const gltf = await this.trackAssetLoad(Ps1ShelfScene.gltfLoader.loadAsync(bookshelfUrl));
      if (this.isDestroyed || loadVersion !== this.shelfLoadVersion) {
        this.disposeObjectResources(gltf.scene);
        return;
      }

      const shelf = gltf.scene;
      this.applyObjectShadows(shelf);

      const bounds = new THREE.Box3().setFromObject(shelf);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
        this.disposeObjectResources(shelf);
        throw new Error('Bookshelf model has invalid dimensions.');
      }
      const scale = this.targetShelfHeight / size.y;
      this.setShelfContentScale(size.x * scale / this.referenceShelfWidth);

      shelf.scale.setScalar(scale);
      shelf.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);

      this.scene.add(shelf);
      this.shelfObject = shelf;
      this.updateShelfBoundsFromObject(shelf);
      this.rebuildRoom();
      void this.loadShelfProps(loadVersion);
      this.renderShelfDebug();
      this.applyView();
      this.updateFreeCameraFrame();
    } catch (err) {
      if (this.isDestroyed || loadVersion !== this.shelfLoadVersion) return;
      console.warn('Failed to load bookshelf.glb, falling back to a box shelf.', err);
      this.createFallbackShelf();
    }
  }

  private createFallbackShelf() {
    // Preserve the model's proportions and four usable rows if loading fails.
    const height = this.targetShelfHeight;
    const width = height * 0.562;
    const depth = height * 0.285;
    this.setShelfContentScale(width / this.referenceShelfWidth);
    const material = new THREE.MeshStandardMaterial({ color: 0xd6b07a });
    const shelf = new THREE.Group();
    const addPanel = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      panel.position.set(x, y, z);
      shelf.add(panel);
    };
    const sideWidth = width * 0.04;
    addPanel(sideWidth, height, depth, -(width - sideWidth) / 2, height / 2);
    addPanel(sideWidth, height, depth, (width - sideWidth) / 2, height / 2);
    addPanel(width, height, depth * 0.08, 0, height / 2, -depth * 0.46);
    this.shelfRowSpecs.forEach((row) => {
      const thickness = height * 0.025;
      addPanel(width, thickness, depth, 0, height * row.minY - thickness / 2);
    });
    addPanel(width, height * 0.015, depth, 0, height * 0.9925);
    this.applyObjectShadows(shelf);
    this.scene.add(shelf);
    this.shelfObject = shelf;
    this.updateShelfBoundsFromObject(shelf);
    this.rebuildRoom();
    void this.loadShelfProps(this.shelfLoadVersion);
    this.renderShelfDebug();
    this.applyView();
    this.updateFreeCameraFrame();
  }

  private updateShelfBoundsFromObject(object: THREE.Object3D) {
    this.shelfBounds = new THREE.Box3().setFromObject(object);
  }

  private setShelfContentScale(scale: number) {
    this.shelfContentScale = scale;
    this.cases.forEach((gameCase) => gameCase.group.scale.setScalar(scale));
    if (this.cameraMode === 'inspect') this.updateInspectionFrame();
    this.viewAnimation = null;
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
    if (!this.shelfBounds) return;
    const room = this.getRoomMetrics();
    if (!this.navigationInitialized) {
      this.freeCameraPosition.set(room.centerX, this.navigation.eyeHeight, room.rearZ + room.depth * 0.72);
      const spawn = this.navigation.findFreePosition(this.freeCameraPosition);
      if (!spawn) return;
      this.freeCameraPosition.copy(spawn);
      this.camera.position.copy(spawn);
      this.camera.lookAt(room.shelfCenter);
      this.navigationOrientation.copy(this.camera.quaternion);
      this.navigationInitialized = true;
    }
    this.ensureSafeNavigationPosition();
  }

  private registerObstacle(object: THREE.Object3D) {
    object.updateWorldMatrix(true, true);
    this.navigation.setObstacle(object, new THREE.Box3().setFromObject(object));
    if (this.navigationInitialized) this.ensureSafeNavigationPosition();
  }

  private ensureSafeNavigationPosition() {
    const safe = this.navigation.findFreePosition(this.freeCameraPosition);
    if (!safe) {
      this.pauseNavigation();
      return;
    }
    this.freeCameraPosition.copy(safe);
    if (this.cameraMode === 'navigate' && !this.returnAnimation) {
      this.camera.position.copy(safe);
    }
  }

  setGames(games: ShelfGame[]) {
    if (this.cameraMode === 'inspect') this.exitInspection();
    if (games.length !== this.shelfGameCount) {
      this.createShelf(games.length);
    }

    this.clearCases();
    this.shelfGames = [...games];
    if (!games?.length) return;

    // Geometry stays at reference size; the model scale also applies to its covers.
    const width = this.caseWidth / this.shelfContentScale;
    const height = this.caseHeight / this.shelfContentScale;
    const depth = this.caseDepth / this.shelfContentScale;

    games.forEach((game, index) => {
      const gameCase = new GameCase({
        width,
        height,
        depth,
        frontUrl: game.frontUrl ?? null,
        backUrl: game.backUrl ?? null,
        sideUrl: game.sideUrl ?? null,
        environmentMap: this.caseEnvironment.texture,
        trackAssetLoad: (promise) => this.trackAssetLoad(promise)
      });
      gameCase.group.userData.caseIndex = index;
      gameCase.group.scale.setScalar(this.shelfContentScale);
      // GameCase casts shadows from its tray, not from its transparent cover windows.
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
    const propConfigs = [
      { url: gameBoyColorUrl, rowBox: rowBoxes[1], rowIndex: 1, rotationY: 0 },
      { url: nokiaUrl, rowBox: rowBoxes[0], rowIndex: 0, rotationY: Math.PI },
      { url: discmanUrl, rowBox: rowBoxes[2], rowIndex: 2, rotationY: 0 },
      { url: tamagotchiURl, rowBox: rowBoxes[3], rowIndex: 3, rotationY: 0 }
    ].filter((config): config is {
      url: string;
      rowBox: THREE.Box3;
      rowIndex: number;
      rotationY: number;
    } => Boolean(config.rowBox));

    if (!propConfigs.length) return;

    try {
      const props = await Promise.all(
        propConfigs.map((config) => this.loadShelfProp({
          loadVersion,
          url: config.url,
          rowBox: config.rowBox,
          rowIndex: config.rowIndex,
          rotationY: config.rotationY
        }))
      );

      props.filter((prop): prop is THREE.Object3D => prop !== null).forEach((prop) => {
        this.scene.add(prop);
        this.shelfPropObjects.push(prop);
        this.registerObstacle(prop);
      });
    } catch (err) {
      console.warn('Failed to load shelf prop:', err);
    }
  }

  private async loadShelfProp(options: {
    loadVersion: number;
    url: string;
    rowBox: THREE.Box3;
    rowIndex: number;
    rotationY: number;
  }) {
    const gltf = await this.trackAssetLoad(Ps1ShelfScene.gltfLoader.loadAsync(options.url));
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
    if (availableWidth < this.shelfPropGap) {
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
      this.registerObstacle(gameCase.group);
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

  private updateInspectionFrame() {
    if (!this.shelfBounds) return;
    const tv = this.roomGroup?.getObjectByName('crt-tv');
    let bounds: THREE.Box3;
    if (tv) {
      tv.updateWorldMatrix(true, true);
      bounds = new THREE.Box3().setFromObject(tv);
    } else {
      // Keep inspection usable when the optional TV model fails to load.
      const stand = this.getTvStandMetrics(this.getRoomMetrics());
      bounds = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(stand.centerX, stand.height + 0.55, stand.centerZ),
        new THREE.Vector3(1.25, 1.1, 0.8)
      );
    }
    this.inspectionFrame = getInspectionFrame(
      bounds, new THREE.Vector3(this.caseWidth, this.caseHeight, this.caseDepth),
      this.camera.aspect, this.defaultFov
    );
  }

  private updateSelectionAnimation(deltaSeconds: number) {
    const rotationBlend = 1 - Math.exp(-this.selectionProgressDamping * deltaSeconds);
    this.cases.forEach((gameCase, index) => {
      const base = this.baseTransforms[index];
      if (!base) return;
      const selected = this.selectedIndex === index;
      const previous = this.selectionProgress[index] ?? 0;
      if (!selected && previous === 0) return;
      let progress = THREE.MathUtils.damp(previous, selected ? 1 : 0, this.selectionProgressDamping, deltaSeconds);
      if (!selected && progress < 0.001) progress = 0;
      this.selectionProgress[index] = progress;

      if (selected) {
        this.spinAngles[index] = ((this.spinAngles[index] ?? 0) + this.selectionSpinSpeed * deltaSeconds) % (Math.PI * 2);
      }
      const target = this.inspectionFrame?.casePosition;
      gameCase.group.position.set(base.x, base.y, base.z);
      if (target) gameCase.group.position.lerp(target, progress);
      this.caseRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, selected ? this.spinAngles[index] : base.rotationY);
      gameCase.group.quaternion.slerp(this.caseRotation, rotationBlend);
      if (progress === 0) {
        gameCase.group.quaternion.copy(this.caseRotation);
        this.spinAngles[index] = 0;
        this.registerObstacle(gameCase.group);
      } else {
        // Presentation animations must not push the saved player position around.
        this.navigation.removeObstacle(gameCase.group);
      }
    });
  }

  private updateCameraFocus(deltaSeconds: number) {
    if (this.returnAnimation) {
      const animation = this.returnAnimation;
      animation.elapsed += deltaSeconds;
      const progress = this.easeInOut(Math.min(animation.elapsed / this.returnDuration, 1));
      this.camera.position.lerpVectors(animation.position, this.freeCameraPosition, progress);
      this.camera.quaternion.slerpQuaternions(animation.orientation, this.navigationOrientation, progress);
      if (animation.elapsed >= this.returnDuration) {
        this.returnAnimation = null;
        this.controls.enabled = true;
        this.dispatchNavigationChange();
      }
      return;
    }
    // Mouse-look owns the camera in Navigate View. Never overwrite its quaternion.
    if (this.cameraMode === 'navigate' || !this.inspectionFrame) return;
    const blend = 1 - Math.exp(-this.cameraFocusDamping * deltaSeconds);
    this.cameraDesiredPosition.copy(this.inspectionFrame.cameraPosition);
    this.cameraDesiredTarget.copy(this.inspectionFrame.cameraTarget);
    this.camera.position.lerp(this.cameraDesiredPosition, blend);
    this.cameraTarget.lerp(this.cameraDesiredTarget, blend);
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
      const deltaSeconds = Math.min((now - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = now;
      this.updateCameraMovement(deltaSeconds);
      this.updateViewAnimation();
      this.updateSelectionAnimation(deltaSeconds);
      this.updateCameraFocus(deltaSeconds);
      this.updateHover(deltaSeconds);
      this.postProcessing.render(deltaSeconds, now / 1000);
    };
    animate();
  }

  //region Cleanup and generic utilities
  /** Called from a click so the browser can grant pointer lock. */
  async startNavigation() {
    if (this.isDestroyed || this.lockRequested || !this.navigationInitialized || this.trackedPendingLoads > 0) return;
    if (this.cameraMode === 'inspect') {
      this.exitInspection();
      return;
    }
    if (this.returnAnimation) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    this.ensureSafeNavigationPosition();
    if (!this.navigation.isFree(this.freeCameraPosition)) return;
    this.navigationError = '';
    this.lockRequested = true;
    this.renderer.domElement.focus({ preventScroll: true });
    try {
      if (!this.renderer.domElement.requestPointerLock) {
        throw new Error('Pointer lock is unavailable.');
      }
      // Use the DOM method directly to catch promise rejections as well as the
      // pointerlockerror event; Three's lock() does not return that promise.
      await this.renderer.domElement.requestPointerLock();
    } catch {
      this.onPointerLockError();
    }
  }

  private dispatchNavigationChange() {
    if (this.isDestroyed) return;
    this.container.dispatchEvent(new CustomEvent<Ps1NavigationChangeDetail>(PS1_NAVIGATION_CHANGE_EVENT, {
      detail: {
        locked: document.pointerLockElement === this.renderer.domElement,
        mode: this.cameraMode,
        returning: Boolean(this.returnAnimation),
        error: this.navigationError
      }
    }));
  }

  private onPointerLockChange = () => {
    this.lockRequested = false;
    this.pressedKeys.clear();
    this.setHoveredIndex(null);
    this.dispatchNavigationChange();
  };

  private onPointerLockError = () => {
    this.lockRequested = false;
    this.navigationError = 'Mouse capture was unavailable. Click to try again, or select a game with the pointer.';
    this.dispatchNavigationChange();
  };

  private pauseNavigation = () => {
    this.pressedKeys.clear();
    this.setHoveredIndex(null);
    if (document.pointerLockElement === this.renderer.domElement) this.controls.unlock();
  };

  private onVisibilityChange = () => {
    if (document.hidden) this.pauseNavigation();
  };

  private onKeyDown(event: KeyboardEvent) {
    if (this.isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const key = this.mapMovementKey(event.code);
    if (this.cameraMode === 'inspect') {
      if (event.target !== this.renderer.domElement || event.key === 'Tab') return;
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') this.cycleSelection(-1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') this.cycleSelection(1);
      else this.exitInspection();
      return;
    }
    if (!this.controls.isLocked || this.returnAnimation) return;
    if (event.code === 'KeyC') {
      event.preventDefault();
      if (!event.repeat && this.navigation.toggleCrouch(this.freeCameraPosition)) {
        this.camera.position.copy(this.freeCameraPosition);
      }
      return;
    }
    if (!key) return;
    this.pressedKeys.add(key);
    event.preventDefault();
  }

  private onKeyUp(event: KeyboardEvent) {
    const key = this.mapMovementKey(event.code);
    if (key) this.pressedKeys.delete(key);
  }

  private mapMovementKey(code: string) {
    if (code === 'KeyW') return 'up';
    if (code === 'KeyS') return 'down';
    if (code === 'KeyA') return 'left';
    if (code === 'KeyD') return 'right';
    return null;
  }

  private isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]'));
  }

  private updateCameraMovement(deltaSeconds: number) {
    if (this.cameraMode !== 'navigate' || this.returnAnimation || !this.controls.isLocked || !this.pressedKeys.size) return;
    const sideways = (this.pressedKeys.has('right') ? 1 : 0) - (this.pressedKeys.has('left') ? 1 : 0);
    const forward = (this.pressedKeys.has('up') ? 1 : 0) - (this.pressedKeys.has('down') ? 1 : 0);
    if (!sideways && !forward) return;

    this.camera.getWorldDirection(this.movementForward);
    this.movementForward.y = 0;
    this.movementForward.normalize();
    this.movementRight.crossVectors(this.movementForward, this.camera.up).normalize();
    this.movementDelta.copy(this.movementForward).multiplyScalar(forward)
      .addScaledVector(this.movementRight, sideways).normalize()
      .multiplyScalar(this.cameraMoveSpeed * deltaSeconds);
    this.navigation.move(this.freeCameraPosition, this.movementDelta);
    this.camera.position.copy(this.freeCameraPosition);
  }

  private onWheel(event: WheelEvent) {
    if (!this.controls.isLocked && this.cameraMode !== 'inspect') return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.container.clientHeight : 1);
    // Optical zoom leaves the collision-resolved player position unchanged.
    this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + pixels * 0.025, 25, 70);
    this.camera.updateProjectionMatrix();
  }

  private onContextMenu = (event: MouseEvent) => {
    if (!this.controls.isLocked && this.cameraMode !== 'inspect') return;
    event.preventDefault();
    this.camera.fov = this.defaultFov;
    this.camera.updateProjectionMatrix();
  };

  private onClick(event: MouseEvent) {
    if (event.button !== 0 || this.returnAnimation || this.trackedPendingLoads > 0) return;
    if (this.cameraMode === 'navigate' && !this.controls.isLocked && !this.navigationError) {
      void this.startNavigation();
      return;
    }
    this.renderer.domElement.focus({ preventScroll: true });
    if (this.controls.isLocked) {
      this.pointer.set(0, 0);
    } else {
      // Keep ordinary picking available while inspecting or if capture fails.
      this.updatePointer(event.clientX, event.clientY);
    }
    const hit = this.pickGame();
    if (hit !== null) this.selectGame(hit);
  }

  private updatePointer(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    this.pointerClient.set(event.clientX, event.clientY);
    this.pointerInside = true;
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.setHoveredIndex(null);
  };

  private updateHover(deltaSeconds: number) {
    const canPick = !this.returnAnimation && this.trackedPendingLoads === 0 &&
      (this.controls.isLocked || (this.pointerInside && (this.cameraMode === 'inspect' || Boolean(this.navigationError))));
    if (!canPick) {
      this.setHoveredIndex(null);
      return;
    }
    this.hoverElapsed += deltaSeconds;
    if (this.hoverElapsed < 0.05) return;
    this.hoverElapsed = 0;
    if (this.controls.isLocked) this.pointer.set(0, 0);
    else this.updatePointer(this.pointerClient.x, this.pointerClient.y);
    this.setHoveredIndex(this.pickGame());
  }

  private setHoveredIndex(index: number | null) {
    if (index === this.hoveredIndex) return;
    this.hoveredIndex = index;
    this.container.dispatchEvent(new CustomEvent<ShelfHoverChangeDetail>(PS1_HOVER_CHANGE_EVENT, {
      detail: { game: index === null ? null : this.shelfGames[index] ?? null }
    }));
  }

  private pickGame() {
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const blockers = [...this.shelfPropObjects];
    if (this.shelfObject) blockers.push(this.shelfObject);
    if (this.roomGroup) blockers.push(this.roomGroup);
    const hit = pickVisibleGame(this.raycaster, this.cases.map((gameCase) => gameCase.group), blockers);
    return this.cameraMode === 'inspect' && hit !== this.selectedIndex ? null : hit;
  }

  private selectGame(index: number) {
    if (this.returnAnimation || !this.cases[index]) return;
    this.setSelectedIndex(index);
    this.dispatchGamePress(index);
  }

  cycleSelection(direction: -1 | 1) {
    if (this.cameraMode !== 'inspect' || this.selectedIndex === null || this.cases.length < 2) return;
    this.selectGame((this.selectedIndex + direction + this.cases.length) % this.cases.length);
  }

  private setSelectedIndex(index: number | null) {
    if (this.selectedIndex === index) return;
    this.setHoveredIndex(null);
    if (index !== null && this.cameraMode === 'navigate') {
      this.freeCameraPosition.copy(this.camera.position);
      this.navigationOrientation.copy(this.camera.quaternion);
      this.camera.getWorldDirection(this.cameraTarget).add(this.camera.position);
      this.cameraMode = 'inspect';
      this.controls.enabled = false;
      this.pauseNavigation();
      this.updateInspectionFrame();
    }
    this.selectedIndex = index;
    if (index !== null) this.navigation.removeObstacle(this.cases[index].group);
    this.dispatchSelectionChange();
    this.dispatchNavigationChange();
  }

  exitInspection() {
    if (this.cameraMode !== 'inspect') return;
    this.returnAnimation = {
      position: this.camera.position.clone(), orientation: this.camera.quaternion.clone(), elapsed: 0
    };
    this.cameraMode = 'navigate';
    this.pressedKeys.clear();
    this.setSelectedIndex(null);
    this.ensureSafeNavigationPosition();
    this.renderer.domElement.focus({ preventScroll: true });
  }

  private dispatchSelectionChange() {
    const game = this.selectedIndex === null ? null : this.shelfGames[this.selectedIndex] ?? null;
    this.container.dispatchEvent(new CustomEvent<ShelfSelectionChangeDetail>(PS1_SELECTION_CHANGE_EVENT, {
      detail: { game }
    }));
  }

  private dispatchGamePress(index: number) {
    const game = this.shelfGames[index];
    if (!game) return;

    this.container.dispatchEvent(new CustomEvent<ShelfGamePressDetail>(PS1_GAME_PRESS_EVENT, {
      detail: { game }
    }));
  }

  private onResize() {
    // Resize handler to keep the aspect ratio correct.
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    if (this.cameraMode === 'inspect') this.updateInspectionFrame();
    this.renderer.setSize(clientWidth, clientHeight);
    this.postProcessing.setSize(clientWidth, clientHeight, this.renderer.getPixelRatio());
  }

  destroy() {
    // Cleanup GPU resources and DOM when the view unmounts.
    this.isDestroyed = true;
    this.pauseNavigation();
    this.controls.dispose();
    this.resizeObserver.disconnect();
    this.shelfLoadVersion += 1;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('wheel', this.onWheel);
    this.renderer.domElement.removeEventListener('click', this.onClick);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('blur', this.pauseNavigation);
    this.clearShelf();
    this.clearCases();
    this.backgroundTexture?.dispose();
    this.caseEnvironment.dispose();
    this.backgroundTexture = null;
    this.postProcessing.dispose();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  private clearCases() {
    this.setHoveredIndex(null);
    for (const gameCase of this.cases) {
      this.navigation.removeObstacle(gameCase.group);
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
    this.clearRoom();
    this.clearShelfDebug();
    this.clearShelfProps();
    if (!this.shelfObject) return;

    this.scene.remove(this.shelfObject);
    this.disposeObjectResources(this.shelfObject);
    this.shelfObject = null;
    this.shelfBounds = null;
  }

  private clearRoom() {
    this.roomLoadVersion += 1;
    this.navigation.clear();
    if (!this.roomGroup) return;

    this.scene.remove(this.roomGroup);
    this.disposeObjectResources(this.roomGroup);
    this.roomGroup = null;
  }

  private clearShelfDebug() {
    if (!this.shelfDebugGroup) return;

    this.scene.remove(this.shelfDebugGroup);
    this.disposeObjectResources(this.shelfDebugGroup);
    this.shelfDebugGroup = null;
  }

  private clearShelfProps() {
    for (const object of this.shelfPropObjects) {
      this.navigation.removeObstacle(object);
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
