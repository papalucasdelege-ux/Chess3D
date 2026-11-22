import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Chess } from 'chess.js';
import {
  BOARD_SKINS,
  LIGHTING_MOODS,
  createContactShadowTexture,
  createCoordinateLabelTexture,
  createProceduralPbrMaps,
} from './skins';
import {
  buildSculptedPiece,
  createPieceGeometryCache,
  disposePieceGeometryCache,
  type PieceMaterialSet,
} from './pieceFactory';
import type {
  BoardSkinId,
  BotSearchReport,
  CameraPreset,
  LightingMood,
  PieceColor,
  PieceType,
  SearchTreeEdge,
} from '../shared/types';

export interface SuggestionArrow {
  from: string;
  to: string;
  kind: 'primary' | 'secondary' | 'branch' | 'trial-1' | 'trial-2' | 'trial-3';
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
  elapsed: number;
  duration: number;
  arcHeight: number;
}

interface SceneCallbacks {
  onSquareClick: (square: string) => void;
  onTreeSquareClick?: (square: string) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
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
  private overlayGroup = new THREE.Group();
  private arrowGroup = new THREE.Group();
  private treeLineGroup = new THREE.Group();
  private hitboxes: THREE.Mesh[] = [];

  private lightSquareMats: THREE.MeshStandardMaterial[] = [];
  private darkSquareMats: THREE.MeshStandardMaterial[] = [];
  private frameMat!: THREE.MeshStandardMaterial;
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

  // Camera transition state
  private camGoalPos: THREE.Vector3 | null = null;
  private camGoalTarget: THREE.Vector3 | null = null;

  // Interaction
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private hoveredSquare: string | null = null;
  private lastHoverRaycastTime = 0;

  // Render scheduling (on-demand + software GL fence pacing)
  private frameId = 0;
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

    // 3. Camera & OrbitControls
    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 140);
    this.camera.position.set(0, 11.4, 13.0);
    this.applyCameraResponsiveFraming(width, height);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.25, 0);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 8.2;
    this.controls.maxDistance = 26.0;
    this.controls.minPolarAngle = 0.14;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.12;

    this.controls.addEventListener('start', () => {
      this.camGoalPos = null;
      this.camGoalTarget = null;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    // 4. Crisp architectural studio lighting for sharply defined cast piece silhouettes
    const mood = LIGHTING_MOODS[initialMood];
    this.keyLight = new THREE.DirectionalLight(mood.keyColor, mood.keyIntensity);
    this.keyLight.position.set(8.4, 7.4, 5.4);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = this.enableShadows;
    if (this.enableShadows) {
      this.keyLight.shadow.mapSize.set(4096, 4096);
      this.keyLight.shadow.camera.near = 4.6;
      this.keyLight.shadow.camera.far = 19.6;
      this.keyLight.shadow.camera.left = -6.5;
      this.keyLight.shadow.camera.right = 6.5;
      this.keyLight.shadow.camera.top = 5.6;
      this.keyLight.shadow.camera.bottom = -4.3;
      this.keyLight.shadow.bias = -0.00008;
      this.keyLight.shadow.normalBias = 0.002;
      this.keyLight.shadow.radius = 0;
    }
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
    this.scene.add(
      this.boardGroup,
      this.coordGroup,
      this.overlayGroup,
      this.pieceGroup,
      this.capturedGroup,
      this.treeLineGroup,
      this.arrowGroup,
    );
    this.rebuildCoordinates(skin.coordTextColor);

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
    this.boundContextLost = (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.frameId);
      window.clearTimeout(this.frameId);
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
    dom.addEventListener('webglcontextlost', this.boundContextLost);
    dom.addEventListener('webglcontextrestored', this.boundContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.requestRender();
  }

  private buildSkinTextures(skin: (typeof BOARD_SKINS)[BoardSkinId]) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    const lightVariants = [11, 23, 37, 53].map((seed) =>
      createProceduralPbrMaps(
        skin.lightSquare.baseHex,
        skin.lightSquare.grainHex,
        skin.lightSquare.pattern,
        seed,
        maxAniso,
        { size: 512, tileSeam: true },
      ),
    );

    const darkVariants = [29, 43, 61, 79].map((seed) =>
      createProceduralPbrMaps(
        skin.darkSquare.baseHex,
        skin.darkSquare.grainHex,
        skin.darkSquare.pattern,
        seed,
        maxAniso,
        { size: 512, tileSeam: true },
      ),
    );

    const framePbr = createProceduralPbrMaps(
      skin.frameBaseHex,
      skin.frameGrainHex,
      skin.framePattern,
      47,
      maxAniso,
      { size: 512, tileSeam: false },
    );
    framePbr.map.repeat.set(3, 3);
    framePbr.bumpMap.repeat.set(3, 3);
    framePbr.roughnessMap.repeat.set(3, 3);

    const whitePieceHex = `#${skin.whitePiece.color.toString(16).padStart(6, '0')}`;
    const blackPieceHex = `#${skin.blackPiece.color.toString(16).padStart(6, '0')}`;

    const whitePiecePbr = createProceduralPbrMaps(
      whitePieceHex,
      '#b28d60',
      'wood',
      101,
      maxAniso,
      { size: 512, tileSeam: false, rotateQuarter: true, grainContrast: 0.75, smoothTurned: true },
    );
    const blackPiecePbr = createProceduralPbrMaps(
      blackPieceHex,
      '#100906',
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
      opacity: this.enableShadows ? 0.22 : 0.48,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const bumpAmount = 0.016;

    // Mobile fallback: MeshStandardMaterial on Android/iOS; MeshPhysicalMaterial on PC
    this.lightSquareMats = lightVariants.map((v, idx) =>
      this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: idx % 2 === 0 ? 0xffffff : 0xfbf8f2,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.lightSquare.roughness,
            metalness: skin.lightSquare.metalness,
            envMapIntensity: skin.boardEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: idx % 2 === 0 ? 0xffffff : 0xfbf8f2,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.lightSquare.roughness,
            metalness: skin.lightSquare.metalness,
            clearcoat: skin.lightSquare.clearcoat,
            clearcoatRoughness: 0.42,
            envMapIntensity: skin.boardEnvIntensity,
          }),
    );

    this.darkSquareMats = darkVariants.map((v, idx) =>
      this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: idx % 2 === 0 ? 0xffffff : 0xf7f3ed,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.darkSquare.roughness,
            metalness: skin.darkSquare.metalness,
            envMapIntensity: skin.boardEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: idx % 2 === 0 ? 0xffffff : 0xf7f3ed,
            map: v.map,
            bumpMap: v.bumpMap,
            bumpScale: bumpAmount,
            roughnessMap: v.roughnessMap,
            roughness: skin.darkSquare.roughness,
            metalness: skin.darkSquare.metalness,
            clearcoat: skin.darkSquare.clearcoat,
            clearcoatRoughness: 0.42,
            envMapIntensity: skin.boardEnvIntensity,
          }),
    );

    this.frameMat = new THREE.MeshStandardMaterial({
      color: skin.frameColor,
      map: framePbr.map,
      bumpMap: framePbr.bumpMap,
      bumpScale: 0.018,
      roughnessMap: framePbr.roughnessMap,
      roughness: skin.frameRoughness,
      metalness: skin.frameMetalness,
      envMapIntensity: skin.boardEnvIntensity,
    });

    this.tableMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      toneMapped: false,
    });

    const whiteGrooveColor = new THREE.Color(skin.whitePiece.collarColor).multiplyScalar(0.52);
    const blackGrooveColor = new THREE.Color(skin.blackPiece.collarColor).multiplyScalar(0.55);
    const whitePieceSpec = 0.45;
    const whiteEnvIntensity = skin.pieceEnvIntensity * 0.85;

    this.whitePieceMats = {
      body: this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: 0xffffff,
            vertexColors: true,
            map: whitePiecePbr.map,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.002,
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
            bumpScale: 0.002,
            roughnessMap: whitePiecePbr.roughnessMap,
            roughness: skin.whitePiece.roughness,
            metalness: skin.whitePiece.metalness,
            clearcoat: skin.whitePiece.clearcoat,
            clearcoatRoughness: 0.2,
            specularIntensity: whitePieceSpec,
            envMapIntensity: whiteEnvIntensity,
          }),
      collar: this.isMobileDevice
        ? new THREE.MeshStandardMaterial({
            color: skin.whitePiece.collarColor,
            vertexColors: true,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.0015,
            roughness: skin.whitePiece.collarRoughness,
            metalness: skin.whitePiece.collarMetalness,
            envMapIntensity: whiteEnvIntensity,
          })
        : new THREE.MeshPhysicalMaterial({
            color: skin.whitePiece.collarColor,
            vertexColors: true,
            bumpMap: whitePiecePbr.bumpMap,
            bumpScale: 0.0015,
            roughness: skin.whitePiece.collarRoughness,
            metalness: skin.whitePiece.collarMetalness,
            clearcoat: skin.whitePiece.clearcoat,
            clearcoatRoughness: 0.22,
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

    // Reuses shared procedural wood textures (zero extra CanvasTextures) and respects mobile MeshStandardMaterial
    this.whiteDangerMats = clonePieceMatsWithEmissive(this.whitePieceMats, 0xff3b2f, 0.55);
    this.whiteAttackerMats = clonePieceMatsWithEmissive(this.whitePieceMats, 0xfbbf24, 0.46);
    this.blackDangerMats = clonePieceMatsWithEmissive(this.blackPieceMats, 0xff453a, 0.68);
    this.blackAttackerMats = clonePieceMatsWithEmissive(this.blackPieceMats, 0xfbbf24, 0.56);
  }

  private buildTableAndBoard(): void {
    const tableGeo = new THREE.CylinderGeometry(28, 28, 0.5, 64);
    const table = new THREE.Mesh(tableGeo, this.tableMat);
    table.position.y = -0.54;
    table.receiveShadow = false;
    this.boardGroup.add(table);

    const shadowTex = createContactShadowTexture();
    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(11.8, 11.8),
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

    const half = 4.44;
    const cornerR = 0.08;
    const slabShape = new THREE.Shape();
    slabShape.moveTo(-half + cornerR, -half);
    slabShape.lineTo(half - cornerR, -half);
    slabShape.quadraticCurveTo(half, -half, half, -half + cornerR);
    slabShape.lineTo(half, half - cornerR);
    slabShape.quadraticCurveTo(half, half, half - cornerR, half);
    slabShape.lineTo(-half + cornerR, half);
    slabShape.quadraticCurveTo(-half, half, -half, half - cornerR);
    slabShape.lineTo(-half, -half + cornerR);
    slabShape.quadraticCurveTo(-half, -half, -half + cornerR, -half);

    const slabGeo = new THREE.ExtrudeGeometry(slabShape, {
      depth: 0.27,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.035,
      bevelSegments: 3,
    });
    slabGeo.rotateX(Math.PI / 2);
    const uvAttr = slabGeo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) / 9.2 + 0.5, uvAttr.getY(i) / 9.2 + 0.5);
    }
    uvAttr.needsUpdate = true;
    slabGeo.computeVertexNormals();

    const mainSlab = new THREE.Mesh(slabGeo, this.frameMat);
    mainSlab.position.y = 0.025;
    mainSlab.castShadow = this.enableShadows;
    mainSlab.receiveShadow = this.enableShadows;
    this.boardGroup.add(mainSlab);

    const tileGeo = new THREE.BoxGeometry(0.998, 0.12, 0.998);
    const hitboxGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = `${FILES[file]}${RANKS[rank]}`;
        const isLight = (file + rank) % 2 === 1;
        const x = file - 3.5;
        const z = 3.5 - rank;
        const variantIdx = (file * 3 + rank * 5) % 4;

        const tile = new THREE.Mesh(
          tileGeo,
          isLight ? this.lightSquareMats[variantIdx] : this.darkSquareMats[variantIdx],
        );
        tile.position.set(x, 0, z);
        if ((file + rank) % 4 === 0) tile.rotation.y = Math.PI;
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

  private rebuildCoordinates(textColor: string): void {
    while (this.coordGroup.children.length > 0) {
      const child = this.coordGroup.children[0] as THREE.Mesh;
      this.coordGroup.remove(child);
      child.geometry.dispose();
      const mat = child.material as THREE.MeshBasicMaterial;
      mat.dispose();
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const plaqueGeo = new THREE.PlaneGeometry(0.36, 0.36);

    const placePlaque = (label: string, x: number, z: number, rotZ: number) => {
      const tex = createCoordinateLabelTexture(label, textColor, maxAniso);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const mesh = new THREE.Mesh(plaqueGeo.clone(), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = rotZ;
      mesh.position.set(x, 0.068, z);
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

  public setCameraPreset(preset: CameraPreset): void {
    if (this.webglUnavailable) return;
    const pos = new THREE.Vector3();
    const target = new THREE.Vector3(0, 0.25, 0);
    switch (preset) {
      case 'white':
        pos.set(0, 11.4, 13.0);
        break;
      case 'black':
        pos.set(0, 11.4, -13.0);
        break;
      case 'top':
        pos.set(0, 18.8, 0.7);
        target.set(0, 0, 0);
        break;
      case 'cinematic':
        pos.set(11.6, 8.2, 10.0);
        target.set(0, 0.35, 0);
        break;
    }
    this.camGoalPos = pos;
    this.camGoalTarget = target;
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

    const branches = report.triedLines
      .filter((l) => l.pvUci.length > 0)
      .slice(0, 3);
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

      this.syncPieces(report.rootFen, null);
      const chosenHint =
        report.bestMoveUci && report.bestMoveUci.length >= 4
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
        this.arrowFadeDuration = 0.9;
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
      }, 1250);
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
      const pvSanSlice = line.pvSan.slice(0, 4);
      const snapshotBeforeBranch = [...completedTrialArrows];

      // Reset pieces to rootFen at the start of this branch while keeping prior branch arrows visible
      this.syncPieces(report.rootFen, null);
      this.lastFromPlate.visible = false;
      this.lastToPlate.visible = false;
      this.syncArrows(snapshotBeforeBranch);
      callbacks?.onBranchChange?.(branchIdx + 1, branches.length, pvSanSlice, false);
      this.requestRender();

      let delayMs = 700;
      const sim = new Chess(report.rootFen);

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
                  opacityScale: 0.65,
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
      // - For Branch 1 and Branch 2 (when another branch follows), pause & wait for player's click confirmation!
      // - For the final branch, pause 1.2s so the final board position is clear, then settle & fade.
      const endOfBranchTimer = window.setTimeout(() => {
        if (this.disposed || !this.calcPreviewActive) return;
        if (branchIdx < branches.length - 1) {
          this.calcWaitingForClick = true;
          this.calcNextBranchFn = () => runBranch(branchIdx + 1);
          callbacks?.onBranchChange?.(branchIdx + 1, branches.length, pvSanSlice, true);
          callbacks?.onWaitForBranchConfirm?.(branchIdx + 1, branches.length, pvSanSlice);
          this.requestRender();
        } else {
          const finalSettleTimer = window.setTimeout(() => {
            finishAllBranches();
          }, 1200);
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
        c.setHex(0xfff099);
      } else if (edge.ply === 0) {
        c.setHex(0xf4c45a);
      } else if (edge.ply === 1) {
        c.setHex(0x38bdf8);
      } else if (edge.ply === 2) {
        c.setHex(0xa78bfa);
      } else {
        c.setHex(0xfb7185);
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
        const boost = v === 0 ? 0.74 : 1.0;
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
      mat.opacity = 0.88;
    } else {
      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.LineSegments(geo, mat);
      mesh.renderOrder = 5;
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
      mat.opacity = opts.treeOpacity ?? 0.88;
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

  private syncPieces(
    fen: string,
    movedHint: { from: string; to: string } | null,
    durationOverrideSec?: number,
  ): void {
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
    if (movedHint) {
      const movingExisting = this.pieceMap.get(movedHint.from);
      const targetSpec = desired.get(movedHint.to);
      if (movingExisting && targetSpec && movingExisting.color === targetSpec.color) {
        const victim = this.pieceMap.get(movedHint.to);
        if (victim) {
          this.pieceGroup.remove(victim.group);
          this.pieceMap.delete(movedHint.to);
        }
        this.pieceMap.delete(movedHint.from);

        if (movingExisting.type === targetSpec.type) {
          this.pieceMap.set(movedHint.to, movingExisting);
          animatedMovedObj = movingExisting.group;
          const endPos = squareToWorld(movedHint.to);
          const startPos = movingExisting.group.position.clone();
          const isKnight = movingExisting.type === 'n';
          const baseDur = durationOverrideSec ?? 0.25;
          this.animations = this.animations.filter((a) => a.obj !== movingExisting.group);
          this.animations.push({
            obj: movingExisting.group,
            startPos,
            endPos,
            elapsed: 0,
            duration: isKnight ? baseDur * 1.2 : baseDur,
            arcHeight: isKnight ? 1.15 : 0.28,
          });
        } else {
          this.pieceGroup.remove(movingExisting.group);
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

    this.rebuildCapturedTrays(counts);
  }

  private rebuildCapturedTrays(onBoardCounts: Record<PieceColor, Record<PieceType, number>>): void {
    while (this.capturedGroup.children.length > 0) {
      this.capturedGroup.remove(this.capturedGroup.children[0]);
    }
    const startCounts: Record<PieceType, number> = { q: 1, r: 2, b: 2, n: 2, p: 8, k: 1 };
    const order: PieceType[] = ['q', 'r', 'b', 'n', 'p'];

    (['w', 'b'] as PieceColor[]).forEach((color) => {
      const missing: PieceType[] = [];
      for (const type of order) {
        const diff = Math.max(0, startCounts[type] - onBoardCounts[color][type]);
        for (let i = 0; i < diff; i++) missing.push(type);
      }

      const mats = color === 'w' ? this.whitePieceMats : this.blackPieceMats;
      const sideSign = color === 'w' ? 1 : -1;

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
        this.capturedGroup.add(piece);
      });
    });
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

      // Flat 2D arrow flush on the chessboard surface (no 3D extrusion)
      const arrowY = BOARD_TOP_Y + 0.025 + idx * 0.002;
      const tailOffset = 0.14;
      const tipDist = Math.max(0.32, dist - 0.06);
      const headLen = Math.min(0.38, Math.max(0.24, (tipDist - tailOffset) * 0.42));
      const neckDist = Math.max(tailOffset + 0.06, tipDist - headLen);
      const halfShaft = 0.082;
      const halfHead = 0.22;

      const palette =
        arrow.kind === 'trial-1'
          ? { color: 0xf4c45a, opacity: 0.9 }
          : arrow.kind === 'trial-2'
            ? { color: 0x38bdf8, opacity: 0.9 }
            : arrow.kind === 'trial-3'
              ? { color: 0xfb7185, opacity: 0.9 }
              : arrow.kind === 'primary'
                ? { color: 0xeac067, opacity: 0.88 }
                : arrow.kind === 'branch'
                  ? { color: 0xf5d487, opacity: 0.84 }
                  : { color: 0x38bdf8, opacity: 0.86 };

      const baseOpacity = palette.opacity * (arrow.opacityScale ?? 1);

      const shape = new THREE.Shape();
      shape.moveTo(-halfShaft, -tailOffset);
      shape.lineTo(-halfShaft, -neckDist);
      shape.lineTo(-halfHead, -neckDist);
      shape.lineTo(0, -tipDist);
      shape.lineTo(halfHead, -neckDist);
      shape.lineTo(halfShaft, -neckDist);
      shape.lineTo(halfShaft, -tailOffset);
      shape.closePath();

      const arrowGeo = new THREE.ShapeGeometry(shape);
      // Rotate flat onto the XZ board plane so -Y in 2D shape points along +Z toward target square
      arrowGeo.rotateX(-Math.PI / 2);

      const arrowMat = new THREE.MeshBasicMaterial({
        color: arrow.customColorHex ?? palette.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3 - idx,
        polygonOffsetUnits: -3 - idx,
      });

      const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
      arrowMesh.userData.baseOpacity = baseOpacity;
      arrowMesh.renderOrder = 6 + idx;
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
    if (now - this.lastHoverRaycastTime < 40) return;
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

  private applyCameraResponsiveFraming(w: number, h: number): void {
    const aspect = w / h;
    // Keep all 8 files + board rim comfortably inside narrow portrait viewports
    const minAspectForFullBoard = 1.24;
    if (aspect < minAspectForFullBoard) {
      const baseHalfRad = THREE.MathUtils.degToRad(15); // half of 30° desktop vertical FOV
      const scaledTan = Math.tan(baseHalfRad) * (minAspectForFullBoard / Math.max(0.38, aspect));
      this.camera.fov = Math.min(64, THREE.MathUtils.radToDeg(2 * Math.atan(scaledTan)));
    } else {
      this.camera.fov = 30;
    }

    this.camera.aspect = aspect;

    // On mobile devices (< 768px portrait or <= 540px landscape), offset optical center away from the
    // micro top-right Chess Angel portrait & modal so 100% of the 3D board remains unobstructed.
    if (w < 768 && w < h) {
      // Portrait mobile: shift rendered board downward into the open lower-middle zone
      const yShiftPx = -Math.round(h * 0.115);
      this.camera.setViewOffset(w, h, 0, yShiftPx, w, h);
    } else if (h <= 540 && w >= h) {
      // Landscape mobile: shift rendered board slightly left of the top-right micro modal
      const xShiftPx = Math.round(w * 0.105);
      this.camera.setViewOffset(w, h, xShiftPx, 0, w, h);
    } else {
      this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
    }
  }

  private handleResize(): void {
    if (this.disposed || this.webglUnavailable) return;
    const w = Math.max(this.container.clientWidth || window.innerWidth, 1);
    const h = Math.max(this.container.clientHeight || window.innerHeight, 1);
    this.applyCameraResponsiveFraming(w, h);
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
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed || this.webglUnavailable) return;
      this.renderDirty = false;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;

      let keepAnimating = false;

      if (this.animations.length > 0) {
        const remaining: ActivePieceAnim[] = [];
        for (const anim of this.animations) {
          anim.elapsed += dt;
          const t = Math.min(1, anim.elapsed / anim.duration);
          const eased = 1 - Math.pow(1 - t, 3);
          anim.obj.position.lerpVectors(anim.startPos, anim.endPos, eased);
          anim.obj.position.y += Math.sin(t * Math.PI) * anim.arcHeight;
          if (t < 1) {
            remaining.push(anim);
            keepAnimating = true;
          } else {
            anim.obj.position.copy(anim.endPos);
          }
        }
        this.animations = remaining;
      }

      if (this.camGoalPos && this.camGoalTarget) {
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

      if (this.arrowFadeActive) {
        this.arrowFadeElapsed += dt;
        const t = Math.min(1, this.arrowFadeElapsed / Math.max(0.05, this.arrowFadeDuration));
        const alphaScale = 1 - t * t * (3 - 2 * t);
        for (const child of this.arrowGroup.children) {
          const mesh = child as THREE.Mesh;
          const mat = mesh.material as THREE.Material & { opacity: number };
          const base = typeof mesh.userData.baseOpacity === 'number' ? mesh.userData.baseOpacity : 0.88;
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
        const vis = Math.min(maxAllowed, Math.max(1, Math.ceil(this.treeVisibleEdgesFloat)));
        this.treeSweepMesh.geometry.setDrawRange(0, vis * 6);
        (this.treeSweepMesh.material as THREE.LineBasicMaterial).opacity = 0.88;

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
        } else {
          keepAnimating = true;
        }
      } else if (this.treeSweepPhase === 'fading' && this.treeSweepMesh) {
        this.treeFadeElapsed += dt;
        const ft = Math.min(1, this.treeFadeElapsed / Math.max(0.05, this.treeFadeDurationSec));
        const mat = this.treeSweepMesh.material as THREE.LineBasicMaterial;
        mat.opacity = Math.max(0, 0.88 * (1 - ft * ft * (3 - 2 * ft)));
        if (ft < 1) {
          keepAnimating = true;
        } else {
          const doneCb = this.treeSweepCompleteCb;
          this.stopSearchTreeThinLines();
          doneCb?.();
        }
      }

      if (this.activeSpeechHighlights.length > 0) {
        this.speechPulseTime += dt;
        const pulse = 0.5 - 0.5 * Math.cos(this.speechPulseTime * 5.0);

        const setSetIntensity = (set: PieceMaterialSet, base: number, amp: number) => {
          const val = base + pulse * amp;
          (set.body as THREE.MeshStandardMaterial).emissiveIntensity = val;
          (set.collar as THREE.MeshStandardMaterial).emissiveIntensity = val * 0.9;
          set.groove.emissiveIntensity = val * 0.65;
        };

        setSetIntensity(this.whiteDangerMats, 0.38, 0.52);
        setSetIntensity(this.blackDangerMats, 0.48, 0.58);
        setSetIntensity(this.whiteAttackerMats, 0.3, 0.44);
        setSetIntensity(this.blackAttackerMats, 0.38, 0.5);

        this.speechDangerRingMat.opacity = 0.66 + pulse * 0.32;
        this.speechDangerDiscMat.opacity = 0.14 + pulse * 0.18;
        this.speechAttackerRingMat.opacity = 0.64 + pulse * 0.32;
        this.speechAttackerDiscMat.opacity = 0.12 + pulse * 0.15;

        const ringScale = 1 + pulse * 0.075;
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
            entry.group.position.y =
              BOARD_TOP_Y + pulse * (item.role === 'danger' ? 0.048 : 0.034);
          }
        }

        keepAnimating = true;
      }

      if (this.controls.update()) {
        keepAnimating = true;
      }

      this.renderer.render(this.scene, this.camera);

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
  }

  public dispose(): void {
    this.disposed = true;
    this.stopCalculationPreview(false);
    this.stopSearchTreeThinLines();
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver?.disconnect();

    if (this.webglUnavailable || !this.renderer) return;

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.boundPointerDown);
    dom.removeEventListener('pointerup', this.boundPointerUp);
    dom.removeEventListener('pointermove', this.boundPointerMove);
    dom.removeEventListener('pointerleave', this.boundPointerLeave);
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

    this.lightSquareMats.forEach((m) => m.dispose());
    this.darkSquareMats.forEach((m) => m.dispose());
    this.frameMat.dispose();
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
