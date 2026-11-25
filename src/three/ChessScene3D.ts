import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Chess } from 'chess.js';
import {
  BOARD_SKINS,
  LIGHTING_MOODS,
  createContactShadowTexture,
  createEmbossedCoordinateMaps,
  createProceduralPbrMaps,
  type WoodFigureStyle,
} from './skins';
import {
  buildSculptedPiece,
  createPieceGeometryCache,
  disposePieceGeometryCache,
  type PieceMaterialSet,
} from './pieceFactory';
import { WildDogActor } from './wildDog';
import { MiniHamsterActor } from './miniHamsters';
import { soundEngine } from './sound';
import type {
  BoardSkinId,
  BotSearchReport,
  CameraPreset,
  LightingMood,
  PieceColor,
  PieceType,
  SearchTreeEdge,
} from '../shared/types';
import type { UpperRightVoidSpec } from '../utils/deviceLayout';

export interface SuggestionArrow {
  from: string;
  to: string;
  kind: 'primary' | 'secondary' | 'branch' | 'trial-1' | 'trial-2' | 'trial-3' | 'fork';
  opacityScale?: number;
  customColorHex?: number;
}

export interface SpeechPieceHighlight {
  square: string;
  role: 'danger' | 'attacker';
}

export interface SceneVisualState {
  fen: string;
  selectedSquare: string | null;
  legalTargets: { square: string; isCapture: boolean }[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  bestMoveArrow: { from: string; to: string } | null;
  suggestionArrows?: SuggestionArrow[];
  speechHighlights?: SpeechPieceHighlight[];
  showCoordinates: boolean;
}

interface ActivePieceAnim {
  obj: THREE.Group;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  origQuat: THREE.Quaternion;
  elapsed: number;
  duration: number;
  arcHeight: number;
  /** Optional subtle forward lean into the strike during a capture slide */
  strikeLeanRad?: number;
  strikeLeanAxis?: THREE.Vector3;
}

interface CaptureSweepAnim {
  obj: THREE.Group;
  contactShadow: THREE.Object3D | null;
  origQuat: THREE.Quaternion;
  startPos: THREE.Vector3;
  controlPos: THREE.Vector3;
  endPos: THREE.Vector3;
  tiltAxis: THREE.Vector3;
  maxTiltRad: number;
  spinYawRad: number;
  peakLiftY: number;
  delay: number;
  elapsed: number;
  duration: number;
  targetScale: number;
  /** Corresponding static piece in capturedGroup, hidden until the flying piece lands */
  revealGraveyardMesh: THREE.Group | null;
}

interface TippedPieceAnim {
  group: THREE.Group;
  contactShadow: THREE.Object3D | null;
  baseRadius: number;
  lipHeight: number;
  headRadius: number;
  headHeight: number;
  origPos: THREE.Vector3;
  origQuat: THREE.Quaternion;
  fallAxis: THREE.Vector3;
  pushDir: THREE.Vector3;
  fallAngle: number;
  targetFallAngle: number;
  fallVel: number;
  nudgeDist: number;
  nudgeCurrent: number;
  spinYaw: number;
  bounces: number;
  recoverDelay: number;
  recoverStartAngle: number;
  recoverStartNudge: number;
}

interface WobblePieceAnim {
  group: THREE.Group;
  origPos: THREE.Vector3;
  origQuat: THREE.Quaternion;
  pushDir: THREE.Vector3;
  axis: THREE.Vector3;
  baseRadius: number;
  age: number;
  duration: number;
  amplitude: number;
}

const PIECE_TIP_DIMENSIONS: Record<
  PieceType,
  { baseRadius: number; lipHeight: number; headRadius: number; headHeight: number }
> = {
  p: { baseRadius: 0.312, lipHeight: 0.048, headRadius: 0.168, headHeight: 0.785 },
  r: { baseRadius: 0.352, lipHeight: 0.05, headRadius: 0.256, headHeight: 1.06 },
  n: { baseRadius: 0.358, lipHeight: 0.052, headRadius: 0.245, headHeight: 0.96 },
  b: { baseRadius: 0.348, lipHeight: 0.048, headRadius: 0.2, headHeight: 1.04 },
  q: { baseRadius: 0.378, lipHeight: 0.056, headRadius: 0.258, headHeight: 1.3 },
  k: { baseRadius: 0.398, lipHeight: 0.06, headRadius: 0.28, headHeight: 1.38 },
};

interface SceneCallbacks {
  onSquareClick: (square: string) => void;
  onTreeSquareClick?: (square: string) => void;
  onUpperRightVoidChange?: (spec: UpperRightVoidSpec) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
  onSecretCoord8DoubleClick?: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const BOARD_TOP_Y = 0.06;

// Dynamic hardware profile split for Android / iOS vs PC
const isMobile =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

// Module-scoped reusable vectors to ensure zero GC inside animation frames
const _tmpVec = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _dogPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP_Y);
const _dogRaycaster = new THREE.Raycaster();
const _dogPos = new THREE.Vector3();
const _dogTan = new THREE.Vector3();
const _dogProj = new THREE.Vector3();
const _dogUp = new THREE.Vector3(0, 1, 0);
const _dogPush = new THREE.Vector3();
const _dogAxis = new THREE.Vector3();
const _dogTiltQuat = new THREE.Quaternion();
const _dogSpinQuat = new THREE.Quaternion();
const _hamPosA = new THREE.Vector3();
const _hamTanA = new THREE.Vector3();
const _hamPosB = new THREE.Vector3();
const _hamTanB = new THREE.Vector3();
const _hamSide = new THREE.Vector3();
const _captureDir = new THREE.Vector3();
const _captureAxis = new THREE.Vector3();
const _captureQuat = new THREE.Quaternion();
const _captureSpinQuat = new THREE.Quaternion();
const _captureUp = new THREE.Vector3(0, 1, 0);

export function squareToWorld(square: string, target = new THREE.Vector3()): THREE.Vector3 {
  const fileIdx = square.charCodeAt(0) - 97; // 0..7 (a..h)
  const rankIdx = Number(square[1]) - 1; // 0..7 (1..8)
  const x = fileIdx - 3.5;
  const z = 3.5 - rankIdx; // rank 1 at +3.5 (near White), rank 8 at -3.5 (near Black)
  return target.set(x, BOARD_TOP_Y, z);
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ChessScene3D {
  private container: HTMLElement;
  private callbacks: SceneCallbacks;
  private isSoftwareGl: boolean;
  private isMobileDevice: boolean;
  private webglUnavailable = false;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private envTexture: THREE.Texture | null = null;

  // Lights
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;

  // Board & materials
  private currentSkinId: BoardSkinId = 'walnut-maple';
  private currentMood: LightingMood = 'warm-studio';
  private boardGroup = new THREE.Group();
  private coordGroup = new THREE.Group();
  private pieceGroup = new THREE.Group();
  private capturedGroup = new THREE.Group();
  private captureSweepGroup = new THREE.Group();
  private overlayGroup = new THREE.Group();
  private arrowGroup = new THREE.Group();
  private treeLineGroup = new THREE.Group();
  private hitboxes: THREE.Mesh[] = [];

  private lightSquareMats: THREE.MeshStandardMaterial[] = [];
  private darkSquareMats: THREE.MeshStandardMaterial[] = [];
  private tileGeometries: THREE.BufferGeometry[] = [];
  private hitboxGeo: THREE.BufferGeometry | null = null;
  private hitboxMat: THREE.Material | null = null;
  private frameMat!: THREE.MeshStandardMaterial;
  private recessBedMat!: THREE.MeshStandardMaterial;
  private tableMat!: THREE.MeshBasicMaterial;
  private whitePieceMats!: PieceMaterialSet;
  private blackPieceMats!: PieceMaterialSet;
  private whiteDangerMats!: PieceMaterialSet;
  private whiteAttackerMats!: PieceMaterialSet;
  private blackDangerMats!: PieceMaterialSet;
  private blackAttackerMats!: PieceMaterialSet;
  private pieceContactShadowMat!: THREE.MeshBasicMaterial;
  private enableShadows = true;

  private pieceGeoCache = createPieceGeometryCache();
  private pieceMap = new Map<string, { group: THREE.Group; type: PieceType; color: PieceColor }>();
  private animations: ActivePieceAnim[] = [];
  private captureSweeps: CaptureSweepAnim[] = [];

  // Overlays
  private hoverRing!: THREE.Mesh;
  private selectedRing!: THREE.Mesh;
  private checkRing!: THREE.Mesh;
  private lastFromPlate!: THREE.Mesh;
  private lastToPlate!: THREE.Mesh;
  private legalMarkerGroup = new THREE.Group();
  private speechHighlightGroup = new THREE.Group();
  private activeSpeechHighlights: SpeechPieceHighlight[] = [];
  private highlightedPieceGroups = new Map<THREE.Group, PieceColor>();
  private speechPulseTime = 0;
  private speechHaloRingGeo = new THREE.RingGeometry(0.35, 0.48, 40);
  private speechHaloDiscGeo = new THREE.CircleGeometry(0.45, 36);
  private speechDangerRingMat = new THREE.MeshBasicMaterial({
    color: 0xff453a,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  private speechDangerDiscMat = new THREE.MeshBasicMaterial({
    color: 0xff3b2f,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private speechAttackerRingMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  private speechAttackerDiscMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private legalQuietGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.018, 24);
  private legalCaptureGeo = new THREE.RingGeometry(0.32, 0.43, 32);
  private legalQuietMat = new THREE.MeshStandardMaterial({
    color: 0xb5e3ff,
    emissive: 0x7cc8f8,
    emissiveIntensity: 0.42,
    roughness: 0.3,
    transparent: true,
    opacity: 0.88,
  });
  private legalCaptureMat = new THREE.MeshBasicMaterial({
    color: 0xd94f4f,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // Calculation search-tree preview & arrow fade state
  private calcPreviewTimers: number[] = [];
  private calcPreviewActive = false;
  private calcWaitingForClick = false;
  private calcNextBranchFn: (() => void) | null = null;
  private calcPreviewRestoreState: SceneVisualState | null = null;
  private latestSyncedState: SceneVisualState | null = null;
  private arrowFadeActive = false;
  private arrowFadeElapsed = 0;
  private arrowFadeDuration = 0.85;
  private arrowFadeCompleteCb: (() => void) | null = null;

  // Full search-tree thin-line live-development & 5s hold state (single batched LineSegments)
  private treeSweepPhase: 'idle' | 'developing' | 'holding' | 'fading' = 'idle';
  private treeVisibleEdgesFloat = 0;
  private treeSweepTotalEdges = 0;
  private treeFinalized = false;
  private treeDevelopRateEdgesPerSec = 140;
  private treeHoldDurationSec = 5.0;
  private treeFadeDurationSec = 0.35;
  private treeFadeElapsed = 0;
  private treeHoldTimer = 0;
  private treeSweepMesh: THREE.LineSegments | null = null;
  private treeDevelopedCb: (() => void) | null = null;
  private treeSweepCompleteCb: (() => void) | null = null;

  // Special Event: Small White Fluffy Puppy Rampage across the 3D chessboard
  private wildDog: WildDogActor | null = null;
  private wildDogPhase: 'idle' | 'running' | 'hold' | 'recovering' = 'idle';
  private wildDogCurve: THREE.CatmullRomCurve3 | null = null;
  private wildDogElapsed = 0;
  private wildDogDuration = 3.55;
  private wildDogPhaseTimer = 0;
  private wildDogNextBarkAt = 0;
  private wildDogBarkEnv = 0;
  private wildDogLastToppleAudioMs = 0;
  private wildDogTippedPieces = new Map<THREE.Group, TippedPieceAnim>();
  private wildDogSoundMuted = false;

  // Special 3D Event: Dark Grey Russian Mini Hamster (black dorsal stripe) &
  // White Mini Hamster (pink nose & pink claws) chasing each other wildly across the board
  private hamsterGrey: MiniHamsterActor | null = null;
  private hamsterWhite: MiniHamsterActor | null = null;
  private hamsterActive = false;
  private hamsterCurve: THREE.CatmullRomCurve3 | null = null;
  private hamsterElapsed = 0;
  private hamsterDuration = 6.2;
  private hamsterNextSqueakAt = 0;
  private hamsterSqueakEnvWhite = 0;
  private hamsterSqueakEnvGrey = 0;
  private hamsterSoundMuted = false;
  private hamsterWobbles = new Map<THREE.Group, WobblePieceAnim>();
  private lastPiecesBoardKey: string | null = null;

  // Camera transition & responsive maximum-extent framing state
  private currentPreset: CameraPreset = 'white';
  private userAdjustedCamera = false;
  private camGoalPos: THREE.Vector3 | null = null;
  private camGoalTarget: THREE.Vector3 | null = null;
  private angelOverlayVisible = true;
  private lastEmittedVoid: UpperRightVoidSpec | null = null;

  // Interaction
  private raycaster = new THREE.Raycaster();
  private coordRaycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private lastCoord8TapMs = 0;
  private hoveredSquare: string | null = null;
  private lastHoverRaycastTime = 0;

  // Render scheduling (on-demand + software GL fence pacing + Power Save Mode FPS cap)
  private frameId = 0;
  private powerSaveTimerId = 0;
  private powerSaveMode = false;
  private lastRenderAtMs = 0;
  private readonly POWER_SAVE_FRAME_INTERVAL_MS = 42; // ~24 FPS active cap in Power Save Mode
  private renderBusy = false;
  private renderDirty = false;
  private lastFrameTime = performance.now();
  private disposed = false;

  // Bound event listeners
  private resizeObserver: ResizeObserver | null = null;
  private boundPointerDown!: (e: PointerEvent) => void;
  private boundPointerUp!: (e: PointerEvent) => void;
  private boundPointerMove!: (e: PointerEvent) => void;
  private boundPointerLeave!: () => void;
  private boundDblClick!: (e: MouseEvent) => void;
  private boundContextLost!: (e: Event) => void;
  private boundContextRestored!: () => void;

  constructor(
    container: HTMLElement,
    initialSkin: BoardSkinId,
    initialMood: LightingMood,
    callbacks: SceneCallbacks,
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.currentSkinId = initialSkin;
    this.currentMood = initialMood;
    this.isSoftwareGl = detectSoftwareGl();
    this.isMobileDevice = isMobile;
    this.enableShadows = !this.isSoftwareGl && !this.isMobileDevice;

    const width = Math.max(container.clientWidth || window.innerWidth, 1);
    const height = Math.max(container.clientHeight || window.innerHeight, 1);

    // 1. Safely initialize WebGLRenderer inside try/catch with fallback context options
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl && !this.isMobileDevice,
        powerPreference: this.isMobileDevice ? 'default' : 'high-performance',
      });
    } catch {
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: false });
      } catch {
        this.webglUnavailable = true;
        this.callbacks.onContextLost?.();
        return;
      }
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING_MOODS[initialMood].exposure;

    // Device pixel ratio split: 1.0 on software GL, max 1.5 on mobile, max 2.0 on PC
    const dpr = this.isSoftwareGl
      ? 1
      : this.isMobileDevice
        ? Math.min(window.devicePixelRatio || 1, 1.5)
        : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.shadowMap.enabled = this.enableShadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.backgroundColor = '#000000';
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Studio Environment (Pure #000000 Pitch-Black Background)
    this.scene = new THREE.Scene();
    const skin = BOARD_SKINS[initialSkin];
    this.scene.background = new THREE.Color(0x000000);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    // 3. Camera & OrbitControls (fitted to maximum unobstructed screen extent on start)
    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 160);
    const initialPose = this.frameCameraPoseForViewport('white', width, height);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 5.5;
    this.controls.maxDistance = 46.0;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;

    this.camera.position.copy(initialPose.pos);
    this.controls.target.copy(initialPose.target);
    this.controls.update();
    this.emitUpperRightVoid(width, height, initialPose.pos, initialPose.target);

    this.controls.addEventListener('start', () => {
      this.userAdjustedCamera = true;
      this.camGoalPos = null;
      this.camGoalTarget = null;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });
    this.controls.addEventListener('end', () => {
      const cw = Math.max(this.container.clientWidth || window.innerWidth, 1);
      const ch = Math.max(this.container.clientHeight || window.innerHeight, 1);
      this.emitUpperRightVoid(cw, ch, this.camera.position, this.controls.target);
    });

    // 4. Crisp architectural studio lighting for sharply defined cast piece silhouettes
    const mood = LIGHTING_MOODS[initialMood];
    this.keyLight = new THREE.DirectionalLight(mood.keyColor, mood.keyIntensity);
    this.keyLight.position.set(8.4, 7.4, 5.4);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = this.enableShadows;
    const shadowMapDim = this.isSoftwareGl ? 1024 : this.isMobileDevice ? 2048 : 4096;
    this.keyLight.shadow.mapSize.set(shadowMapDim, shadowMapDim);
    this.keyLight.shadow.camera.near = 4.6;
    this.keyLight.shadow.camera.far = 19.6;
    this.keyLight.shadow.camera.left = -6.5;
    this.keyLight.shadow.camera.right = 6.5;
    this.keyLight.shadow.camera.top = 5.6;
    this.keyLight.shadow.camera.bottom = -4.3;
    this.keyLight.shadow.bias = -0.00008;
    this.keyLight.shadow.normalBias = 0.002;
    this.keyLight.shadow.radius = 0;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.hemiLight = new THREE.HemisphereLight(mood.hemiSky, mood.hemiGround, mood.hemiIntensity);
    this.scene.add(this.hemiLight);

    // Subtle rim light separates dark piece silhouettes cleanly without washing out cast shadows
    this.rimLight = new THREE.DirectionalLight(mood.rimColor, mood.rimIntensity);
    this.rimLight.position.set(-8.5, 2.2, -8.5);
    this.scene.add(this.rimLight);

    // 5. Build materials, board architecture, overlays, and raycast hitboxes
    this.initMaterials(skin);
    this.buildTableAndBoard();
    this.buildOverlays();
    this.wildDog = new WildDogActor(this.enableShadows);
    this.hamsterGrey = new MiniHamsterActor('russian-grey', this.enableShadows);
    this.hamsterWhite = new MiniHamsterActor('snow-white', this.enableShadows);
    this.scene.add(
      this.boardGroup,
      this.coordGroup,
      this.overlayGroup,
      this.pieceGroup,
      this.capturedGroup,
      this.captureSweepGroup,
      this.treeLineGroup,
      this.arrowGroup,
      this.wildDog.root,
      this.wildDog.dustGroup,
      this.hamsterGrey.root,
      this.hamsterGrey.dustGroup,
      this.hamsterWhite.root,
      this.hamsterWhite.dustGroup,
    );
    this.rebuildCoordinates(skin.coordTextColor, skin.frameGrainHex, skin.boardEnvIntensity);

    this.raycaster.layers.set(1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 6. Listeners (including webglcontextlost & webglcontextrestored)
    this.boundPointerDown = (e) => this.handlePointerDown(e);
    this.boundPointerUp = (e) => this.handlePointerUp(e);
    this.boundPointerMove = (e) => this.handlePointerMove(e);
    this.boundPointerLeave = () => {
      if (this.hoveredSquare) {
        this.hoveredSquare = null;
        this.hoverRing.visible = false;
        this.renderer.domElement.style.cursor = 'grab';
        this.requestRender();
      }
    };
    this.boundDblClick = (e) => this.handleDblClick(e);
    this.boundContextLost = (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.frameId);
      window.clearTimeout(this.frameId);
      window.clearTimeout(this.powerSaveTimerId);
      this.powerSaveTimerId = 0;
      this.renderBusy = false;
      this.callbacks.onContextLost?.();
    };
    this.boundContextRestored = () => {
      this.callbacks.onContextRestored?.();
      this.requestRender();
    };

    const dom = this.renderer.domElement;
    dom.style.cursor = 'grab';
    dom.addEventListener('pointerdown', this.boundPointerDown);
    dom.addEventListener('pointerup', this.boundPointerUp);
    dom.addEventListener('pointermove', this.boundPointerMove);
    dom.addEventListener('pointerleave', this.boundPointerLeave);
    if (this.callbacks.onSecretCoord8DoubleClick) {
      dom.addEventListener('dblclick', this.boundDblClick);
    }
    dom.addEventListener('webglcontextlost', this.boundContextLost);
    dom.addEventListener('webglcontextrestored', this.boundContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.requestRender();
  }

  private buildSkinTextures(skin: (typeof BOARD_SKINS)[BoardSkinId]) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const veneerStyles: WoodFigureStyle[] = [
      'cathedral',
      'quartersawn',
      'ribbon',
      'curly',
      'burl',
    ];

    // Natural beige sycamore/maple plank cuts: subtle per-plank beige hue & figure contrast so every light checker reads as its own distinct piece of wood
    const lightPlankSpecs: ReadonlyArray<{
      seed: number;
      baseHex: string;
      grainHex: string;
      contrast: number;
      rotateQuarter: boolean;
    }> = [
      { seed: 11, baseHex: '#b6a07f', grainHex: '#806848', contrast: 0.96, rotateQuarter: false },
      { seed: 23, baseHex: '#b09a79', grainHex: '#7a6242', contrast: 1.12, rotateQuarter: false },
      { seed: 37, baseHex: '#aa9372', grainHex: '#755d3d', contrast: 1.04, rotateQuarter: true },
      { seed: 53, baseHex: '#b9a484', grainHex: '#846c4c', contrast: 0.88, rotateQuarter: false },
      { seed: 71, baseHex: '#ad9675', grainHex: '#775f3f', contrast: 1.18, rotateQuarter: false },
      { seed: 89, baseHex: '#a7906f', grainHex: '#72593a', contrast: 1.06, rotateQuarter: true },
      { seed: 107, baseHex: '#b49f80', grainHex: '#7e6747', contrast: 0.94, rotateQuarter: false },
      { seed: 127, baseHex: '#af9877', grainHex: '#796141', contrast: 1.16, rotateQuarter: false },
      { seed: 149, baseHex: '#b59f7e', grainHex: '#7f6646', contrast: 1.02, rotateQuarter: true },
      { seed: 167, baseHex: '#a99271', grainHex: '#745b3c', contrast: 1.22, rotateQuarter: false },
      { seed: 191, baseHex: '#b29c7c', grainHex: '#7d6545', contrast: 0.9, rotateQuarter: false },
      { seed: 211, baseHex: '#ac9574', grainHex: '#775e3f', contrast: 1.1, rotateQuarter: true },
    ];

    const lightVariants = lightPlankSpecs.map((plank, idx) =>
      createProceduralPbrMaps(
        skin.id === 'walnut-maple' ? plank.baseHex : skin.lightSquare.baseHex,
        skin.id === 'walnut-maple' ? plank.grainHex : skin.lightSquare.grainHex,
        skin.lightSquare.pattern,
        plank.seed,
        maxAniso,
        {
          size: 512,
          tileSeam: false,
          rotateQuarter: plank.rotateQuarter,
          grainContrast: plank.contrast,
          figureStyle: veneerStyles[idx % veneerStyles.length],
        },
      ),
    );

    const darkPlankSpecs: ReadonlyArray<{
      seed: number;
      baseHex: string;
      grainHex: string;
      contrast: number;
      rotateQuarter: boolean;
    }> = [
      { seed: 17, baseHex: '#351d0f', grainHex: '#1e0e06', contrast: 0.96, rotateQuarter: false },
      { seed: 29, baseHex: '#301a0d', grainHex: '#1b0d05', contrast: 1.06, rotateQuarter: false },
      { seed: 43, baseHex: '#2c170b', grainHex: '#180b04', contrast: 0.92, rotateQuarter: true },
      { seed: 61, baseHex: '#371f10', grainHex: '#201007', contrast: 1.08, rotateQuarter: false },
      { seed: 79, baseHex: '#311a0d', grainHex: '#1b0d05', contrast: 0.98, rotateQuarter: false },
      { seed: 97, baseHex: '#2b160b', grainHex: '#170a04', contrast: 1.04, rotateQuarter: true },
      { seed: 113, baseHex: '#341c0e', grainHex: '#1d0e06', contrast: 0.9, rotateQuarter: false },
      { seed: 137, baseHex: '#2e180c', grainHex: '#190c05', contrast: 1.1, rotateQuarter: false },
      { seed: 157, baseHex: '#361e10', grainHex: '#1f0f06', contrast: 0.95, rotateQuarter: true },
      { seed: 179, baseHex: '#2d180c', grainHex: '#180b04', contrast: 1.05, rotateQuarter: false },
      { seed: 197, baseHex: '#321b0e', grainHex: '#1c0d05', contrast: 0.93, rotateQuarter: false },
      { seed: 223, baseHex: '#2f190c', grainHex: '#1a0c05', contrast: 1.12, rotateQuarter: true },
    ];

    const darkVariants = darkPlankSpecs.map((plank, idx) =>
      createProceduralPbrMaps(
        skin.id === 'walnut-maple' ? plank.baseHex : skin.darkSquare.baseHex,
        skin.id === 'walnut-maple' ? plank.grainHex : skin.darkSquare.grainHex,
        skin.darkSquare.pattern,
        plank.seed,
        maxAniso,
        {
          size: 512,
          tileSeam: false,
          rotateQuarter: plank.rotateQuarter,
          grainContrast: plank.contrast,
          figureStyle: veneerStyles[idx % veneerStyles.length],
        },
      ),
    );

    // Board frame milled from the exact same rich walnut hardwood palette (continuous frame grain, dedicated 6x6 repeat)
    const frameBaseMaps = createProceduralPbrMaps(
      skin.frameBaseHex,
      skin.frameGrainHex,
      skin.framePattern,
      151,
      maxAniso,
      { size: 512, tileSeam: false, grainContrast: 0.88, figureStyle: 'frame' },
    );
    frameBaseMaps.map.repeat.set(6, 6);
    frameBaseMaps.bumpMap.repeat.set(6, 6);
    frameBaseMaps.roughnessMap.repeat.set(6, 6);
    const framePbr = frameBaseMaps;

    const whitePieceHex = `#${skin.whitePiece.color.toString(16).padStart(6, '0')}`;
    const blackPieceHex = `#${skin.blackPiece.color.toString(16).padStart(6, '0')}`;

    const whitePiecePbr = createProceduralPbrMaps(
      whitePieceHex,
      '#756e65',
      'wood',
      101,
      maxAniso,
      { size: 512, tileSeam: false, rotateQuarter: true, grainContrast: 1.35, smoothTurned: true },
    );
    const blackPiecePbr = createProceduralPbrMaps(
      blackPieceHex,
      '#0d0704',
      'wood',
      131,
      maxAniso,
      { size: 512, tileSeam: false, rotateQuarter: true, grainContrast: 0.65, smoothTurned: true },
    );

    return { lightVariants, darkVariants, framePbr, whitePiecePbr, blackPiecePbr };
  }

  private initMaterials(skin: (typeof BOARD_SKINS)[BoardSkinId]): void {
    const { lightVariants, darkVariants, framePbr, whitePiecePbr, blackPiecePbr } =
      this.buildSkinTextures(skin);

    const pieceAoTex = createContactShadowTexture();

    this.pieceContactShadowMat = new THREE.MeshBasicMaterial({
      map: pieceAoTex,
      transparent: true,
      depthWrite: false,
      opacity: this.enableShadows ? 0.36 : 0.54,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const bumpAmount = 0.014;

    // Mobile fallback: MeshStandardMaterial on Android/iOS; MeshPhysicalMaterial on PC (vertexColors carries subtle per-checker wood variation)
    const boardSurfaceTint = 0xf0ebe3;
    this.lightSquareMats = lightVariants.map((v) =>
      this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: boardSurfaceTint,
            vertexColors: true,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.lightSquare.roughness,
            metalness: skin.lightSquare.metalness,
            envMapIntensity: skin.boardEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: boardSurfaceTint,
            vertexColors: true,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.lightSquare.roughness,
            metalness: skin.lightSquare.metalness,
            clearcoat: skin.lightSquare.clearcoat,
            clearcoatRoughness: 0.46,
            envMapIntensity: skin.boardEnvIntensity,
          }),
    );

    this.darkSquareMats = darkVariants.map((v) =>
      this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: boardSurfaceTint,
            vertexColors: true,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.darkSquare.roughness,
            metalness: skin.darkSquare.metalness,
            envMapIntensity: skin.boardEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: boardSurfaceTint,
            vertexColors: true,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.darkSquare.roughness,
            metalness: skin.darkSquare.metalness,
            clearcoat: skin.darkSquare.clearcoat,
            clearcoatRoughness: 0.46,
            envMapIntensity: skin.boardEnvIntensity,
          }),
    );

    this.frameMat = this.isMobileDevice
      ? new THREE.MeshStandardMaterial({
          color: boardSurfaceTint,
          map: framePbr.map,
          bumpMap: framePbr.bumpMap,
          bumpScale: bumpAmount,
          roughnessMap: framePbr.roughnessMap,
          roughness: skin.darkSquare.roughness,
          metalness: skin.darkSquare.metalness,
          envMapIntensity: skin.boardEnvIntensity,
        })
      : new THREE.MeshPhysicalMaterial({
          color: boardSurfaceTint,
          map: framePbr.map,
          bumpMap: framePbr.bumpMap,
          bumpScale: bumpAmount,
          roughnessMap: framePbr.roughnessMap,
          roughness: skin.darkSquare.roughness,
          metalness: skin.darkSquare.metalness,
          clearcoat: skin.darkSquare.clearcoat,
          clearcoatRoughness: 0.46,
          envMapIntensity: skin.boardEnvIntensity,
        });

    this.recessBedMat = new THREE.MeshStandardMaterial({
      color: 0x0c0502,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.015,
    });

    this.tableMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      toneMapped: false,
    });

    const whiteGrooveColor = new THREE.Color(skin.whitePiece.collarColor).multiplyScalar(0.5);
    const blackGrooveColor = new THREE.Color(skin.blackPiece.collarColor).multiplyScalar(0.55);
    const whitePieceSpec = 0.16;
    const whiteEnvIntensity = skin.pieceEnvIntensity * 0.42;

    this.whitePieceMats = {
      body: this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            map: whitePiecePbr.map,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.0032,
            roughnessMap: whitePiecePbr.roughnessMap,
            roughness: skin.whitePiece.roughness,
            metalness: skin.whitePiece.metalness,
            envMapIntensity: whiteEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            vertexColors: true,
            map: whitePiecePbr.map,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.0032,
            roughnessMap: whitePiecePbr.roughnessMap,
            roughness: skin.whitePiece.roughness,
            metalness: skin.whitePiece.metalness,
            clearcoat: skin.whitePiece.clearcoat,
            clearcoatRoughness: 0.45,
            specularIntensity: whitePieceSpec,
            envMapIntensity: whiteEnvIntensity,
          }),
      collar: this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: skin.whitePiece.collarColor,
            vertexColors: true,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.0022,
            roughness: skin.whitePiece.collarRoughness,
            metalness: skin.whitePiece.collarMetalness,
            envMapIntensity: whiteEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: skin.whitePiece.collarColor,
            vertexColors: true,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.0022,
            roughness: skin.whitePiece.collarRoughness,
            metalness: skin.whitePiece.collarMetalness,
            clearcoat: skin.whitePiece.clearcoat,
            clearcoatRoughness: 0.48,
            specularIntensity: whitePieceSpec,
            envMapIntensity: whiteEnvIntensity,
          }),
      groove: new THREE.MeshStandardMaterial({
        color: whiteGrooveColor,
        roughness: 0.65,
        metalness: 0.0,
        envMapIntensity: 0.04,
      }),
      contactShadow: this.pieceContactShadowMat,
    };

    const blackPieceSpec = 0.16;
    const blackEnvIntensity = skin.pieceEnvIntensity * 0.35;
    this.blackPieceMats = {
      body: this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: blackPiecePbr.map,
            bumpMap: blackPiecePbr.bumpMap,
            bumpScale: 0.0015,
            roughness: skin.blackPiece.roughness,
            metalness: skin.blackPiece.metalness,
            envMapIntensity: blackEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            map: blackPiecePbr.map,
            bumpMap: blackPiecePbr.bumpMap,
            bumpScale: 0.0015,
            roughness: skin.blackPiece.roughness,
            metalness: skin.blackPiece.metalness,
            clearcoat: skin.blackPiece.clearcoat,
            clearcoatRoughness: 0.65,
            specularIntensity: blackPieceSpec,
            envMapIntensity: blackEnvIntensity,
          }),
      collar: this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: skin.blackPiece.collarColor,
            bumpMap: blackPiecePbr.bumpMap,
            bumpScale: 0.0015,
            roughness: skin.blackPiece.collarRoughness,
            metalness: skin.blackPiece.collarMetalness,
            envMapIntensity: blackEnvIntensity * 0.9,
          })
        : new THREE.MeshPhysicalMaterial({
            color: skin.blackPiece.collarColor,
            bumpMap: blackPiecePbr.bumpMap,
            bumpScale: 0.0015,
            roughness: skin.blackPiece.collarRoughness,
            metalness: skin.blackPiece.collarMetalness,
            clearcoat: skin.blackPiece.clearcoat,
            clearcoatRoughness: 0.68,
            specularIntensity: blackPieceSpec,
            envMapIntensity: blackEnvIntensity * 0.9,
          }),
      groove: new THREE.MeshStandardMaterial({
        color: blackGrooveColor,
        roughness: 0.96,
        metalness: 0.0,
        envMapIntensity: 0.015,
      }),
      contactShadow: this.pieceContactShadowMat,
    };

    const clonePieceMatsWithEmissive = (
      src: PieceMaterialSet,
      emissiveHex: number,
      intensity: number,
    ): PieceMaterialSet => {
      const body = src.body.clone() as THREE.MeshStandardMaterial;
      body.emissive = new THREE.Color(emissiveHex);
      body.emissiveIntensity = intensity;
      const collar = src.collar.clone() as THREE.MeshStandardMaterial;
      collar.emissive = new THREE.Color(emissiveHex);
      collar.emissiveIntensity = intensity * 0.9;
      const groove = src.groove.clone();
      groove.emissive = new THREE.Color(emissiveHex);
      groove.emissiveIntensity = intensity * 0.65;
      return {
        body,
        collar,
        groove,
        contactShadow: src.contactShadow,
      };
    };

    // Reuses shared procedural wood textures (zero extra CanvasTextures) with subtle emissive tint
    this.whiteDangerMats = clonePieceMatsWithEmissive(this.whitePieceMats, 0xd95b4f, 0.15);
    this.whiteAttackerMats = clonePieceMatsWithEmissive(this.whitePieceMats, 0xd9a84e, 0.12);
    this.blackDangerMats = clonePieceMatsWithEmissive(this.blackPieceMats, 0xd95b4f, 0.2);
    this.blackAttackerMats = clonePieceMatsWithEmissive(this.blackPieceMats, 0xd9a84e, 0.16);
  }

  private buildTableAndBoard(): void {
    const tableGeo = new THREE.CylinderGeometry(28, 28, 0.5, 64);
    this.tileGeometries.push(tableGeo);
    const table = new THREE.Mesh(tableGeo, this.tableMat);
    table.position.y = -0.54;
    table.receiveShadow = false;
    this.boardGroup.add(table);

    const shadowTex = createContactShadowTexture();
    const contactGeo = new THREE.PlaneGeometry(11.8, 11.8);
    this.tileGeometries.push(contactGeo);
    const contactPlane = new THREE.Mesh(
      contactGeo,
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      }),
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = -0.285;
    this.boardGroup.add(contactPlane);

    const tileHash = (f: number, r: number, salt: number): number => {
      const n = Math.sin((f + 1) * 127.1 + (r + 1) * 311.7 + salt * 74.7) * 43758.5453;
      return n - Math.floor(n);
    };

    const makeRoundedBoardOutline = (half: number, cornerR: number): THREE.Shape => {
      const shape = new THREE.Shape();
      shape.moveTo(-half + cornerR, -half);
      shape.lineTo(half - cornerR, -half);
      shape.quadraticCurveTo(half, -half, half, -half + cornerR);
      shape.lineTo(half, half - cornerR);
      shape.quadraticCurveTo(half, half, half - cornerR, half);
      shape.lineTo(-half + cornerR, half);
      shape.quadraticCurveTo(-half, half, -half, half - cornerR);
      shape.lineTo(-half, -half + cornerR);
      shape.quadraticCurveTo(-half, -half, -half + cornerR, -half);
      return shape;
    };

    const applyPlanarFrameUvs = (geo: THREE.BufferGeometry) => {
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const vz = posAttr.getZ(i);
        uvAttr.setXY(i, (vx + vy * 0.25) / 9.2 + 0.5, (vz + vy * 0.25) / 9.2 + 0.5);
      }
      uvAttr.needsUpdate = true;
    };

    const half = 4.44;
    const cornerR = 0.08;
    const slabShape = makeRoundedBoardOutline(half, cornerR);

    // 1. Solid walnut base chassis sitting beneath the marquetry shadow bed
    const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.035,
      bevelSegments: 3,
    });
    slabGeo.rotateX(Math.PI / 2);
    applyPlanarFrameUvs(slabGeo);
    slabGeo.computeVertexNormals();
    this.tileGeometries.push(slabGeo);

    const mainSlab = new THREE.Mesh(slabGeo, this.frameMat);
    mainSlab.position.y = 0.015; // Top surface at y = 0.045, bottom at y = -0.275
    mainSlab.userData.isBoardSlab = true;
    mainSlab.castShadow = this.enableShadows;
    mainSlab.receiveShadow = this.enableShadows;
    this.boardGroup.add(mainSlab);

    // 2. Dark hand-glued marquetry sub-veneer bed revealed inside the tiny irregular seams
    const recessBedGeo = new THREE.PlaneGeometry(8.1, 8.1);
    this.tileGeometries.push(recessBedGeo);
    const recessBed = new THREE.Mesh(recessBedGeo, this.recessBedMat);
    recessBed.rotation.x = -Math.PI / 2;
    recessBed.position.y = 0.0475;
    recessBed.userData.isBoardTile = true;
    recessBed.receiveShadow = this.enableShadows;
    this.boardGroup.add(recessBed);

    // 3. Flush outer walnut frame border with a very tiny, organically irregular inner gap around the 8x8 checkers
    const frameRimShape = makeRoundedBoardOutline(half, cornerR);
    const innerHole = new THREE.Path();
    const edgeSamples = 32;
    // Note: ExtrudeGeometry bevels expand into holes by bevelSize (0.0032), so base 4.0175 yields a visible lip at ~4.0143
    // against outer checker edges around ~3.9935, leaving a delicate, irregular ~0.014..0.029 marquetry perimeter gap.
    const innerIrregularOffset = (sideIdx: number, t: number): number => {
      const waveA = Math.sin(t * Math.PI * 5 + sideIdx * 1.9) * 0.0028;
      const waveB = Math.cos(t * Math.PI * 13 + sideIdx * 3.1) * 0.0019;
      const stepIdx = Math.floor(t * 16);
      const localNudge = (tileHash(sideIdx * 3 + stepIdx, stepIdx, 61) - 0.5) * 0.0036;
      // Taper subtle corner easing near t=0 and t=1 so the 4 inner corners join smoothly
      const env = Math.sin(t * Math.PI);
      return 4.0175 + (waveA + waveB + localNudge) * (0.35 + 0.65 * env);
    };

    // Clockwise hole path in 2D shape coordinates: (-X,-Z) -> (-X,+Z) -> (+X,+Z) -> (+X,-Z)
    for (let s = 0; s < edgeSamples; s++) {
      const t = s / edgeSamples;
      const zCoord = -4.0175 + t * 8.035;
      const xCoord = -innerIrregularOffset(0, t);
      if (s === 0) innerHole.moveTo(xCoord, zCoord);
      else innerHole.lineTo(xCoord, zCoord);
    }
    for (let s = 0; s < edgeSamples; s++) {
      const t = s / edgeSamples;
      const xCoord = -4.0175 + t * 8.035;
      const zCoord = innerIrregularOffset(1, t);
      innerHole.lineTo(xCoord, zCoord);
    }
    for (let s = 0; s < edgeSamples; s++) {
      const t = s / edgeSamples;
      const zCoord = 4.0175 - t * 8.035;
      const xCoord = innerIrregularOffset(2, t);
      innerHole.lineTo(xCoord, zCoord);
    }
    for (let s = 0; s < edgeSamples; s++) {
      const t = s / edgeSamples;
      const xCoord = 4.0175 - t * 8.035;
      const zCoord = -innerIrregularOffset(3, t);
      innerHole.lineTo(xCoord, zCoord);
    }
    innerHole.closePath();
    frameRimShape.holes.push(innerHole);

    const frameRimBevel = 0.0032;
    const frameRimGeo = new THREE.ExtrudeGeometry(frameRimShape, {
      depth: 0.013,
      curveSegments: 4,
      steps: 1,
      bevelEnabled: true,
      bevelThickness: frameRimBevel,
      bevelSize: frameRimBevel,
      bevelSegments: 2,
    });
    frameRimGeo.rotateX(Math.PI / 2);
    applyPlanarFrameUvs(frameRimGeo);
    frameRimGeo.computeVertexNormals();
    this.tileGeometries.push(frameRimGeo);

    const frameRim = new THREE.Mesh(frameRimGeo, this.frameMat);
    frameRim.position.y = 0.0604 - frameRimBevel; // Flush top at y = 0.0604, right below y = 0.068 coordinate plaques
    frameRim.userData.isBoardSlab = true;
    frameRim.castShadow = this.enableShadows;
    frameRim.receiveShadow = this.enableShadows;
    this.boardGroup.add(frameRim);

    const hitboxGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitboxGeo = hitboxGeo;
    this.hitboxMat = hitboxMat;

    const placedVariant: number[][] = Array.from({ length: 8 }, () => Array<number>(8).fill(-1));
    const sameColorNeighborOffsets: ReadonlyArray<[number, number]> = [
      [-1, -1],
      [1, -1],
      [-2, 0],
      [0, -2],
      [-2, -2],
      [2, -2],
    ];

    const tileBevel = 0.0024;
    const tileDepth = 0.0096;

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = `${FILES[file]}${RANKS[rank]}`;
        const isLight = (file + rank) % 2 === 1;
        const x = file - 3.5;
        const z = 3.5 - rank;

        const h1 = tileHash(file, rank, 3);
        const h2 = tileHash(file, rank, 11);
        const h3 = tileHash(file, rank, 23);
        const h4 = tileHash(file, rank, 37);
        const h5 = tileHash(file, rank, 53);
        const h6 = tileHash(file, rank, 71);
        const h7 = tileHash(file, rank, 89);
        const h8 = tileHash(file, rank, 103);
        const h9 = tileHash(file, rank, 119);
        const h10 = tileHash(file, rank, 137);

        const variantList = isLight ? this.lightSquareMats : this.darkSquareMats;
        const totalVariants = variantList.length;
        const baseIdx =
          (file * 5 + rank * 7 + Math.floor(h1 * totalVariants)) % totalVariants;
        let variantIdx = baseIdx;
        for (let step = 0; step < totalVariants; step++) {
          const cand = (baseIdx + step * 5) % totalVariants;
          let collides = false;
          for (const [df, dr] of sameColorNeighborOffsets) {
            const nf = file + df;
            const nr = rank + dr;
            if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && placedVariant[nr][nf] === cand) {
              collides = true;
              break;
            }
          }
          if (!collides) {
            variantIdx = cand;
            break;
          }
        }
        placedVariant[rank][file] = variantIdx;

        // 4. Hand-cut imperfect marquetry checker geometry:
        // Each corner & edge midpoint is inset from the 0.500 cell boundary by a tiny organic margin (0.0038..0.0092),
        // producing subtly hand-planed edges and very, very tiny irregular gaps (~0.008..0.018) between neighboring checkers.
        const inset = (salt: number) => 0.0038 + tileHash(file, rank, salt) * 0.0054 + tileBevel;
        const nwX = -0.5 + inset(201);
        const nwZ = -0.5 + inset(203);
        const neX = 0.5 - inset(207);
        const neZ = -0.5 + inset(211);
        const seX = 0.5 - inset(213);
        const seZ = 0.5 - inset(217);
        const swX = -0.5 + inset(223);
        const swZ = 0.5 - inset(227);

        // Subtle hand-planed organic bow/camber along each of the 4 checker sides
        const topMidZ = (nwZ + neZ) * 0.5 + (tileHash(file, rank, 233) - 0.5) * 0.0032;
        const rightMidX = (neX + seX) * 0.5 + (tileHash(file, rank, 239) - 0.5) * 0.0032;
        const botMidZ = (seZ + swZ) * 0.5 + (tileHash(file, rank, 241) - 0.5) * 0.0032;
        const leftMidX = (swX + nwX) * 0.5 + (tileHash(file, rank, 251) - 0.5) * 0.0032;

        const checkerShape = new THREE.Shape();
        checkerShape.moveTo(nwX, nwZ);
        checkerShape.quadraticCurveTo((nwX + neX) * 0.5, topMidZ, neX, neZ);
        checkerShape.quadraticCurveTo(rightMidX, (neZ + seZ) * 0.5, seX, seZ);
        checkerShape.quadraticCurveTo((seX + swX) * 0.5, botMidZ, swX, swZ);
        checkerShape.quadraticCurveTo(leftMidX, (swZ + nwZ) * 0.5, nwX, nwZ);

        const tileGeo = new THREE.ExtrudeGeometry(checkerShape, {
          depth: tileDepth,
          curveSegments: 2,
          steps: 1,
          bevelEnabled: true,
          bevelThickness: tileBevel,
          bevelSize: tileBevel,
          bevelSegments: 2,
        });
        tileGeo.rotateX(Math.PI / 2);

        // Per-checker unique marquetry veneer cut: planar top + chamfer UVs with scale/mirror/angle/offset
        const posAttr = tileGeo.getAttribute('position') as THREE.BufferAttribute;
        const uvAttr = tileGeo.getAttribute('uv') as THREE.BufferAttribute;
        const scaleU = (0.52 + h3 * 0.44) * (h5 >= 0.5 ? -1 : 1);
        const scaleV = (0.54 + h4 * 0.44) * (h6 >= 0.5 ? -1 : 1);
        const cutAngle = (h7 - 0.5) * 0.34;
        const cosA = Math.cos(cutAngle);
        const sinA = Math.sin(cutAngle);
        const du = h1 * 0.91;
        const dv = h2 * 0.91;
        for (let vi = 0; vi < posAttr.count; vi++) {
          const vx = posAttr.getX(vi);
          const vy = posAttr.getY(vi);
          const vz = posAttr.getZ(vi);
          const cu = (vx + vy * 0.35) * scaleU;
          const cv = (vz + vy * 0.35) * scaleV;
          const ru = cu * cosA - cv * sinA + 0.5 + du;
          const rv = cu * sinA + cv * cosA + 0.5 + dv;
          uvAttr.setXY(vi, ru, rv);
        }
        uvAttr.needsUpdate = true;
        tileGeo.computeVertexNormals();

        let cr: number;
        let cg: number;
        let cb: number;
        if (isLight) {
          // Subtle per-checker aged sycamore/maple variation kept calm so bright thinking lines stand out
          const lum = 0.915 + (h2 - 0.5) * 0.125;
          const warm = (h6 - 0.5) * 0.038;
          cr = Math.min(0.99, lum + warm * 0.85);
          cg = Math.min(0.98, lum + warm * 0.42);
          cb = Math.max(0.83, lum - warm * 0.45);
        } else {
          // Hand-inlaid dark roasted walnut veneer variation from checker to checker
          const lum = 0.91 + (h2 - 0.5) * 0.18;
          const warm = (h6 - 0.5) * 0.055;
          cr = Math.min(1.02, lum + warm);
          cg = Math.min(0.99, lum + warm * 0.34);
          cb = Math.max(0.76, lum - warm * 0.58);
        }

        const posCount = posAttr.count;
        const colors = new Float32Array(posCount * 3);
        for (let vi = 0; vi < posCount; vi++) {
          colors[vi * 3] = cr;
          colors[vi * 3 + 1] = cg;
          colors[vi * 3 + 2] = cb;
        }
        tileGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.tileGeometries.push(tileGeo);

        const jitterX = (h8 - 0.5) * 0.0024;
        const jitterZ = (h9 - 0.5) * 0.0024;
        const tileTopY = BOARD_TOP_Y + (h10 - 0.5) * 0.0014;
        const microYaw = (tileHash(file, rank, 257) - 0.5) * 0.0056;

        const tile = new THREE.Mesh(tileGeo, variantList[variantIdx]);
        tile.position.set(x + jitterX, tileTopY - tileBevel, z + jitterZ);
        tile.rotation.y = (h4 >= 0.5 ? Math.PI : 0) + microYaw;
        tile.userData.isBoardTile = true;
        tile.receiveShadow = this.enableShadows;
        this.boardGroup.add(tile);

        const hit = new THREE.Mesh(hitboxGeo, hitboxMat);
        hit.rotation.x = -Math.PI / 2;
        hit.position.set(x, BOARD_TOP_Y + 0.015, z);
        hit.layers.set(1);
        hit.userData = { square };
        this.hitboxes.push(hit);
        this.boardGroup.add(hit);
      }
    }
  }

  private rebuildCoordinates(
    textColor: string,
    frameGrainHex = '#281409',
    envIntensity = 0.1,
  ): void {
    const disposedMats = new Set<THREE.Material>();
    while (this.coordGroup.children.length > 0) {
      const child = this.coordGroup.children[0] as THREE.Mesh;
      this.coordGroup.remove(child);
      child.geometry.dispose();
      const mat = child.material as THREE.Material;
      if (!disposedMats.has(mat)) {
        disposedMats.add(mat);
        mat.dispose();
      }
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const plaqueGeo = new THREE.PlaneGeometry(0.37, 0.37);
    const matByLabel = new Map<string, THREE.MeshStandardMaterial>();

    const getEmbossedMaterial = (label: string): THREE.MeshStandardMaterial => {
      const existing = matByLabel.get(label);
      if (existing) return existing;

      const maps = createEmbossedCoordinateMaps(label, textColor, frameGrainHex, maxAniso);
      // Mobile fallback: MeshStandardMaterial on Android/iOS; MeshPhysicalMaterial on PC
      const mat = this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            map: maps.map,
            bumpMap: maps.bumpMap,
            bumpScale: 0.017,
            roughnessMap: maps.roughnessMap,
            roughness: 0.68,
            metalness: 0.0,
            envMapIntensity: envIntensity * 1.15,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2,
          })
        : new THREE.MeshPhysicalMaterial({
            map: maps.map,
            bumpMap: maps.bumpMap,
            bumpScale: 0.019,
            roughnessMap: maps.roughnessMap,
            roughness: 0.66,
            metalness: 0.0,
            clearcoat: 0.06,
            clearcoatRoughness: 0.55,
            envMapIntensity: envIntensity * 1.25,
            transparent: true,
            opacity: 0.94,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2,
          });
      matByLabel.set(label, mat);
      return mat;
    };

    const placePlaque = (label: string, x: number, z: number, rotZ: number) => {
      const mat = getEmbossedMaterial(label);
      const mesh = new THREE.Mesh(plaqueGeo.clone(), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = rotZ;
      // Flush right onto the oiled walnut frame top (y = 0.0604) so the carved groove sits into the wood
      mesh.position.set(x, 0.0607, z);
      mesh.receiveShadow = this.enableShadows;
      mesh.userData = { coordLabel: label };
      this.coordGroup.add(mesh);
    };

    for (let i = 0; i < 8; i++) {
      const fileLabel = FILES[i].toUpperCase();
      const rankLabel = RANKS[i];
      const posX = i - 3.5;
      const posZ = 3.5 - i;
      placePlaque(fileLabel, posX, 4.22, 0);
      placePlaque(fileLabel, posX, -4.22, Math.PI);
      placePlaque(rankLabel, -4.22, posZ, 0);
      placePlaque(rankLabel, 4.22, posZ, Math.PI);
    }
    plaqueGeo.dispose();
  }

  private buildOverlays(): void {
    const makeRing = (inner: number, outer: number, color: number, opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 36),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = BOARD_TOP_Y + 0.022;
      mesh.visible = false;
      return mesh;
    };

    const makeSquarePlate = (color: number, opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.95, 0.95),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = BOARD_TOP_Y + 0.018;
      mesh.visible = false;
      return mesh;
    };

    this.hoverRing = makeRing(0.39, 0.45, 0xd8f0ff, 0.55);
    this.selectedRing = makeRing(0.37, 0.46, 0x9ad8ff, 0.94);
    this.checkRing = makeRing(0.34, 0.47, 0xef4444, 0.92);
    this.lastFromPlate = makeSquarePlate(0x93d5ff, 0.24);
    this.lastToPlate = makeSquarePlate(0xa8e0ff, 0.34);

    this.overlayGroup.add(
      this.lastFromPlate,
      this.lastToPlate,
      this.hoverRing,
      this.selectedRing,
      this.checkRing,
      this.legalMarkerGroup,
      this.speechHighlightGroup,
    );
  }

  public setSkin(skinId: BoardSkinId): void {
    if (this.webglUnavailable || this.currentSkinId === skinId) return;
    this.currentSkinId = skinId;
    this.requestRender();
  }

  public setLightingMood(moodId: LightingMood): void {
    if (this.webglUnavailable || this.currentMood === moodId) return;
    this.currentMood = moodId;
    this.requestRender();
  }

  public getShadowsEnabled(): boolean {
    return this.enableShadows;
  }

  public setShadowsEnabled(enabled: boolean): void {
    if (this.webglUnavailable || this.disposed || this.enableShadows === enabled) return;
    this.enableShadows = enabled;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.needsUpdate = true;
    this.keyLight.castShadow = enabled;
    this.pieceContactShadowMat.opacity = enabled ? 0.36 : 0.54;

    for (const child of this.boardGroup.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) continue;
      if (mesh.userData.isBoardSlab) {
        mesh.castShadow = enabled;
        mesh.receiveShadow = enabled;
      } else if (mesh.userData.isBoardTile) {
        mesh.receiveShadow = enabled;
      }
    }

    const updatePieceGroupShadows = (parent: THREE.Group) => {
      for (const groupObj of parent.children) {
        const pieceGroup = groupObj as THREE.Group;
        for (const sub of pieceGroup.children) {
          const mesh = sub as THREE.Mesh;
          if (!mesh.isMesh || mesh.material === this.pieceContactShadowMat) continue;
          const eligible = Boolean(mesh.userData.shadowEligible);
          mesh.castShadow = eligible && enabled;
          mesh.receiveShadow = eligible && enabled;
        }
      }
    };
    updatePieceGroupShadows(this.pieceGroup);
    updatePieceGroupShadows(this.capturedGroup);
    updatePieceGroupShadows(this.captureSweepGroup);

    const markSetNeedsUpdate = (set: PieceMaterialSet) => {
      set.body.needsUpdate = true;
      set.collar.needsUpdate = true;
      set.groove.needsUpdate = true;
    };
    this.frameMat.needsUpdate = true;
    this.lightSquareMats.forEach((m) => {
      m.needsUpdate = true;
    });
    this.darkSquareMats.forEach((m) => {
      m.needsUpdate = true;
    });
    markSetNeedsUpdate(this.whitePieceMats);
    markSetNeedsUpdate(this.blackPieceMats);
    markSetNeedsUpdate(this.whiteDangerMats);
    markSetNeedsUpdate(this.whiteAttackerMats);
    markSetNeedsUpdate(this.blackDangerMats);
    markSetNeedsUpdate(this.blackAttackerMats);

    this.requestRender();
  }

  public getPowerSaveMode(): boolean {
    return this.powerSaveMode;
  }

  public setPowerSaveMode(enabled: boolean): void {
    if (this.webglUnavailable || this.disposed || this.powerSaveMode === enabled) return;
    this.powerSaveMode = enabled;

    const dpr =
      enabled || this.isSoftwareGl
        ? 1
        : this.isMobileDevice
          ? Math.min(window.devicePixelRatio || 1, 1.5)
          : Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    const w = Math.max(this.container.clientWidth || window.innerWidth, 1);
    const h = Math.max(this.container.clientHeight || window.innerHeight, 1);
    this.renderer.setSize(w, h);

    this.controls.enableDamping = !this.isSoftwareGl && !enabled;

    if (enabled) {
      // Snap any in-flight non-essential piece, camera, arrow, search-tree, and highlight animations
      if (this.animations.length > 0) {
        for (const anim of this.animations) {
          anim.obj.position.copy(anim.endPos);
          anim.obj.quaternion.copy(anim.origQuat);
        }
        this.animations = [];
      }
      this.finalizeCaptureSweeps();

      if (this.camGoalPos && this.camGoalTarget) {
        this.camera.position.copy(this.camGoalPos);
        this.controls.target.copy(this.camGoalTarget);
        this.camGoalPos = null;
        this.camGoalTarget = null;
        this.controls.update();
      }

      if (this.arrowFadeActive) {
        this.arrowFadeActive = false;
        const doneCb = this.arrowFadeCompleteCb;
        this.arrowFadeCompleteCb = null;
        this.syncArrows([]);
        doneCb?.();
      }

      if (this.treeSweepPhase === 'developing' && this.treeSweepMesh) {
        this.treeVisibleEdgesFloat = this.treeSweepTotalEdges;
        this.treeSweepMesh.geometry.setDrawRange(0, this.treeSweepTotalEdges * 6);
        (this.treeSweepMesh.material as THREE.LineBasicMaterial).opacity = 0.96;
        if (this.treeFinalized) {
          this.treeSweepPhase = 'holding';
          const devCb = this.treeDevelopedCb;
          this.treeDevelopedCb = null;
          devCb?.();
          if (this.treeHoldDurationSec > 0) {
            this.treeHoldTimer = window.setTimeout(() => {
              this.treeHoldTimer = 0;
              if (this.disposed || this.treeSweepPhase !== 'holding') return;
              const doneCb = this.treeSweepCompleteCb;
              this.stopSearchTreeThinLines();
              doneCb?.();
            }, Math.max(50, Math.round(this.treeHoldDurationSec * 1000)));
          }
        }
      } else if (this.treeSweepPhase === 'fading' && this.treeSweepMesh) {
        const doneCb = this.treeSweepCompleteCb;
        this.stopSearchTreeThinLines();
        doneCb?.();
      }

      for (const child of this.speechHighlightGroup.children) {
        if (child.userData.isSpeechRing) {
          child.scale.set(1, 1, 1);
        }
      }
      for (const item of this.activeSpeechHighlights) {
        const entry = this.pieceMap.get(item.square);
        if (entry) {
          entry.group.position.y = BOARD_TOP_Y;
        }
      }
    } else if (this.powerSaveTimerId) {
      window.clearTimeout(this.powerSaveTimerId);
      this.powerSaveTimerId = 0;
      this.renderBusy = false;
    }

    this.requestRender();
  }

  public setAngelOverlayVisible(visible: boolean): void {
    if (this.webglUnavailable || this.disposed || this.angelOverlayVisible === visible) return;
    this.angelOverlayVisible = visible;
    this.userAdjustedCamera = false;
    const w = Math.max(this.container.clientWidth || window.innerWidth, 1);
    const h = Math.max(this.container.clientHeight || window.innerHeight, 1);
    const pose = this.frameCameraPoseForViewport(this.currentPreset, w, h);
    this.camGoalPos = null;
    this.camGoalTarget = null;
    this.camera.position.copy(pose.pos);
    this.controls.target.copy(pose.target);
    this.controls.update();
    this.emitUpperRightVoid(w, h, pose.pos, pose.target);
    this.requestRender();
  }

  public setCameraPreset(preset: CameraPreset, immediate = false): void {
    if (this.webglUnavailable) return;
    this.currentPreset = preset;
    this.userAdjustedCamera = false;
    const w = Math.max(this.container.clientWidth || window.innerWidth, 1);
    const h = Math.max(this.container.clientHeight || window.innerHeight, 1);
    const pose = this.frameCameraPoseForViewport(preset, w, h);
    if (immediate || this.powerSaveMode) {
      this.camGoalPos = null;
      this.camGoalTarget = null;
      this.camera.position.copy(pose.pos);
      this.controls.target.copy(pose.target);
      this.controls.update();
    } else {
      this.camGoalPos = pose.pos;
      this.camGoalTarget = pose.target;
    }
    this.emitUpperRightVoid(w, h, pose.pos, pose.target);
    this.requestRender();
  }

  public syncState(
    state: SceneVisualState,
    animateFromMove?: { from: string; to: string } | null,
  ): void {
    if (this.webglUnavailable) return;
    this.latestSyncedState = state;
    if (this.calcPreviewActive) {
      this.calcPreviewRestoreState = state;
      return;
    }
    this.applyVisualState(state, animateFromMove || null);
  }

  private applyVisualState(
    state: SceneVisualState,
    animateFromMove: { from: string; to: string } | null,
  ): void {
    this.coordGroup.visible = state.showCoordinates;
    this.syncPieces(state.fen, animateFromMove);
    this.syncOverlays(state);
    this.syncSpeechHighlights(state.speechHighlights || []);

    const arrows: SuggestionArrow[] = [];
    if (state.suggestionArrows && state.suggestionArrows.length > 0) {
      arrows.push(...state.suggestionArrows);
    } else if (state.bestMoveArrow) {
      arrows.push({
        from: state.bestMoveArrow.from,
        to: state.bestMoveArrow.to,
        kind: 'secondary',
      });
    }
    this.syncArrows(arrows);
    this.requestRender();
  }

  /**
   * Animates up to 3 candidate branches Chess Angel tested at an unhurried, step-by-step pace:
   * - Marks each branch with its own distinct flat 2D arrow color (Branch 1 Gold, Branch 2 Cyan, Branch 3 Rose).
   * - After Branch 1 and after Branch 2, pauses and waits for the player's click confirmation
   *   ("Seen & Understood") before playing the next branch.
   * - After the final branch completes, holds all colored arrows for 1.2s on finalFen, then fades them away.
   */
  public playCalculationPreview(
    report: BotSearchReport,
    finalFen: string,
    callbacks?: {
      onBranchChange?: (
        branchIndex: number,
        totalBranches: number,
        pvSan: string[],
        waitingForConfirm?: boolean,
      ) => void;
      onWaitForBranchConfirm?: (
        completedBranchIndex: number,
        totalBranches: number,
        pvSan: string[],
      ) => void;
      onComplete?: () => void;
    },
  ): void {
    if (this.webglUnavailable) return;
    this.stopCalculationPreview(false);
    this.stopSearchTreeThinLines();

    let effectiveRootFen = report.rootFen || finalFen;
    let branches = report.triedLines
      .map((l) => {
        const pvUci =
          l.pvUci && l.pvUci.length > 0
            ? l.pvUci
            : l.bestMoveUci && l.bestMoveUci.length >= 4
              ? [l.bestMoveUci]
              : [];
        return { ...l, pvUci };
      })
      .filter((l) => {
        if (l.pvUci.length === 0) return false;
        const uci = l.pvUci[0];
        if (!uci || uci.length < 4) return false;
        try {
          const probe = new Chess(effectiveRootFen);
          const mv = probe.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: (uci.slice(4, 5) || undefined) as PieceType | undefined,
          });
          return Boolean(mv);
        } catch {
          return false;
        }
      })
      .slice(0, 3);

    // Fallback: if rootFen had no matching legal branches, synthesize up to 3 legal lines from finalFen
    if (branches.length === 0) {
      try {
        const fallbackChess = new Chess(finalFen);
        const legalMoves = fallbackChess.moves({ verbose: true });
        if (legalMoves.length > 0) {
          effectiveRootFen = finalFen;
          const ordered = [...legalMoves].sort(
            (a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)),
          );
          branches = ordered.slice(0, 3).map((mv, idx) => {
            const sim = new Chess(finalFen);
            const uciList: string[] = [];
            const sanList: string[] = [];
            const first = sim.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
            if (first) {
              uciList.push(`${first.from}${first.to}${first.promotion || ''}`);
              sanList.push(first.san);
              const replies = sim.moves({ verbose: true });
              if (replies.length > 0) {
                const replyPick = replies.find((r) => r.captured) || replies[0];
                const second = sim.move({
                  from: replyPick.from,
                  to: replyPick.to,
                  promotion: replyPick.promotion,
                });
                if (second) {
                  uciList.push(`${second.from}${second.to}${second.promotion || ''}`);
                  sanList.push(second.san);
                }
              }
            }
            return {
              multipv: idx + 1,
              scoreCp: 0,
              mateIn: null,
              pvSan: sanList,
              pvUci: uciList,
              bestMoveUci: uciList[0] || `${mv.from}${mv.to}${mv.promotion || ''}`,
            };
          });
        }
      } catch {
        // Ignore invalid fallback FEN
      }
    }

    if (branches.length === 0) {
      callbacks?.onComplete?.();
      return;
    }

    const trialKinds: Array<'trial-1' | 'trial-2' | 'trial-3'> = [
      'trial-1',
      'trial-2',
      'trial-3',
    ];

    this.calcPreviewActive = true;
    this.calcWaitingForClick = false;
    this.calcNextBranchFn = null;
    this.arrowFadeActive = false;
    this.arrowFadeCompleteCb = null;
    this.calcPreviewRestoreState = this.latestSyncedState
      ? { ...this.latestSyncedState, fen: finalFen }
      : null;

    // Clear selection & speech markers while demonstrating candidate branches
    this.selectedRing.visible = false;
    while (this.legalMarkerGroup.children.length > 0) {
      this.legalMarkerGroup.remove(this.legalMarkerGroup.children[0]);
    }
    this.syncSpeechHighlights([]);

    const completedTrialArrows: SuggestionArrow[] = [];

    const finishAllBranches = () => {
      if (this.disposed || !this.calcPreviewActive) return;
      const allTrialArrowsSnapshot = [...completedTrialArrows];

      this.syncPieces(effectiveRootFen, null);
      const chosenHint =
        effectiveRootFen !== finalFen && report.bestMoveUci && report.bestMoveUci.length >= 4
          ? { from: report.bestMoveUci.slice(0, 2), to: report.bestMoveUci.slice(2, 4) }
          : null;

      this.syncPieces(finalFen, chosenHint, 0.78);
      const restore = this.calcPreviewRestoreState || this.latestSyncedState;
      if (restore) {
        this.syncOverlays({ ...restore, fen: finalFen });
      }
      this.syncArrows(allTrialArrowsSnapshot);
      callbacks?.onBranchChange?.(0, branches.length, ['All branches shown'], false);
      this.requestRender();

      const fadeStartTimer = window.setTimeout(() => {
        if (this.disposed || !this.calcPreviewActive) return;
        this.calcPreviewTimers = [];
        this.arrowFadeActive = true;
        this.arrowFadeElapsed = 0;
        this.arrowFadeDuration = 1.05;
        this.arrowFadeCompleteCb = () => {
          this.calcPreviewActive = false;
          this.calcWaitingForClick = false;
          this.calcNextBranchFn = null;
          const rest = this.calcPreviewRestoreState || this.latestSyncedState;
          if (rest) {
            this.applyVisualState({ ...rest, fen: finalFen }, null);
          } else {
            this.syncArrows([]);
            this.requestRender();
          }
          callbacks?.onComplete?.();
        };
        this.requestRender();
      }, 2200);
      this.calcPreviewTimers.push(fadeStartTimer);
    };

    const runBranch = (branchIdx: number) => {
      if (this.disposed || !this.calcPreviewActive) return;
      for (const id of this.calcPreviewTimers) {
        window.clearTimeout(id);
      }
      this.calcPreviewTimers = [];
      this.calcWaitingForClick = false;
      this.calcNextBranchFn = null;

      const line = branches[branchIdx];
      if (!line) {
        finishAllBranches();
        return;
      }

      const trialKind = trialKinds[branchIdx] || 'trial-1';
      const plies = line.pvUci.slice(0, 4);
      const snapshotBeforeBranch = [...completedTrialArrows];

      // Derive SAN labels if pvSan is missing or shorter than pvUci
      const sanCheck = new Chess(effectiveRootFen);
      const computedSan: string[] = [];
      for (const u of plies) {
        if (u.length < 4) break;
        try {
          const mv = sanCheck.move({
            from: u.slice(0, 2),
            to: u.slice(2, 4),
            promotion: (u.slice(4, 5) || undefined) as PieceType | undefined,
          });
          if (!mv) break;
          computedSan.push(mv.san);
        } catch {
          break;
        }
      }
      const pvSanSlice =
        line.pvSan && line.pvSan.length > 0 ? line.pvSan.slice(0, 4) : computedSan;

      // Reset pieces to effectiveRootFen at the start of this branch while keeping prior branch arrows visible
      this.syncPieces(effectiveRootFen, null);
      this.lastFromPlate.visible = false;
      this.lastToPlate.visible = false;
      this.syncArrows(snapshotBeforeBranch);
      callbacks?.onBranchChange?.(branchIdx + 1, branches.length, pvSanSlice, false);
      this.requestRender();

      let delayMs = 520;
      const sim = new Chess(effectiveRootFen);

      for (let p = 0; p < plies.length; p++) {
        const uci = plies[p];
        if (uci.length < 4) break;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = (uci.slice(4, 5) || undefined) as PieceType | undefined;
        let stepFen = '';
        try {
          const mv = sim.move({ from, to, promotion });
          if (!mv) break;
          stepFen = sim.fen();
        } catch {
          break;
        }

        if (p === 0) {
          completedTrialArrows.push({
            from,
            to,
            kind: trialKind,
            opacityScale: 1,
          });
        }

        const arrowsForStep: SuggestionArrow[] =
          p === 0
            ? [...completedTrialArrows]
            : [
                ...completedTrialArrows,
                {
                  from,
                  to,
                  kind: trialKind,
                  opacityScale: 0.72,
                },
              ];

        const plyTimer = window.setTimeout(() => {
          if (this.disposed || !this.calcPreviewActive) return;
          // Slow, deliberate 0.96s piece glide per ply
          this.syncPieces(stepFen, { from, to }, 0.96);
          squareToWorld(from, _tmpVec);
          this.lastFromPlate.position.set(_tmpVec.x, BOARD_TOP_Y + 0.018, _tmpVec.z);
          this.lastFromPlate.visible = true;
          squareToWorld(to, _tmpVec);
          this.lastToPlate.position.set(_tmpVec.x, BOARD_TOP_Y + 0.018, _tmpVec.z);
          this.lastToPlate.visible = true;
          this.syncArrows(arrowsForStep);
          this.requestRender();
        }, delayMs);
        this.calcPreviewTimers.push(plyTimer);

        // Generous 1.65s between plies so every step of the branch is easy to absorb
        delayMs += 1650;
      }

      // Pause after the branch's final move lands:
      // - For Branch 1 and Branch 2 (when another branch follows), or when there is only 1 branch total,
      //   pause & wait for player's click confirmation so the branch never disappears unseen!
      // - For the final branch of a multi-branch set, pause 1.6s so the final board position is clear, then settle & fade.
      const endOfBranchTimer = window.setTimeout(() => {
        if (this.disposed || !this.calcPreviewActive) return;
        if (branchIdx < branches.length - 1) {
          this.calcWaitingForClick = true;
          this.calcNextBranchFn = () => runBranch(branchIdx + 1);
          callbacks?.onBranchChange?.(branchIdx + 1, branches.length, pvSanSlice, true);
          callbacks?.onWaitForBranchConfirm?.(branchIdx + 1, branches.length, pvSanSlice);
          this.requestRender();
        } else if (branches.length === 1) {
          this.calcWaitingForClick = true;
          this.calcNextBranchFn = () => finishAllBranches();
          callbacks?.onBranchChange?.(1, 1, pvSanSlice, true);
          this.requestRender();
        } else {
          const finalSettleTimer = window.setTimeout(() => {
            finishAllBranches();
          }, 1600);
          this.calcPreviewTimers.push(finalSettleTimer);
        }
      }, delayMs + 250);
      this.calcPreviewTimers.push(endOfBranchTimer);
    };

    runBranch(0);
  }

  /**
   * Advances to the next candidate branch when the player clicks to confirm
   * they have seen and understood the current branch.
   */
  public confirmNextCalculationBranch(): boolean {
    if (!this.calcPreviewActive || !this.calcWaitingForClick || !this.calcNextBranchFn) {
      return false;
    }
    const next = this.calcNextBranchFn;
    this.calcWaitingForClick = false;
    this.calcNextBranchFn = null;
    next();
    return true;
  }

  public stopCalculationPreview(restoreBoard = true): void {
    if (this.calcPreviewTimers.length > 0) {
      for (const id of this.calcPreviewTimers) {
        window.clearTimeout(id);
      }
      this.calcPreviewTimers = [];
    }
    const wasActive = this.calcPreviewActive || this.arrowFadeActive;
    this.calcPreviewActive = false;
    this.calcWaitingForClick = false;
    this.calcNextBranchFn = null;
    this.arrowFadeActive = false;
    this.arrowFadeCompleteCb = null;

    if (wasActive && restoreBoard && !this.disposed && !this.webglUnavailable) {
      const restore = this.calcPreviewRestoreState || this.latestSyncedState;
      if (restore) {
        this.applyVisualState(restore, null);
      }
    }
  }

  private populateSearchTreeMesh(edges: SearchTreeEdge[]): number {
    const valid = edges.filter((e) => e.from.length >= 2 && e.to.length >= 2 && e.from !== e.to);
    if (valid.length === 0) return 0;

    // Order stably by ply (0 -> 1 -> 2 -> 3) so the tree develops outward from root moves through deeper plies
    const ordered = valid
      .map((e, idx) => ({ e, idx }))
      .sort((a, b) => (a.e.ply !== b.e.ply ? a.e.ply - b.e.ply : a.idx - b.idx))
      .map((x) => x.e);

    const vertsPerEdge = 6;
    const positions = new Float32Array(ordered.length * vertsPerEdge * 3);
    const colors = new Float32Array(ordered.length * vertsPerEdge * 3);

    const startVec = new THREE.Vector3();
    const endVec = new THREE.Vector3();
    const c = new THREE.Color();

    let writtenEdges = 0;
    for (let i = 0; i < ordered.length; i++) {
      const edge = ordered[i];
      squareToWorld(edge.from, startVec);
      squareToWorld(edge.to, endVec);
      const dx = endVec.x - startVec.x;
      const dz = endVec.z - startVec.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.2) continue;

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const perpX = -dirZ;
      const perpZ = dirX;

      const lat = edge.chosen ? 0 : ((i % 7) - 3) * 0.03;
      const y = BOARD_TOP_Y + 0.028 + edge.ply * 0.004 + (edge.chosen ? 0.01 : 0);

      const sx = startVec.x + dirX * 0.12 + perpX * lat;
      const sz = startVec.z + dirZ * 0.12 + perpZ * lat;
      const ex = endVec.x - dirX * 0.1 + perpX * lat;
      const ez = endVec.z - dirZ * 0.1 + perpZ * lat;

      const barbBack = 0.105;
      const barbWing = 0.058;
      const b1x = ex - dirX * barbBack + perpX * barbWing;
      const b1z = ez - dirZ * barbBack + perpZ * barbWing;
      const b2x = ex - dirX * barbBack - perpX * barbWing;
      const b2z = ez - dirZ * barbBack - perpZ * barbWing;

      if (edge.chosen) {
        c.setHex(0xfff5a8);
      } else if (edge.ply === 0) {
        c.setHex(0xffcf5c);
      } else if (edge.ply === 1) {
        c.setHex(0x4cc9ff);
      } else if (edge.ply === 2) {
        c.setHex(0xb79cff);
      } else {
        c.setHex(0xff7a90);
      }

      const base = writtenEdges * vertsPerEdge * 3;
      positions[base + 0] = sx;
      positions[base + 1] = y;
      positions[base + 2] = sz;
      positions[base + 3] = ex;
      positions[base + 4] = y;
      positions[base + 5] = ez;

      positions[base + 6] = ex;
      positions[base + 7] = y;
      positions[base + 8] = ez;
      positions[base + 9] = b1x;
      positions[base + 10] = y;
      positions[base + 11] = b1z;

      positions[base + 12] = ex;
      positions[base + 13] = y;
      positions[base + 14] = ez;
      positions[base + 15] = b2x;
      positions[base + 16] = y;
      positions[base + 17] = b2z;

      for (let v = 0; v < vertsPerEdge; v++) {
        const cb = base + v * 3;
        const boost = v === 0 ? 0.84 : 1.0;
        colors[cb + 0] = c.r * boost;
        colors[cb + 1] = c.g * boost;
        colors[cb + 2] = c.b * boost;
      }

      writtenEdges++;
    }

    if (writtenEdges === 0) return 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(positions.subarray(0, writtenEdges * vertsPerEdge * 3), 3),
    );
    geo.setAttribute(
      'color',
      new THREE.BufferAttribute(colors.subarray(0, writtenEdges * vertsPerEdge * 3), 3),
    );

    if (this.treeSweepMesh) {
      const oldGeo = this.treeSweepMesh.geometry;
      this.treeSweepMesh.geometry = geo;
      oldGeo.dispose();
      const mat = this.treeSweepMesh.material as THREE.LineBasicMaterial;
      mat.opacity = 0.96;
    } else {
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.LineSegments(geo, mat);
      mesh.renderOrder = 7;
      mesh.frustumCulled = false;
      this.treeLineGroup.add(mesh);
      this.treeSweepMesh = mesh;
    }

    this.treeSweepTotalEdges = writtenEdges;
    return writtenEdges;
  }

  /**
   * Streams live search-tree growth onto the 3D board while the engine is still computing.
   */
  public updateDevelopingSearchTree(edges: SearchTreeEdge[]): void {
    if (this.webglUnavailable || this.disposed) return;
    if (this.treeHoldTimer) {
      window.clearTimeout(this.treeHoldTimer);
      this.treeHoldTimer = 0;
    }
    const count = this.populateSearchTreeMesh(edges);
    if (count === 0 || !this.treeSweepMesh) return;

    if (this.powerSaveMode) {
      this.treeVisibleEdgesFloat = count;
      this.treeFinalized = false;
      this.treeSweepPhase = 'holding';
      this.treeSweepMesh.geometry.setDrawRange(0, count * 6);
      (this.treeSweepMesh.material as THREE.LineBasicMaterial).opacity = 0.96;
      this.requestRender();
      return;
    }

    if (this.treeSweepPhase !== 'developing') {
      this.treeVisibleEdgesFloat = Math.min(3, count);
      this.treeSweepPhase = 'developing';
    }
    this.treeFinalized = false;
    this.treeDevelopRateEdgesPerSec = Math.max(95, count / 1.35);

    const vis = Math.min(count, Math.max(1, Math.ceil(this.treeVisibleEdgesFloat)));
    this.treeSweepMesh.geometry.setDrawRange(0, vis * 6);
    this.requestRender();
  }

  /**
   * Completes the live search-tree development to 100% of branches and keeps the full tree
   * visible on the screen until the player clicks (`holdSec <= 0`, the default) or for `holdSec` if positive.
   */
  public presentDevelopedSearchTree(
    edges: SearchTreeEdge[],
    opts?: {
      minDevelopSec?: number;
      holdSec?: number;
      fadeSec?: number;
      onDeveloped?: () => void;
      onComplete?: () => void;
    },
  ): void {
    if (this.webglUnavailable || this.disposed) {
      opts?.onComplete?.();
      return;
    }
    if (this.treeHoldTimer) {
      window.clearTimeout(this.treeHoldTimer);
      this.treeHoldTimer = 0;
    }

    const wasDeveloping = this.treeSweepPhase === 'developing';
    const prevShown = wasDeveloping ? this.treeVisibleEdgesFloat : 0;

    const count = this.populateSearchTreeMesh(edges);
    if (count === 0 || !this.treeSweepMesh) {
      this.stopSearchTreeThinLines();
      opts?.onComplete?.();
      return;
    }

    if (this.powerSaveMode) {
      this.treeVisibleEdgesFloat = count;
      this.treeHoldDurationSec = opts?.holdSec ?? 0;
      this.treeFadeDurationSec = 0;
      this.treeFadeElapsed = 0;
      this.treeFinalized = true;
      this.treeSweepPhase = 'holding';
      this.treeDevelopedCb = null;
      this.treeSweepCompleteCb = opts?.onComplete ?? null;
      this.treeSweepMesh.geometry.setDrawRange(0, count * 6);
      (this.treeSweepMesh.material as THREE.LineBasicMaterial).opacity = 0.96;
      this.requestRender();
      opts?.onDeveloped?.();

      if (this.treeHoldDurationSec > 0) {
        this.treeHoldTimer = window.setTimeout(() => {
          this.treeHoldTimer = 0;
          if (this.disposed || this.treeSweepPhase !== 'holding') return;
          const doneCb = this.treeSweepCompleteCb;
          this.stopSearchTreeThinLines();
          doneCb?.();
        }, Math.max(50, Math.round(this.treeHoldDurationSec * 1000)));
      }
      return;
    }

    const minDevelopSec = opts?.minDevelopSec ?? 1.35;
    const alreadyShown = wasDeveloping ? Math.min(prevShown, count * 0.78) : 0;
    this.treeVisibleEdgesFloat = alreadyShown;

    const remainingEdges = Math.max(1, count - alreadyShown);
    const remainingSec =
      alreadyShown > 0
        ? Math.max(0.6, minDevelopSec * (remainingEdges / count))
        : minDevelopSec;

    this.treeDevelopRateEdgesPerSec = remainingEdges / remainingSec;
    // Default holdSec = 0 means keep on screen indefinitely until the player clicks on the screen
    this.treeHoldDurationSec = opts?.holdSec ?? 0;
    this.treeFadeDurationSec = opts?.fadeSec ?? 0.3;
    this.treeFadeElapsed = 0;
    this.treeFinalized = true;
    this.treeSweepPhase = 'developing';
    this.treeDevelopedCb = opts?.onDeveloped ?? null;
    this.treeSweepCompleteCb = opts?.onComplete ?? null;

    const vis = Math.min(count, Math.max(1, Math.ceil(this.treeVisibleEdgesFloat)));
    this.treeSweepMesh.geometry.setDrawRange(0, vis * 6);
    this.requestRender();
  }

  /**
   * Manual search-tree trigger (develops smoothly and stays on screen until the player clicks).
   */
  public playSearchTreeThinLines(
    edges: SearchTreeEdge[],
    onComplete?: () => void,
    onDeveloped?: () => void,
  ): void {
    if (this.webglUnavailable) return;
    this.stopSearchTreeThinLines();
    this.presentDevelopedSearchTree(edges, {
      minDevelopSec: 1.25,
      holdSec: 0,
      fadeSec: 0.3,
      onDeveloped,
      onComplete,
    });
  }

  /**
   * Updates the displayed search-tree lines, opacity, and colored evaluation arrows
   * while the player calmly browses simulations or toggles "Only 3 Best Evaluations".
   */
  public setSearchTreeBrowserDisplay(opts: {
    edges: SearchTreeEdge[];
    treeOpacity?: number;
    overlayArrows?: SuggestionArrow[];
  }): void {
    if (this.webglUnavailable || this.disposed) return;
    if (this.treeHoldTimer) {
      window.clearTimeout(this.treeHoldTimer);
      this.treeHoldTimer = 0;
    }
    const count = this.populateSearchTreeMesh(opts.edges);
    if (count > 0 && this.treeSweepMesh) {
      this.treeVisibleEdgesFloat = count;
      this.treeFinalized = true;
      this.treeSweepPhase = 'holding';
      this.treeSweepMesh.geometry.setDrawRange(0, count * 6);
      const mat = this.treeSweepMesh.material as THREE.LineBasicMaterial;
      mat.opacity = opts.treeOpacity ?? 0.96;
    }
    this.syncArrows(opts.overlayArrows ?? []);
    this.requestRender();
  }

  /**
   * Dismisses the displayed full search tree when the player chooses to continue.
   */
  public confirmSearchTreeContinue(): boolean {
    if (this.treeSweepPhase === 'idle') return false;
    const doneCb = this.treeSweepCompleteCb;
    this.stopSearchTreeThinLines();
    doneCb?.();
    return true;
  }

  public stopSearchTreeThinLines(): void {
    if (this.treeHoldTimer) {
      window.clearTimeout(this.treeHoldTimer);
      this.treeHoldTimer = 0;
    }
    const wasActive = this.treeSweepPhase !== 'idle' || Boolean(this.treeSweepMesh);
    this.treeSweepPhase = 'idle';
    this.treeFinalized = false;
    this.treeVisibleEdgesFloat = 0;
    this.treeSweepTotalEdges = 0;
    this.treeDevelopedCb = null;
    this.treeSweepCompleteCb = null;
    if (this.treeSweepMesh) {
      this.treeLineGroup.remove(this.treeSweepMesh);
      this.treeSweepMesh.geometry.dispose();
      (this.treeSweepMesh.material as THREE.Material).dispose();
      this.treeSweepMesh = null;
    }
    while (this.treeLineGroup.children.length > 0) {
      const child = this.treeLineGroup.children[0] as THREE.LineSegments;
      this.treeLineGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    if (wasActive && !this.calcPreviewActive && this.latestSyncedState) {
      const rest = this.latestSyncedState;
      const arrows: SuggestionArrow[] = [];
      if (rest.suggestionArrows && rest.suggestionArrows.length > 0) {
        arrows.push(...rest.suggestionArrows);
      } else if (rest.bestMoveArrow) {
        arrows.push({
          from: rest.bestMoveArrow.from,
          to: rest.bestMoveArrow.to,
          kind: 'secondary',
        });
      }
      this.syncArrows(arrows);
    }
    this.requestRender();
  }

  /**
   * Launches the 3D small white fluffy puppy jumping out from the left side of Chess Angel's modal,
   * scampering wildly across the chessboard while barking excitedly and tipping over every piece
   * it touches, then dashing completely off the left edge of the screen before pieces spring back up.
   */
  public triggerWildDogRun(
    modalRect?: { left: number; top: number; width: number; height: number } | null,
    soundEnabled = true,
  ): void {
    if (this.webglUnavailable || !this.wildDog) return;
    this.stopWildDogRun(true);
    this.wildDogSoundMuted = !soundEnabled;

    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    const raycastClientToBoardPlane = (
      clientX: number,
      clientY: number,
      fallback: THREE.Vector3,
    ): THREE.Vector3 => {
      _rayMouse.x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      _rayMouse.y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      _dogRaycaster.setFromCamera(_rayMouse, this.camera);
      const hit = new THREE.Vector3();
      if (_dogRaycaster.ray.intersectPlane(_dogPlane, hit) && hit.length() < 34) {
        return hit;
      }
      return fallback.clone();
    };

    // 1. Start right at the lower-left edge of Chess Angel's modal so the puppy leaps out of her modal
    const startClientX = modalRect
      ? modalRect.left + Math.min(28, modalRect.width * 0.1)
      : canvasRect.left + canvasRect.width * 0.78;
    const startClientY = modalRect
      ? modalRect.top + modalRect.height * 0.76
      : canvasRect.top + canvasRect.height * 0.44;
    const startWorld = raycastClientToBoardPlane(
      startClientX,
      startClientY,
      new THREE.Vector3(6.8, BOARD_TOP_Y, -0.6),
    );

    // 2. Exit well past the left edge of the viewport until completely out of sight
    const exitClientX = canvasRect.left - Math.max(140, canvasRect.width * 0.14);
    const exitClientY = canvasRect.top + canvasRect.height * 0.56;
    const exitWorld = raycastClientToBoardPlane(
      exitClientX,
      exitClientY,
      new THREE.Vector3(-9.5, BOARD_TOP_Y, 0.8),
    );

    // 3. Sample live pieces across right / center / left screen bands so the puppy reliably
    //    barrels through real chess pieces regardless of camera orientation
    const piecePoints: Array<{ pos: THREE.Vector3; ndcX: number }> = [];
    for (const entry of this.pieceMap.values()) {
      _dogProj.copy(entry.group.position).project(this.camera);
      piecePoints.push({ pos: entry.group.position.clone(), ndcX: _dogProj.x });
    }
    piecePoints.sort((a, b) => b.ndcX - a.ndcX); // right-to-left on screen

    const pickZonePoint = (
      fromFrac: number,
      toFrac: number,
      fallbackX: number,
      fallbackZ: number,
    ): THREE.Vector3 => {
      if (piecePoints.length >= 3) {
        const lo = Math.floor(piecePoints.length * fromFrac);
        const hi = Math.max(lo + 1, Math.floor(piecePoints.length * toFrac));
        const slice = piecePoints.slice(lo, hi);
        if (slice.length > 0) {
          const picked = slice[Math.floor(Math.random() * slice.length)];
          return new THREE.Vector3(
            THREE.MathUtils.clamp(picked.pos.x, -3.5, 3.5),
            BOARD_TOP_Y,
            THREE.MathUtils.clamp(picked.pos.z, -3.5, 3.5),
          );
        }
      }
      return new THREE.Vector3(fallbackX, BOARD_TOP_Y, fallbackZ);
    };

    const wpRight = pickZonePoint(0.05, 0.36, 2.4, -1.1);
    const wpCenter = pickZonePoint(0.36, 0.68, 0.1, 1.35);
    const wpLeft = pickZonePoint(0.68, 0.96, -2.5, -0.75);

    // Ensure lively zig-zag across the board so the path feels wild and hits plenty of pieces
    if (Math.abs(wpCenter.z - wpRight.z) < 0.7) {
      wpCenter.z = THREE.MathUtils.clamp(wpCenter.z + (wpCenter.z >= 0 ? -1.45 : 1.45), -3.2, 3.2);
    }
    if (Math.abs(wpLeft.z - wpCenter.z) < 0.7) {
      wpLeft.z = THREE.MathUtils.clamp(wpLeft.z + (wpCenter.z >= 0 ? -1.35 : 1.35), -3.2, 3.2);
    }

    const leftRim = new THREE.Vector3().lerpVectors(wpLeft, exitWorld, 0.42);
    leftRim.y = BOARD_TOP_Y;

    this.wildDogCurve = new THREE.CatmullRomCurve3(
      [startWorld, wpRight, wpCenter, wpLeft, leftRim, exitWorld],
      false,
      'centripetal',
      0.5,
    );

    this.wildDogPhase = 'running';
    this.wildDogElapsed = 0;
    this.wildDogDuration = 3.55;
    this.wildDogPhaseTimer = 0;
    this.wildDogNextBarkAt = 0.04;
    this.wildDogBarkEnv = 0;
    this.wildDogLastToppleAudioMs = 0;
    this.wildDog.resetDust();
    this.wildDog.root.position.copy(startWorld);
    this.wildDogCurve.getTangent(0.01, _dogTan);
    this.wildDog.root.rotation.set(0, Math.atan2(_dogTan.x, _dogTan.z), 0);
    this.wildDog.root.visible = true;
    this.requestRender();
  }

  public stopWildDogRun(restorePieces = true): void {
    if (restorePieces && this.wildDogTippedPieces.size > 0) {
      for (const tipped of this.wildDogTippedPieces.values()) {
        tipped.group.position.copy(tipped.origPos);
        tipped.group.quaternion.copy(tipped.origQuat);
        if (tipped.contactShadow) tipped.contactShadow.visible = true;
      }
    }
    this.wildDogTippedPieces.clear();
    this.wildDogPhase = 'idle';
    this.wildDogCurve = null;
    this.wildDogElapsed = 0;
    this.wildDogPhaseTimer = 0;
    this.wildDogBarkEnv = 0;
    if (this.wildDog) {
      this.wildDog.root.visible = false;
      this.wildDog.resetDust();
    }
  }

  private applyTippedPiecePose(
    tipped: TippedPieceAnim,
    angle: number,
    slideNudge: number,
    extraLiftY = 0,
  ): void {
    const a = Math.max(0, angle);
    const sinA = Math.sin(a);
    const cosA = Math.cos(a);

    // Rigid-body pivot around the outside base rim edge (origPos + baseRadius * pushDir):
    // As the piece tilts by angle `a` around its outside edge, its base center swings
    // horizontally forward by baseRadius * (1 - cosA) and lifts vertically so that neither
    // the base bottom, the plinth lip, nor the upper head/crown ever sinks below BOARD_TOP_Y.
    const rimPivotHoriz = tipped.baseRadius * (1 - cosA);
    const lowestRelY = Math.min(
      0,
      -tipped.baseRadius * sinA,
      tipped.lipHeight * cosA - tipped.baseRadius * sinA,
      tipped.headHeight * cosA - tipped.headRadius * sinA,
    );
    const liftY = -lowestRelY + (a > 0.01 ? 0.004 : 0) + extraLiftY;
    const totalHoriz = rimPivotHoriz + slideNudge;

    tipped.group.position.set(
      tipped.origPos.x + tipped.pushDir.x * totalHoriz,
      BOARD_TOP_Y + liftY,
      tipped.origPos.z + tipped.pushDir.z * totalHoriz,
    );

    _dogTiltQuat.setFromAxisAngle(tipped.fallAxis, a);
    _dogSpinQuat.setFromAxisAngle(_dogUp, tipped.spinYaw * sinA);
    tipped.group.quaternion
      .copy(_dogTiltQuat)
      .multiply(_dogSpinQuat)
      .multiply(tipped.origQuat);

    if (tipped.contactShadow) {
      tipped.contactShadow.visible = a < 0.04 && extraLiftY < 0.02;
    }
  }

  private updateWildDog(dt: number): boolean {
    if (this.wildDogPhase === 'idle' || !this.wildDog) return false;

    const stepTippedPiecesFall = (stepDt: number) => {
      for (const tipped of this.wildDogTippedPieces.values()) {
        // Gravity-accelerated topple pivoting over the piece's outer rim with realistic bounce
        if (tipped.fallAngle < tipped.targetFallAngle || Math.abs(tipped.fallVel) > 0.25) {
          tipped.fallVel += 22.0 * stepDt;
          tipped.fallAngle += tipped.fallVel * stepDt;
          if (tipped.fallAngle >= tipped.targetFallAngle) {
            tipped.fallAngle = tipped.targetFallAngle;
            if (tipped.bounces < 2 && tipped.fallVel > 1.4) {
              tipped.fallVel = -tipped.fallVel * 0.32;
              tipped.bounces++;
            } else {
              tipped.fallVel = 0;
            }
          }
        }

        // Smooth horizontal slide/nudge from puppy impact (on top of natural rim-roll offset)
        tipped.nudgeCurrent = THREE.MathUtils.damp(
          tipped.nudgeCurrent,
          tipped.nudgeDist,
          9.0,
          stepDt,
        );

        this.applyTippedPiecePose(tipped, tipped.fallAngle, tipped.nudgeCurrent);
      }
    };

    if (this.wildDogPhase === 'running' && this.wildDogCurve) {
      this.wildDogElapsed += dt;
      const u = Math.min(1, this.wildDogElapsed / this.wildDogDuration);

      this.wildDogCurve.getPoint(u, _dogPos);
      this.wildDogCurve.getTangent(u, _dogTan);

      // Dramatic joyful leap arc as the fluffy white puppy bursts out of the side of Chess Angel's modal
      let jumpArcY = 0;
      if (u < 0.22) {
        const leapT = u / 0.22;
        jumpArcY = Math.sin(leapT * Math.PI) * 1.15;
      } else if (u > 0.78 && u < 0.94) {
        const exitHopT = (u - 0.78) / 0.16;
        jumpArcY = Math.sin(exitHopT * Math.PI) * 0.52;
      }
      _dogPos.y = BOARD_TOP_Y + jumpArcY;

      this.wildDog.root.position.copy(_dogPos);

      // Smoothly steer puppy forward along its velocity tangent
      const targetYaw = Math.atan2(_dogTan.x, _dogTan.z);
      let deltaYaw = targetYaw - this.wildDog.root.rotation.y;
      while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      this.wildDog.root.rotation.y += deltaYaw * Math.min(1, dt * 14);

      // Stereo-panned excited puppy barks synced to snapping jaw
      this.wildDogBarkEnv = Math.max(0, this.wildDogBarkEnv - dt * 5.2);
      if (this.wildDogElapsed >= this.wildDogNextBarkAt && u < 0.95) {
        this.wildDogBarkEnv = 1.0;
        this.wildDogNextBarkAt = this.wildDogElapsed + 0.24 + Math.random() * 0.15;
        if (!this.wildDogSoundMuted) {
          _dogProj.copy(_dogPos).project(this.camera);
          const stereoPan = THREE.MathUtils.clamp(_dogProj.x, -0.92, 0.92);
          soundEngine.playWildDogBark(stereoPan, 0.95 + Math.random() * 0.15);
        }
      }

      this.wildDog.update(
        dt,
        this.wildDogElapsed,
        _dogPos,
        BOARD_TOP_Y,
        this.wildDogBarkEnv,
        u > 0.14 && u < 0.88,
      );

      // Detect collision with chess pieces and tip over every piece the puppy touches
      if (jumpArcY < 0.88) {
        const hitRadiusSq = 0.98 * 0.98;
        const nowMs = performance.now();
        for (const entry of this.pieceMap.values()) {
          if (this.wildDogTippedPieces.has(entry.group)) continue;
          const dx = entry.group.position.x - _dogPos.x;
          const dz = entry.group.position.z - _dogPos.z;
          const dSq = dx * dx + dz * dz;
          if (dSq > hitRadiusSq) continue;

          // Combine outward radial knock + puppy forward momentum for natural tip direction
          _dogPush.set(dx + _dogTan.x * 0.62, 0, dz + _dogTan.z * 0.62);
          if (_dogPush.lengthSq() < 0.0001) {
            _dogPush.set(_dogTan.x, 0, _dogTan.z);
          }
          _dogPush.normalize();

          // Rotation axis perpendicular to pushDir on the horizontal board plane
          _dogAxis.crossVectors(_dogUp, _dogPush).normalize();
          if (_dogAxis.lengthSq() < 0.0001) _dogAxis.set(1, 0, 0);

          const dims = PIECE_TIP_DIMENSIONS[entry.type];
          // Exact resting side-lay angle where both the base rim and upper head/crown touch the board
          const restAngle =
            Math.PI / 2 + Math.atan2(dims.baseRadius - dims.headRadius, dims.headHeight);
          const contactShadow =
            entry.group.children.find((c) => c.userData?.isContactShadow === true) ?? null;

          this.wildDogTippedPieces.set(entry.group, {
            group: entry.group,
            contactShadow,
            baseRadius: dims.baseRadius,
            lipHeight: dims.lipHeight,
            headRadius: dims.headRadius,
            headHeight: dims.headHeight,
            origPos: entry.group.position.clone(),
            origQuat: entry.group.quaternion.clone(),
            fallAxis: _dogAxis.clone(),
            pushDir: _dogPush.clone(),
            fallAngle: 0.04,
            targetFallAngle: restAngle,
            fallVel: 3.4 + Math.random() * 2.4,
            nudgeDist: 0.08 + Math.random() * 0.12,
            nudgeCurrent: 0,
            spinYaw: (Math.random() - 0.5) * 0.5,
            bounces: 0,
            recoverDelay: Math.random() * 0.28,
            recoverStartAngle: restAngle,
            recoverStartNudge: 0,
          });

          if (!this.wildDogSoundMuted && nowMs - this.wildDogLastToppleAudioMs > 52) {
            this.wildDogLastToppleAudioMs = nowMs;
            _dogProj.copy(entry.group.position).project(this.camera);
            soundEngine.playPieceTopple(THREE.MathUtils.clamp(_dogProj.x, -0.88, 0.88));
          }
        }
      }

      stepTippedPiecesFall(dt);

      if (u >= 1) {
        this.wildDog.root.visible = false;
        this.wildDogPhase = this.wildDogTippedPieces.size > 0 ? 'hold' : 'idle';
        this.wildDogPhaseTimer = 0;
        if (this.wildDogPhase === 'idle') {
          this.wildDog.resetDust();
        }
      }
      return true;
    }

    if (this.wildDogPhase === 'hold') {
      this.wildDogPhaseTimer += dt;
      // Keep fading remaining paw puffs while tipped pieces finish settling
      this.wildDog.update(dt, this.wildDogElapsed + this.wildDogPhaseTimer, _dogPos, BOARD_TOP_Y, 0, false);
      stepTippedPiecesFall(dt);

      if (this.wildDogPhaseTimer >= 1.65) {
        this.wildDogPhase = 'recovering';
        this.wildDogPhaseTimer = 0;
        for (const tipped of this.wildDogTippedPieces.values()) {
          tipped.recoverStartAngle = tipped.fallAngle;
          tipped.recoverStartNudge = tipped.nudgeCurrent;
        }
        if (!this.wildDogSoundMuted) {
          soundEngine.playMove();
        }
      }
      return true;
    }

    if (this.wildDogPhase === 'recovering') {
      this.wildDogPhaseTimer += dt;
      const recoverDur = 0.68;
      let anyStillRecovering = false;

      for (const tipped of this.wildDogTippedPieces.values()) {
        const localT = Math.max(0, (this.wildDogPhaseTimer - tipped.recoverDelay) / recoverDur);
        if (localT < 1) {
          anyStillRecovering = true;
          // Smoothly unroll back upright over the outer rim with a playful little hop (zero board clipping!)
          const eased = 1 - Math.pow(1 - localT, 3);
          const curAngle = tipped.recoverStartAngle * (1 - eased);
          const curNudge = tipped.recoverStartNudge * (1 - eased);
          const hopY = Math.sin(localT * Math.PI) * 0.16;
          this.applyTippedPiecePose(tipped, curAngle, curNudge, hopY);
        } else {
          tipped.group.position.copy(tipped.origPos);
          tipped.group.quaternion.copy(tipped.origQuat);
          if (tipped.contactShadow) tipped.contactShadow.visible = true;
        }
      }

      if (!anyStillRecovering) {
        this.stopWildDogRun(true);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Launches the 3D Mini Hamsters Chase: a dark grey Russian mini hamster (with a crisp black
   * dorsal stripe down its back) and a white mini hamster (with pink nose and pink claws)
   * racing wildly in a figure-8 chase across the chessboard, swapping the lead halfway through,
   * squeaking playfully in stereo, and dashing off the left edge until out of view.
   */
  public triggerHamsterChase(soundEnabled = true): void {
    if (this.webglUnavailable || !this.hamsterGrey || !this.hamsterWhite) return;
    if (this.wildDogPhase !== 'idle') {
      this.stopWildDogRun(true);
    }
    this.stopHamsterChase();
    this.hamsterSoundMuted = !soundEnabled;

    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;

    const raycastToBoard = (clientX: number, clientY: number, fallback: THREE.Vector3): THREE.Vector3 => {
      _rayMouse.x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      _rayMouse.y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      _dogRaycaster.setFromCamera(_rayMouse, this.camera);
      const hit = new THREE.Vector3();
      if (_dogRaycaster.ray.intersectPlane(_dogPlane, hit) && hit.length() < 34) {
        return hit;
      }
      return fallback.clone();
    };

    const entryWorld = raycastToBoard(
      canvasRect.left + canvasRect.width * 0.84,
      canvasRect.top + canvasRect.height * 0.48,
      new THREE.Vector3(4.6, BOARD_TOP_Y, -1.2),
    );
    // Clamp entry close to the right rim of the board so both hamsters appear immediately in view
    entryWorld.x = THREE.MathUtils.clamp(entryWorld.x, -5.2, 5.2);
    entryWorld.z = THREE.MathUtils.clamp(entryWorld.z, -2.4, 2.4);

    const exitWorld = raycastToBoard(
      canvasRect.left - Math.max(120, canvasRect.width * 0.12),
      canvasRect.top + canvasRect.height * 0.56,
      new THREE.Vector3(-8.8, BOARD_TOP_Y, 1.2),
    );

    // Wild sweeping figure-8 chase weaving across the open central ranks & around chess pieces
    const flip = Math.random() > 0.5 ? 1 : -1;
    const pts: THREE.Vector3[] = [
      entryWorld,
      new THREE.Vector3(3.3, BOARD_TOP_Y, -1.4 * flip),
      new THREE.Vector3(1.2, BOARD_TOP_Y, -2.2 * flip),
      new THREE.Vector3(-1.9, BOARD_TOP_Y, -1.1 * flip),
      new THREE.Vector3(-3.0, BOARD_TOP_Y, 1.4 * flip),
      new THREE.Vector3(-0.2, BOARD_TOP_Y, 2.1 * flip),
      new THREE.Vector3(2.4, BOARD_TOP_Y, 0.7 * flip),
      new THREE.Vector3(0.3, BOARD_TOP_Y, -1.3 * flip),
      new THREE.Vector3(-2.6, BOARD_TOP_Y, -0.3 * flip),
      new THREE.Vector3().lerpVectors(new THREE.Vector3(-4.0, BOARD_TOP_Y, 0.4 * flip), exitWorld, 0.45),
      exitWorld,
    ];
    for (const p of pts) p.y = BOARD_TOP_Y;

    this.hamsterCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    this.hamsterActive = true;
    this.hamsterElapsed = 0;
    this.hamsterDuration = 7.4;
    this.hamsterNextSqueakAt = 0.12;
    this.hamsterSqueakEnvWhite = 0;
    this.hamsterSqueakEnvGrey = 0;

    this.hamsterGrey.resetDust();
    this.hamsterWhite.resetDust();
    this.hamsterGrey.root.position.copy(entryWorld);
    this.hamsterWhite.root.position.copy(entryWorld);
    // Keep hidden until updateHamsterChase places them on separated lanes so frame 0 never overlaps
    this.hamsterGrey.root.visible = false;
    this.hamsterWhite.root.visible = false;
    this.requestRender();
  }

  public stopHamsterChase(): void {
    if (this.hamsterWobbles.size > 0) {
      for (const wob of this.hamsterWobbles.values()) {
        wob.group.position.copy(wob.origPos);
        wob.group.quaternion.copy(wob.origQuat);
      }
      this.hamsterWobbles.clear();
    }
    this.hamsterActive = false;
    this.hamsterCurve = null;
    this.hamsterElapsed = 0;
    this.hamsterSqueakEnvWhite = 0;
    this.hamsterSqueakEnvGrey = 0;
    if (this.hamsterGrey) {
      this.hamsterGrey.root.visible = false;
      this.hamsterGrey.resetDust();
    }
    if (this.hamsterWhite) {
      this.hamsterWhite.root.visible = false;
      this.hamsterWhite.resetDust();
    }
  }

  private updateHamsterChase(dt: number): boolean {
    if (!this.hamsterActive || !this.hamsterCurve || !this.hamsterGrey || !this.hamsterWhite) {
      return false;
    }

    this.hamsterElapsed += dt;
    // Slight start offset so the white hamster enters immediately on frame 1 while the grey hamster
    // follows cleanly behind, with cosine lead-swaps keeping generous spacing at entry, mid-chase, and exit.
    const baseU = this.hamsterElapsed / this.hamsterDuration - 0.056;

    // Smooth lead-swap wave: white leads first, grey sweeps wide to overtake mid-board,
    // then white darts back ahead on the opposite lane so they never cross through each other.
    const swapWave = Math.cos(baseU * Math.PI * 1.85) * 0.054;
    const whiteU = baseU + 0.009 + swapWave;
    const greyU = baseU - 0.009 - swapWave;

    const whiteVisible = whiteU > 0.002 && whiteU < 0.998;
    const greyVisible = greyU > 0.002 && greyU < 0.998;

    // Widen their opposing lateral lanes smoothly whenever they pull alongside for an overtake
    const uGap = Math.abs(whiteU - greyU);
    const overtakeFactor = Math.exp(-Math.pow(uGap / 0.068, 2));

    const computeRawPose = (
      u: number,
      visible: boolean,
      posOut: THREE.Vector3,
      tanOut: THREE.Vector3,
      laneSign: 1 | -1,
      lateralPhase: number,
    ) => {
      if (!visible) return;
      this.hamsterCurve!.getPoint(u, posOut);
      this.hamsterCurve!.getTangent(u, tanOut);

      // Persistent opposite side lanes + wide passing arc during overtakes + gentle scurry weave
      _hamSide.set(-tanOut.z, 0, tanOut.x);
      if (_hamSide.lengthSq() > 0.0001) _hamSide.normalize();
      const laneOffset = laneSign * (0.44 + overtakeFactor * 0.56);
      const lateralWiggle = Math.sin(this.hamsterElapsed * 6.8 + lateralPhase) * 0.15;
      posOut.addScaledVector(_hamSide, laneOffset + lateralWiggle);

      // Tiny excited bunny-hop skips while chasing
      const hopWave = Math.max(0, Math.sin(this.hamsterElapsed * 11.5 + lateralPhase));
      const hopY = Math.pow(hopWave, 5) * 0.24;
      posOut.y = BOARD_TOP_Y + hopY;
    };

    computeRawPose(whiteU, whiteVisible, _hamPosA, _hamTanA, 1, 0.0);
    computeRawPose(greyU, greyVisible, _hamPosB, _hamTanB, -1, Math.PI * 0.92);

    // Smooth world-space XZ separation cushion + strict minimum-distance floor so the two
    // 3D hamster meshes (each ~1.0 unit long) can never clip or merge even on tight figure-8 bends.
    if (whiteVisible && greyVisible) {
      const MIN_HARD_SEP = 1.52;
      const SOFT_CUSHION_SEP = 2.15;
      let dx = _hamPosA.x - _hamPosB.x;
      let dz = _hamPosA.z - _hamPosB.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < SOFT_CUSHION_SEP * SOFT_CUSHION_SEP) {
        let dist = Math.sqrt(distSq);
        if (dist < 0.0001) {
          dx = -_hamTanA.z;
          dz = _hamTanA.x;
          dist = Math.hypot(dx, dz) || 1;
        }
        const norm = dist / SOFT_CUSHION_SEP;
        const targetDist = MIN_HARD_SEP + (SOFT_CUSHION_SEP - MIN_HARD_SEP) * (norm * norm);
        if (targetDist > dist) {
          const push = (targetDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          _hamPosA.x += nx * push;
          _hamPosA.z += nz * push;
          _hamPosB.x -= nx * push;
          _hamPosB.z -= nz * push;
        }
      }
    }

    // Stereo squeaks alternating between the white & Russian grey mini hamsters
    this.hamsterSqueakEnvWhite = Math.max(0, this.hamsterSqueakEnvWhite - dt * 5.8);
    this.hamsterSqueakEnvGrey = Math.max(0, this.hamsterSqueakEnvGrey - dt * 5.8);
    if (this.hamsterElapsed >= this.hamsterNextSqueakAt && (whiteVisible || greyVisible)) {
      this.hamsterNextSqueakAt = this.hamsterElapsed + 0.36 + Math.random() * 0.26;
      const whiteSqueaks = whiteVisible && (!greyVisible || Math.random() > 0.48);
      if (whiteSqueaks) {
        this.hamsterSqueakEnvWhite = 1.0;
      } else {
        this.hamsterSqueakEnvGrey = 1.0;
      }
      if (!this.hamsterSoundMuted) {
        _dogProj.copy(whiteSqueaks ? _hamPosA : _hamPosB).project(this.camera);
        soundEngine.playHamsterSqueak(
          THREE.MathUtils.clamp(_dogProj.x, -0.9, 0.9),
          whiteSqueaks ? 'white' : 'grey',
        );
      }
    }

    const commitHamster = (
      actor: MiniHamsterActor,
      u: number,
      visible: boolean,
      pos: THREE.Vector3,
      tan: THREE.Vector3,
      lateralPhase: number,
      squeakEnv: number,
    ) => {
      const wasVisible = actor.root.visible;
      actor.root.visible = visible;
      if (!visible) return;

      actor.root.position.copy(pos);

      const targetYaw = Math.atan2(tan.x, tan.z);
      if (!wasVisible) {
        actor.root.rotation.y = targetYaw;
      } else {
        let dy = targetYaw - actor.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        actor.root.rotation.y += dy * Math.min(1, dt * 18);
      }

      actor.update(
        dt,
        this.hamsterElapsed + lateralPhase * 0.2,
        pos,
        BOARD_TOP_Y,
        squeakEnv,
        u > 0.06 && u < 0.92,
      );
    };

    commitHamster(this.hamsterWhite, whiteU, whiteVisible, _hamPosA, _hamTanA, 0.0, this.hamsterSqueakEnvWhite);
    commitHamster(this.hamsterGrey, greyU, greyVisible, _hamPosB, _hamTanB, Math.PI * 0.92, this.hamsterSqueakEnvGrey);

    // Subtle adorable piece wobble whenever either visible tiny hamster zips right past a piece base
    const brushRadiusSq = 0.54 * 0.54;
    if (whiteVisible || greyVisible) {
      for (const entry of this.pieceMap.values()) {
        if (this.hamsterWobbles.has(entry.group)) continue;
        const activePositions: THREE.Vector3[] = [];
        if (whiteVisible) activePositions.push(_hamPosA);
        if (greyVisible) activePositions.push(_hamPosB);
        for (const hPos of activePositions) {
          const dx = entry.group.position.x - hPos.x;
          const dz = entry.group.position.z - hPos.z;
          if (dx * dx + dz * dz < brushRadiusSq) {
            _dogPush.set(dx, 0, dz);
            if (_dogPush.lengthSq() < 0.0001) _dogPush.set(1, 0, 0);
            _dogPush.normalize();
            _dogAxis.crossVectors(_dogUp, _dogPush).normalize();
            if (_dogAxis.lengthSq() < 0.0001) _dogAxis.set(1, 0, 0);
            const dims = PIECE_TIP_DIMENSIONS[entry.type];
            this.hamsterWobbles.set(entry.group, {
              group: entry.group,
              origPos: entry.group.position.clone(),
              origQuat: entry.group.quaternion.clone(),
              pushDir: _dogPush.clone(),
              axis: _dogAxis.clone(),
              baseRadius: dims.baseRadius,
              age: 0,
              duration: 0.42,
              amplitude: 0.11 + Math.random() * 0.04,
            });
            break;
          }
        }
      }
    }

    for (const [grp, wob] of Array.from(this.hamsterWobbles.entries())) {
      wob.age += dt;
      if (wob.age >= wob.duration) {
        grp.position.copy(wob.origPos);
        grp.quaternion.copy(wob.origQuat);
        this.hamsterWobbles.delete(grp);
      } else {
        const k = wob.age / wob.duration;
        const angle = Math.sin(k * Math.PI * 2.5) * wob.amplitude * (1 - k);
        const absA = Math.abs(angle);
        const signA = Math.sign(angle);
        // Pivot cleanly on the piece's outer rim edge so the base never dips into the board
        const rimShift = wob.baseRadius * (1 - Math.cos(absA)) * signA;
        grp.position.set(
          wob.origPos.x + wob.pushDir.x * rimShift,
          BOARD_TOP_Y + wob.baseRadius * Math.sin(absA),
          wob.origPos.z + wob.pushDir.z * rimShift,
        );
        _dogTiltQuat.setFromAxisAngle(wob.axis, angle);
        grp.quaternion.copy(_dogTiltQuat).multiply(wob.origQuat);
      }
    }

    if (whiteU >= 1.0 && greyU >= 1.0 && this.hamsterWobbles.size === 0) {
      this.stopHamsterChase();
      return false;
    }
    return true;
  }

  private syncPieces(
    fen: string,
    movedHint: { from: string; to: string } | null,
    durationOverrideSec?: number,
  ): void {
    const boardKey = fen.split(' ')[0];
    if (boardKey === this.lastPiecesBoardKey && !movedHint && this.pieceMap.size > 0) {
      // Board piece positions did not change (only overlays/arrows/highlights updated) —
      // keep any active puppy or mini-hamster board animations running smoothly!
      return;
    }
    this.lastPiecesBoardKey = boardKey;
    if (this.wildDogPhase !== 'idle') {
      this.stopWildDogRun(true);
    }
    if (this.hamsterActive) {
      this.stopHamsterChase();
    }
    this.finalizeCaptureSweeps();
    const chess = new Chess(fen);
    const board = chess.board();

    const desired = new Map<string, { type: PieceType; color: PieceColor }>();
    const counts: Record<PieceColor, Record<PieceType, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        const sq = `${FILES[c]}${8 - r}`;
        const t = cell.type as PieceType;
        const col = cell.color as PieceColor;
        desired.set(sq, { type: t, color: col });
        counts[col][t]++;
      }
    }

    let animatedMovedObj: THREE.Group | null = null;
    let pendingCaptureSweep: {
      victimObj: THREE.Group;
      victimType: PieceType;
      victimColor: PieceColor;
      victimStartPos: THREE.Vector3;
      attackerStartPos: THREE.Vector3;
      attackerEndPos: THREE.Vector3;
      impactDelaySec: number;
    } | null = null;

    if (movedHint) {
      const movingExisting = this.pieceMap.get(movedHint.from);
      const targetSpec = desired.get(movedHint.to);
      if (movingExisting && targetSpec && movingExisting.color === targetSpec.color) {
        // Detect standard capture at movedHint.to OR en-passant pawn capture beside movedHint.from
        let victimSquare = movedHint.to;
        let victim = this.pieceMap.get(movedHint.to);
        if (victim && victim.color === movingExisting.color) {
          victim = undefined;
        }
        if (
          !victim &&
          movingExisting.type === 'p' &&
          movedHint.from[0] !== movedHint.to[0]
        ) {
          const epSq = `${movedHint.to[0]}${movedHint.from[1]}`;
          const epCandidate = this.pieceMap.get(epSq);
          if (
            epCandidate &&
            epCandidate.color !== movingExisting.color &&
            !desired.has(epSq)
          ) {
            victim = epCandidate;
            victimSquare = epSq;
          }
        }

        const startPos = movingExisting.group.position.clone();
        const endPos = squareToWorld(movedHint.to);
        const isCapture = Boolean(victim);
        const isKnight = movingExisting.type === 'n';
        const baseDur = durationOverrideSec ?? (isCapture ? 0.28 : 0.25);
        const moveDur = isCapture
          ? isKnight
            ? baseDur * 1.32
            : baseDur * 1.18
          : isKnight
            ? baseDur * 1.2
            : baseDur;

        if (victim) {
          this.pieceGroup.remove(victim.group);
          this.pieceMap.delete(victimSquare);
          this.animations = this.animations.filter((a) => a.obj !== victim!.group);
          if (!this.powerSaveMode) {
            pendingCaptureSweep = {
              victimObj: victim.group,
              victimType: victim.type,
              victimColor: victim.color,
              victimStartPos: victim.group.position.clone(),
              attackerStartPos: startPos.clone(),
              attackerEndPos: endPos.clone(),
              impactDelaySec: moveDur * (isKnight ? 0.56 : 0.5),
            };
          }
        }

        this.pieceMap.delete(movedHint.from);
        this.animations = this.animations.filter((a) => a.obj !== movingExisting.group);

        let movedGroup: THREE.Group;
        if (movingExisting.type === targetSpec.type) {
          movedGroup = movingExisting.group;
          this.pieceMap.set(movedHint.to, movingExisting);
        } else {
          // Pawn promotion (including promotion captures): animate the promoted piece sliding in
          this.pieceGroup.remove(movingExisting.group);
          const mats = targetSpec.color === 'w' ? this.whitePieceMats : this.blackPieceMats;
          movedGroup = buildSculptedPiece(
            targetSpec.type,
            targetSpec.color,
            this.pieceGeoCache,
            mats,
            this.enableShadows,
          );
          movedGroup.position.copy(startPos);
          this.pieceGroup.add(movedGroup);
          this.pieceMap.set(movedHint.to, {
            group: movedGroup,
            type: targetSpec.type,
            color: targetSpec.color,
          });
        }

        if (this.powerSaveMode) {
          movedGroup.position.copy(endPos);
        } else {
          animatedMovedObj = movedGroup;
          let strikeLeanAxis: THREE.Vector3 | undefined;
          let strikeLeanRad: number | undefined;
          if (isCapture) {
            _captureDir.subVectors(endPos, startPos);
            _captureDir.y = 0;
            if (_captureDir.lengthSq() > 1e-5) {
              _captureDir.normalize();
              strikeLeanAxis = new THREE.Vector3().crossVectors(_captureUp, _captureDir).normalize();
              strikeLeanRad = isKnight ? 0.11 : 0.095;
            }
          }
          this.animations.push({
            obj: movedGroup,
            startPos,
            endPos,
            origQuat: movedGroup.quaternion.clone(),
            elapsed: 0,
            duration: moveDur,
            // Capturing ground pieces glide smoothly into the target square; knights leap over pieces
            arcHeight: isKnight ? (isCapture ? 1.08 : 1.15) : isCapture ? 0.035 : 0.28,
            strikeLeanRad,
            strikeLeanAxis,
          });
        }
      }
    }

    for (const [sq, entry] of Array.from(this.pieceMap.entries())) {
      const want = desired.get(sq);
      if (!want || want.type !== entry.type || want.color !== entry.color) {
        this.pieceGroup.remove(entry.group);
        this.pieceMap.delete(sq);
      }
    }

    for (const [sq, want] of desired.entries()) {
      const existing = this.pieceMap.get(sq);
      if (existing) {
        if (existing.group !== animatedMovedObj) {
          squareToWorld(sq, existing.group.position);
        }
        continue;
      }
      const mats = want.color === 'w' ? this.whitePieceMats : this.blackPieceMats;
      const group = buildSculptedPiece(
        want.type,
        want.color,
        this.pieceGeoCache,
        mats,
        this.enableShadows,
      );
      squareToWorld(sq, group.position);
      this.pieceGroup.add(group);
      this.pieceMap.set(sq, { group, type: want.type, color: want.color });
    }

    const graveyardSlot = this.rebuildCapturedTrays(
      counts,
      pendingCaptureSweep
        ? { color: pendingCaptureSweep.victimColor, type: pendingCaptureSweep.victimType }
        : null,
    );

    if (pendingCaptureSweep && !this.powerSaveMode) {
      const {
        victimObj,
        victimColor,
        victimStartPos,
        attackerStartPos,
        attackerEndPos,
        impactDelaySec,
      } = pendingCaptureSweep;
      const sideSign = victimColor === 'w' ? 1 : -1;
      const endPos = graveyardSlot
        ? graveyardSlot.pos.clone()
        : new THREE.Vector3(sideSign * 5.77, -0.285, 2.8);

      // Compute sweeping Bezier curve: initial knock follows the attacker's strike momentum,
      // then arcs smoothly outward over the walnut border toward the captured piece's graveyard slot
      const attackDir = new THREE.Vector3().subVectors(attackerEndPos, attackerStartPos);
      attackDir.y = 0;
      if (attackDir.lengthSq() > 1e-5) {
        attackDir.normalize();
      } else {
        attackDir.set(sideSign, 0, 0);
      }

      const toGraveX = endPos.x - victimStartPos.x;
      const toGraveZ = endPos.z - victimStartPos.z;
      const controlPos = new THREE.Vector3(
        victimStartPos.x + attackDir.x * 1.35 + toGraveX * 0.44,
        BOARD_TOP_Y,
        victimStartPos.z + attackDir.z * 1.35 + toGraveZ * 0.44,
      );

      // Tilt away from the initial sweeping direction
      const sweepInitDir = new THREE.Vector3(
        controlPos.x - victimStartPos.x,
        0,
        controlPos.z - victimStartPos.z,
      );
      if (sweepInitDir.lengthSq() > 1e-5) {
        sweepInitDir.normalize();
      } else {
        sweepInitDir.set(sideSign, 0, 0);
      }
      const tiltAxis = new THREE.Vector3().crossVectors(_captureUp, sweepInitDir).normalize();
      const spinSign = sweepInitDir.z >= 0 ? 1 : -1;

      // Locate the piece's flat contact shadow disc so we can hide it while airborne
      let contactShadow: THREE.Object3D | null = null;
      for (const child of victimObj.children) {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material === this.pieceContactShadowMat) {
          contactShadow = mesh;
          break;
        }
      }

      victimObj.position.copy(victimStartPos);
      victimObj.scale.setScalar(1);
      this.captureSweepGroup.add(victimObj);

      const distToGrave = Math.hypot(toGraveX, toGraveZ);
      const sweepDuration = THREE.MathUtils.clamp(0.46 + distToGrave * 0.032, 0.5, 0.74);

      this.captureSweeps.push({
        obj: victimObj,
        contactShadow,
        origQuat: victimObj.quaternion.clone(),
        startPos: victimStartPos,
        controlPos,
        endPos,
        tiltAxis,
        maxTiltRad: 0.48,
        spinYawRad: 0.54 * spinSign,
        peakLiftY: 0.82,
        delay: impactDelaySec,
        elapsed: 0,
        duration: sweepDuration,
        targetScale: 0.68,
        revealGraveyardMesh: graveyardSlot?.mesh ?? null,
      });
    }
  }

  private finalizeCaptureSweeps(): void {
    if (this.captureSweeps.length === 0 && this.captureSweepGroup.children.length === 0) {
      return;
    }
    for (const sweep of this.captureSweeps) {
      if (sweep.contactShadow) {
        sweep.contactShadow.visible = true;
      }
      if (sweep.revealGraveyardMesh) {
        sweep.revealGraveyardMesh.visible = true;
      }
      this.captureSweepGroup.remove(sweep.obj);
    }
    this.captureSweeps = [];
    while (this.captureSweepGroup.children.length > 0) {
      this.captureSweepGroup.remove(this.captureSweepGroup.children[0]);
    }
  }

  private rebuildCapturedTrays(
    onBoardCounts: Record<PieceColor, Record<PieceType, number>>,
    hideLatestForSweep?: { color: PieceColor; type: PieceType } | null,
  ): { pos: THREE.Vector3; mesh: THREE.Group } | null {
    while (this.capturedGroup.children.length > 0) {
      this.capturedGroup.remove(this.capturedGroup.children[0]);
    }
    const startCounts: Record<PieceType, number> = { q: 1, r: 2, b: 2, n: 2, p: 8, k: 1 };
    const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
    let sweptSlot: { pos: THREE.Vector3; mesh: THREE.Group } | null = null;

    (['w', 'b'] as PieceColor[]).forEach((color) => {
      const missing: PieceType[] = [];
      for (const type of order) {
        const diff = Math.max(0, startCounts[type] - onBoardCounts[color][type]);
        for (let i = 0; i < diff; i++) missing.push(type);
      }

      const mats = color === 'w' ? this.whitePieceMats : this.blackPieceMats;
      const sideSign = color === 'w' ? 1 : -1;

      // Hide the last matching slot in the graveyard while the newly captured piece is flying toward it
      let hideIdx = -1;
      if (hideLatestForSweep && hideLatestForSweep.color === color) {
        for (let i = missing.length - 1; i >= 0; i--) {
          if (missing[i] === hideLatestForSweep.type) {
            hideIdx = i;
            break;
          }
        }
      }

      missing.forEach((type, idx) => {
        const piece = buildSculptedPiece(
          type,
          color,
          this.pieceGeoCache,
          mats,
          this.enableShadows,
        );
        piece.scale.setScalar(0.68);
        const col = Math.floor(idx / 8);
        const row = idx % 8;
        const x = sideSign * (5.15 + col * 0.62);
        const z = (row - 3.5) * 0.72;
        piece.position.set(x, -0.285, z);
        if (idx === hideIdx) {
          piece.visible = false;
          sweptSlot = { pos: new THREE.Vector3(x, -0.285, z), mesh: piece };
        }
        this.capturedGroup.add(piece);
      });
    });

    return sweptSlot;
  }

  private syncOverlays(state: SceneVisualState): void {
    if (state.selectedSquare) {
      squareToWorld(state.selectedSquare, _tmpVec);
      this.selectedRing.position.set(_tmpVec.x, BOARD_TOP_Y + 0.024, _tmpVec.z);
      this.selectedRing.visible = true;
    } else {
      this.selectedRing.visible = false;
    }

    if (state.checkSquare) {
      squareToWorld(state.checkSquare, _tmpVec);
      this.checkRing.position.set(_tmpVec.x, BOARD_TOP_Y + 0.025, _tmpVec.z);
      this.checkRing.visible = true;
    } else {
      this.checkRing.visible = false;
    }

    if (state.lastMove) {
      squareToWorld(state.lastMove.from, _tmpVec);
      this.lastFromPlate.position.set(_tmpVec.x, BOARD_TOP_Y + 0.018, _tmpVec.z);
      this.lastFromPlate.visible = true;

      squareToWorld(state.lastMove.to, _tmpVec);
      this.lastToPlate.position.set(_tmpVec.x, BOARD_TOP_Y + 0.018, _tmpVec.z);
      this.lastToPlate.visible = true;
    } else {
      this.lastFromPlate.visible = false;
      this.lastToPlate.visible = false;
    }

    while (this.legalMarkerGroup.children.length > 0) {
      this.legalMarkerGroup.remove(this.legalMarkerGroup.children[0]);
    }
    for (const target of state.legalTargets) {
      squareToWorld(target.square, _tmpVec);
      if (target.isCapture) {
        const ring = new THREE.Mesh(this.legalCaptureGeo, this.legalCaptureMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(_tmpVec.x, BOARD_TOP_Y + 0.026, _tmpVec.z);
        this.legalMarkerGroup.add(ring);
      } else {
        const disc = new THREE.Mesh(this.legalQuietGeo, this.legalQuietMat);
        disc.position.set(_tmpVec.x, BOARD_TOP_Y + 0.022, _tmpVec.z);
        this.legalMarkerGroup.add(disc);
      }
    }
  }

  private applyMaterialSetToPieceGroup(
    group: THREE.Group,
    color: PieceColor,
    targetSet: PieceMaterialSet,
  ): void {
    const baseSet = color === 'w' ? this.whitePieceMats : this.blackPieceMats;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh.material === this.pieceContactShadowMat) continue;
      let slot = mesh.userData.pieceMatSlot as 'body' | 'collar' | 'groove' | undefined;
      if (!slot) {
        if (mesh.material === baseSet.collar) slot = 'collar';
        else if (mesh.material === baseSet.groove) slot = 'groove';
        else slot = 'body';
        mesh.userData.pieceMatSlot = slot;
      }
      mesh.material = targetSet[slot];
    }
  }

  private syncSpeechHighlights(highlights: SpeechPieceHighlight[]): void {
    // 1. Restore any previously highlighted piece groups to their base wood materials & board height
    for (const [group, color] of this.highlightedPieceGroups.entries()) {
      const baseSet = color === 'w' ? this.whitePieceMats : this.blackPieceMats;
      this.applyMaterialSetToPieceGroup(group, color, baseSet);
      const isMoving = this.animations.some((a) => a.obj === group);
      if (!isMoving) {
        group.position.y = BOARD_TOP_Y;
      }
    }
    this.highlightedPieceGroups.clear();

    while (this.speechHighlightGroup.children.length > 0) {
      this.speechHighlightGroup.remove(this.speechHighlightGroup.children[0]);
    }

    if (!highlights || highlights.length === 0) {
      this.activeSpeechHighlights = [];
      this.speechPulseTime = 0;
      return;
    }

    const nextActive: SpeechPieceHighlight[] = [];
    for (const item of highlights) {
      if (!item.square || item.square.length !== 2) continue;
      const entry = this.pieceMap.get(item.square);
      if (!entry) continue;

      nextActive.push(item);
      const targetMats =
        entry.color === 'w'
          ? item.role === 'danger'
            ? this.whiteDangerMats
            : this.whiteAttackerMats
          : item.role === 'danger'
            ? this.blackDangerMats
            : this.blackAttackerMats;

      this.applyMaterialSetToPieceGroup(entry.group, entry.color, targetMats);
      this.highlightedPieceGroups.set(entry.group, entry.color);

      squareToWorld(item.square, _tmpVec);
      const discMat =
        item.role === 'danger' ? this.speechDangerDiscMat : this.speechAttackerDiscMat;
      const ringMat =
        item.role === 'danger' ? this.speechDangerRingMat : this.speechAttackerRingMat;

      const disc = new THREE.Mesh(this.speechHaloDiscGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(_tmpVec.x, BOARD_TOP_Y + 0.023, _tmpVec.z);
      disc.userData.isSpeechDisc = true;
      this.speechHighlightGroup.add(disc);

      const ring = new THREE.Mesh(this.speechHaloRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(_tmpVec.x, BOARD_TOP_Y + 0.027, _tmpVec.z);
      ring.userData.isSpeechRing = true;
      this.speechHighlightGroup.add(ring);
    }

    if (this.activeSpeechHighlights.length === 0 && nextActive.length > 0) {
      this.speechPulseTime = 0;
    }
    this.activeSpeechHighlights = nextActive;
  }

  private syncArrows(arrows: SuggestionArrow[]): void {
    while (this.arrowGroup.children.length > 0) {
      const child = this.arrowGroup.children[0] as THREE.Mesh;
      this.arrowGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    if (arrows.length === 0) return;

    const buildArrowGeometry = (
      halfShaft: number,
      halfHead: number,
      tailOffset: number,
      neckDist: number,
      tipDist: number,
      pad = 0,
    ): THREE.ShapeGeometry => {
      const s = new THREE.Shape();
      s.moveTo(-(halfShaft + pad), -(tailOffset - pad * 0.85));
      s.lineTo(-(halfShaft + pad), -(neckDist - pad * 0.55));
      s.lineTo(-(halfHead + pad), -(neckDist - pad * 0.55));
      s.lineTo(0, -(tipDist + pad * 1.3));
      s.lineTo(halfHead + pad, -(neckDist - pad * 0.55));
      s.lineTo(halfShaft + pad, -(neckDist - pad * 0.55));
      s.lineTo(halfShaft + pad, -(tailOffset - pad * 0.85));
      s.closePath();
      const geo = new THREE.ShapeGeometry(s);
      // Rotate flat onto the XZ board plane so -Y in 2D shape points along +Z toward target square
      geo.rotateX(-Math.PI / 2);
      return geo;
    };

    arrows.forEach((arrow, idx) => {
      const start = squareToWorld(arrow.from);
      const end = squareToWorld(arrow.to);
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.2) return;

      const dirX = dx / dist;
      const dirZ = dz / dist;
      const angle = Math.atan2(dirX, dirZ);

      // Flat 2D arrow cleanly elevated above square plates & rings (no 3D extrusion, zero Z-fighting)
      const arrowY = BOARD_TOP_Y + 0.032 + idx * 0.004;
      const tailOffset = 0.13;
      const tipDist = Math.max(0.34, dist - 0.05);
      const headLen = Math.min(0.4, Math.max(0.25, (tipDist - tailOffset) * 0.42));
      const neckDist = Math.max(tailOffset + 0.06, tipDist - headLen);
      const halfShaft = 0.084;
      const halfHead = 0.228;

      // Gold, Cyan, Rose, and Transparent Lila (fork) glowing palette
      const palette =
        arrow.kind === 'fork'
          ? { coreColor: 0xc084fc, glowColor: 0xe9d5ff }
          : arrow.kind === 'trial-2' || arrow.kind === 'secondary'
            ? { coreColor: 0x38bdf8, glowColor: 0x7dd3fc }
            : arrow.kind === 'trial-3'
              ? { coreColor: 0xfb7185, glowColor: 0xfda4af }
              : { coreColor: 0xffcf54, glowColor: 0xffe082 };

      const coreHex = arrow.customColorHex ?? palette.coreColor;
      const glowHex = arrow.customColorHex ?? palette.glowColor;
      const scaleAlpha = arrow.opacityScale ?? 1;

      const outerGlowOpacity = (arrow.kind === 'fork' ? 0.15 : 0.16) * scaleAlpha;
      const innerGlowOpacity = (arrow.kind === 'fork' ? 0.24 : 0.24) * scaleAlpha;
      const coreTranslucentOpacity = (arrow.kind === 'fork' ? 0.48 : 0.44) * scaleAlpha;

      // 1) Wide soft outer additive halo (airy glow across wood grain & square lines)
      const outerHaloGeo = buildArrowGeometry(
        halfShaft,
        halfHead,
        tailOffset,
        neckDist,
        tipDist,
        0.048,
      );
      const outerHaloMat = new THREE.MeshBasicMaterial({
        color: glowHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: outerGlowOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -4 - idx * 3,
        polygonOffsetUnits: -4 - idx * 3,
      });
      const outerHaloMesh = new THREE.Mesh(outerHaloGeo, outerHaloMat);
      outerHaloMesh.userData.baseOpacity = outerGlowOpacity;
      outerHaloMesh.renderOrder = 12 + idx * 3;
      outerHaloMesh.position.set(start.x, arrowY - 0.001, start.z);
      outerHaloMesh.rotation.y = angle;
      this.arrowGroup.add(outerHaloMesh);

      // 2) Tight inner additive bloom (soft luminous edge & body radiance)
      const innerGlowGeo = buildArrowGeometry(
        halfShaft,
        halfHead,
        tailOffset,
        neckDist,
        tipDist,
        0.018,
      );
      const innerGlowMat = new THREE.MeshBasicMaterial({
        color: glowHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: innerGlowOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -5 - idx * 3,
        polygonOffsetUnits: -5 - idx * 3,
      });
      const innerGlowMesh = new THREE.Mesh(innerGlowGeo, innerGlowMat);
      innerGlowMesh.userData.baseOpacity = innerGlowOpacity;
      innerGlowMesh.renderOrder = 13 + idx * 3;
      innerGlowMesh.position.set(start.x, arrowY - 0.0005, start.z);
      innerGlowMesh.rotation.y = angle;
      this.arrowGroup.add(innerGlowMesh);

      // 3) Semi-transparent arrow body so wood grain & thin lines stay visible underneath
      const arrowGeo = buildArrowGeometry(halfShaft, halfHead, tailOffset, neckDist, tipDist, 0);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: coreHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: coreTranslucentOpacity,
        blending: THREE.NormalBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -6 - idx * 3,
        polygonOffsetUnits: -6 - idx * 3,
      });
      const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
      arrowMesh.userData.baseOpacity = coreTranslucentOpacity;
      arrowMesh.renderOrder = 14 + idx * 3;
      arrowMesh.position.set(start.x, arrowY, start.z);
      arrowMesh.rotation.y = angle;
      this.arrowGroup.add(arrowMesh);
    });
  }

  private pickSquare(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    if (hits.length > 0) {
      return (hits[0].object.userData.square as string) || null;
    }
    return null;
  }

  private isPointerOnCoord8(clientX: number, clientY: number): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    _rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.coordRaycaster.setFromCamera(_rayMouse, this.camera);

    // Direct raycast against the embossed "8" coordinate plaques on the board rim
    const coord8Meshes = this.coordGroup.children.filter((obj) => obj.userData?.coordLabel === '8');
    if (coord8Meshes.length > 0 && this.coordRaycaster.intersectObjects(coord8Meshes, false).length > 0) {
      return true;
    }

    // Generous proximity fallback on the board top plane around both "8" coordinate plaques (±4.22, -3.5)
    if (this.coordRaycaster.ray.intersectPlane(_dogPlane, _tmpVec)) {
      const distLeft = Math.hypot(_tmpVec.x - -4.22, _tmpVec.z - -3.5);
      const distRight = Math.hypot(_tmpVec.x - 4.22, _tmpVec.z - -3.5);
      if (distLeft <= 0.34 || distRight <= 0.34) {
        return true;
      }
    }
    return false;
  }

  private handleDblClick(e: MouseEvent): void {
    if (!this.callbacks.onSecretCoord8DoubleClick) return;
    if (this.isPointerOnCoord8(e.clientX, e.clientY)) {
      e.preventDefault();
      this.callbacks.onSecretCoord8DoubleClick();
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button !== 0) return;
    const travel = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    if (travel > 6) return;

    // Touch/pen double-tap fallback for the developer-only "8" coordinate secret trigger
    if (this.callbacks.onSecretCoord8DoubleClick && e.pointerType !== 'mouse') {
      if (this.isPointerOnCoord8(e.clientX, e.clientY)) {
        const now = performance.now();
        if (now - this.lastCoord8TapMs <= 420) {
          this.lastCoord8TapMs = 0;
          this.callbacks.onSecretCoord8DoubleClick();
          return;
        }
        this.lastCoord8TapMs = now;
      }
    }

    if (this.calcPreviewActive) {
      if (this.calcWaitingForClick) {
        this.confirmNextCalculationBranch();
      }
      return;
    }

    if (this.treeSweepPhase !== 'idle' && this.treeFinalized) {
      const sq = this.pickSquare(e.clientX, e.clientY);
      if (sq && this.callbacks.onTreeSquareClick) {
        this.callbacks.onTreeSquareClick(sq);
      }
      return;
    }

    const sq = this.pickSquare(e.clientX, e.clientY);
    if (sq) {
      this.callbacks.onSquareClick(sq);
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const now = performance.now();
    const minIntervalMs = this.powerSaveMode ? 120 : 40;
    if (now - this.lastHoverRaycastTime < minIntervalMs) return;
    this.lastHoverRaycastTime = now;

    const sq = this.pickSquare(e.clientX, e.clientY);
    if (sq !== this.hoveredSquare) {
      this.hoveredSquare = sq;
      if (sq) {
        squareToWorld(sq, _tmpVec);
        this.hoverRing.position.set(_tmpVec.x, BOARD_TOP_Y + 0.021, _tmpVec.z);
        this.hoverRing.visible = true;
        this.renderer.domElement.style.cursor = 'pointer';
      } else {
        this.hoverRing.visible = false;
        this.renderer.domElement.style.cursor = 'grab';
      }
      this.requestRender();
    }
  }

  /**
   * Solves for maximum-extent 3D camera distance and sub-frustum `setViewOffset` so the wooden
   * chessboard fills the viewport while consolidating remaining empty space into a clean
   * unobstructed upper-right void when Chess Angel is visible.
   */
  private frameCameraPoseForViewport(
    preset: CameraPreset,
    w: number,
    h: number,
  ): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const aspect = w / h;
    if (aspect < 1.0) {
      this.camera.fov = THREE.MathUtils.clamp(30 + (1.0 - aspect) * 14, 30, 38);
    } else {
      this.camera.fov = 30;
    }
    this.camera.aspect = aspect;

    const target = new THREE.Vector3();
    const dir = new THREE.Vector3();

    switch (preset) {
      case 'white':
        target.set(0, 0.16, 0.42);
        dir.set(0, 11.1, 12.6).normalize();
        break;
      case 'black':
        target.set(0, 0.16, -0.42);
        dir.set(0, 11.1, -12.6).normalize();
        break;
      case 'top':
        target.set(0, 0.04, 0);
        dir.set(0, 18.8, 0.65).normalize();
        break;
      case 'cinematic':
        target.set(0, 0.24, 0.15);
        dir.set(11.2, 8.4, 10.0).normalize();
        break;
    }

    const corners: ReadonlyArray<[number, number, number]> = [
      [-4.48, -0.26, -4.48],
      [4.48, -0.26, -4.48],
      [-4.48, -0.26, 4.48],
      [4.48, -0.26, 4.48],
      [-4.48, 0.06, -4.48],
      [4.48, 0.06, -4.48],
      [-4.48, 0.06, 4.48],
      [4.48, 0.06, 4.48],
      [-3.65, 1.76, -3.65],
      [3.65, 1.76, -3.65],
      [-3.65, 1.76, 3.65],
      [3.65, 1.76, 3.65],
      [0, 1.78, -3.65],
      [0, 1.78, 3.65],
    ];

    const eye = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const viewMat = new THREE.Matrix4();
    const projViewMat = new THREE.Matrix4();
    const pt = new THREE.Vector4();

    const isPortrait = w < h;
    const padX = this.angelOverlayVisible
      ? Math.max(4, Math.round(w * 0.012))
      : Math.max(2, Math.round(w * 0.008));

    if (isPortrait) {
      const minTopClearPx = this.angelOverlayVisible
        ? Math.round(Math.min(188, h * 0.21))
        : 24;
      const bottomMarginPx = this.angelOverlayVisible
        ? Math.round(Math.max(26, Math.min(72, (h - w * 1.15) * 0.28)))
        : 16;
      const offsetY = Math.round((bottomMarginPx - minTopClearPx) * 0.5);
      this.camera.setViewOffset(w, h, 0, offsetY, w, h);
      this.camera.updateProjectionMatrix();

      const leftPx = padX;
      const rightPx = w - padX;
      const topPx = minTopClearPx;
      const bottomPx = h - bottomMarginPx;

      const fitsPortrait = (dist: number): boolean => {
        eye.copy(dir).multiplyScalar(dist).add(target);
        viewMat.lookAt(eye, target, up);
        viewMat.setPosition(eye);
        viewMat.invert();
        projViewMat.multiplyMatrices(this.camera.projectionMatrix, viewMat);
        for (let i = 0; i < corners.length; i++) {
          const c = corners[i];
          pt.set(c[0], c[1], c[2], 1).applyMatrix4(projViewMat);
          if (pt.w <= 0.05) return false;
          const px = (pt.x / pt.w + 1) * 0.5 * w;
          const py = (1 - pt.y / pt.w) * 0.5 * h;
          if (px < leftPx || px > rightPx || py < topPx || py > bottomPx) {
            return false;
          }
        }
        return true;
      };

      let lo = 6.0;
      let hi = 44.0;
      for (let iter = 0; iter < 22; iter++) {
        const mid = (lo + hi) * 0.5;
        if (fitsPortrait(mid)) hi = mid;
        else lo = mid;
      }
      const pos = dir.clone().multiplyScalar(hi).add(target);
      return { pos, target };
    }

    // Landscape / Desktop:
    // - When Angel Modal is OFF, fill the entire viewport edge-to-edge centered (zero lateral offset).
    // - When Angel Modal is ON, keep the exact side-by-side framing with upper-right void for Chess Angel.
    const baseOffsetY = this.angelOverlayVisible ? -5 : -2;
    this.camera.setViewOffset(w, h, 0, baseOffsetY, w, h);
    this.camera.updateProjectionMatrix();

    const topPx = this.angelOverlayVisible
      ? h <= 540
        ? 28
        : 36
      : h <= 540
        ? 18
        : 26;
    const bottomPx =
      h -
      (this.angelOverlayVisible
        ? h <= 540
          ? 20
          : 24
        : h <= 540
          ? 10
          : 14);
    const minAngelCornerW = this.angelOverlayVisible
      ? Math.round(Math.min(182, w * 0.21))
      : 0;
    const minAngelCornerH = this.angelOverlayVisible
      ? Math.min(h * 0.42, 215)
      : 0;

    const fitsCentered = (dist: number): boolean => {
      eye.copy(dir).multiplyScalar(dist).add(target);
      viewMat.lookAt(eye, target, up);
      viewMat.setPosition(eye);
      viewMat.invert();
      projViewMat.multiplyMatrices(this.camera.projectionMatrix, viewMat);
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        pt.set(c[0], c[1], c[2], 1).applyMatrix4(projViewMat);
        if (pt.w <= 0.05) return false;
        const px = (pt.x / pt.w + 1) * 0.5 * w;
        const py = (1 - pt.y / pt.w) * 0.5 * h;
        if (px < padX || px > w - padX || py < topPx || py > bottomPx) {
          return false;
        }
      }
      return true;
    };

    let lo = 6.0;
    let hi = 44.0;
    for (let iter = 0; iter < 22; iter++) {
      const mid = (lo + hi) * 0.5;
      if (fitsCentered(mid)) hi = mid;
      else lo = mid;
    }

    let offsetX = 0;
    if (this.angelOverlayVisible) {
      eye.copy(dir).multiplyScalar(hi).add(target);
      viewMat.lookAt(eye, target, up);
      viewMat.setPosition(eye);
      viewMat.invert();
      projViewMat.multiplyMatrices(this.camera.projectionMatrix, viewMat);

      let minBoardX = w;
      for (let i = 0; i < corners.length; i++) {
        const c = corners[i];
        pt.set(c[0], c[1], c[2], 1).applyMatrix4(projViewMat);
        if (pt.w > 0.05) {
          const px = (pt.x / pt.w + 1) * 0.5 * w;
          if (px < minBoardX) minBoardX = px;
        }
      }

      const desiredLeftPadPx = Math.round(THREE.MathUtils.clamp(w * 0.022, 10, 42));
      const spareLeftPx = Math.max(0, minBoardX - desiredLeftPadPx);
      offsetX = Math.round(Math.min(spareLeftPx * 0.88, Math.max(260, w * 0.22)));
      this.camera.setViewOffset(w, h, offsetX, baseOffsetY, w, h);
      this.camera.updateProjectionMatrix();

      // Re-verify that with offsetX applied, no corner clips left edge or minimum upper-right Angel corner
      const fitsShifted = (dist: number): boolean => {
        eye.copy(dir).multiplyScalar(dist).add(target);
        viewMat.lookAt(eye, target, up);
        viewMat.setPosition(eye);
        viewMat.invert();
        projViewMat.multiplyMatrices(this.camera.projectionMatrix, viewMat);
        for (let i = 0; i < corners.length; i++) {
          const c = corners[i];
          pt.set(c[0], c[1], c[2], 1).applyMatrix4(projViewMat);
          if (pt.w <= 0.05) return false;
          const px = (pt.x / pt.w + 1) * 0.5 * w;
          const py = (1 - pt.y / pt.w) * 0.5 * h;
          if (px < padX || px > w - padX || py < topPx || py > bottomPx) {
            return false;
          }
          if (minAngelCornerW > 0 && py < minAngelCornerH && px > w - minAngelCornerW) {
            return false;
          }
        }
        return true;
      };

      if (!fitsShifted(hi)) {
        let sLo = hi;
        let sHi = 44.0;
        for (let iter = 0; iter < 18; iter++) {
          const mid = (sLo + sHi) * 0.5;
          if (fitsShifted(mid)) sHi = mid;
          else sLo = mid;
        }
        hi = sHi;
      }
    }

    const pos = dir.clone().multiplyScalar(hi).add(target);
    return { pos, target };
  }

  /**
   * Projects 36 perimeter points of the beveled wooden board & piece crowns into screen pixels
   * and finds the largest unobstructed upper-right void rectangle outside the chessboard & TopBar,
   * returning its dynamic sizing budget (up to full native 554×740 portrait + modal when space permits).
   */
  private computeUpperRightVoid(
    w: number,
    h: number,
    camPos: THREE.Vector3,
    camTarget: THREE.Vector3,
  ): UpperRightVoidSpec {
    const up = new THREE.Vector3(0, 1, 0);
    const viewMat = new THREE.Matrix4();
    viewMat.lookAt(camPos, camTarget, up);
    viewMat.setPosition(camPos);
    viewMat.invert();

    const projViewMat = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      viewMat,
    );
    const pt = new THREE.Vector4();

    // Sample perimeter points along all 4 board edges and top piece crowns
    const hullSamples: Array<[number, number, number]> = [];
    const steps = [-4.48, -2.24, 0, 2.24, 4.48];
    for (const s of steps) {
      hullSamples.push([s, -0.26, -4.48], [s, 0.06, -4.48]);
      hullSamples.push([s, -0.26, 4.48], [s, 0.06, 4.48]);
      hullSamples.push([-4.48, -0.26, s], [-4.48, 0.06, s]);
      hullSamples.push([4.48, -0.26, s], [4.48, 0.06, s]);
    }
    const centralPieceX = [-1.8, 0, 1.8];
    for (const cx of centralPieceX) {
      hullSamples.push([cx, 1.78, -3.65], [cx, 1.78, 3.65]);
    }
    // Corner Rooks (a1/h1/a8/h8) and flank Pawns along files a & h
    hullSamples.push(
      [-3.65, 1.08, -3.65],
      [3.65, 1.08, -3.65],
      [-3.65, 1.08, 3.65],
      [3.65, 1.08, 3.65],
      [-3.65, 0.94, -1.8],
      [3.65, 0.94, -1.8],
      [-3.65, 0.94, 0],
      [3.65, 0.94, 0],
      [-3.65, 0.94, 1.8],
      [3.65, 0.94, 1.8],
    );

    const projected: Array<{ px: number; py: number }> = [];
    for (let i = 0; i < hullSamples.length; i++) {
      const c = hullSamples[i];
      pt.set(c[0], c[1], c[2], 1).applyMatrix4(projViewMat);
      if (pt.w <= 0.05) continue;
      projected.push({
        px: (pt.x / pt.w + 1) * 0.5 * w,
        py: (1 - pt.y / pt.w) * 0.5 * h,
      });
    }

    const voidTopPx = w < 768 ? 26 : 32;
    const voidRightPx = w - (w < 768 ? 4 : 8);
    const minCandBottom = voidTopPx + 100;
    const maxCandBottom = Math.max(minCandBottom + 20, Math.min(h - 12, Math.round(h * 0.97)));

    let bestVoidW = 0;
    let bestVoidH = 0;
    let bestScore = -1;

    const sweepCount = 36;
    for (let s = 0; s <= sweepCount; s++) {
      const candBottomPx = Math.round(
        minCandBottom + ((maxCandBottom - minCandBottom) * s) / sweepCount,
      );
      let maxBoardRightX = -Infinity;
      let anyInBand = false;

      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        if (p.py <= candBottomPx + 4) {
          anyInBand = true;
          if (p.px > maxBoardRightX) {
            maxBoardRightX = p.px;
          }
        }
      }

      let availW: number;
      if (!anyInBand) {
        // Strictly above the entire 3D board & pieces (e.g. portrait phones & portrait tablets)
        availW = Math.min(voidRightPx - 6, Math.round(w * (w < 560 ? 0.78 : 0.68)));
      } else {
        availW = Math.max(0, Math.round(voidRightPx - maxBoardRightX - 4));
      }
      const availH = Math.max(0, candBottomPx - voidTopPx);

      // Primary fit rewards balanced portrait+modal aspect; tie-breaker claims full unobstructed vertical height
      const aspectFit = Math.min(availW, availH * 0.72);
      const score = aspectFit + availW * 0.02 + availH * 0.025;
      if (score > bestScore) {
        bestScore = score;
        bestVoidW = availW;
        bestVoidH = availH;
      }
    }

    const targetWidthPx = Math.round(bestVoidW * 0.97);
    const targetHeightPx = Math.round(bestVoidH * 0.97);
    const hasVoidSpace = bestVoidW >= 132 && bestVoidH >= 132;

    return {
      voidWidthPx: bestVoidW,
      voidHeightPx: bestVoidH,
      targetWidthPx,
      targetHeightPx,
      hasVoidSpace,
    };
  }

  private emitUpperRightVoid(
    w: number,
    h: number,
    camPos: THREE.Vector3,
    camTarget: THREE.Vector3,
  ): void {
    if (!this.callbacks.onUpperRightVoidChange) return;
    const next = this.computeUpperRightVoid(w, h, camPos, camTarget);
    const prev = this.lastEmittedVoid;
    if (
      prev &&
      prev.hasVoidSpace === next.hasVoidSpace &&
      Math.abs(prev.targetWidthPx - next.targetWidthPx) < 3 &&
      Math.abs(prev.targetHeightPx - next.targetHeightPx) < 3
    ) {
      return;
    }
    this.lastEmittedVoid = next;
    this.callbacks.onUpperRightVoidChange(next);
  }

  private handleResize(): void {
    if (this.disposed || this.webglUnavailable) return;
    const w = Math.max(this.container.clientWidth || window.innerWidth, 1);
    const h = Math.max(this.container.clientHeight || window.innerHeight, 1);
    if (!this.userAdjustedCamera) {
      const pose = this.frameCameraPoseForViewport(this.currentPreset, w, h);
      this.camGoalPos = null;
      this.camGoalTarget = null;
      this.camera.position.copy(pose.pos);
      this.controls.target.copy(pose.target);
      this.controls.update();
      this.emitUpperRightVoid(w, h, pose.pos, pose.target);
    } else {
      const aspect = w / h;
      this.camera.fov =
        aspect < 1.0 ? THREE.MathUtils.clamp(30 + (1.0 - aspect) * 14, 30, 38) : 30;
      this.camera.aspect = aspect;
      if (this.camera.view && this.camera.view.enabled && this.camera.view.fullWidth > 0) {
        const scaledOffX = Math.round((this.camera.view.offsetX / this.camera.view.fullWidth) * w);
        const scaledOffY = Math.round((this.camera.view.offsetY / this.camera.view.fullHeight) * h);
        this.camera.setViewOffset(w, h, scaledOffX, scaledOffY, w, h);
      }
      this.camera.updateProjectionMatrix();
      this.emitUpperRightVoid(w, h, this.camera.position, this.controls.target);
    }
    this.renderer.setSize(w, h);
    this.requestRender();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public requestRender(): void {
    if (this.disposed || this.webglUnavailable) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;

    const scheduleFrame = () => {
      if (this.disposed || this.webglUnavailable) return;
      this.frameId = requestAnimationFrame(() => {
        if (this.disposed || this.webglUnavailable) return;
        this.renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;

        let keepAnimating = false;

        if (this.animations.length > 0) {
          if (this.powerSaveMode) {
            for (const anim of this.animations) {
              anim.obj.position.copy(anim.endPos);
              anim.obj.quaternion.copy(anim.origQuat);
            }
            this.animations = [];
          } else {
            const remaining: ActivePieceAnim[] = [];
            for (const anim of this.animations) {
              anim.elapsed += dt;
              const t = Math.min(1, anim.elapsed / anim.duration);
              const eased = 1 - Math.pow(1 - t, 3);
              anim.obj.position.lerpVectors(anim.startPos, anim.endPos, eased);
              anim.obj.position.y += Math.sin(t * Math.PI) * anim.arcHeight;
              if (anim.strikeLeanRad && anim.strikeLeanAxis) {
                // Subtle forward momentum lean peaking as the attacker sweeps through impact
                const leanAngle = Math.sin(Math.pow(t, 0.85) * Math.PI) * anim.strikeLeanRad;
                _captureQuat.setFromAxisAngle(anim.strikeLeanAxis, leanAngle);
                anim.obj.quaternion.copy(_captureQuat).multiply(anim.origQuat);
              }
              if (t < 1) {
                remaining.push(anim);
                keepAnimating = true;
              } else {
                anim.obj.position.copy(anim.endPos);
                anim.obj.quaternion.copy(anim.origQuat);
              }
            }
            this.animations = remaining;
          }
        }

        if (this.captureSweeps.length > 0) {
          if (this.powerSaveMode) {
            this.finalizeCaptureSweeps();
          } else {
            const remainingSweeps: CaptureSweepAnim[] = [];
            for (const sweep of this.captureSweeps) {
              sweep.elapsed += dt;
              if (sweep.elapsed < sweep.delay) {
                // Wait anchored on square until the attacking piece makes contact
                remainingSweeps.push(sweep);
                keepAnimating = true;
                continue;
              }
              const rawU = Math.min(1, (sweep.elapsed - sweep.delay) / sweep.duration);
              // Brisk push-off that smoothly decelerates as the piece settles into its graveyard slot
              const u = 1 - Math.pow(1 - rawU, 2.35);
              const invU = 1 - u;

              // Quadratic Bezier sweep across XZ from board square -> outward knock -> graveyard slot
              const x =
                invU * invU * sweep.startPos.x +
                2 * invU * u * sweep.controlPos.x +
                u * u * sweep.endPos.x;
              const z =
                invU * invU * sweep.startPos.z +
                2 * invU * u * sweep.controlPos.z +
                u * u * sweep.endPos.z;
              // Smooth elevation clearing the raised walnut board frame before descending to the table tray
              const baseY = THREE.MathUtils.lerp(sweep.startPos.y, sweep.endPos.y, u);
              const liftY = Math.sin(Math.pow(rawU, 0.78) * Math.PI) * sweep.peakLiftY;
              sweep.obj.position.set(x, baseY + liftY, z);

              // Tilt away from the strike and add a graceful mid-air yaw twist that resolves upright at touchdown
              const tiltAngle = Math.sin(Math.pow(rawU, 0.65) * Math.PI) * sweep.maxTiltRad;
              const yawAngle = Math.sin(rawU * Math.PI) * sweep.spinYawRad;
              _captureAxis.copy(sweep.tiltAxis);
              _captureQuat.setFromAxisAngle(_captureAxis, tiltAngle);
              _captureSpinQuat.setFromAxisAngle(_captureUp, yawAngle);
              sweep.obj.quaternion
                .copy(_captureQuat)
                .multiply(_captureSpinQuat)
                .multiply(sweep.origQuat);

              // Smoothly scale from board size (1.0) to graveyard tray scale (0.68)
              const scaleT = THREE.MathUtils.smoothstep(rawU, 0.16, 0.92);
              const s = THREE.MathUtils.lerp(1, sweep.targetScale, scaleT);
              sweep.obj.scale.setScalar(s);

              if (sweep.contactShadow) {
                sweep.contactShadow.visible = rawU <= 0.06 || rawU >= 0.94;
              }

              if (rawU < 1) {
                remainingSweeps.push(sweep);
                keepAnimating = true;
              } else {
                if (sweep.contactShadow) {
                  sweep.contactShadow.visible = true;
                }
                if (sweep.revealGraveyardMesh) {
                  sweep.revealGraveyardMesh.visible = true;
                }
                this.captureSweepGroup.remove(sweep.obj);
              }
            }
            this.captureSweeps = remainingSweeps;
          }
        }

        if (this.camGoalPos && this.camGoalTarget) {
          if (this.powerSaveMode) {
            this.camera.position.copy(this.camGoalPos);
            this.controls.target.copy(this.camGoalTarget);
            this.camGoalPos = null;
            this.camGoalTarget = null;
          } else {
            const lambda = 7.5;
            this.camera.position.x = THREE.MathUtils.damp(
              this.camera.position.x,
              this.camGoalPos.x,
              lambda,
              dt,
            );
            this.camera.position.y = THREE.MathUtils.damp(
              this.camera.position.y,
              this.camGoalPos.y,
              lambda,
              dt,
            );
            this.camera.position.z = THREE.MathUtils.damp(
              this.camera.position.z,
              this.camGoalPos.z,
              lambda,
              dt,
            );

            this.controls.target.x = THREE.MathUtils.damp(
              this.controls.target.x,
              this.camGoalTarget.x,
              lambda,
              dt,
            );
            this.controls.target.y = THREE.MathUtils.damp(
              this.controls.target.y,
              this.camGoalTarget.y,
              lambda,
              dt,
            );
            this.controls.target.z = THREE.MathUtils.damp(
              this.controls.target.z,
              this.camGoalTarget.z,
              lambda,
              dt,
            );

            if (
              this.camera.position.distanceTo(this.camGoalPos) < 0.04 &&
              this.controls.target.distanceTo(this.camGoalTarget) < 0.02
            ) {
              this.camera.position.copy(this.camGoalPos);
              this.controls.target.copy(this.camGoalTarget);
              this.camGoalPos = null;
              this.camGoalTarget = null;
            } else {
              keepAnimating = true;
            }
          }
        }

        if (this.arrowFadeActive) {
          this.arrowFadeElapsed += dt;
          const t = this.powerSaveMode
            ? 1
            : Math.min(1, this.arrowFadeElapsed / Math.max(0.05, this.arrowFadeDuration));
          const alphaScale = 1 - t * t * (3 - 2 * t);
          for (const child of this.arrowGroup.children) {
            const mesh = child as THREE.Mesh;
            const mat = mesh.material as THREE.Material & { opacity: number };
            const base =
              typeof mesh.userData.baseOpacity === 'number' ? mesh.userData.baseOpacity : 0.88;
            mat.opacity = Math.max(0, base * alphaScale);
          }
          if (t < 1) {
            keepAnimating = true;
          } else {
            this.arrowFadeActive = false;
            const doneCb = this.arrowFadeCompleteCb;
            this.arrowFadeCompleteCb = null;
            this.syncArrows([]);
            doneCb?.();
          }
        }

        if (this.treeSweepPhase === 'developing' && this.treeSweepMesh) {
          this.treeVisibleEdgesFloat += this.treeDevelopRateEdgesPerSec * dt;
          const maxAllowed = this.treeFinalized
            ? this.treeSweepTotalEdges
            : Math.max(1, this.treeSweepTotalEdges - 1);
          const vis = this.powerSaveMode
            ? maxAllowed
            : Math.min(maxAllowed, Math.max(1, Math.ceil(this.treeVisibleEdgesFloat)));
          this.treeSweepMesh.geometry.setDrawRange(0, vis * 6);
          (this.treeSweepMesh.material as THREE.LineBasicMaterial).opacity = 0.96;

          if (this.treeFinalized && vis >= this.treeSweepTotalEdges) {
            this.treeSweepPhase = 'holding';
            const devCb = this.treeDevelopedCb;
            this.treeDevelopedCb = null;
            devCb?.();

            if (this.treeHoldDurationSec > 0) {
              this.treeHoldTimer = window.setTimeout(() => {
                this.treeHoldTimer = 0;
                if (this.disposed || this.treeSweepPhase !== 'holding') return;
                this.treeSweepPhase = 'fading';
                this.treeFadeElapsed = 0;
                this.requestRender();
              }, Math.max(50, Math.round(this.treeHoldDurationSec * 1000)));
            }
          } else if (!this.powerSaveMode) {
            keepAnimating = true;
          }
        } else if (this.treeSweepPhase === 'fading' && this.treeSweepMesh) {
          this.treeFadeElapsed += dt;
          const ft = this.powerSaveMode
            ? 1
            : Math.min(1, this.treeFadeElapsed / Math.max(0.05, this.treeFadeDurationSec));
          const mat = this.treeSweepMesh.material as THREE.LineBasicMaterial;
          mat.opacity = Math.max(0, 0.96 * (1 - ft * ft * (3 - 2 * ft)));
          if (ft < 1) {
            keepAnimating = true;
          } else {
            const doneCb = this.treeSweepCompleteCb;
            this.stopSearchTreeThinLines();
            doneCb?.();
          }
        }

        if (this.activeSpeechHighlights.length > 0) {
          const pulse = this.powerSaveMode
            ? 0.65
            : 0.5 - 0.5 * Math.cos((this.speechPulseTime += dt) * 5.0);

          const setSetIntensity = (set: PieceMaterialSet, base: number, amp: number) => {
            const val = base + pulse * amp;
            (set.body as THREE.MeshStandardMaterial).emissiveIntensity = val;
            (set.collar as THREE.MeshStandardMaterial).emissiveIntensity = val * 0.9;
            set.groove.emissiveIntensity = val * 0.65;
          };

          setSetIntensity(this.whiteDangerMats, 0.09, 0.14);
          setSetIntensity(this.blackDangerMats, 0.13, 0.18);
          setSetIntensity(this.whiteAttackerMats, 0.07, 0.12);
          setSetIntensity(this.blackAttackerMats, 0.1, 0.15);

          this.speechDangerRingMat.opacity = 0.58 + pulse * 0.28;
          this.speechDangerDiscMat.opacity = 0.09 + pulse * 0.11;
          this.speechAttackerRingMat.opacity = 0.56 + pulse * 0.28;
          this.speechAttackerDiscMat.opacity = 0.08 + pulse * 0.1;

          const ringScale = this.powerSaveMode ? 1 : 1 + pulse * 0.075;
          for (const child of this.speechHighlightGroup.children) {
            if (child.userData.isSpeechRing) {
              child.scale.set(ringScale, ringScale, 1);
            }
          }

          for (const item of this.activeSpeechHighlights) {
            const entry = this.pieceMap.get(item.square);
            if (!entry) continue;
            const isMoving = this.animations.some((a) => a.obj === entry.group);
            if (!isMoving) {
              entry.group.position.y = this.powerSaveMode
                ? BOARD_TOP_Y
                : BOARD_TOP_Y + pulse * (item.role === 'danger' ? 0.048 : 0.034);
            }
          }

          if (!this.powerSaveMode) {
            keepAnimating = true;
          }
        }

        if (this.updateWildDog(dt)) {
          keepAnimating = true;
        }
        if (this.updateHamsterChase(dt)) {
          keepAnimating = true;
        }

        if (this.controls.update()) {
          keepAnimating = true;
        }

        this.renderer.render(this.scene, this.camera);
        this.lastRenderAtMs = performance.now();

        const done = () => {
          if (this.disposed) return;
          this.renderBusy = false;
          if (this.renderDirty || keepAnimating) {
            this.requestRender();
          }
        };

        if (this.isSoftwareGl) {
          this.afterDraw(done);
        } else {
          done();
        }
      });
    };

    if (this.powerSaveMode && !this.isSoftwareGl) {
      const elapsedSinceLast = performance.now() - this.lastRenderAtMs;
      if (elapsedSinceLast < this.POWER_SAVE_FRAME_INTERVAL_MS) {
        const waitMs = Math.max(1, Math.ceil(this.POWER_SAVE_FRAME_INTERVAL_MS - elapsedSinceLast));
        this.powerSaveTimerId = window.setTimeout(() => {
          this.powerSaveTimerId = 0;
          scheduleFrame();
        }, waitMs);
        return;
      }
    }

    scheduleFrame();
  }

  public dispose(): void {
    this.disposed = true;
    this.stopCalculationPreview(false);
    this.stopSearchTreeThinLines();
    this.stopWildDogRun(false);
    this.stopHamsterChase();
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.clearTimeout(this.powerSaveTimerId);
    this.powerSaveTimerId = 0;
    this.resizeObserver?.disconnect();

    if (this.webglUnavailable || !this.renderer) return;

    this.finalizeCaptureSweeps();
    this.wildDog?.dispose();
    this.wildDog = null;
    this.hamsterGrey?.dispose();
    this.hamsterGrey = null;
    this.hamsterWhite?.dispose();
    this.hamsterWhite = null;

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.boundPointerDown);
    dom.removeEventListener('pointerup', this.boundPointerUp);
    dom.removeEventListener('pointermove', this.boundPointerMove);
    dom.removeEventListener('pointerleave', this.boundPointerLeave);
    dom.removeEventListener('dblclick', this.boundDblClick);
    dom.removeEventListener('webglcontextlost', this.boundContextLost);
    dom.removeEventListener('webglcontextrestored', this.boundContextRestored);

    this.controls.dispose();
    disposePieceGeometryCache(this.pieceGeoCache);
    this.legalQuietGeo.dispose();
    this.legalCaptureGeo.dispose();
    this.legalQuietMat.dispose();
    this.legalCaptureMat.dispose();
    this.speechHaloRingGeo.dispose();
    this.speechHaloDiscGeo.dispose();
    this.speechDangerRingMat.dispose();
    this.speechDangerDiscMat.dispose();
    this.speechAttackerRingMat.dispose();
    this.speechAttackerDiscMat.dispose();

    this.tileGeometries.forEach((g) => g.dispose());
    this.tileGeometries = [];
    this.hitboxGeo?.dispose();
    this.hitboxMat?.dispose();
    this.lightSquareMats.forEach((m) => m.dispose());
    this.darkSquareMats.forEach((m) => m.dispose());
    this.frameMat.dispose();
    this.recessBedMat.dispose();
    this.tableMat.dispose();
    this.whitePieceMats.body.dispose();
    this.whitePieceMats.collar.dispose();
    this.whitePieceMats.groove.dispose();
    this.blackPieceMats.body.dispose();
    this.blackPieceMats.collar.dispose();
    this.blackPieceMats.groove.dispose();
    for (const clonedSet of [
      this.whiteDangerMats,
      this.whiteAttackerMats,
      this.blackDangerMats,
      this.blackAttackerMats,
    ]) {
      clonedSet.body.dispose();
      clonedSet.collar.dispose();
      clonedSet.groove.dispose();
    }
    this.pieceContactShadowMat.dispose();

    this.envTexture?.dispose();

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
