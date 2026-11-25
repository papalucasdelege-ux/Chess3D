import * as THREE from 'three';

export type MiniHamsterVariant = 'russian-grey' | 'snow-white';

/**
 * Generates an anatomically UV-mapped 512x512 procedural fur texture + subtle micro-fur bump map
 * for a Campbell's Russian Dwarf Hamster (`Phodopus campbelli`).
 *
 * UV convention on the sculpted Campbell's torso & head:
 * - `u` (0..1): angle around the longitudinal Z-axis (`u = 0.25` = dorsal centerline top,
 *   `u = 0.0 / 0.5 / 1.0` = lateral flanks, `u = 0.75` = ventral belly).
 * - `v` (0..1): longitudinal position (`v = 0` = rump/tail base, `v = 1` = shoulders/nose).
 */
function createCampbellFurTextures(variant: MiniHamsterVariant): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  let seed = variant === 'russian-grey' ? 6143 : 9209;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  if (ctx) {
    if (variant === 'russian-grey') {
      // Base creamy-ivory underbelly (visible below the Campbell's 3-arch lateral flank line)
      ctx.fillStyle = '#ebe6dc';
      ctx.fillRect(0, 0, size, size);

      // Paint dorsal agouti slate-grey Campbell's coat with the signature wavy 3-arch lateral flank border!
      const img = ctx.getImageData(0, 0, size, size);
      const data = img.data;
      for (let py = 0; py < size; py++) {
        const v = py / (size - 1); // 0 = rump, 1 = front/shoulders
        // Signature Phodopus campbelli triple-arch flank wave (3 gentle scalloped dips along each side)
        const triArch = Math.sin(v * Math.PI * 3.0) * 0.036 + Math.sin(v * Math.PI * 6.0) * 0.008;
        for (let px = 0; px < size; px++) {
          const u = px / (size - 1);
          // Angular distance from dorsal centerline (u = 0.25) wrapped onto [0, 0.5]
          let dTop = Math.abs(u - 0.25);
          if (dTop > 0.5) dTop = 1 - dTop;

          // Flank boundary lies around dTop ≈ 0.285 modulated by the 3-arch wave
          const flankEdge = 0.285 + triArch;
          const idx = (py * size + px) * 4;

          if (dTop < flankEdge + 0.045) {
            // Smooth fur-blended transition between agouti dorsal grey & ivory cream belly
            const blend = THREE.MathUtils.clamp((flankEdge + 0.025 - dTop) / 0.055, 0, 1);

            // Authentic Campbell's agouti slate-grey with slightly warmer taupe-grey flanks & frosted ticking
            const sideWarmth = THREE.MathUtils.clamp(dTop / 0.27, 0, 1);
            const grain = (rand() - 0.5) * 14;
            let r = 84 + sideWarmth * 26 + grain;
            let g = 83 + sideWarmth * 23 + grain;
            let b = 86 + sideWarmth * 16 + grain;

            // Subtle darker ochre/charcoal agouti rim right along the 3-arch flank border
            const rimDist = Math.abs(dTop - flankEdge);
            if (rimDist < 0.022) {
              const rimK = 1 - rimDist / 0.022;
              r -= rimK * 14;
              g -= rimK * 15;
              b -= rimK * 14;
            }

            // Crisp, thin, signature Campbell's black dorsal stripe down the exact spine!
            // Slightly broader between shoulders & mid-back, tapering cleanly toward tail & brow
            const stripeWidth = 0.0155 + Math.sin(v * Math.PI) * 0.007;
            if (dTop < stripeWidth + 0.014) {
              const sK = THREE.MathUtils.clamp(1 - (dTop - stripeWidth * 0.45) / (stripeWidth * 0.95), 0, 1);
              const sSmooth = sK * sK * (3 - 2 * sK);
              r = r * (1 - sSmooth) + 18 * sSmooth;
              g = g * (1 - sSmooth) + 18 * sSmooth;
              b = b * (1 - sSmooth) + 21 * sSmooth;
            }

            // Blend with ivory-cream belly
            const br = 236 + (rand() - 0.5) * 8;
            const bg = 231 + (rand() - 0.5) * 8;
            const bb = 221 + (rand() - 0.5) * 8;
            data[idx] = Math.round(br * (1 - blend) + r * blend);
            data[idx + 1] = Math.round(bg * (1 - blend) + g * blend);
            data[idx + 2] = Math.round(bb * (1 - blend) + b * blend);
            data[idx + 3] = 255;
          } else {
            // Soft off-white belly with slight micro-variation
            const gVal = (rand() - 0.5) * 8;
            data[idx] = Math.round(236 + gVal);
            data[idx + 1] = Math.round(231 + gVal);
            data[idx + 2] = Math.round(221 + gVal);
            data[idx + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);

      // Fine directional velvety short-coat fur micro-strokes flowing front-to-back
      for (let i = 0; i < 2400; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const len = 5 + rand() * 11;
        const alpha = 0.06 + rand() * 0.12;
        ctx.strokeStyle =
          rand() > 0.46
            ? `rgba(218, 214, 206, ${alpha.toFixed(3)})`
            : `rgba(28, 29, 34, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.9 + rand() * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 2.4, y - len);
        ctx.stroke();
      }
    } else {
      // Mottled / Pied Snow-White Campbell's Dwarf Hamster:
      // Plush pearlescent white base with organic slate-grey pied Campbell's patches
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#fcfaf7');
      grad.addColorStop(0.55, '#ffffff');
      grad.addColorStop(1, '#f5f0ea');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Soft-feathered organic pied Campbell's grey fur patches across upper back & flanks
      const patches: Array<[number, number, number, number, string]> = [
        [0.19 * size, 0.58 * size, 58, 72, 'rgba(92, 98, 108, 0.88)'], // Left dorsal saddle
        [0.32 * size, 0.32 * size, 48, 56, 'rgba(110, 116, 126, 0.84)'], // Right rump patch
        [0.37 * size, 0.66 * size, 38, 44, 'rgba(96, 102, 112, 0.85)'], // Right shoulder spot
        [0.25 * size, 0.44 * size, 32, 38, 'rgba(84, 90, 99, 0.82)'], // Mid-spine oval
        [0.12 * size, 0.36 * size, 30, 34, 'rgba(116, 122, 132, 0.78)'], // Left hip spot
        [0.29 * size, 0.76 * size, 24, 26, 'rgba(92, 98, 108, 0.82)'], // Upper shoulder dot
      ];
      for (const [cx, cy, rx, ry, col] of patches) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((rand() - 0.5) * 0.7);
        const rg = ctx.createRadialGradient(0, 0, Math.min(rx, ry) * 0.25, 0, 0, Math.max(rx, ry));
        rg.addColorStop(0, col);
        rg.addColorStop(0.72, col);
        rg.addColorStop(1, 'rgba(96, 102, 112, 0)');
        ctx.fillStyle = rg;
        ctx.scale(1, ry / rx);
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Silky plush white & subtle pearl fur strokes
      for (let i = 0; i < 2000; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const len = 5 + rand() * 10;
        const alpha = 0.08 + rand() * 0.14;
        ctx.strokeStyle =
          rand() > 0.42
            ? `rgba(255, 255, 255, ${(alpha * 1.4).toFixed(3)})`
            : `rgba(216, 208, 202, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 0.9 + rand() * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 2.4, y - len);
        ctx.stroke();
      }
    }
  }

  // Procedural short-coat plush fur bump texture
  if (bCtx) {
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);
    for (let i = 0; i < 3200; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 4 + rand() * 9;
      const shade = Math.round(92 + rand() * 90);
      bCtx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.42)`;
      bCtx.lineWidth = 1 + rand() * 0.8;
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.lineTo(x + (rand() - 0.5) * 2, y - len);
      bCtx.stroke();
    }
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.ClampToEdgeWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { colorMap, bumpMap };
}

/**
 * Sculpts a continuous, anatomically authentic Campbell's Dwarf Hamster (`Phodopus campbelli`) torso:
 * - Compact, plump pear-egg silhouette (~1.34:1 length-to-width, NOT an elongated mouse!)
 * - Broad, domed hindquarters with soft lower-flank fullness ("fluffy cotton-ball dumpling")
 * - Gentle hunched shoulder arch tapering directly into a thick, neckless head junction
 * - Softly flattened ventral belly sitting low over the paws
 * - Exact cylindrical-anatomical UVs matching `createCampbellFurTextures`
 */
function createCampbellBodyGeometry(): THREE.BufferGeometry {
  const segU = 36;
  const segV = 28;
  const geo = new THREE.SphereGeometry(1, segU, segV);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  const lengthHalf = 0.385; // total torso Z span ≈ 0.77

  for (let i = 0; i < pos.count; i++) {
    // SphereGeometry poles are along +Y / -Y; remap pole axis to longitudinal Z (rump=-1, front=+1)
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (rump) .. +1 (shoulders)
    const sz = pos.getZ(i);

    const t = sy; // -1..+1 longitudinal coordinate
    const vNorm = (t + 1) * 0.5; // 0 (rump) .. 1 (shoulders)
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(sz, sx); // -PI..PI; angle=+PI/2 -> dorsal top (+Y), -PI/2 -> belly (-Y)

    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? sz / radial : 0; // +1 = dorsal top, -1 = ventral belly

    // Longitudinal anatomical width profile (pear-egg: broadest at rounded hips t ≈ -0.26, snug at shoulders)
    const pearWidth =
      0.295 *
      (1.0 +
        0.16 * Math.exp(-Math.pow((t + 0.28) / 0.48, 2)) -
        0.13 * Math.exp(-Math.pow((t - 0.62) / 0.42, 2)));

    // Lower-flank plushness ("dumpling skirt"): wider slightly below mid-height
    const skirtFlare = sinA < 0.15 ? 1.0 + 0.08 * Math.exp(-Math.pow((sinA + 0.25) / 0.42, 2)) : 1.0;

    // Dorsal arch (classic compact hunched Campbell's back) & soft ventral flattening
    const dorsalHeight =
      0.242 *
      (1.0 +
        0.13 * Math.exp(-Math.pow((t + 0.18) / 0.55, 2)) +
        0.04 * Math.exp(-Math.pow((t - 0.35) / 0.4, 2)));
    const ventralDepth = 0.182;

    const x = cosA * radial * pearWidth * skirtFlare;
    let y = (sinA >= 0 ? sinA * dorsalHeight : sinA * ventralDepth) * radial;
    // Slight natural dorsal rise across mid-back
    y += 0.022 * Math.exp(-Math.pow((t + 0.12) / 0.65, 2)) * (1 - Math.abs(t) * 0.4);
    // Gently flatten underside where tummy skims near the chessboard
    if (y < -0.155) {
      y = -0.155 + (y + 0.155) * 0.38;
    }

    // Round off the rear rump smoothly while keeping front chest slightly fuller
    const zOffset = t < 0 ? t * lengthHalf * 1.03 : t * lengthHalf * 0.96;
    pos.setXYZ(i, x, y, zOffset);

    // Map UV so u = 0.25 is exact dorsal centerline (sinA = +1, angle = +PI/2)
    let uNorm = angle / (Math.PI * 2);
    if (uNorm < 0) uNorm += 1;
    uv.setXY(i, uNorm, vNorm);
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts an authentic Campbell's Dwarf Hamster head:
 * - Short, blunt, softly Roman-arched muzzle (NOT a pointy mouse nose)
 * - Broad, puffy cheek-pouch jowls flaring gently laterally below the eyes
 * - Smooth crown transitioning directly into the shoulders with no skinny neck
 */
function createCampbellHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 30, 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (nape) .. +1 (snout tip)
    const sz = pos.getZ(i);

    const t = sy; // -1 = back of head, +1 = blunt nose tip
    const vNorm = 0.68 + (t + 1) * 0.16; // sample upper-front coat band of fur texture
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? sz / radial : 0;

    // Broad cheek pouches peaking at t ≈ 0.08, tapering smoothly into a SHORT blunt muzzle at t -> +1
    const cheekPouch =
      0.048 *
      Math.exp(-Math.pow((t - 0.05) / 0.42, 2)) *
      Math.exp(-Math.pow((sinA + 0.18) / 0.55, 2)) *
      Math.abs(cosA);

    // Blunt muzzle taper (keeps nose rounded rather than pointed!)
    const muzzleTaper = t > 0 ? 1.0 - 0.46 * Math.pow(t, 1.75) : 1.0 - 0.08 * Math.abs(t);
    const widthR = 0.215 * muzzleTaper + cheekPouch;
    const heightTop = 0.185 * (t > 0 ? 1.0 - 0.4 * Math.pow(t, 1.55) : 1.0 - 0.05 * Math.abs(t));
    const heightBot = 0.155 * (t > 0 ? 1.0 - 0.36 * Math.pow(t, 1.65) : 1.0);

    const x = cosA * radial * widthR;
    // Subtle Roman-nose downward slope toward the blunt muzzle tip
    const nasalCurveY = t > 0 ? -0.048 * Math.pow(t, 1.8) : 0;
    const y = (sinA >= 0 ? sinA * heightTop : sinA * heightBot) * radial + nasalCurveY;
    // Short compact skull length (Campbell's face is adorably short!)
    const z = t >= 0 ? t * 0.245 : t * 0.21;

    pos.setXYZ(i, x, y, z);

    let uNorm = angle / (Math.PI * 2);
    if (uNorm < 0) uNorm += 1;
    uv.setXY(i, uNorm, THREE.MathUtils.clamp(vNorm, 0.02, 0.98));
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts an authentic curved cup-shaped Campbell's dwarf hamster ear shell
 * (rounded oval rim with gentle concave inner concha and soft basal pinch).
 */
function createCampbellEarShellGeometry(radiusX: number, radiusY: number, cupDepth: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 18, 14);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    // Slightly narrower at ear base (sy < 0), delightfully round across upper rim (sy > 0)
    const baseTaper = sy < 0 ? 1.0 + sy * 0.24 : 1.0 + sy * 0.05;
    const x = sx * radiusX * baseTaper;
    const y = sy * radiusY;

    // Thin curved saucer shell: concave toward +Z (front), convex toward -Z (back)
    const r2 = Math.min(1, sx * sx + sy * sy);
    const cupZ = -cupDepth * (1 - r2);
    const thickness = sz * 0.014;
    const z = cupZ + thickness;

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createHamsterShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(48, 48, 5, 48, 48, 42);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
    grad.addColorStop(0.58, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 96, 96);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface HamsterDustPuff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  age: number;
  life: number;
  active: boolean;
}

/**
 * Procedural 3D Campbell's Russian Dwarf Hamster Actor (`Phodopus campbelli`):
 * - 'russian-grey': authentic agouti slate-grey Campbell's dwarf hamster with compact pear-egg body,
 *   crisp black dorsal stripe, signature wavy 3-arch ivory flank line, plump cheek pouches,
 *   blunt Roman muzzle, curved rounded ears, glossy obsidian button eyes, and furry *Phodopus* paws.
 * - 'snow-white': pied snow-white Campbell's dwarf hamster with soft organic slate-grey fur patches,
 *   rosy pink rhinarium nose, soft pink inner ears, and dainty furry paws with pink toes & tiny claws.
 *
 * Local coordinate convention:
 * - Forward direction: +Z
 * - Up direction: +Y (paws rest flush at y = 0)
 */
export class MiniHamsterActor {
  public readonly root = new THREE.Group();
  public readonly dustGroup = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly noseMesh: THREE.Mesh;
  private readonly earLeftPivot = new THREE.Group();
  private readonly earRightPivot = new THREE.Group();
  private readonly tailMesh: THREE.Mesh;
  private readonly pawFL = new THREE.Group();
  private readonly pawFR = new THREE.Group();
  private readonly pawBL = new THREE.Group();
  private readonly pawBR = new THREE.Group();
  private readonly shadowMesh: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;

  private readonly furTex: THREE.CanvasTexture;
  private readonly furBumpTex: THREE.CanvasTexture;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly dustPuffs: HamsterDustPuff[] = [];
  private dustSpawnAccum = 0;

  constructor(variant: MiniHamsterVariant, enableShadows: boolean) {
    const isGrey = variant === 'russian-grey';
    this.root.name = isGrey ? 'CampbellGreyDwarfHamster' : 'CampbellWhiteDwarfHamster';

    const furTextures = createCampbellFurTextures(variant);
    this.furTex = furTextures.colorMap;
    this.furBumpTex = furTextures.bumpMap;
    this.shadowTex = createHamsterShadowTexture();

    const coatMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: this.furTex,
        bumpMap: this.furBumpTex,
        bumpScale: 0.012,
        color: isGrey ? 0xf2f0ec : 0xffffff,
        emissive: isGrey ? 0x16171a : 0x242220,
        emissiveIntensity: isGrey ? 0.14 : 0.16,
        roughness: 0.89,
        metalness: 0.01,
      }),
    );

    const creamFurMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        bumpMap: this.furBumpTex,
        bumpScale: 0.008,
        color: isGrey ? 0xeae4d8 : 0xfffaf7,
        emissive: 0x161513,
        emissiveIntensity: 0.12,
        roughness: 0.9,
        metalness: 0.0,
      }),
    );

    const earOuterMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0x525052 : 0xf4ecec,
        emissive: isGrey ? 0x101012 : 0x221b1d,
        emissiveIntensity: 0.14,
        roughness: 0.84,
        metalness: 0.0,
      }),
    );

    const earInnerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xa3898f : 0xffadc2,
        emissive: isGrey ? 0x180f12 : 0x3f1422,
        emissiveIntensity: 0.2,
        roughness: 0.72,
        metalness: 0.0,
      }),
    );

    const pinkNoseMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xd98f9a : 0xff6b96,
        emissive: isGrey ? 0x240c10 : 0x521226,
        emissiveIntensity: isGrey ? 0.18 : 0.34,
        roughness: 0.22,
        metalness: 0.05,
      }),
    );

    const pawSkinMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xcda4aa : 0xffa6be,
        emissive: isGrey ? 0x1a1012 : 0x3e1422,
        emissiveIntensity: isGrey ? 0.12 : 0.22,
        roughness: 0.52,
        metalness: 0.02,
      }),
    );

    const tinyClawMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xeadcd8 : 0xff6490,
        emissive: isGrey ? 0x151210 : 0x4c0f22,
        emissiveIntensity: isGrey ? 0.08 : 0.28,
        roughness: 0.24,
        metalness: 0.06,
      }),
    );

    const eyeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0x0a090b : 0x1c080e,
        roughness: 0.06,
        metalness: 0.16,
      }),
    );

    const catchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const whiskerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: isGrey ? 0xd5d8de : 0xf7eef1,
        transparent: true,
        opacity: 0.78,
      }),
    );

    const makeMesh = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      cast = enableShadows,
    ): THREE.Mesh => {
      this.geometries.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast;
      m.receiveShadow = enableShadows;
      return m;
    };

    // Grounded soft contact shadow matching the compact plump Campbell's oval silhouette
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(0.84, 1.08));
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.materials.push(this.shadowMat);
    this.shadowMesh = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.set(0, 0.015, 0.0);
    this.root.add(this.shadowMesh);

    // Low-slung dwarf hamster body pivot (belly skims snugly just above paws)
    this.bodyPivot.position.set(0, 0.215, -0.02);
    this.root.add(this.bodyPivot);

    // 1. Continuous sculpted Campbell's Dwarf Hamster pear-egg torso (with dorsal stripe & 3-arch flank texture)
    const bodyMesh = makeMesh(createCampbellBodyGeometry(), coatMat);
    bodyMesh.position.set(0, 0.015, -0.04);
    this.bodyPivot.add(bodyMesh);

    // Soft furry neck-collar / chest ruff blending shoulders seamlessly into the head (no skinny neck!)
    const chestRuff = makeMesh(new THREE.SphereGeometry(0.185, 16, 12), creamFurMat);
    chestRuff.scale.set(1.04, 0.72, 0.85);
    chestRuff.position.set(0, -0.045, 0.235);
    this.bodyPivot.add(chestRuff);

    // 2. Sculpted Campbell's Head with broad cheek pouches & short blunt Roman muzzle
    this.headPivot.position.set(0, 0.032, 0.285);
    this.bodyPivot.add(this.headPivot);

    const headMesh = makeMesh(createCampbellHeadGeometry(), coatMat);
    headMesh.position.set(0, 0.01, 0.035);
    this.headPivot.add(headMesh);

    // Subtle soft furry whisker pads (mystacial pads) + tiny cleft upper lip (philtrum)
    for (const side of [-1, 1]) {
      const whiskerPad = makeMesh(new THREE.SphereGeometry(0.056, 12, 10), creamFurMat);
      whiskerPad.scale.set(1.06, 0.82, 0.96);
      whiskerPad.position.set(side * 0.048, -0.042, 0.228);
      this.headPivot.add(whiskerPad);
    }

    // Soft tucked cream lower chin
    const chin = makeMesh(new THREE.SphereGeometry(0.052, 10, 8), creamFurMat);
    chin.scale.set(1.12, 0.62, 0.92);
    chin.position.set(0, -0.075, 0.205);
    this.headPivot.add(chin);

    // Delicate small rhinarium button nose tucked right on the blunt muzzle tip
    this.noseMesh = makeMesh(
      new THREE.SphereGeometry(isGrey ? 0.024 : 0.029, 12, 10),
      pinkNoseMat,
      false,
    );
    this.noseMesh.scale.set(1.18, 0.82, 0.82);
    this.noseMesh.position.set(0, -0.022, 0.282);
    this.headPivot.add(this.noseMesh);

    // Glossy prominent dark obsidian "boba" eyes set slightly high & wide-lateral + curved whiskers
    for (const side of [-1, 1]) {
      // Subtle fur eyelid rim
      const eyeRim = makeMesh(new THREE.SphereGeometry(0.05, 12, 10), coatMat, false);
      eyeRim.scale.set(0.92, 0.94, 0.82);
      eyeRim.position.set(side * 0.132, 0.042, 0.146);
      this.headPivot.add(eyeRim);

      const eye = makeMesh(new THREE.SphereGeometry(0.045, 14, 12), eyeMat, false);
      eye.position.set(side * 0.14, 0.044, 0.158);
      this.headPivot.add(eye);

      // Primary bright studio catchlight
      const glintMain = makeMesh(new THREE.SphereGeometry(0.014, 8, 6), catchlightMat, false);
      glintMain.position.set(side * 0.156, 0.058, 0.193);
      this.headPivot.add(glintMain);

      // Tiny secondary lower glint
      const glintSub = makeMesh(new THREE.SphereGeometry(0.007, 6, 6), catchlightMat, false);
      glintSub.position.set(side * 0.165, 0.035, 0.186);
      this.headPivot.add(glintSub);

      // 4 gracefully arched fine Campbell's vibrissae (whiskers) sweeping outward & back
      const whiskerConfigs = [
        { yOff: 0.012, spreadY: 0.036, reachX: 0.21, sweepZ: -0.04 },
        { yOff: 0.002, spreadY: 0.008, reachX: 0.235, sweepZ: -0.065 },
        { yOff: -0.008, spreadY: -0.016, reachX: 0.22, sweepZ: -0.05 },
        { yOff: -0.016, spreadY: -0.038, reachX: 0.18, sweepZ: -0.025 },
      ];
      for (const wc of whiskerConfigs) {
        const wCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.068, -0.036 + wc.yOff, 0.238),
          new THREE.Vector3(
            side * (0.068 + wc.reachX * 0.55),
            -0.036 + wc.yOff + wc.spreadY * 0.65,
            0.238 + wc.sweepZ * 0.45,
          ),
          new THREE.Vector3(
            side * (0.068 + wc.reachX),
            -0.036 + wc.yOff + wc.spreadY,
            0.238 + wc.sweepZ,
          ),
        ]);
        const whisker = makeMesh(
          new THREE.TubeGeometry(wCurve, 8, 0.0026, 4, false),
          whiskerMat,
          false,
        );
        this.headPivot.add(whisker);
      }
    }

    // Characteristic Campbell's rounded, slightly cup-shaped papery ears angled outward & slightly back
    const buildCampbellEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.132, 0.148, -0.015);
      const outer = makeMesh(createCampbellEarShellGeometry(0.084, 0.094, 0.028), earOuterMat);
      outer.rotation.y = side * -0.44;
      outer.rotation.z = side * -0.34;
      outer.rotation.x = -0.14;
      pivot.add(outer);

      const inner = makeMesh(createCampbellEarShellGeometry(0.062, 0.072, 0.022), earInnerMat, false);
      inner.position.set(side * -0.004, -0.004, 0.012);
      inner.rotation.y = side * -0.44;
      inner.rotation.z = side * -0.34;
      inner.rotation.x = -0.14;
      pivot.add(inner);

      this.headPivot.add(pivot);
    };
    buildCampbellEar(-1, this.earLeftPivot);
    buildCampbellEar(1, this.earRightPivot);

    // 3. Authentic tiny blunt furry nub tail tucked snugly at the base of the plump rump
    this.tailMesh = makeMesh(new THREE.SphereGeometry(0.044, 10, 8), creamFurMat);
    this.tailMesh.scale.set(0.84, 0.78, 1.28);
    this.tailMesh.position.set(0, -0.042, -0.442);
    this.bodyPivot.add(this.tailMesh);

    // 4. Authentic Phodopus ("hairy-footed") short furry legs & dainty 4-toe paws!
    const buildPhodopusPaw = (pivot: THREE.Group, x: number, y: number, z: number, isBack: boolean) => {
      pivot.position.set(x, y, z);
      this.bodyPivot.add(pivot);

      // Furry tucked upper thigh/ankle covered in dense fur down to the foot
      const furryAnkle = makeMesh(
        new THREE.CapsuleGeometry(isBack ? 0.062 : 0.05, 0.055, 6, 10),
        creamFurMat,
      );
      furryAnkle.position.set(0, -0.052, 0);
      pivot.add(furryAnkle);

      // Furry dorsal foot pad (characteristic hairy top of Phodopus feet)
      const furryTop = makeMesh(new THREE.SphereGeometry(isBack ? 0.054 : 0.046, 10, 8), creamFurMat);
      furryTop.scale.set(1.06, 0.56, 1.38);
      furryTop.position.set(0, -0.106, 0.032);
      pivot.add(furryTop);

      // Soft pink sole / dainty paw pad resting on the board
      const footPad = makeMesh(new THREE.SphereGeometry(isBack ? 0.05 : 0.044, 10, 8), pawSkinMat);
      footPad.scale.set(1.08, 0.44, 1.44);
      footPad.position.set(0, -0.122, 0.038);
      pivot.add(footPad);

      // 4 delicate fanned little toes + subtle miniature claws
      const toeAngles = [-0.42, -0.14, 0.14, 0.42];
      for (const ang of toeAngles) {
        const tx = Math.sin(ang) * (isBack ? 0.054 : 0.046);
        const tz = 0.088 + Math.cos(ang) * (isBack ? 0.022 : 0.018);

        const toe = makeMesh(new THREE.SphereGeometry(0.014, 7, 6), pawSkinMat, false);
        toe.scale.set(0.85, 0.72, 1.45);
        toe.position.set(tx, -0.126, tz);
        toe.rotation.y = ang;
        pivot.add(toe);

        const claw = makeMesh(
          new THREE.ConeGeometry(isGrey ? 0.0075 : 0.01, isGrey ? 0.024 : 0.034, 5),
          tinyClawMat,
          false,
        );
        claw.rotation.x = Math.PI / 2 + 0.18;
        claw.rotation.z = -ang * 0.9;
        claw.position.set(tx * 1.14, -0.128, tz + 0.022);
        pivot.add(claw);
      }
    };

    buildPhodopusPaw(this.pawFL, -0.145, -0.072, 0.185, false);
    buildPhodopusPaw(this.pawFR, 0.145, -0.072, 0.185, false);
    buildPhodopusPaw(this.pawBL, -0.168, -0.068, -0.205, true);
    buildPhodopusPaw(this.pawBR, 0.168, -0.068, -0.205, true);

    // 5. Tiny subtle scurry puffs
    const puffGeo = this.trackGeo(new THREE.SphereGeometry(0.042, 7, 5));
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: isGrey ? 0xd8dce4 : 0xfff4f7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(puffGeo, mat);
      mesh.visible = false;
      this.dustGroup.add(mesh);
      this.dustPuffs.push({
        mesh,
        mat,
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.28,
        active: false,
      });
    }

    // Clearly visible compact dwarf hamster scale beside 1.0-unit chess squares & Staunton pieces
    this.root.scale.setScalar(0.92);
    this.root.visible = false;
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.geometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.materials.push(mat);
    return mat;
  }

  public resetDust(): void {
    this.dustSpawnAccum = 0;
    for (const p of this.dustPuffs) {
      p.active = false;
      p.mesh.visible = false;
      p.mat.opacity = 0;
    }
  }

  /**
   * Animates authentic low-slung Campbell's dwarf hamster scuttling, plump rump waddle,
   * rapid nose twitch, papery ear flutter, contact shadow projection, and scurry dust puffs.
   */
  public update(
    dt: number,
    elapsedSec: number,
    worldPos: THREE.Vector3,
    groundY: number,
    squeak01: number,
    spawnDust: boolean,
  ): void {
    const scurryFreq = 36.0;
    const phase = elapsedSec * scurryFreq;
    const airHeight = Math.max(0, worldPos.y - groundY);

    // Compact plump body rapid low-slung waddle & subtle rump sway
    const bounce = Math.abs(Math.sin(phase)) * 0.062;
    this.bodyPivot.position.y = 0.215 + bounce;
    this.bodyPivot.rotation.x = Math.cos(phase) * 0.13 - Math.min(0.22, airHeight * 0.24);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.12;
    this.bodyPivot.rotation.y = Math.cos(phase * 0.5) * 0.095;

    // Rapid alternating dainty Phodopus paw paddling
    this.pawFL.rotation.x = Math.sin(phase) * 0.98;
    this.pawFR.rotation.x = Math.sin(phase + Math.PI) * 0.98;
    this.pawBL.rotation.x = Math.sin(phase + Math.PI + 0.35) * 1.04;
    this.pawBR.rotation.x = Math.sin(phase + 0.35) * 1.04;

    // Nose twitch & excited squeak head perk
    const sq = THREE.MathUtils.clamp(squeak01, 0, 1);
    this.headPivot.rotation.x = -0.05 - sq * 0.18 + Math.sin(phase * 0.5) * 0.05;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 14.0) * 0.12;
    this.noseMesh.position.y = -0.022 + Math.sin(elapsedSec * 32.0) * 0.0055;
    const nosePulse = 1 + sq * 0.12;
    this.noseMesh.scale.set(1.18 * nosePulse, 0.82 * nosePulse, 0.82 * nosePulse);

    // Rounded papery ear twitch & tiny nub tail wiggle
    const earWiggle = Math.sin(phase * 0.7) * 0.18 + sq * 0.22;
    this.earLeftPivot.rotation.z = 0.08 + earWiggle;
    this.earRightPivot.rotation.z = -0.08 - earWiggle;
    this.tailMesh.position.x = Math.sin(phase * 0.8) * 0.02;

    // Contact shadow stays flush on the chessboard surface
    const invScale = 1 / this.root.scale.x;
    this.shadowMesh.position.y = (groundY + 0.014 - worldPos.y) * invScale;
    const shadowFade = THREE.MathUtils.clamp(1 - airHeight * 0.45, 0.24, 1);
    this.shadowMesh.scale.setScalar(0.84 + shadowFade * 0.22);
    this.shadowMat.opacity = 0.46 * shadowFade;

    // Tiny subtle scurry puffs
    if (spawnDust && airHeight < 0.14) {
      this.dustSpawnAccum += dt;
      if (this.dustSpawnAccum >= 0.055) {
        this.dustSpawnAccum = 0;
        const slot = this.dustPuffs.find((p) => !p.active);
        if (slot) {
          slot.active = true;
          slot.age = 0;
          slot.life = 0.24 + Math.random() * 0.14;
          slot.mesh.visible = true;
          slot.mesh.position.set(
            worldPos.x + (Math.random() - 0.5) * 0.18,
            groundY + 0.05,
            worldPos.z + (Math.random() - 0.5) * 0.18,
          );
          slot.mesh.scale.setScalar(0.5 + Math.random() * 0.35);
          slot.vel.set(
            (Math.random() - 0.5) * 0.55,
            0.35 + Math.random() * 0.42,
            (Math.random() - 0.5) * 0.55,
          );
          slot.mat.opacity = 0.38;
        }
      }
    }

    for (const p of this.dustPuffs) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.mesh.visible = false;
        p.mat.opacity = 0;
        continue;
      }
      const k = p.age / p.life;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 4.2));
      p.mesh.scale.setScalar(0.55 + k * 1.15);
      p.mat.opacity = 0.38 * (1 - k) * (1 - k);
    }
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.furTex.dispose();
    this.furBumpTex.dispose();
    this.shadowTex.dispose();
  }
}
