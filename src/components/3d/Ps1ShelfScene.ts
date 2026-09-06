import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GameCase } from './GameCase';
import { loadTexture } from './materials';
import { Ps1PostProcessing } from './Ps1PostProcessing';
import bookshelfUrl from '../../assets/bookshelf.glb?url';
import gameBoyColorUrl from '../../assets/game_boy_color.glb?url';
import nokiaUrl from '../../assets/nokia_6230.glb?url';
import discmanUrl from '../../assets/sony_discman_d-181.glb?url';
import tamagotchiURl from '../../assets/tamagotchi.glb?url';
import backgroundUrl from '../../assets/background.jpg?url';

const roomModelUrls = import.meta.glob([
  '../../assets/room/bed.glb',
  '../../assets/room/nightstand.glb',
  '../../assets/room/desk.glb',
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
  rotationY?: number;
  alignToFloor?: boolean;
};

export class Ps1ShelfScene {
  private static readonly gltfLoader = new GLTFLoader();

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private postProcessing: Ps1PostProcessing;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private cameraTarget = new THREE.Vector3(0, 0.6, 0);
  private freeCameraPosition = new THREE.Vector3(0, 1.2, 4);
  private freeCameraTarget = new THREE.Vector3(0, 0.6, 0);
  private cameraDesiredPosition = new THREE.Vector3(0, 1.2, 4);
  private cameraDesiredTarget = new THREE.Vector3(0, 0.6, 0);
  private frameId: number | null = null;
  private lastFrameTime = performance.now();
  private backgroundTexture: THREE.Texture | null = null;
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
  private readonly cameraZoomSpeed = 0.01;
  private readonly cameraMinDistance = 1.5;
  private readonly cameraMaxDistance = 32;
  private get selectedCameraYOffset() { return 0.1 * this.shelfContentScale; }
  private get selectedCameraDefaultDistance() { return 2.1 * this.shelfContentScale; }
  private get selectedCameraMinDistance() { return 1.2 * this.shelfContentScale; }
  private readonly selectedCameraMaxDistance = 10;
  private selectedCameraDistance = 2.1;
  private readonly showShelfDebug = false;
  private readonly roomDepth = 9.5;
  private readonly roomMinWidth = 11;
  // Treat the wall as eight feet high, with a three-foot game shelf.
  private readonly roomHeight = 6.5;
  private readonly targetShelfHeight = this.roomHeight * 3 / 8;
  private readonly referenceShelfWidth = 2.53;
  private shelfContentScale = 1;
  private get caseWidth() { return 0.87 * this.shelfContentScale; }
  private get caseHeight() { return 0.94 * this.shelfContentScale; }
  private get caseDepth() { return 0.13 * this.shelfContentScale; }
  private get selectionOffsetZ() { return 0.8 * this.shelfContentScale; }
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

    // Camera framing: slightly above and in front of the shelf.
    this.camera = new THREE.PerspectiveCamera(45, clientWidth / clientHeight, 0.1, 100);
    this.camera.position.copy(this.freeCameraPosition);
    this.camera.lookAt(this.cameraTarget);

    // WebGL renderer bound to the provided DOM container.
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
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
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.renderer.domElement.addEventListener('click', this.onClick);
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
    const depth = Math.max(this.roomDepth, this.freeCameraPosition.z - rearZ + 2.5);
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
    const lightZ = room.rearZ + room.depth * 0.48;
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
    const shelfLeft = room.shelfCenter.x - room.shelfSize.x / 2;
    const bedWidth = 2.7;
    const bedX = THREE.MathUtils.clamp(
      shelfLeft - 1.75,
      room.leftX + bedWidth / 2 + 0.35,
      shelfLeft - bedWidth / 2 - 0.35
    );
    const rugMaterial = new THREE.MeshStandardMaterial({
      color: 0x66798a,
      roughness: 0.95
    });

    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9), rugMaterial);
    rug.name = 'small-bedroom-rug';
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(bedX, 0.018, room.rearZ + room.depth * 0.5);
    rug.receiveShadow = true;
    group.add(rug);

    this.createTvStand(group, room);
  }

  private getTvStandMetrics(room: ReturnType<Ps1ShelfScene['getRoomMetrics']>) {
    const width = 2.8;
    const depth = 1.65;
    const height = this.targetShelfHeight;
    const boardThickness = 0.08;
    return {
      width,
      depth,
      height,
      boardThickness,
      centerX: room.shelfCenter.x + room.shelfSize.x / 2 + 0.25 + width / 2,
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
      const url = this.getRoomModelUrl(config.filename);
      if (!url) {
        console.warn(`Room model not found: src/assets/room/${config.filename}`);
        return;
      }

      try {
        const gltf = await this.trackAssetLoad(Ps1ShelfScene.gltfLoader.loadAsync(url));
        if (this.isDestroyed || loadVersion !== this.roomLoadVersion || group !== this.roomGroup) {
          this.disposeObjectResources(gltf.scene);
          return;
        }

        const object = this.normalizeRoomProp(gltf.scene, config);
        object.name = config.label;
        group.add(object);
      } catch (err) {
        console.warn(`Failed to load room model: ${config.filename}`, err);
      }
    }));
  }

  private getRoomModelUrl(filename: string) {
    return roomModelUrls[`../../assets/room/${filename}`];
  }

  private getRoomPropConfigs(room: ReturnType<Ps1ShelfScene['getRoomMetrics']>): RoomPropConfig[] {
    const shelfLeft = room.shelfCenter.x - room.shelfSize.x / 2;
    const stand = this.getTvStandMetrics(room);
    const furnitureReferenceHeight = 1.43;
    const deskWidth = 2.75;
    const bedWidth = 2.7;
    const bedX = THREE.MathUtils.clamp(
      shelfLeft - 1.75,
      room.leftX + bedWidth / 2 + 0.35,
      shelfLeft - bedWidth / 2 - 0.35
    );
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
        position: new THREE.Vector3(bedX - bedWidth / 2 - 0.55, 0, bedZ - 1.15),
        targetSize: new THREE.Vector3(0.82, 0.86, 0.82),
        rotationY: Math.PI / 2
      },
      {
        filename: 'desk.glb',
        label: 'desk',
        position: new THREE.Vector3(deskX, 0, deskZ),
        targetSize: new THREE.Vector3(deskDepth, furnitureReferenceHeight * 1.16, deskWidth),
        rotationY: Math.PI / 2
      },
      {
        filename: 'chair.glb',
        label: 'desk-chair',
        position: new THREE.Vector3(deskX - 1.15, 0, deskZ),
        targetSize: new THREE.Vector3(1.2, furnitureReferenceHeight * 1.2, 1.2),
        rotationY: -Math.PI / 2
      },
      {
        filename: 'crt_tv.glb',
        label: 'crt-tv',
        position: new THREE.Vector3(stand.centerX, stand.height, stand.centerZ),
        targetSize: new THREE.Vector3(stand.width - 0.2, 1.5, stand.depth - 0.2),
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
        position: new THREE.Vector3(room.rightX - 0.55, 0, room.rearZ + 0.75),
        targetSize: new THREE.Vector3(0.62, 2.4, 0.62),
        rotationY: -Math.PI / 4
      },
      {
        filename: 'beanbag.glb',
        label: 'beanbag',
        position: new THREE.Vector3(room.centerX - 2.6, 0, room.rearZ + room.depth * 0.54),
        targetSize: new THREE.Vector3(1.25, 0.7, 1.25),
        rotationY: -Math.PI / 6
      }
    ];
  }

  private normalizeRoomProp(rawObject: THREE.Object3D, config: RoomPropConfig) {
    this.applyObjectShadows(rawObject);
    rawObject.rotation.y = config.rotationY ?? 0;
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
    this.selectedCameraDistance = this.selectedCameraDefaultDistance;
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
    const bounds = this.shelfBounds;
    if (!bounds) return;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const room = this.getRoomMetrics();
    const halfFovY = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const halfFovX = Math.atan(Math.tan(halfFovY) * this.camera.aspect);
    const framedHeight = Math.max(size.y + 1.8, room.height * 1.3);
    const framedWidth = Math.max(size.x * 1.25, room.width * 0.58);
    const distanceForHeight = (framedHeight * 0.5) / Math.tan(halfFovY);
    const distanceForWidth = (framedWidth * 0.5) / Math.tan(halfFovX || halfFovY);
    const distance = THREE.MathUtils.clamp(
      Math.max(distanceForHeight, distanceForWidth, size.z * 2.4) + 0.7,
      7,
      this.cameraMaxDistance
    );

    const targetY = THREE.MathUtils.clamp(room.height * 0.52, center.y + 0.45, room.height - 1);
    this.freeCameraTarget.set(center.x, targetY, center.z + 0.15);
    this.freeCameraPosition.set(center.x, targetY - 0.85, center.z + distance);

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
        trackAssetLoad: (promise) => this.trackAssetLoad(promise)
      });
      gameCase.group.userData.caseIndex = index;
      gameCase.group.scale.setScalar(this.shelfContentScale);
      this.applyObjectShadows(gameCase.group);
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
      this.postProcessing.render(deltaSeconds, now / 1000);
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

    if (hit !== undefined && hit !== null) {
      this.dispatchGamePress(hit);
    }
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

  private dispatchGamePress(index: number) {
    const game = this.shelfGames[index];
    if (!game) return;

    this.container.dispatchEvent(new CustomEvent<ShelfGamePressDetail>(PS1_GAME_PRESS_EVENT, {
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
    this.postProcessing.setSize(clientWidth, clientHeight, this.renderer.getPixelRatio());
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
    this.backgroundTexture?.dispose();
    this.backgroundTexture = null;
    this.postProcessing.dispose();
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
