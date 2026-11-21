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
  CameraPreset,
  LightingMood,
  PieceColor,
  PieceType,
} from '../shared/types';

export interface SceneVisualState {
  fen: string;
  selectedSquare: string | null;
  legalTargets: { square: string; isCapture: boolean }[];
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  bestMoveArrow: { from: string; to: string } | null;
  showCoordinates: boolean;
}

interface ActivePieceAnim {
  obj: THREE.Group;
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  elapsed: number;
  duration: number;
  arcHeight: number;
  removeAfter?: boolean;
}

interface SceneCallbacks {
  onSquareClick: (square: string) => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const BOARD_TOP_Y = 0.06;

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
    const gl = canvas.getContext('webgl2');
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

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envTexture: THREE.Texture;

  // Lights
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;

  // Board & materials
  private currentSkinId: BoardSkinId = 'walnut-maple';
  private currentMood: LightingMood = 'warm-studio';
  private boardGroup = new THREE.Group();
  private coordGroup = new THREE.Group();
  private pieceGroup = new THREE.Group();
  private capturedGroup = new THREE.Group();
  private overlayGroup = new THREE.Group();
  private arrowGroup = new THREE.Group();
  private hitboxes: THREE.Mesh[] = [];

  private lightSquareMats: THREE.MeshPhysicalMaterial[] = [];
  private darkSquareMats: THREE.MeshPhysicalMaterial[] = [];
  private frameMat!: THREE.MeshStandardMaterial;
  private tableMat!: THREE.MeshStandardMaterial;
  private whitePieceMats!: PieceMaterialSet;
  private blackPieceMats!: PieceMaterialSet;
  private pieceContactShadowMat!: THREE.MeshBasicMaterial;
  private skinTextures: THREE.Texture[] = [];
  private ownedTextures: THREE.Texture[] = [];

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
  private resizeObserver: ResizeObserver;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerLeave: () => void;
  private boundContextLost: (e: Event) => void;
  private boundContextRestored: () => void;

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

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHTING_MOODS[initialMood].exposure;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Studio Environment
    this.scene = new THREE.Scene();
    const skin = BOARD_SKINS[initialSkin];
    this.scene.background = new THREE.Color(skin.sceneBg);
    this.scene.fog = new THREE.FogExp2(skin.fogColor, 0.022);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmrem.dispose();

    // 3. Camera & OrbitControls (natural ~60mm studio lens FOV 30 minimizes near/far piece size distortion)
    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 140);
    this.camera.position.set(0, 11.4, 13.0);

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
      // Cancel scripted camera transition immediately when user takes control
      this.camGoalPos = null;
      this.camGoalTarget = null;
    });
    this.controls.addEventListener('change', () => {
      this.requestRender();
    });

    // 4. Raking 3-point studio lighting calibrated for crisp, unmistakable piece shadows
    const mood = LIGHTING_MOODS[initialMood];
    this.keyLight = new THREE.DirectionalLight(mood.keyColor, mood.keyIntensity);
    this.keyLight.position.set(9.4, 6.4, 5.2);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    const shadowRes = this.isSoftwareGl ? 1024 : 2048;
    this.keyLight.shadow.mapSize.set(shadowRes, shadowRes);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 28;
    const d = 7.4;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.00025;
    this.keyLight.shadow.normalBias = 0.014;
    this.keyLight.shadow.radius = 2.4;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.hemiLight = new THREE.HemisphereLight(mood.hemiSky, mood.hemiGround, mood.hemiIntensity);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(mood.rimColor, mood.rimIntensity);
    this.rimLight.position.set(-7.5, 6.2, -8.5);
    this.scene.add(this.rimLight);

    // 5. Build materials, board architecture, overlays, and raycast hitboxes
    this.initMaterials(skin);
    this.buildTableAndBoard();
    this.buildOverlays();
    this.scene.add(this.boardGroup, this.coordGroup, this.overlayGroup, this.pieceGroup, this.capturedGroup, this.arrowGroup);
    this.rebuildCoordinates(skin.coordTextColor);

    this.raycaster.layers.set(1);

    // Pre-warm shaders on hardware GPUs
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 6. Listeners
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
    const newTex: THREE.Texture[] = [];

    // 4 subtle organic grain variants for light squares and 4 for dark squares so no tiles look cloned
    const lightVariants = [11, 23, 37, 53].map((seed) => {
      const pbr = createProceduralPbrMaps(
        skin.lightSquare.baseHex,
        skin.lightSquare.grainHex,
        skin.lightSquare.pattern,
        seed,
        maxAniso,
        { size: 512, tileSeam: true },
      );
      newTex.push(pbr.map, pbr.bumpMap, pbr.roughnessMap);
      return pbr;
    });

    const darkVariants = [29, 43, 61, 79].map((seed) => {
      const pbr = createProceduralPbrMaps(
        skin.darkSquare.baseHex,
        skin.darkSquare.grainHex,
        skin.darkSquare.pattern,
        seed,
        maxAniso,
        { size: 512, tileSeam: true },
      );
      newTex.push(pbr.map, pbr.bumpMap, pbr.roughnessMap);
      return pbr;
    });

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
    newTex.push(framePbr.map, framePbr.bumpMap, framePbr.roughnessMap);

    // Subtle organic wood/stone micro-grain on the carved pieces themselves
    const whitePieceHex = `#${skin.whitePiece.color.toString(16).padStart(6, '0')}`;
    const blackPieceHex = `#${skin.blackPiece.color.toString(16).padStart(6, '0')}`;
    const whitePieceGrain = skin.id === 'walnut-maple' ? '#a4865e' : '#d2d4d8';
    const blackPieceGrain = skin.id === 'walnut-maple' ? '#120904' : '#101216';
    const piecePattern = skin.id === 'walnut-maple' ? 'wood' : skin.lightSquare.pattern;

    const whitePiecePbr = createProceduralPbrMaps(
      whitePieceHex,
      whitePieceGrain,
      piecePattern,
      101,
      maxAniso,
      { size: 256, tileSeam: false },
    );
    const blackPiecePbr = createProceduralPbrMaps(
      blackPieceHex,
      blackPieceGrain,
      piecePattern,
      131,
      maxAniso,
      { size: 256, tileSeam: false },
    );
    // Orient wood grain vertically along the lathe axis like real hand-turned hardwood billets
    for (const pbr of [whitePiecePbr, blackPiecePbr]) {
      for (const tex of [pbr.map, pbr.bumpMap, pbr.roughnessMap]) {
        tex.center.set(0.5, 0.5);
        tex.rotation = Math.PI / 2;
      }
    }
    newTex.push(
      whitePiecePbr.map,
      whitePiecePbr.bumpMap,
      whitePiecePbr.roughnessMap,
      blackPiecePbr.map,
      blackPiecePbr.bumpMap,
      blackPiecePbr.roughnessMap,
    );

    return { lightVariants, darkVariants, framePbr, whitePiecePbr, blackPiecePbr, newTex };
  }

  private initMaterials(skin: (typeof BOARD_SKINS)[BoardSkinId]): void {
    const { lightVariants, darkVariants, framePbr, whitePiecePbr, blackPiecePbr, newTex } =
      this.buildSkinTextures(skin);
    this.skinTextures = newTex;

    const pieceAoTex = createContactShadowTexture();
    this.ownedTextures.push(pieceAoTex);

    this.pieceContactShadowMat = new THREE.MeshBasicMaterial({
      map: pieceAoTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.52,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const bumpAmount = skin.lightSquare.pattern === 'wood' ? 0.016 : 0.008;

    this.lightSquareMats = lightVariants.map(
      (v, idx) =>
        new THREE.MeshPhysicalMaterial({
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
          transparent: Boolean(skin.glassMode && !this.isSoftwareGl),
          opacity: skin.glassMode ? 0.92 : 1,
        }),
    );

    this.darkSquareMats = darkVariants.map(
      (v, idx) =>
        new THREE.MeshPhysicalMaterial({
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
          transparent: Boolean(skin.glassMode && !this.isSoftwareGl),
          opacity: skin.glassMode ? 0.94 : 1,
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

    this.tableMat = new THREE.MeshStandardMaterial({
      color: 0x020202,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.0,
    });

    const whiteGrooveColor = new THREE.Color(skin.whitePiece.collarColor).multiplyScalar(0.62);
    const blackGrooveColor = new THREE.Color(skin.blackPiece.collarColor).multiplyScalar(0.55);
    const pieceSpec = skin.id === 'walnut-maple' ? 0.22 : 0.85;

    this.whitePieceMats = {
      body: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: whitePiecePbr.map,
        bumpMap: whitePiecePbr.bumpMap,
        bumpScale: 0.011,
        roughnessMap: whitePiecePbr.roughnessMap,
        roughness: skin.whitePiece.roughness,
        metalness: skin.whitePiece.metalness,
        clearcoat: skin.whitePiece.clearcoat,
        clearcoatRoughness: 0.4,
        specularIntensity: pieceSpec,
        envMapIntensity: skin.pieceEnvIntensity,
      }),
      collar: new THREE.MeshPhysicalMaterial({
        color: skin.whitePiece.collarColor,
        bumpMap: whitePiecePbr.bumpMap,
        bumpScale: 0.008,
        roughness: skin.whitePiece.collarRoughness,
        metalness: skin.whitePiece.collarMetalness,
        clearcoat: skin.whitePiece.clearcoat,
        specularIntensity: pieceSpec,
        envMapIntensity: skin.pieceEnvIntensity,
      }),
      groove: new THREE.MeshStandardMaterial({
        color: whiteGrooveColor,
        roughness: 0.94,
        metalness: 0.0,
        envMapIntensity: 0.06,
      }),
      contactShadow: this.pieceContactShadowMat,
    };

    this.blackPieceMats = {
      body: new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: blackPiecePbr.map,
        bumpMap: blackPiecePbr.bumpMap,
        bumpScale: 0.011,
        roughnessMap: blackPiecePbr.roughnessMap,
        roughness: skin.blackPiece.roughness,
        metalness: skin.blackPiece.metalness,
        clearcoat: skin.blackPiece.clearcoat,
        clearcoatRoughness: 0.4,
        specularIntensity: pieceSpec,
        envMapIntensity: skin.pieceEnvIntensity,
      }),
      collar: new THREE.MeshPhysicalMaterial({
        color: skin.blackPiece.collarColor,
        bumpMap: blackPiecePbr.bumpMap,
        bumpScale: 0.008,
        roughness: skin.blackPiece.collarRoughness,
        metalness: skin.blackPiece.collarMetalness,
        clearcoat: skin.blackPiece.clearcoat,
        specularIntensity: pieceSpec,
        envMapIntensity: skin.pieceEnvIntensity,
      }),
      groove: new THREE.MeshStandardMaterial({
        color: blackGrooveColor,
        roughness: 0.94,
        metalness: 0.0,
        envMapIntensity: 0.06,
      }),
      contactShadow: this.pieceContactShadowMat,
    };
  }

  private buildTableAndBoard(): void {
    // Broad physical tabletop extending seamlessly into soft horizon fog
    const tableGeo = new THREE.CylinderGeometry(28, 28, 0.5, 64);
    const table = new THREE.Mesh(tableGeo, this.tableMat);
    table.position.y = -0.54;
    table.receiveShadow = true;
    this.boardGroup.add(table);

    // Soft contact shadow plane directly beneath the single wooden slab
    const shadowTex = createContactShadowTexture();
    this.ownedTextures.push(shadowTex);
    const contactPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(11.8, 11.8),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.62,
      }),
    );
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = -0.285;
    this.boardGroup.add(contactPlane);

    // Single clean, gently beveled solid-wood tournament board slab (no second outer border)
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
    // Normalize UVs on top face so wood grain maps cleanly across the board frame
    const uvAttr = slabGeo.attributes.uv;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) / 9.2 + 0.5, uvAttr.getY(i) / 9.2 + 0.5);
    }
    uvAttr.needsUpdate = true;
    slabGeo.computeVertexNormals();

    const mainSlab = new THREE.Mesh(slabGeo, this.frameMat);
    mainSlab.position.y = 0.025;
    mainSlab.castShadow = true;
    mainSlab.receiveShadow = true;
    this.boardGroup.add(mainSlab);

    // 64 individual light & dark wood tiles seated flush in the single wooden board
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
        // Rotate alternate tiles 180° for organic natural wood veneer variation
        if ((file + rank) % 4 === 0) tile.rotation.y = Math.PI;
        tile.receiveShadow = true;
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
      mat.map?.dispose();
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
      // Cleanly centered on the single wooden border margin
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
    );
  }

  public setSkin(skinId: BoardSkinId): void {
    if (this.currentSkinId === skinId) return;
    this.currentSkinId = skinId;
    const skin = BOARD_SKINS[skinId];

    this.scene.background = new THREE.Color(skin.sceneBg);
    this.scene.fog = new THREE.FogExp2(skin.fogColor, 0.022);

    const prevSkinTextures = this.skinTextures;
    const { lightVariants, darkVariants, framePbr, whitePiecePbr, blackPiecePbr, newTex } =
      this.buildSkinTextures(skin);
    this.skinTextures = newTex;

    const bumpAmount = skin.lightSquare.pattern === 'wood' ? 0.016 : 0.008;

    this.lightSquareMats.forEach((mat, i) => {
      const v = lightVariants[i];
      mat.map = v.map;
      mat.bumpMap = v.bumpMap;
      mat.bumpScale = bumpAmount;
      mat.roughnessMap = v.roughnessMap;
      mat.roughness = skin.lightSquare.roughness;
      mat.metalness = skin.lightSquare.metalness;
      mat.clearcoat = skin.lightSquare.clearcoat;
      mat.envMapIntensity = skin.boardEnvIntensity;
      mat.transparent = Boolean(skin.glassMode && !this.isSoftwareGl);
      mat.opacity = skin.glassMode ? 0.92 : 1;
      mat.needsUpdate = true;
    });

    this.darkSquareMats.forEach((mat, i) => {
      const v = darkVariants[i];
      mat.map = v.map;
      mat.bumpMap = v.bumpMap;
      mat.bumpScale = bumpAmount;
      mat.roughnessMap = v.roughnessMap;
      mat.roughness = skin.darkSquare.roughness;
      mat.metalness = skin.darkSquare.metalness;
      mat.clearcoat = skin.darkSquare.clearcoat;
      mat.envMapIntensity = skin.boardEnvIntensity;
      mat.transparent = Boolean(skin.glassMode && !this.isSoftwareGl);
      mat.opacity = skin.glassMode ? 0.94 : 1;
      mat.needsUpdate = true;
    });

    this.frameMat.map = framePbr.map;
    this.frameMat.bumpMap = framePbr.bumpMap;
    this.frameMat.roughnessMap = framePbr.roughnessMap;
    this.frameMat.color.setHex(skin.frameColor);
    this.frameMat.roughness = skin.frameRoughness;
    this.frameMat.metalness = skin.frameMetalness;
    this.frameMat.envMapIntensity = skin.boardEnvIntensity;
    this.frameMat.needsUpdate = true;

    const pieceSpec = skin.id === 'walnut-maple' ? 0.22 : 0.85;

    this.whitePieceMats.body.map = whitePiecePbr.map;
    this.whitePieceMats.body.bumpMap = whitePiecePbr.bumpMap;
    this.whitePieceMats.body.roughnessMap = whitePiecePbr.roughnessMap;
    this.whitePieceMats.body.roughness = skin.whitePiece.roughness;
    this.whitePieceMats.body.metalness = skin.whitePiece.metalness;
    this.whitePieceMats.body.clearcoat = skin.whitePiece.clearcoat;
    this.whitePieceMats.body.specularIntensity = pieceSpec;
    this.whitePieceMats.body.envMapIntensity = skin.pieceEnvIntensity;
    this.whitePieceMats.body.needsUpdate = true;

    this.whitePieceMats.collar.color.setHex(skin.whitePiece.collarColor);
    this.whitePieceMats.collar.bumpMap = whitePiecePbr.bumpMap;
    this.whitePieceMats.collar.roughness = skin.whitePiece.collarRoughness;
    this.whitePieceMats.collar.metalness = skin.whitePiece.collarMetalness;
    this.whitePieceMats.collar.clearcoat = skin.whitePiece.clearcoat;
    this.whitePieceMats.collar.specularIntensity = pieceSpec;
    this.whitePieceMats.collar.envMapIntensity = skin.pieceEnvIntensity;
    this.whitePieceMats.collar.needsUpdate = true;
    this.whitePieceMats.groove.color.setHex(skin.whitePiece.collarColor).multiplyScalar(0.62);

    this.blackPieceMats.body.map = blackPiecePbr.map;
    this.blackPieceMats.body.bumpMap = blackPiecePbr.bumpMap;
    this.blackPieceMats.body.roughnessMap = blackPiecePbr.roughnessMap;
    this.blackPieceMats.body.roughness = skin.blackPiece.roughness;
    this.blackPieceMats.body.metalness = skin.blackPiece.metalness;
    this.blackPieceMats.body.clearcoat = skin.blackPiece.clearcoat;
    this.blackPieceMats.body.specularIntensity = pieceSpec;
    this.blackPieceMats.body.envMapIntensity = skin.pieceEnvIntensity;
    this.blackPieceMats.body.needsUpdate = true;

    this.blackPieceMats.collar.color.setHex(skin.blackPiece.collarColor);
    this.blackPieceMats.collar.bumpMap = blackPiecePbr.bumpMap;
    this.blackPieceMats.collar.roughness = skin.blackPiece.collarRoughness;
    this.blackPieceMats.collar.metalness = skin.blackPiece.collarMetalness;
    this.blackPieceMats.collar.clearcoat = skin.blackPiece.clearcoat;
    this.blackPieceMats.collar.specularIntensity = pieceSpec;
    this.blackPieceMats.collar.envMapIntensity = skin.pieceEnvIntensity;
    this.blackPieceMats.collar.needsUpdate = true;
    this.blackPieceMats.groove.color.setHex(skin.blackPiece.collarColor).multiplyScalar(0.55);

    prevSkinTextures.forEach((t) => t.dispose());

    this.rebuildCoordinates(skin.coordTextColor);
    this.requestRender();
  }

  public setLightingMood(moodId: LightingMood): void {
    if (this.currentMood === moodId) return;
    this.currentMood = moodId;
    const cfg = LIGHTING_MOODS[moodId];
    this.keyLight.color.setHex(cfg.keyColor);
    this.keyLight.intensity = cfg.keyIntensity;
    this.hemiLight.color.setHex(cfg.hemiSky);
    this.hemiLight.groundColor.setHex(cfg.hemiGround);
    this.hemiLight.intensity = cfg.hemiIntensity;
    this.rimLight.color.setHex(cfg.rimColor);
    this.rimLight.intensity = cfg.rimIntensity;
    this.renderer.toneMappingExposure = cfg.exposure;
    this.requestRender();
  }

  public setCameraPreset(preset: CameraPreset): void {
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

  public syncState(state: SceneVisualState, animateFromMove?: { from: string; to: string } | null): void {
    this.coordGroup.visible = state.showCoordinates;
    this.syncPieces(state.fen, animateFromMove || null);
    this.syncOverlays(state);
    this.syncBestMoveArrow(state.bestMoveArrow);
    this.requestRender();
  }

  private syncPieces(fen: string, movedHint: { from: string; to: string } | null): void {
    const chess = new Chess(fen);
    const board = chess.board();

    // Build target map of square -> {type, color}
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

    // Check if we can smoothly animate a single move from movedHint
    let animatedMovedObj: THREE.Group | null = null;
    if (movedHint) {
      const movingExisting = this.pieceMap.get(movedHint.from);
      const targetSpec = desired.get(movedHint.to);
      if (movingExisting && targetSpec && movingExisting.color === targetSpec.color) {
        // Remove captured piece at destination if any
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
          this.animations = this.animations.filter((a) => a.obj !== movingExisting.group);
          this.animations.push({
            obj: movingExisting.group,
            startPos,
            endPos,
            elapsed: 0,
            duration: isKnight ? 0.34 : 0.25,
            arcHeight: isKnight ? 1.15 : 0.28,
          });
        } else {
          // Promotion: replace piece mesh cleanly
          this.pieceGroup.remove(movingExisting.group);
        }
      }
    }

    // Reconcile remaining squares (handles castling rook, en passant, resets, replay jumps)
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
        true,
      );
      squareToWorld(sq, group.position);
      this.pieceGroup.add(group);
      this.pieceMap.set(sq, { group, type: want.type, color: want.color });
    }

    // Rebuild captured pieces neatly resting on left/right ledges beside the cabinet
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
      // Captured White pieces rest neatly on the East ledge (+X); Black captured pieces on West ledge (-X)
      const sideSign = color === 'w' ? 1 : -1;

      missing.forEach((type, idx) => {
        const piece = buildSculptedPiece(type, color, this.pieceGeoCache, mats, true);
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
    // Selected square ring
    if (state.selectedSquare) {
      squareToWorld(state.selectedSquare, _tmpVec);
      this.selectedRing.position.set(_tmpVec.x, BOARD_TOP_Y + 0.024, _tmpVec.z);
      this.selectedRing.visible = true;
    } else {
      this.selectedRing.visible = false;
    }

    // Check ring
    if (state.checkSquare) {
      squareToWorld(state.checkSquare, _tmpVec);
      this.checkRing.position.set(_tmpVec.x, BOARD_TOP_Y + 0.025, _tmpVec.z);
      this.checkRing.visible = true;
    } else {
      this.checkRing.visible = false;
    }

    // Last move highlight plates
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

    // Legal move markers
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

  private syncBestMoveArrow(arrow: { from: string; to: string } | null): void {
    while (this.arrowGroup.children.length > 0) {
      const child = this.arrowGroup.children[0] as THREE.Mesh;
      this.arrowGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    if (!arrow) return;

    const start = squareToWorld(arrow.from);
    const end = squareToWorld(arrow.to);
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) return;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const angle = Math.atan2(dirX, dirZ);

    const arrowY = BOARD_TOP_Y + 0.14;
    const headLen = Math.min(0.42, dist * 0.4);
    const shaftLen = Math.max(0.1, dist - headLen - 0.12);

    const arrowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
    });

    // Shaft
    const shaftGeo = new THREE.BoxGeometry(0.14, 0.045, shaftLen);
    const shaft = new THREE.Mesh(shaftGeo, arrowMat);
    const shaftCenterDist = 0.08 + shaftLen / 2;
    shaft.position.set(
      start.x + dirX * shaftCenterDist,
      arrowY,
      start.z + dirZ * shaftCenterDist,
    );
    shaft.rotation.y = angle;
    this.arrowGroup.add(shaft);

    // Arrowhead cone lying flat along travel direction
    const headGeo = new THREE.ConeGeometry(0.24, headLen, 4);
    headGeo.rotateX(Math.PI / 2);
    headGeo.rotateZ(Math.PI / 4);
    const head = new THREE.Mesh(headGeo, arrowMat.clone());
    const headCenterDist = dist - headLen * 0.52;
    head.position.set(
      start.x + dirX * headCenterDist,
      arrowY,
      start.z + dirZ * headCenterDist,
    );
    head.rotation.y = angle;
    this.arrowGroup.add(head);
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
    const travel = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (travel > 6) return; // User orbited camera rather than clicking a square

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

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;

      let keepAnimating = false;

      // 1. Advance piece glide arcs
      if (this.animations.length > 0) {
        const remaining: ActivePieceAnim[] = [];
        for (const anim of this.animations) {
          anim.elapsed += dt;
          const t = Math.min(1, anim.elapsed / anim.duration);
          // Smooth cubic ease-out
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

      // 2. Smooth exponential camera preset transitions
      if (this.camGoalPos && this.camGoalTarget) {
        const lambda = 7.5;
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.camGoalPos.x, lambda, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.camGoalPos.y, lambda, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.camGoalPos.z, lambda, dt);

        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.camGoalTarget.x, lambda, dt);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.camGoalTarget.y, lambda, dt);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.camGoalTarget.z, lambda, dt);

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
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

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
    this.pieceContactShadowMat.dispose();

    this.skinTextures.forEach((t) => t.dispose());
    this.ownedTextures.forEach((t) => t.dispose());
    this.envTexture.dispose();

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
