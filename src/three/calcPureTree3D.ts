import * as THREE from 'three';

interface TreeBorderLimbSpec {
  edge: 'top' | 'left' | 'right' | 'bottom';
  /** Normalized coordinate along the edge (0..1: left->right on top/bottom, top->bottom on left/right) */
  tEdge: number;
  /** Outward fan bias perpendicular to edge normal */
  fanBias: number;
  /** Base organic curvature bend */
  curveBend: number;
  /** Reach scale relative to portrait size */
  reachFactor: number;
  /** Base trunk/bough thickness multiplier */
  thickness: number;
  /** 3D depth layer offset in world units (- = toward camera, + = deeper over board) */
  depthLayer: number;
  /** Border-crossing stagger (0..0.28) matching video growth timing */
  startOffset: number;
  /** Recursion depth (2..3) */
  depth: number;
  /** Whether this thick bough/root carries a crimson-ruby glowing energy vein */
  hasCrimsonVein: boolean;
  /** Whether this is a gnarled downward root vs leafy canopy branch */
  isRoot?: boolean;
}

/**
 * Exact 4-edge organic branch & root exits mapped directly from the peak frame (`t = 4.5s`)
 * of `angel_case_calc_pure.mp4`:
 * - TOP EDGE: 9 arching golden-mahogany crown boughs crowning above the portrait
 * - LEFT EDGE: 12 sweeping primary limbs fanning out over the 3D chessboard & beside the modal
 * - RIGHT EDGE: 7 right-flank boughs reaching into the right viewport margin
 * - BOTTOM EDGE: 9 gnarled twisted roots & emerald saplings threading behind/through & below the modal
 */
const TREE_BORDER_LIMBS: ReadonlyArray<TreeBorderLimbSpec> = [
  // === TOP EDGE: lush arching Tree of Life crown rising above the video ===
  { edge: 'top', tEdge: 0.08, fanBias: -0.92, curveBend: -0.24, reachFactor: 0.78, thickness: 0.92, depthLayer: -0.22, startOffset: 0.0, depth: 3, hasCrimsonVein: false },
  { edge: 'top', tEdge: 0.19, fanBias: -0.68, curveBend: -0.18, reachFactor: 0.88, thickness: 1.05, depthLayer: 0.18, startOffset: 0.02, depth: 3, hasCrimsonVein: true },
  { edge: 'top', tEdge: 0.31, fanBias: -0.44, curveBend: -0.14, reachFactor: 0.92, thickness: 1.12, depthLayer: -0.1, startOffset: 0.01, depth: 3, hasCrimsonVein: false },
  { edge: 'top', tEdge: 0.43, fanBias: -0.18, curveBend: 0.12, reachFactor: 0.95, thickness: 1.18, depthLayer: 0.25, startOffset: 0.0, depth: 3, hasCrimsonVein: true },
  { edge: 'top', tEdge: 0.53, fanBias: 0.04, curveBend: -0.12, reachFactor: 0.96, thickness: 1.16, depthLayer: -0.18, startOffset: 0.01, depth: 3, hasCrimsonVein: false },
  { edge: 'top', tEdge: 0.64, fanBias: 0.26, curveBend: 0.15, reachFactor: 0.88, thickness: 1.08, depthLayer: 0.15, startOffset: 0.02, depth: 3, hasCrimsonVein: true },
  { edge: 'top', tEdge: 0.75, fanBias: 0.48, curveBend: 0.18, reachFactor: 0.82, thickness: 0.98, depthLayer: -0.12, startOffset: 0.03, depth: 3, hasCrimsonVein: false },
  { edge: 'top', tEdge: 0.86, fanBias: 0.7, curveBend: 0.22, reachFactor: 0.72, thickness: 0.9, depthLayer: 0.12, startOffset: 0.04, depth: 2, hasCrimsonVein: false },
  { edge: 'top', tEdge: 0.94, fanBias: 0.88, curveBend: 0.24, reachFactor: 0.64, thickness: 0.82, depthLayer: -0.08, startOffset: 0.05, depth: 2, hasCrimsonVein: false },

  // === LEFT EDGE: sweeping golden-copper canopy limbs unfolding over the 3D chessboard ===
  { edge: 'left', tEdge: 0.06, fanBias: 0.68, curveBend: 0.22, reachFactor: 1.05, thickness: 0.96, depthLayer: -0.35, startOffset: 0.01, depth: 3, hasCrimsonVein: false },
  { edge: 'left', tEdge: 0.14, fanBias: 0.5, curveBend: 0.18, reachFactor: 1.18, thickness: 1.12, depthLayer: 0.22, startOffset: 0.0, depth: 3, hasCrimsonVein: true },
  { edge: 'left', tEdge: 0.23, fanBias: 0.34, curveBend: 0.14, reachFactor: 1.24, thickness: 1.22, depthLayer: -0.18, startOffset: 0.02, depth: 3, hasCrimsonVein: false },
  { edge: 'left', tEdge: 0.32, fanBias: 0.2, curveBend: 0.1, reachFactor: 1.32, thickness: 1.32, depthLayer: 0.32, startOffset: 0.01, depth: 3, hasCrimsonVein: true },
  { edge: 'left', tEdge: 0.41, fanBias: 0.08, curveBend: 0.08, reachFactor: 1.36, thickness: 1.42, depthLayer: -0.28, startOffset: 0.0, depth: 3, hasCrimsonVein: true },
  { edge: 'left', tEdge: 0.5, fanBias: -0.04, curveBend: -0.06, reachFactor: 1.28, thickness: 1.38, depthLayer: 0.18, startOffset: 0.02, depth: 3, hasCrimsonVein: true },
  { edge: 'left', tEdge: 0.59, fanBias: -0.16, curveBend: -0.12, reachFactor: 1.18, thickness: 1.26, depthLayer: -0.2, startOffset: 0.04, depth: 3, hasCrimsonVein: false },
  { edge: 'left', tEdge: 0.68, fanBias: -0.28, curveBend: -0.16, reachFactor: 1.04, thickness: 1.12, depthLayer: 0.26, startOffset: 0.06, depth: 3, hasCrimsonVein: true },
  { edge: 'left', tEdge: 0.77, fanBias: -0.42, curveBend: -0.2, reachFactor: 0.92, thickness: 0.96, depthLayer: -0.14, startOffset: 0.09, depth: 3, hasCrimsonVein: false },
  { edge: 'left', tEdge: 0.86, fanBias: -0.56, curveBend: -0.22, reachFactor: 0.84, thickness: 0.88, depthLayer: 0.14, startOffset: 0.12, depth: 2, hasCrimsonVein: false },
  { edge: 'left', tEdge: 0.94, fanBias: -0.72, curveBend: -0.26, reachFactor: 0.86, thickness: 1.05, depthLayer: -0.1, startOffset: 0.16, depth: 3, hasCrimsonVein: true, isRoot: true },

  // === RIGHT EDGE: flanking golden boughs reaching into the right margin ===
  { edge: 'right', tEdge: 0.1, fanBias: 0.56, curveBend: -0.2, reachFactor: 0.72, thickness: 0.92, depthLayer: -0.16, startOffset: 0.02, depth: 3, hasCrimsonVein: false },
  { edge: 'right', tEdge: 0.24, fanBias: 0.34, curveBend: -0.14, reachFactor: 0.8, thickness: 1.1, depthLayer: 0.18, startOffset: 0.01, depth: 3, hasCrimsonVein: true },
  { edge: 'right', tEdge: 0.39, fanBias: 0.12, curveBend: -0.1, reachFactor: 0.84, thickness: 1.24, depthLayer: -0.12, startOffset: 0.02, depth: 3, hasCrimsonVein: true },
  { edge: 'right', tEdge: 0.53, fanBias: -0.08, curveBend: 0.1, reachFactor: 0.8, thickness: 1.18, depthLayer: 0.15, startOffset: 0.04, depth: 3, hasCrimsonVein: false },
  { edge: 'right', tEdge: 0.67, fanBias: -0.26, curveBend: 0.16, reachFactor: 0.74, thickness: 1.02, depthLayer: -0.15, startOffset: 0.07, depth: 2, hasCrimsonVein: false },
  { edge: 'right', tEdge: 0.82, fanBias: -0.46, curveBend: 0.2, reachFactor: 0.7, thickness: 0.94, depthLayer: 0.1, startOffset: 0.11, depth: 2, hasCrimsonVein: false },
  { edge: 'right', tEdge: 0.94, fanBias: -0.68, curveBend: 0.24, reachFactor: 0.78, thickness: 1.04, depthLayer: -0.08, startOffset: 0.16, depth: 3, hasCrimsonVein: true, isRoot: true },

  // === BOTTOM EDGE: gnarled golden roots & emerald undergrowth saplings sweeping through & below the modal ===
  { edge: 'bottom', tEdge: 0.08, fanBias: -0.68, curveBend: -0.24, reachFactor: 1.12, thickness: 1.14, depthLayer: -0.18, startOffset: 0.15, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.19, fanBias: -0.48, curveBend: -0.18, reachFactor: 1.22, thickness: 1.28, depthLayer: 0.12, startOffset: 0.14, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.31, fanBias: -0.28, curveBend: -0.14, reachFactor: 1.26, thickness: 1.38, depthLayer: -0.14, startOffset: 0.13, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.43, fanBias: -0.12, curveBend: 0.12, reachFactor: 1.28, thickness: 1.46, depthLayer: 0.16, startOffset: 0.12, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.55, fanBias: 0.1, curveBend: -0.12, reachFactor: 1.26, thickness: 1.44, depthLayer: -0.16, startOffset: 0.12, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.67, fanBias: 0.28, curveBend: 0.15, reachFactor: 1.2, thickness: 1.32, depthLayer: 0.14, startOffset: 0.14, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.79, fanBias: 0.48, curveBend: 0.18, reachFactor: 1.14, thickness: 1.18, depthLayer: -0.12, startOffset: 0.15, depth: 3, hasCrimsonVein: true, isRoot: true },
  { edge: 'bottom', tEdge: 0.91, fanBias: 0.66, curveBend: 0.22, reachFactor: 1.02, thickness: 1.06, depthLayer: 0.1, startOffset: 0.17, depth: 3, hasCrimsonVein: false, isRoot: true },
];

interface BranchSegData {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  w0: number;
  w1: number;
  t0: number;
  t1: number;
  vein: number; // 0 = pure golden-mahogany wood, 1 = crimson-gold sap vein accent
  sway: number; // tip sway flexibility (0 at border root -> 1 at outer twigs)
}

interface LeafInstanceData {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  scaleW: number;
  scaleH: number;
  appearAt: number;
  phase: number;
  tint: readonly [number, number, number];
}

interface SporeInstanceData {
  basePos: THREE.Vector3;
  driftDir: THREE.Vector3;
  appearAt: number;
  scale: number;
  phase: number;
  speed: number;
  rgb: readonly [number, number, number];
}

interface CachedCalcTreeTextures {
  leafTex: THREE.CanvasTexture;
  sporeTex: THREE.CanvasTexture;
}

let cachedCalcTreeTextures: CachedCalcTreeTextures | null = null;

/**
 * Generates crisp procedural botanical textures matching `angel_case_calc_pure.mp4`:
 * - `leafTex`: pointed glowing emerald-lime botanical leaf with luminous center vein & dark forest edge
 * - `sporeTex`: soft warm emerald-gold botanical pollen/firefly glow
 */
function getCalcTreeTextures(): CachedCalcTreeTextures {
  if (cachedCalcTreeTextures) return cachedCalcTreeTextures;

  // 1. Botanical Pointed Glowing Emerald Leaf (256x256, oriented pointing +Y from stem at bottom)
  const leafCanvas = document.createElement('canvas');
  leafCanvas.width = 256;
  leafCanvas.height = 256;
  const ctx = leafCanvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);

    // Subtle emerald outer aura around the leaf (matches the video's lush glowing foliage halo)
    const aura = ctx.createRadialGradient(128, 128, 16, 128, 128, 118);
    aura.addColorStop(0, 'rgba(72, 238, 108, 0.36)');
    aura.addColorStop(0.55, 'rgba(20, 140, 52, 0.14)');
    aura.addColorStop(1, 'rgba(8, 60, 20, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, 256, 256);

    // Crisp almond-shaped pointed leaf silhouette
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(128, 224); // stem base
    ctx.bezierCurveTo(64, 182, 54, 96, 128, 22); // left curve to sharp tip
    ctx.bezierCurveTo(202, 96, 192, 182, 128, 224); // right curve back to stem
    ctx.closePath();

    const bodyGrad = ctx.createLinearGradient(128, 224, 128, 22);
    bodyGrad.addColorStop(0.0, '#0a4a1c'); // deep forest green base
    bodyGrad.addColorStop(0.32, '#18963c'); // rich vibrant emerald
    bodyGrad.addColorStop(0.72, '#4ee86c'); // glowing bright emerald-lime
    bodyGrad.addColorStop(1.0, '#c8ffb4'); // luminous mint-white leaf tip
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Crisp dark forest outline so overlapping leaves read distinctly like in the video
    ctx.strokeStyle = 'rgba(4, 34, 14, 0.85)';
    ctx.lineWidth = 4.5;
    ctx.stroke();

    // Luminous lime-gold center midrib vein + fine lateral leaf veins
    ctx.strokeStyle = 'rgba(220, 255, 198, 0.88)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(128, 214);
    ctx.lineTo(128, 42);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(180, 255, 165, 0.52)';
    ctx.lineWidth = 1.8;
    for (const [y0, dx, dy] of [
      [182, 26, -24],
      [148, 34, -28],
      [114, 30, -26],
      [82, 20, -22],
    ]) {
      ctx.beginPath();
      ctx.moveTo(128, y0);
      ctx.quadraticCurveTo(128 - dx * 0.55, y0 + dy * 0.4, 128 - dx, y0 + dy);
      ctx.moveTo(128, y0);
      ctx.quadraticCurveTo(128 + dx * 0.55, y0 + dy * 0.4, 128 + dx, y0 + dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 2. Soft Botanical Firefly / Spore Glow (64x64)
  const sporeCanvas = document.createElement('canvas');
  sporeCanvas.width = 64;
  sporeCanvas.height = 64;
  const sCtx = sporeCanvas.getContext('2d');
  if (sCtx) {
    sCtx.clearRect(0, 0, 64, 64);
    const g = sCtx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0.0, 'rgba(255, 255, 240, 1.0)');
    g.addColorStop(0.24, 'rgba(170, 255, 150, 0.9)');
    g.addColorStop(0.55, 'rgba(84, 218, 92, 0.35)');
    g.addColorStop(1.0, 'rgba(20, 110, 40, 0.0)');
    sCtx.fillStyle = g;
    sCtx.fillRect(0, 0, 64, 64);
  }

  const leafTex = new THREE.CanvasTexture(leafCanvas);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;

  const sporeTex = new THREE.CanvasTexture(sporeCanvas);
  sporeTex.colorSpace = THREE.SRGBColorSpace;

  cachedCalcTreeTextures = { leafTex, sporeTex };
  return cachedCalcTreeTextures;
}

// Camera-facing organic braided mahogany-gold branch shader with progressive tip unfolding & gentle wind sway
const BRANCH_VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSide;
  attribute float aWidth;
  attribute float aTime;
  attribute float aVein;
  attribute float aSway;

  uniform float uClock;

  varying vec2 vUv;
  varying float vTime;
  varying float vVein;
  varying float vWidth;

  void main() {
    vUv = uv;
    vTime = aTime;
    vVein = aVein;
    vWidth = aWidth;

    vec3 pos = position;
    // Gentle organic living canopy sway proportional to branch tip flexibility
    float wave = sin(uClock * 1.45 + pos.x * 0.95 + pos.y * 0.78 + pos.z * 0.5) * 0.045 * aSway;
    float wave2 = cos(uClock * 1.1 + pos.y * 1.15 - pos.x * 0.6) * 0.028 * aSway;
    pos.x += wave;
    pos.y += wave2;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vec3 viewDir = normalize(-mvPos.xyz);
    vec3 segViewDir = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
    vec3 perp = cross(segViewDir, viewDir);
    float perpLen = length(perp);
    if (perpLen < 0.0001) {
      perp = vec3(0.0, 1.0, 0.0);
    } else {
      perp /= perpLen;
    }

    mvPos.xyz += perp * (aSide * aWidth * 0.5);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const BRANCH_FRAG = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uClock;

  varying vec2 vUv;
  varying float vTime;
  varying float vVein;
  varying float vWidth;

  void main() {
    // Progressive smooth tip unfolding synced to calc_pure video clock
    float reveal = 1.0 - smoothstep(uProgress - 0.028, uProgress + 0.006, vTime);
    if (reveal <= 0.004 || uOpacity <= 0.004) discard;

    float d = abs(vUv.y - 0.5) * 2.0; // 0 = branch centerline, 1 = bark outer edge
    float bodyMask = 1.0 - smoothstep(0.74, 1.0, d);
    float edgeHighlight = exp(-pow((d - 0.64) / 0.22, 2.0));

    // Organic braided woodgrain & golden sap filaments running along branch length (matches calc_pure.mp4!)
    float grain1 = 0.5 + 0.5 * sin(vUv.y * 20.0 + vTime * 34.0 + sin(vTime * 12.0) * 1.4);
    float grain2 = 0.5 + 0.5 * cos(vUv.y * 12.0 - vTime * 24.0);
    float barkRidge = smoothstep(0.45, 0.92, grain1 * 0.65 + grain2 * 0.35);

    vec3 darkBark = vec3(0.24, 0.09, 0.03);     // deep rich mahogany bark shadow
    vec3 warmCopper = vec3(0.68, 0.34, 0.09);   // burnished copper-chestnut wood
    vec3 goldHighlight = vec3(1.0, 0.80, 0.32); // luminous golden rim & sap highlight
    vec3 crimsonVein = vec3(0.95, 0.14, 0.22);  // intertwined ruby-crimson energy filament on thick trunks/roots

    vec3 col = mix(darkBark, warmCopper, 0.42 + 0.42 * barkRidge);
    col = mix(col, goldHighlight, edgeHighlight * 0.68 + pow(barkRidge, 2.4) * 0.38);

    // Subtle flowing golden sap shimmer & crimson vein on thick boughs/roots
    float veinWave = exp(-pow((vUv.y - (0.5 + 0.26 * sin(vTime * 22.0))) / 0.12, 2.0));
    float sapPulse = 0.72 + 0.28 * sin(vTime * 16.0 - uClock * 3.4);
    col = mix(col, crimsonVein * (0.9 + 0.35 * sapPulse), vVein * veinWave * 0.85);
    col += goldHighlight * (0.14 * sapPulse * edgeHighlight);

    // Bright luminous emerald-gold growing shoot tip right at the advancing growth frontier!
    float tipGlow = exp(-abs(vTime - uProgress) * 32.0) * step(vTime, uProgress + 0.015);
    vec3 sproutGlow = vec3(0.56, 1.0, 0.46);
    col = mix(col, sproutGlow, clamp(tipGlow * 0.88, 0.0, 0.9));

    // Soft glowing green-gold halo outside the solid bark rim
    float outerHalo = exp(-d * d * 3.8) * 0.26;
    float alpha = clamp((bodyMask * 0.96 + outerHalo + tipGlow * 0.35) * reveal * uOpacity, 0.0, 1.0);
    if (alpha <= 0.005) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

// Reusable zero-GC math helpers
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _planeOrigin = new THREE.Vector3();
const _planeNormal = new THREE.Vector3();
const _projPlane = new THREE.Plane();
const _mat4 = new THREE.Matrix4();
const _basisMat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _idQuat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _zeroScale = new THREE.Vector3(0, 0, 0);
const _tmpPos = new THREE.Vector3();
const _tmpCol = new THREE.Color();
const _tmpX = new THREE.Vector3();
const _tmpY = new THREE.Vector3();
const _tmpZ = new THREE.Vector3();

function projectClientToPlane(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect,
  camera: THREE.PerspectiveCamera,
  plane: THREE.Plane,
  out: THREE.Vector3,
): boolean {
  _ndc.x = ((clientX - canvasRect.left) / Math.max(1, canvasRect.width)) * 2 - 1;
  _ndc.y = -((clientY - canvasRect.top) / Math.max(1, canvasRect.height)) * 2 + 1;
  _raycaster.setFromCamera(_ndc, camera);
  return _raycaster.ray.intersectPlane(plane, out) !== null;
}

/**
 * 3D Luminous Organic Botanical Tree continuing `angel_case_calc_pure.mp4` seamlessly
 * out of ALL FOUR borders of Chess Angel's portrait video (above, left over the chessboard,
 * right margin, and gnarled roots descending through & below the speech modal).
 *
 * Syncs both progressive sprouting (`1.85s -> 4.45s`) and graceful dissolution (`5.25s -> 6.72s`)
 * directly to the video's playback clock for seamless visual continuity.
 */
export class CalcPureTree3D {
  public readonly root = new THREE.Group();

  private branchGeo: THREE.BufferGeometry | null = null;
  private branchMat: THREE.ShaderMaterial | null = null;
  private branchMesh: THREE.Mesh | null = null;

  private leafGeo: THREE.BufferGeometry | null = null;
  private leafMat: THREE.MeshBasicMaterial | null = null;
  private leafMesh: THREE.InstancedMesh | null = null;
  private leaves: LeafInstanceData[] = [];

  private sporeGeo: THREE.BufferGeometry | null = null;
  private sporeMat: THREE.MeshBasicMaterial | null = null;
  private sporeMesh: THREE.InstancedMesh | null = null;
  private spores: SporeInstanceData[] = [];

  private active = false;
  private fadingOut = false;
  private fadeOutElapsed = 0;
  private videoTimeSec = 0;
  private smoothProgress = 0;
  private currentOpacity = 0;
  private clockSec = 0;
  private builtRectKey = '';

  // Exact frame-audited timing constants for `angel_case_calc_pure.mp4` (8.08s)
  private readonly GROW_START_SEC = 1.82;
  private readonly GROW_SPAN_SEC = 2.68; // full lush 3D canopy & roots unfolded by ~4.50s
  private readonly DISSOLVE_START_SEC = 5.25; // video tree starts turning translucent at 5.25s
  private readonly DISSOLVE_END_SEC = 6.72; // video tree completely gone by 6.72s
  private readonly FALLBACK_FADE_SEC = 0.85;

  constructor() {
    this.root.name = 'CalcPureTree3D';
    this.root.visible = false;
  }

  public syncWithCalcPureVideo(
    active: boolean,
    videoTimeSec: number,
    portraitRect: DOMRect | null,
    canvasRect: DOMRect | null,
    camera: THREE.PerspectiveCamera,
    boardTopY: number,
  ): void {
    if (!active || !portraitRect || !canvasRect || portraitRect.width < 12 || portraitRect.height < 12) {
      if (this.active) {
        this.active = false;
        if (this.currentOpacity > 0.02) {
          this.fadingOut = true;
          this.fadeOutElapsed = 0;
        } else {
          this.stopImmediately();
        }
      }
      return;
    }

    this.videoTimeSec = videoTimeSec;

    // Reset smooth progress when a fresh calc_pure playback begins
    if (!this.active && videoTimeSec < 1.2) {
      this.smoothProgress = 0;
    }

    const rectKey = [
      Math.round(portraitRect.left / 4),
      Math.round(portraitRect.top / 4),
      Math.round(portraitRect.width / 4),
      Math.round(portraitRect.height / 4),
      Math.round(canvasRect.width / 8),
      Math.round(canvasRect.height / 8),
      Math.round(camera.position.x * 10),
      Math.round(camera.position.y * 10),
      Math.round(camera.position.z * 10),
    ].join('|');

    if (rectKey !== this.builtRectKey || !this.branchMesh) {
      this.rebuildTreeGeometry(portraitRect, canvasRect, camera, boardTopY);
      this.builtRectKey = rectKey;
    }

    this.active = true;
    this.fadingOut = false;
    this.root.visible = videoTimeSec >= this.GROW_START_SEC - 0.12 && videoTimeSec <= this.DISSOLVE_END_SEC + 0.15;
  }

  public stopImmediately(): void {
    this.active = false;
    this.fadingOut = false;
    this.fadeOutElapsed = 0;
    this.smoothProgress = 0;
    this.currentOpacity = 0;
    this.root.visible = false;
  }

  public isRunning(): boolean {
    return this.active || this.fadingOut;
  }

  private clearBuiltMeshes(): void {
    if (this.branchMesh) {
      this.root.remove(this.branchMesh);
      this.branchMesh = null;
    }
    this.branchGeo?.dispose();
    this.branchGeo = null;
    this.branchMat?.dispose();
    this.branchMat = null;

    if (this.leafMesh) {
      this.root.remove(this.leafMesh);
      this.leafMesh.dispose();
      this.leafMesh = null;
    }
    this.leafGeo?.dispose();
    this.leafGeo = null;
    this.leafMat?.dispose();
    this.leafMat = null;

    if (this.sporeMesh) {
      this.root.remove(this.sporeMesh);
      this.sporeMesh.dispose();
      this.sporeMesh = null;
    }
    this.sporeGeo?.dispose();
    this.sporeGeo = null;
    this.sporeMat?.dispose();
    this.sporeMat = null;

    this.leaves = [];
    this.spores = [];
  }

  private rebuildTreeGeometry(
    portraitRect: DOMRect,
    canvasRect: DOMRect,
    camera: THREE.PerspectiveCamera,
    boardTopY: number,
  ): void {
    this.clearBuiltMeshes();

    camera.updateMatrixWorld();
    camera.getWorldDirection(_camForward);
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    // Camera-parallel 3D projection plane slightly closer than board center so tree wraps above/beside/below seamlessly
    const boardCenter = new THREE.Vector3(0, boardTopY + 0.72, 0);
    const camToBoardDist = Math.max(5.5, boardCenter.clone().sub(camera.position).dot(_camForward));
    const planeDist = camToBoardDist * 0.88;
    _planeOrigin.copy(camera.position).addScaledVector(_camForward, planeDist);
    _planeNormal.copy(_camForward).negate();
    _projPlane.setFromNormalAndCoplanarPoint(_planeNormal, _planeOrigin);

    const pTL = new THREE.Vector3();
    const pTR = new THREE.Vector3();
    const pBL = new THREE.Vector3();
    const pBR = new THREE.Vector3();

    const insetX = Math.min(6, portraitRect.width * 0.02);
    const insetY = Math.min(6, portraitRect.height * 0.02);

    const ok =
      projectClientToPlane(portraitRect.left + insetX, portraitRect.top + insetY, canvasRect, camera, _projPlane, pTL) &&
      projectClientToPlane(portraitRect.right - insetX, portraitRect.top + insetY, canvasRect, camera, _projPlane, pTR) &&
      projectClientToPlane(portraitRect.left + insetX, portraitRect.bottom - insetY, canvasRect, camera, _projPlane, pBL) &&
      projectClientToPlane(portraitRect.right - insetX, portraitRect.bottom - insetY, canvasRect, camera, _projPlane, pBR);

    if (!ok) return;

    const portraitWorldW = pTL.distanceTo(pTR);
    const portraitWorldH = pTL.distanceTo(pBL);
    const unitScale = THREE.MathUtils.clamp(portraitWorldH * 0.32, 0.5, 1.55);

    const rightAxis = _camRight.clone();
    const upAxis = _camUp.clone();
    const depthAxis = _camForward.clone();

    let seed = 82471;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const segments: BranchSegData[] = [];
    this.leaves = [];
    this.spores = [];

    const LEAF_TINTS: ReadonlyArray<readonly [number, number, number]> = [
      [0.95, 1.0, 0.92], // vivid bright emerald-lime
      [0.78, 0.98, 0.72], // fresh glowing forest emerald
      [1.0, 1.0, 0.84], // sunlit lime-gold highlight leaf
      [0.64, 0.92, 0.68], // deep lush canopy green
    ];

    // Helper: spawn a natural botanical leaf spray along or at the tip of a branch segment
    const addLeaf = (
      pos: THREE.Vector3,
      tangent: THREE.Vector3,
      lateralSide: number,
      appearAt: number,
      sizeScale: number,
      isTip = false,
    ) => {
      // Splay leaf gracefully outward from twig tangent
      const perp = new THREE.Vector3().crossVectors(tangent, depthAxis);
      if (perp.lengthSq() < 1e-5) perp.copy(upAxis);
      else perp.normalize();

      const leafDir = tangent
        .clone()
        .multiplyScalar(isTip ? 0.92 : 0.62 + rand() * 0.25)
        .addScaledVector(perp, lateralSide * (isTip ? 0.18 * (rand() - 0.5) : 0.65 + rand() * 0.35))
        .addScaledVector(depthAxis, (rand() - 0.5) * 0.24)
        .normalize();

      const baseH = (0.145 + rand() * 0.085) * unitScale * sizeScale;
      const baseW = baseH * (0.56 + rand() * 0.14);
      const tint = LEAF_TINTS[Math.floor(rand() * LEAF_TINTS.length)];

      this.leaves.push({
        pos: pos.clone().addScaledVector(leafDir, baseH * 0.32),
        dir: leafDir,
        scaleW: baseW,
        scaleH: baseH,
        appearAt: Math.min(0.98, appearAt + 0.015 + rand() * 0.03),
        phase: rand() * Math.PI * 2,
        tint,
      });
    };

    // Recursive organic curved fractal branch builder (matches `angel_case_calc_pure.mp4`'s sinuous golden boughs!)
    const growOrganicBranch = (
      startPos: THREE.Vector3,
      initDir: THREE.Vector3,
      length: number,
      baseWidth: number,
      tStart: number,
      tSpan: number,
      bendAmount: number,
      depthRemaining: number,
      hasVein: boolean,
      isRoot: boolean,
      generation: number,
    ) => {
      const steps = depthRemaining >= 2 ? 6 : 4;
      const stepLen = length / steps;
      let curPos = startPos.clone();
      const curDir = initDir.clone().normalize();
      const sidePerp = new THREE.Vector3().crossVectors(curDir, depthAxis);
      if (sidePerp.lengthSq() < 1e-5) sidePerp.copy(upAxis);
      else sidePerp.normalize();

      const wavePhase = rand() * Math.PI * 2;
      const depthDrift = (rand() - 0.48) * 0.16;

      for (let s = 0; s < steps; s++) {
        const u0 = s / steps;
        const u1 = (s + 1) / steps;

        // Sinuous organic wood curve (gentle S-wave + natural upward/outward arch)
        const sCurve = Math.sin(u1 * Math.PI * 1.35 + wavePhase) * 0.14 + bendAmount * (0.28 + u1 * 0.45);
        curDir.addScaledVector(sidePerp, sCurve * 0.28);
        curDir.addScaledVector(depthAxis, depthDrift * 0.18);
        if (!isRoot) {
          // Canopy twigs gently lift skyward near their tips
          curDir.addScaledVector(upAxis, 0.055 * u1);
        } else {
          // Roots curve subtly outward as they descend below the modal
          curDir.addScaledVector(upAxis, -0.025 * (1 - u1));
        }
        curDir.normalize();

        const nextPos = curPos.clone().addScaledVector(curDir, stepLen);
        const w0 = baseWidth * (1.0 - 0.46 * u0);
        const w1 = baseWidth * (1.0 - 0.46 * u1);
        const segT0 = tStart + tSpan * u0;
        const segT1 = tStart + tSpan * u1;

        const swayFactor = Math.min(1, generation * 0.28 + u1 * 0.35);

        segments.push({
          p0: curPos.clone(),
          p1: nextPos.clone(),
          w0,
          w1,
          t0: segT0,
          t1: segT1,
          vein: hasVein && generation <= 1 ? 1.0 - u0 * 0.65 : 0.0,
          sway: swayFactor,
        });

        // Sprout lush alternating pairs of emerald leaves along canopy twigs & undergrowth root saplings
        const leafDensity = isRoot ? (generation >= 1 ? 0.68 : 0.24) : generation === 0 ? 0.55 : 0.95;
        if (rand() < leafDensity) {
          const midPos = curPos.clone().lerp(nextPos, 0.45 + rand() * 0.35);
          const leafScale = isRoot ? 0.78 + rand() * 0.25 : 0.85 + rand() * 0.35 - generation * 0.08;
          addLeaf(midPos, curDir, 1, segT1, leafScale, false);
          if (rand() < (isRoot ? 0.55 : 0.86)) {
            addLeaf(midPos, curDir, -1, segT1 + 0.01, leafScale * 0.94, false);
          }
        }

        // Mid-branch organic offshoot fork!
        if (depthRemaining > 0 && (s === 2 || s === 4)) {
          const forkSide = (s === 2 ? 1 : -1) * (rand() > 0.3 ? 1 : -1);
          const forkAngle = (0.34 + rand() * 0.32) * forkSide;
          const forkDir = curDir
            .clone()
            .multiplyScalar(Math.cos(forkAngle))
            .addScaledVector(sidePerp, Math.sin(forkAngle))
            .addScaledVector(depthAxis, (rand() - 0.5) * 0.24)
            .normalize();

          growOrganicBranch(
            nextPos,
            forkDir,
            length * (0.56 + rand() * 0.16),
            w1 * 0.72,
            segT1,
            Math.max(0.08, tSpan * 0.68),
            forkSide * (0.16 + rand() * 0.18),
            depthRemaining - 1,
            hasVein && s === 2 && rand() > 0.45,
            isRoot,
            generation + 1,
          );
        }

        curPos = nextPos;
      }

      // Terminal twin fork or lush 3-leaf botanical crown spray at the end of every branch
      if (depthRemaining > 0) {
        for (const side of [-1, 1]) {
          const splitAngle = side * (0.26 + rand() * 0.28);
          const childDir = curDir
            .clone()
            .multiplyScalar(Math.cos(splitAngle))
            .addScaledVector(sidePerp, Math.sin(splitAngle))
            .addScaledVector(depthAxis, (rand() - 0.5) * 0.22)
            .normalize();

          growOrganicBranch(
            curPos,
            childDir,
            length * (0.58 + rand() * 0.18),
            baseWidth * 0.54,
            tStart + tSpan,
            Math.max(0.08, tSpan * 0.65),
            side * (0.18 + rand() * 0.16),
            depthRemaining - 1,
            false,
            isRoot,
            generation + 1,
          );
        }
      } else {
        // Lush terminal 3-leaf spray & floating spore glow
        const tipScale = isRoot ? 0.8 : 0.94;
        addLeaf(curPos, curDir, 0, tStart + tSpan, tipScale, true);
        addLeaf(curPos, curDir, 1, tStart + tSpan + 0.01, tipScale * 0.86, false);
        addLeaf(curPos, curDir, -1, tStart + tSpan + 0.01, tipScale * 0.86, false);

        if (this.spores.length < 96 && rand() > 0.58) {
          this.spores.push({
            basePos: curPos.clone(),
            driftDir: curDir
              .clone()
              .multiplyScalar(0.35)
              .addScaledVector(upAxis, 0.45 + rand() * 0.35)
              .addScaledVector(rightAxis, (rand() - 0.5) * 0.5)
              .normalize(),
            appearAt: Math.min(0.95, tStart + tSpan),
            scale: (0.075 + rand() * 0.065) * unitScale,
            phase: rand() * Math.PI * 2,
            speed: 0.22 + rand() * 0.26,
            rgb: rand() > 0.35 ? [0.58, 1.0, 0.52] : [1.0, 0.86, 0.44],
          });
        }
      }
    };

    // Build all 35 border-anchored primary limbs across TOP, LEFT, RIGHT, and BOTTOM borders
    for (let li = 0; li < TREE_BORDER_LIMBS.length; li++) {
      const spec = TREE_BORDER_LIMBS[li];
      const anchor = new THREE.Vector3();
      const outDir = new THREE.Vector3();

      if (spec.edge === 'top') {
        anchor.lerpVectors(pTL, pTR, spec.tEdge);
        // Tuck 3% inside the video border so the branch grows seamlessly out of the frame edge
        anchor.addScaledVector(upAxis, -portraitWorldH * 0.025);
        outDir.copy(upAxis).addScaledVector(rightAxis, spec.fanBias).normalize();
      } else if (spec.edge === 'left') {
        anchor.lerpVectors(pTL, pBL, spec.tEdge);
        anchor.addScaledVector(rightAxis, portraitWorldW * 0.025);
        outDir.copy(rightAxis).negate().addScaledVector(upAxis, spec.fanBias).normalize();
      } else if (spec.edge === 'right') {
        anchor.lerpVectors(pTR, pBR, spec.tEdge);
        anchor.addScaledVector(rightAxis, -portraitWorldW * 0.025);
        outDir.copy(rightAxis).addScaledVector(upAxis, spec.fanBias).normalize();
      } else {
        // BOTTOM edge: roots descend seamlessly from the bottom of the portrait right through & below the modal!
        anchor.lerpVectors(pBL, pBR, spec.tEdge);
        anchor.addScaledVector(upAxis, portraitWorldH * 0.025);
        outDir.copy(upAxis).negate().addScaledVector(rightAxis, spec.fanBias).normalize();
      }

      anchor.addScaledVector(depthAxis, spec.depthLayer * 0.32 * unitScale);
      outDir.addScaledVector(depthAxis, spec.depthLayer * 0.14).normalize();

      const primaryLen =
        (spec.edge === 'left'
          ? portraitWorldW * 0.96
          : spec.edge === 'bottom'
            ? portraitWorldH * 0.72
            : portraitWorldH * 0.58) * spec.reachFactor;

      const baseWidth = 0.072 * unitScale * spec.thickness;
      const tSpan = spec.isRoot ? 0.34 : 0.32;

      growOrganicBranch(
        anchor,
        outDir,
        primaryLen,
        baseWidth,
        spec.startOffset,
        tSpan,
        spec.curveBend,
        spec.depth,
        spec.hasCrimsonVein,
        Boolean(spec.isRoot),
        0,
      );
    }

    const tex = getCalcTreeTextures();

    // 1. Single-draw-call tapered curved branch BufferGeometry
    const segCount = segments.length;
    const positions = new Float32Array(segCount * 4 * 3);
    const dirs = new Float32Array(segCount * 4 * 3);
    const sides = new Float32Array(segCount * 4);
    const widths = new Float32Array(segCount * 4);
    const times = new Float32Array(segCount * 4);
    const veins = new Float32Array(segCount * 4);
    const sways = new Float32Array(segCount * 4);
    const uvs = new Float32Array(segCount * 4 * 2);
    const indices = new Uint32Array(segCount * 6);

    const segDir = new THREE.Vector3();
    for (let i = 0; i < segCount; i++) {
      const seg = segments[i];
      segDir.subVectors(seg.p1, seg.p0);
      if (segDir.lengthSq() < 1e-8) segDir.set(0, 1, 0);
      else segDir.normalize();

      // Tiny overlap at segment joins so curved wood joints fuse seamlessly with zero miter gaps
      const pad0 = seg.w0 * 0.36;
      const pad1 = seg.w1 * 0.36;
      const p0x = seg.p0.x - segDir.x * pad0;
      const p0y = seg.p0.y - segDir.y * pad0;
      const p0z = seg.p0.z - segDir.z * pad0;
      const p1x = seg.p1.x + segDir.x * pad1;
      const p1y = seg.p1.y + segDir.y * pad1;
      const p1z = seg.p1.z + segDir.z * pad1;

      const vBase = i * 4;
      const verts: ReadonlyArray<[number, number, number, number, number, number, number, number]> = [
        [p0x, p0y, p0z, -1, seg.w0, seg.t0, 0, 0],
        [p0x, p0y, p0z, +1, seg.w0, seg.t0, 0, 1],
        [p1x, p1y, p1z, -1, seg.w1, seg.t1, 1, 0],
        [p1x, p1y, p1z, +1, seg.w1, seg.t1, 1, 1],
      ];

      for (let k = 0; k < 4; k++) {
        const vi = vBase + k;
        const [vx, vy, vz, side, wVal, tVal, uCoord, vCoord] = verts[k];
        positions[vi * 3] = vx;
        positions[vi * 3 + 1] = vy;
        positions[vi * 3 + 2] = vz;

        dirs[vi * 3] = segDir.x;
        dirs[vi * 3 + 1] = segDir.y;
        dirs[vi * 3 + 2] = segDir.z;

        sides[vi] = side;
        widths[vi] = wVal;
        times[vi] = tVal;
        veins[vi] = seg.vein;
        sways[vi] = seg.sway;

        uvs[vi * 2] = uCoord;
        uvs[vi * 2 + 1] = vCoord;
      }

      const iBase = i * 6;
      indices[iBase] = vBase;
      indices[iBase + 1] = vBase + 1;
      indices[iBase + 2] = vBase + 2;
      indices[iBase + 3] = vBase + 1;
      indices[iBase + 4] = vBase + 3;
      indices[iBase + 5] = vBase + 2;
    }

    this.branchGeo = new THREE.BufferGeometry();
    this.branchGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.branchGeo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    this.branchGeo.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    this.branchGeo.setAttribute('aWidth', new THREE.BufferAttribute(widths, 1));
    this.branchGeo.setAttribute('aTime', new THREE.BufferAttribute(times, 1));
    this.branchGeo.setAttribute('aVein', new THREE.BufferAttribute(veins, 1));
    this.branchGeo.setAttribute('aSway', new THREE.BufferAttribute(sways, 1));
    this.branchGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.branchGeo.setIndex(new THREE.BufferAttribute(indices, 1));

    this.branchMat = new THREE.ShaderMaterial({
      vertexShader: BRANCH_VERT,
      fragmentShader: BRANCH_FRAG,
      uniforms: {
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
        uClock: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.branchMesh = new THREE.Mesh(this.branchGeo, this.branchMat);
    this.branchMesh.frustumCulled = false;
    this.branchMesh.renderOrder = 7;
    this.root.add(this.branchMesh);

    // 2. Single-draw-call InstancedMesh for all pointed glowing emerald-lime leaves
    const leafCount = Math.max(1, this.leaves.length);
    this.leafGeo = new THREE.PlaneGeometry(1, 1);
    this.leafMat = new THREE.MeshBasicMaterial({
      map: tex.leafTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.leafMesh = new THREE.InstancedMesh(this.leafGeo, this.leafMat, leafCount);
    this.leafMesh.frustumCulled = false;
    this.leafMesh.renderOrder = 8;
    _mat4.compose(_tmpPos.set(0, 0, 0), _idQuat, _zeroScale);
    _tmpCol.setRGB(1, 1, 1);
    for (let i = 0; i < leafCount; i++) {
      this.leafMesh.setMatrixAt(i, _mat4);
      const t = this.leaves[i]?.tint ?? [1, 1, 1];
      _tmpCol.setRGB(t[0], t[1], t[2]);
      this.leafMesh.setColorAt(i, _tmpCol);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
    if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true;
    this.root.add(this.leafMesh);

    // 3. Single-draw-call InstancedMesh for drifting luminous emerald-gold botanical spores
    const sporeCount = Math.max(1, this.spores.length);
    this.sporeGeo = new THREE.PlaneGeometry(1, 1);
    this.sporeMat = new THREE.MeshBasicMaterial({
      map: tex.sporeTex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.sporeMesh = new THREE.InstancedMesh(this.sporeGeo, this.sporeMat, sporeCount);
    this.sporeMesh.frustumCulled = false;
    this.sporeMesh.renderOrder = 9;
    _tmpCol.setRGB(0, 0, 0);
    for (let i = 0; i < sporeCount; i++) {
      this.sporeMesh.setMatrixAt(i, _mat4);
      this.sporeMesh.setColorAt(i, _tmpCol);
    }
    this.sporeMesh.instanceMatrix.needsUpdate = true;
    if (this.sporeMesh.instanceColor) this.sporeMesh.instanceColor.needsUpdate = true;
    this.root.add(this.sporeMesh);
  }

  public update(dt: number, cameraQuat: THREE.Quaternion): boolean {
    if (!this.active && !this.fadingOut) return false;
    if (!this.branchMat || !this.leafMesh || !this.leafMat || !this.sporeMesh) {
      return false;
    }

    this.clockSec += dt;

    if (this.active) {
      const targetProgress = THREE.MathUtils.clamp(
        (this.videoTimeSec - this.GROW_START_SEC) / this.GROW_SPAN_SEC,
        0,
        1.04,
      );
      this.smoothProgress = THREE.MathUtils.lerp(
        this.smoothProgress,
        targetProgress,
        Math.min(1, dt * 10.5),
      );

      // Fade in smoothly as twigs cross border, hold full lush opacity through peak canopy,
      // then dissolve in exact lockstep with `angel_case_calc_pure.mp4` (`5.25s -> 6.72s`)!
      const fadeIn = THREE.MathUtils.clamp(
        (this.videoTimeSec - (this.GROW_START_SEC - 0.08)) / 0.28,
        0,
        1,
      );
      let dissolve = 1;
      if (this.videoTimeSec >= this.DISSOLVE_START_SEC) {
        const dk = THREE.MathUtils.clamp(
          (this.videoTimeSec - this.DISSOLVE_START_SEC) /
            (this.DISSOLVE_END_SEC - this.DISSOLVE_START_SEC),
          0,
          1,
        );
        dissolve = (1 - dk) * (1 - dk);
      }
      this.currentOpacity = fadeIn * dissolve;
      this.root.visible = this.currentOpacity > 0.006;
    } else if (this.fadingOut) {
      this.fadeOutElapsed += dt;
      const k = THREE.MathUtils.clamp(this.fadeOutElapsed / this.FALLBACK_FADE_SEC, 0, 1);
      this.currentOpacity = (1 - k) * (1 - k);
      if (k >= 1) {
        this.fadingOut = false;
        this.root.visible = false;
        return false;
      }
    }

    if (!this.root.visible) {
      return this.active;
    }

    const prog = this.smoothProgress;
    const op = this.currentOpacity;

    this.branchMat.uniforms.uProgress.value = prog;
    this.branchMat.uniforms.uOpacity.value = op;
    this.branchMat.uniforms.uClock.value = this.clockSec;
    this.leafMat.opacity = op * 0.96;

    // Camera view-forward axis for aligning leaves cleanly to face camera while pointing along their twig direction
    _tmpZ.set(0, 0, 1).applyQuaternion(cameraQuat).normalize();

    for (let i = 0; i < this.leaves.length; i++) {
      const lf = this.leaves[i];
      const delta = prog - lf.appearAt;
      if (delta <= 0) {
        _mat4.compose(lf.pos, _idQuat, _zeroScale);
      } else {
        const pop = Math.min(1, delta / 0.085);
        // Springy botanical unfurling overshoot
        const unfurl = 1 - Math.pow(1 - pop, 2.2) + Math.sin(pop * Math.PI) * 0.12;
        const flutter = Math.sin(this.clockSec * 2.6 + lf.phase) * 0.08;

        // Build billboarded leaf basis: local +Y points along lf.dir, local +Z faces camera
        _tmpY.copy(lf.dir);
        _tmpX.crossVectors(_tmpY, _tmpZ);
        if (_tmpX.lengthSq() < 1e-5) _tmpX.set(1, 0, 0);
        else _tmpX.normalize();
        // Add subtle organic flutter roll
        _tmpY.addScaledVector(_tmpX, flutter).normalize();
        _tmpX.crossVectors(_tmpY, _tmpZ).normalize();
        const orthoZ = _tmpPos.crossVectors(_tmpX, _tmpY).normalize();

        _basisMat.makeBasis(_tmpX, _tmpY, orthoZ);
        _quat.setFromRotationMatrix(_basisMat);

        // Subtle wind sway offset matching branch shader
        const swayX = Math.sin(this.clockSec * 1.45 + lf.pos.x * 0.95 + lf.pos.y * 0.78) * 0.038;
        const swayY = Math.cos(this.clockSec * 1.1 + lf.pos.y * 1.15 - lf.pos.x * 0.6) * 0.024;
        _tmpPos.set(lf.pos.x + swayX, lf.pos.y + swayY, lf.pos.z);

        _scaleVec.set(lf.scaleW * unfurl, lf.scaleH * unfurl, 1);
        _mat4.compose(_tmpPos, _quat, _scaleVec);
      }
      this.leafMesh.setMatrixAt(i, _mat4);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;

    // Drifting glowing emerald-gold botanical spores around canopy & roots
    for (let i = 0; i < this.spores.length; i++) {
      const sp = this.spores[i];
      const delta = prog - sp.appearAt;
      if (delta <= 0) {
        _mat4.compose(sp.basePos, cameraQuat, _zeroScale);
        _tmpCol.setRGB(0, 0, 0);
      } else {
        const lifeU = (this.clockSec * sp.speed + sp.phase) % 1;
        const driftDist = lifeU * 0.65;
        _tmpPos
          .copy(sp.basePos)
          .addScaledVector(sp.driftDir, driftDist);
        _tmpPos.x += Math.sin(this.clockSec * 2.2 + sp.phase) * 0.09;
        _tmpPos.y += Math.cos(this.clockSec * 1.9 + sp.phase) * 0.07;

        const env = Math.sin(lifeU * Math.PI) * Math.min(1, delta / 0.12);
        const s = sp.scale * (0.65 + 0.55 * env);
        _scaleVec.setScalar(s);
        _mat4.compose(_tmpPos, cameraQuat, _scaleVec);

        const bright = op * env * 1.05;
        _tmpCol.setRGB(sp.rgb[0] * bright, sp.rgb[1] * bright, sp.rgb[2] * bright);
      }
      this.sporeMesh.setMatrixAt(i, _mat4);
      this.sporeMesh.setColorAt(i, _tmpCol);
    }
    this.sporeMesh.instanceMatrix.needsUpdate = true;
    if (this.sporeMesh.instanceColor) this.sporeMesh.instanceColor.needsUpdate = true;

    return true;
  }

  public dispose(): void {
    this.stopImmediately();
    this.clearBuiltMeshes();
  }
}
