import * as THREE from 'three';

interface CachedUdoTextures {
  bodyColorMap: THREE.CanvasTexture;
  headColorMap: THREE.CanvasTexture;
  earColorMap: THREE.CanvasTexture;
  wireBumpMap: THREE.CanvasTexture;
  shadowMap: THREE.CanvasTexture;
  sparkleStarMap: THREE.CanvasTexture;
  sparkleMoteMap: THREE.CanvasTexture;
}

let cachedUdoTextures: CachedUdoTextures | null = null;

// Pre-allocated math helpers for zero-GC per-frame sparkle updates
const _sparkleMat4 = new THREE.Matrix4();
const _sparkleQuat = new THREE.Quaternion();
const _sparkleRollQuat = new THREE.Quaternion();
const _sparkleIdentityQuat = new THREE.Quaternion();
const _sparkleScaleVec = new THREE.Vector3();
const _sparkleZeroScale = new THREE.Vector3(0, 0, 0);
const _sparkleColor = new THREE.Color();
const _sparkleZAxis = new THREE.Vector3(0, 0, 1);
const _sparkleUpAxis = new THREE.Vector3(0, 1, 0);
const _sparkleFwd = new THREE.Vector3();
const _sparkleRight = new THREE.Vector3();
const _sparkleSpawnPos = new THREE.Vector3();

const SPARKLE_STAR_COUNT = 56;
const SPARKLE_MOTE_COUNT = 64;

const SPARKLE_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.91, 0.48], // warm radiant champagne gold
  [1.0, 0.97, 0.82], // incandescent cream-white gold
  [1.0, 0.82, 0.31], // rich honey-amber gold
  [1.0, 0.94, 0.62], // luminous lemon-gold glint
  [0.94, 0.97, 1.0], // subtle celestial silver-blue glint echoing Angel's sash
];

/**
 * Generates and caches all procedural CanvasTextures for Udo —
 * the black/charcoal-grizzle & white wirehaired Jack/Parson Russell Terrier:
 * - `bodyColorMap`: snowy-white rough terrier coat with wispy fur texture & subtle dark tail-root spot
 * - `headColorMap`: exact UV-mapped symmetrical dark charcoal-grizzle eye/cheek/crown mask,
 *   feathered white center forehead blaze, and pure snowy-white bearded muzzle
 * - `earColorMap`: dark charcoal-black terrier ear leather streaked with silver-white wirehair wisps at the fold
 * - `wireBumpMap`: coarse broken/wirehaired terrier fur micro-relief
 * - `shadowMap`: soft grounded radial contact shadow
 */
function getUdoTextures(): CachedUdoTextures {
  if (cachedUdoTextures) return cachedUdoTextures;

  let seed = 4729;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 1. Body Coat Texture (512x512): snowy-white rough terrier fur + small dark hip/tail-base spot
  // UV convention on sculpted body: u = angle around Z (u = 0.25 dorsal top), v = 0 (rump) .. 1 (chest/neck)
  const bodySize = 512;
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = bodySize;
  bodyCanvas.height = bodySize;
  const bCtx = bodyCanvas.getContext('2d');
  if (bCtx) {
    const grad = bCtx.createLinearGradient(0, 0, 0, bodySize);
    grad.addColorStop(0, '#f8f7f4');
    grad.addColorStop(0.55, '#f4f3ef');
    grad.addColorStop(1, '#eceae4');
    bCtx.fillStyle = grad;
    bCtx.fillRect(0, 0, bodySize, bodySize);

    // Subtle dark charcoal-grizzle spot right near the rear-right hip / tail base (v ≈ 0.08, u ≈ 0.34)
    const spotCx = 0.34 * bodySize;
    const spotCy = (1 - 0.08) * bodySize;
    const spotGrad = bCtx.createRadialGradient(spotCx, spotCy, 8, spotCx, spotCy, 46);
    spotGrad.addColorStop(0, 'rgba(34, 33, 32, 0.88)');
    spotGrad.addColorStop(0.62, 'rgba(52, 50, 48, 0.58)');
    spotGrad.addColorStop(1, 'rgba(52, 50, 48, 0)');
    bCtx.fillStyle = spotGrad;
    bCtx.beginPath();
    bCtx.arc(spotCx, spotCy, 46, 0, Math.PI * 2);
    bCtx.fill();

    // Scruffy white & pale-silver wirehair terrier strokes flowing front-to-back
    for (let i = 0; i < 2800; i++) {
      const x = rand() * bodySize;
      const y = rand() * bodySize;
      const len = 7 + rand() * 15;
      const jitterX = (rand() - 0.5) * 4.5;
      const alpha = 0.08 + rand() * 0.14;
      bCtx.strokeStyle =
        rand() > 0.38
          ? `rgba(255, 255, 255, ${(alpha * 1.35).toFixed(3)})`
          : `rgba(196, 193, 186, ${alpha.toFixed(3)})`;
      bCtx.lineWidth = 1.0 + rand() * 1.2;
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.lineTo(x + jitterX, y + len);
      bCtx.stroke();
    }
  }

  // 2. Head Coat Texture (512x512): Udo's exact dark grizzle mask + white center blaze + white bearded snout!
  // UV convention on sculpted head:
  // - v = 0 (back of skull/nape) .. v = 1 (front nose tip); Note Canvas flipY=true -> py = (1 - v) * size
  // - u = angle / 2PI around Z: u = 0.25 is exact dorsal top (+Y, forehead/bridge),
  //   u = 0.0 / 0.5 are exact right/left cheeks, u = 0.75 is ventral chin/throat (-Y).
  const headSize = 512;
  const headCanvas = document.createElement('canvas');
  headCanvas.width = headSize;
  headCanvas.height = headSize;
  const hCtx = headCanvas.getContext('2d');
  if (hCtx) {
    const img = hCtx.createImageData(headSize, headSize);
    const data = img.data;

    for (let py = 0; py < headSize; py++) {
      const v = 1 - py / (headSize - 1); // 0 = nape, 0.45 = eyes/stop, 1.0 = nose tip
      for (let px = 0; px < headSize; px++) {
        const u = px / (headSize - 1);
        const angle = u * Math.PI * 2;
        const cosA = Math.cos(angle); // lateral X: +1 right, -1 left, 0 top/bottom centerline
        const sinA = Math.sin(angle); // vertical Y: +1 dorsal top, -1 ventral chin/throat

        // Angular/lateral distance from exact top centerline (sinA = +1, cosA = 0)
        const latAbs = Math.abs(cosA);

        // Determine how dark (1 = deep charcoal mask, 0 = snowy white coat) this texel is:
        let darkMask = 0;

        // Mask covers upper & lateral cranium, around both eyes, and upper cheeks (v in ~0.06..0.60),
        // while throat/under-chin (sinA < -0.35), muzzle/beard (v > 0.58), and center forehead blaze stay WHITE!
        if (sinA > -0.42 && v < 0.64) {
          // Muzzle transition: crisp feathery transition into pure white snout around v = 0.54..0.61
          // Cheek patches dip slightly further forward laterally around the eyes/zygomatic arch (v up to ~0.60)
          const muzzleFrontLimit = 0.52 + 0.09 * Math.exp(-Math.pow((sinA - 0.05) / 0.52, 2));
          const frontFade = THREE.MathUtils.clamp((muzzleFrontLimit - v) / 0.085, 0, 1);

          // Nape transition: white neck collar blends in right at the very back of nape (v < 0.10)
          const napeFade = THREE.MathUtils.clamp((v - 0.05) / 0.09, 0, 1);

          // Ventral throat transition: under-jaw & throat stay crisp white
          const throatFade = THREE.MathUtils.clamp((sinA + 0.36) / 0.24, 0, 1);

          // Center white forehead blaze! Runs right up dorsal top (sinA > 0) between the two dark eye patches:
          // Narrowest just above/between the eyes (v ≈ 0.42, half-width ≈ 0.13), flaring forward into white snout
          // and tapering softly near the top crown (v ≈ 0.16).
          let blazeWhiteness = 0;
          if (sinA > 0.15) {
            const blazeHalfWidth =
              v > 0.46
                ? 0.125 + (v - 0.46) * 1.45
                : 0.125 + 0.045 * Math.exp(-Math.pow((v - 0.24) / 0.14, 2));
            blazeWhiteness =
              1 - THREE.MathUtils.clamp((latAbs - blazeHalfWidth * 0.62) / (blazeHalfWidth * 0.65), 0, 1);
          }

          darkMask = frontFade * napeFade * throatFade * (1 - blazeWhiteness);

          // Deepen darkness directly around both eye sockets (v ≈ 0.44..0.53, latAbs ≈ 0.38..0.78, sinA > -0.05)
          const eyeRingBoost =
            Math.exp(-Math.pow((v - 0.48) / 0.08, 2)) *
            Math.exp(-Math.pow((latAbs - 0.56) / 0.24, 2)) *
            (sinA > -0.1 ? 1 : 0);
          darkMask = THREE.MathUtils.clamp(darkMask + eyeRingBoost * 0.45 * (1 - blazeWhiteness), 0, 1);
        }

        const grain = (rand() - 0.5) * 18;
        // White coat RGB (~246, 244, 240) vs Charcoal-black grizzle mask RGB (~28, 27, 26)
        const r = 246 * (1 - darkMask) + 27 * darkMask + grain * (0.45 + darkMask * 0.55);
        const g = 244 * (1 - darkMask) + 26 * darkMask + grain * (0.45 + darkMask * 0.55);
        const b = 239 * (1 - darkMask) + 25 * darkMask + grain * (0.45 + darkMask * 0.55);

        const idx = (py * headSize + px) * 4;
        data[idx] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
        data[idx + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
        data[idx + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
        data[idx + 3] = 255;
      }
    }
    hCtx.putImageData(img, 0, 0);

    // Paint authentic grizzled wirehair terrier strands!
    // Silver-white & charcoal hairs feathering across the blaze, brows, cheeks, and bearded muzzle
    for (let i = 0; i < 4200; i++) {
      const u = rand();
      const v = rand();
      const px = u * headSize;
      const py = (1 - v) * headSize;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const latAbs = Math.abs(cosA);

      const inMaskZone = sinA > -0.32 && v > 0.08 && v < 0.58 && latAbs > 0.13;
      const len = 6 + rand() * 14;
      // Radiate slightly outward from muzzle/blaze just like Udo's wirehair facial furnishings!
      const dirX = cosA * (2.5 + rand() * 4.5) + (rand() - 0.5) * 2.5;
      const dirY = (v > 0.5 ? -1 : 1) * len * 0.85;

      if (inMaskZone) {
        // Grizzled charcoal + occasional silver-white wirehair highlights (signature Udo grizzle!)
        const isSilverWisp = rand() > 0.72;
        const alpha = isSilverWisp ? 0.18 + rand() * 0.24 : 0.22 + rand() * 0.28;
        hCtx.strokeStyle = isSilverWisp
          ? `rgba(218, 217, 213, ${alpha.toFixed(3)})`
          : `rgba(18, 17, 17, ${alpha.toFixed(3)})`;
      } else {
        // Crisp white scruffy beard & blaze strands
        const isSoftShadow = rand() > 0.64;
        const alpha = 0.14 + rand() * 0.2;
        hCtx.strokeStyle = isSoftShadow
          ? `rgba(196, 193, 187, ${alpha.toFixed(3)})`
          : `rgba(255, 255, 255, ${(alpha * 1.3).toFixed(3)})`;
      }
      hCtx.lineWidth = 0.9 + rand() * 1.25;
      hCtx.beginPath();
      hCtx.moveTo(px, py);
      hCtx.lineTo(px + dirX, py + dirY);
      hCtx.stroke();
    }
  }

  // 3. Ear Texture (256x256): Dark charcoal-black with silver-white wirehair wisps near the base/fold
  const earSize = 256;
  const earCanvas = document.createElement('canvas');
  earCanvas.width = earSize;
  earCanvas.height = earSize;
  const eCtx = earCanvas.getContext('2d');
  if (eCtx) {
    const eGrad = eCtx.createLinearGradient(0, 0, 0, earSize);
    eGrad.addColorStop(0, '#141313'); // pointed dark feathered tip
    eGrad.addColorStop(0.55, '#21201f');
    eGrad.addColorStop(1, '#333130'); // grizzled ear base
    eCtx.fillStyle = eGrad;
    eCtx.fillRect(0, 0, earSize, earSize);

    for (let i = 0; i < 1100; i++) {
      const x = rand() * earSize;
      const y = rand() * earSize;
      const len = 8 + rand() * 18;
      // More silver-white wirehair wisps near the upper fold/base, jet-charcoal toward tips
      const silverChance = y > earSize * 0.42 ? 0.36 : 0.12;
      const isSilver = rand() < silverChance;
      const alpha = isSilver ? 0.18 + rand() * 0.26 : 0.24 + rand() * 0.28;
      eCtx.strokeStyle = isSilver
        ? `rgba(222, 220, 216, ${alpha.toFixed(3)})`
        : `rgba(12, 12, 12, ${alpha.toFixed(3)})`;
      eCtx.lineWidth = 1.0 + rand() * 1.2;
      eCtx.beginPath();
      eCtx.moveTo(x, y);
      eCtx.lineTo(x + (rand() - 0.5) * 4, y - len);
      eCtx.stroke();
    }
  }

  // 4. Coarse Wirehair Bump Map (256x256)
  const bumpSize = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = bumpSize;
  bumpCanvas.height = bumpSize;
  const bumpCtx = bumpCanvas.getContext('2d');
  if (bumpCtx) {
    bumpCtx.fillStyle = '#808080';
    bumpCtx.fillRect(0, 0, bumpSize, bumpSize);
    for (let i = 0; i < 2400; i++) {
      const x = rand() * bumpSize;
      const y = rand() * bumpSize;
      const len = 5 + rand() * 12;
      const shade = Math.round(78 + rand() * 115);
      bumpCtx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.48)`;
      bumpCtx.lineWidth = 1.0 + rand() * 1.1;
      bumpCtx.beginPath();
      bumpCtx.moveTo(x, y);
      bumpCtx.lineTo(x + (rand() - 0.5) * 3.5, y + len);
      bumpCtx.stroke();
    }
  }

  // 5. Soft Grounded Contact Shadow (128x128)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d');
  if (sCtx) {
    const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 58);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
    sGrad.addColorStop(0.56, 'rgba(0, 0, 0, 0.25)');
    sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
  }

  // 6. Magical 4-Point Star Glint Sparkle Texture (128x128) — matches portrait jump sparkles
  const starCanvas = document.createElement('canvas');
  starCanvas.width = 128;
  starCanvas.height = 128;
  const stCtx = starCanvas.getContext('2d');
  if (stCtx) {
    stCtx.clearRect(0, 0, 128, 128);
    // Soft warm golden outer halo
    const haloGrad = stCtx.createRadialGradient(64, 64, 0, 64, 64, 58);
    haloGrad.addColorStop(0, 'rgba(255, 253, 232, 0.92)');
    haloGrad.addColorStop(0.15, 'rgba(255, 235, 140, 0.62)');
    haloGrad.addColorStop(0.38, 'rgba(248, 190, 58, 0.22)');
    haloGrad.addColorStop(0.7, 'rgba(236, 160, 32, 0.05)');
    haloGrad.addColorStop(1, 'rgba(236, 160, 32, 0)');
    stCtx.fillStyle = haloGrad;
    stCtx.fillRect(0, 0, 128, 128);

    const drawStarRay = (angleRad: number, lengthPx: number, baseHalfWidth: number, peakAlpha: number) => {
      stCtx.save();
      stCtx.translate(64, 64);
      stCtx.rotate(angleRad);
      const rayGrad = stCtx.createRadialGradient(0, 0, 0, 0, 0, lengthPx);
      rayGrad.addColorStop(0, `rgba(255, 255, 248, ${peakAlpha})`);
      rayGrad.addColorStop(0.24, `rgba(255, 244, 182, ${(peakAlpha * 0.92).toFixed(3)})`);
      rayGrad.addColorStop(0.58, `rgba(255, 214, 96, ${(peakAlpha * 0.46).toFixed(3)})`);
      rayGrad.addColorStop(1, 'rgba(255, 188, 56, 0)');
      stCtx.fillStyle = rayGrad;
      stCtx.beginPath();
      stCtx.moveTo(0, -baseHalfWidth);
      stCtx.quadraticCurveTo(lengthPx * 0.16, -baseHalfWidth * 0.24, lengthPx, 0);
      stCtx.quadraticCurveTo(lengthPx * 0.16, baseHalfWidth * 0.24, 0, baseHalfWidth);
      stCtx.closePath();
      stCtx.fill();
      stCtx.restore();
    };

    // Crisp horizontal & vertical 4-point star flare rays + delicate 45-degree secondary glints
    for (let k = 0; k < 4; k++) {
      drawStarRay(k * (Math.PI * 0.5), 60, 4.3, 1.0);
      drawStarRay(k * (Math.PI * 0.5) + Math.PI * 0.25, 24, 2.0, 0.78);
    }

    // Blazing white-gold pinpoint core
    const coreGrad = stCtx.createRadialGradient(64, 64, 0, 64, 64, 9);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    coreGrad.addColorStop(0.46, 'rgba(255, 250, 214, 0.94)');
    coreGrad.addColorStop(1, 'rgba(255, 232, 138, 0)');
    stCtx.fillStyle = coreGrad;
    stCtx.beginPath();
    stCtx.arc(64, 64, 9, 0, Math.PI * 2);
    stCtx.fill();
  }

  // 7. Luminous Golden Fairy-Dust Bokeh Mote Texture (64x64)
  const moteCanvas = document.createElement('canvas');
  moteCanvas.width = 64;
  moteCanvas.height = 64;
  const mCtx = moteCanvas.getContext('2d');
  if (mCtx) {
    mCtx.clearRect(0, 0, 64, 64);
    const moteGrad = mCtx.createRadialGradient(32, 32, 0, 32, 32, 30);
    moteGrad.addColorStop(0, 'rgba(255, 255, 246, 1)');
    moteGrad.addColorStop(0.22, 'rgba(255, 240, 162, 0.92)');
    moteGrad.addColorStop(0.54, 'rgba(248, 194, 64, 0.4)');
    moteGrad.addColorStop(0.84, 'rgba(236, 158, 30, 0.08)');
    moteGrad.addColorStop(1, 'rgba(236, 158, 30, 0)');
    mCtx.fillStyle = moteGrad;
    mCtx.fillRect(0, 0, 64, 64);
  }

  const bodyColorMap = new THREE.CanvasTexture(bodyCanvas);
  bodyColorMap.colorSpace = THREE.SRGBColorSpace;
  bodyColorMap.wrapS = THREE.RepeatWrapping;
  bodyColorMap.wrapT = THREE.ClampToEdgeWrapping;

  const headColorMap = new THREE.CanvasTexture(headCanvas);
  headColorMap.colorSpace = THREE.SRGBColorSpace;
  headColorMap.wrapS = THREE.RepeatWrapping;
  headColorMap.wrapT = THREE.ClampToEdgeWrapping;

  const earColorMap = new THREE.CanvasTexture(earCanvas);
  earColorMap.colorSpace = THREE.SRGBColorSpace;
  earColorMap.wrapS = THREE.ClampToEdgeWrapping;
  earColorMap.wrapT = THREE.ClampToEdgeWrapping;

  const wireBumpMap = new THREE.CanvasTexture(bumpCanvas);
  wireBumpMap.wrapS = THREE.RepeatWrapping;
  wireBumpMap.wrapT = THREE.RepeatWrapping;

  const shadowMap = new THREE.CanvasTexture(shadowCanvas);
  shadowMap.colorSpace = THREE.SRGBColorSpace;

  const sparkleStarMap = new THREE.CanvasTexture(starCanvas);
  sparkleStarMap.colorSpace = THREE.SRGBColorSpace;

  const sparkleMoteMap = new THREE.CanvasTexture(moteCanvas);
  sparkleMoteMap.colorSpace = THREE.SRGBColorSpace;

  cachedUdoTextures = {
    bodyColorMap,
    headColorMap,
    earColorMap,
    wireBumpMap,
    shadowMap,
    sparkleStarMap,
    sparkleMoteMap,
  };
  return cachedUdoTextures;
}

/**
 * Sculpts an athletic, compact Jack/Parson Russell Terrier torso:
 * - Deep brisket/chest, level muscular terrier back, slight loin tuck, rounded hindquarters
 * - Cylindrical-anatomical UVs matching `bodyColorMap`
 */
function createTerrierBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 24);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  const halfLen = 0.39; // compact agile terrier body length (~0.78 Z span)

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (rump) .. +1 (front chest)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5;
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? sz / radial : 0; // +1 dorsal back, -1 ventral chest/belly

    // Broad muscular shoulders/chest (t ≈ +0.35), slight terrier waist tuck (t ≈ -0.22), firm hips
    const ribWidth =
      0.215 *
      (1.0 +
        0.13 * Math.exp(-Math.pow((t - 0.32) / 0.42, 2)) -
        0.09 * Math.exp(-Math.pow((t + 0.2) / 0.35, 2)) +
        0.05 * Math.exp(-Math.pow((t + 0.62) / 0.32, 2)));

    // Level terrier topline with slight wither rise
    const topHeight = 0.195 * (1.0 + 0.08 * Math.exp(-Math.pow((t - 0.45) / 0.38, 2)));
    // Deep terrier brisket at front chest (t > 0), neat abdominal tuck toward rear (t < 0)
    const bellyDepth =
      0.215 *
      (1.0 +
        0.18 * Math.exp(-Math.pow((t - 0.36) / 0.44, 2)) -
        0.24 * Math.exp(-Math.pow((t + 0.36) / 0.42, 2)));

    const x = cosA * radial * ribWidth;
    const y = (sinA >= 0 ? sinA * topHeight : sinA * bellyDepth) * radial;
    const z = t * halfLen;

    pos.setXYZ(i, x, y, z);

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
 * Sculpts Udo's authentic wirehaired terrier skull & sturdy blunt-wedged bearded muzzle:
 * - Broad flat-domed terrier skull between the ears (t < 0)
 * - Distinct stop around t ≈ -0.04 (v ≈ 0.48, right where the eyes sit!)
 * - Full, straight, plushly bearded white snout (t > 0) ending in a rounded terrier muzzle
 */
function createUdoHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 34, 26);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (nape) .. +1 (snout tip)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5; // 0 = nape, 0.5 = eyes/stop, 1.0 = nose tip
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? sz / radial : 0; // +1 forehead/nasal bridge, -1 jaw/beard

    // Terrier stop step-down from forehead cranium (t < 0) to straight nasal bridge (t > 0.08)
    const stopStep = 0.5 * (1 - Math.tanh((t - 0.02) * 5.2)); // ~1 on skull, ~0 on muzzle

    // Skull width vs sturdy bearded terrier muzzle width (wirehair furnishings keep snout full & boxy-round!)
    const widthProfile =
      0.148 +
      0.068 * stopStep +
      0.024 * Math.exp(-Math.pow((t - 0.42) / 0.34, 2)) * (sinA < 0.25 ? 1 : 0.4); // fluffy muzzle beard fullness

    const topProfile = 0.115 + 0.078 * stopStep;
    const botProfile =
      0.128 +
      0.032 * stopStep +
      0.022 * Math.exp(-Math.pow((t - 0.35) / 0.38, 2)); // scruffy lower beard depth

    const x = cosA * radial * widthProfile;
    let y = (sinA >= 0 ? sinA * topProfile : sinA * botProfile) * radial;
    // Slight level lift on skull crown, straight terrier muzzle forward
    y += 0.028 * stopStep - (1 - stopStep) * 0.018;

    const z = t >= 0 ? t * 0.335 : t * 0.235;
    pos.setXYZ(i, x, y, z);

    let uNorm = angle / (Math.PI * 2);
    if (uNorm < 0) uNorm += 1;
    uv.setXY(i, uNorm, THREE.MathUtils.clamp(vNorm, 0.01, 0.99));
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts Udo's signature high-set V-shaped semi-drop ("airplane / folded terrier") ear:
 * rises from the outer corner of the skull, arches outward horizontally, and folds/tapers
 * into a feathered pointed tip drooping gracefully at the outer end!
 */
function createUdoFoldedEarGeometry(side: number): THREE.BufferGeometry {
  const segU = 18; // span from skull root (0) out to pointed tip (1)
  const segV = 12; // across ear flap width (-1 back edge .. +1 front edge)
  const geo = new THREE.PlaneGeometry(1, 1, segU, segV);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    // Remap PlaneGeometry X (-0.5..+0.5) -> span s (0 = base on skull, 1 = pointed outer tip)
    // and Y (-0.5..+0.5) -> flap chord w (-1 = rear margin, +1 = front margin)
    const s = pos.getX(i) + 0.5;
    const w = pos.getY(i) * 2;

    // V-shaped terrier ear chord width: broad at fold (s ≈ 0.28), tapering to a feathered point at s = 1
    const halfWidth =
      0.098 *
      (1 - 0.85 * Math.pow(s, 1.42)) *
      (0.82 + 0.28 * Math.sin(Math.min(1, s * 2.2) * Math.PI * 0.5));

    // Arch up slightly at base (s < 0.32), extend outward laterally, then droop at the feathered outer tip!
    const reachOut = s * 0.255;
    const archY =
      0.046 * Math.sin(Math.min(1, s / 0.52) * Math.PI) -
      Math.pow(Math.max(0, s - 0.38), 1.65) * 0.19;
    // Slight forward cup & natural V-shaped terrier ear chord across Z
    const cupZ = 0.026 * (1 - w * w) + w * halfWidth + s * 0.024;

    const x = side * reachOut;
    const y = archY - Math.abs(w) * 0.014;
    const z = cupZ;

    pos.setXYZ(i, x, y, z);
    // v = 0 at skull base -> v = 1 at dark feathered tip (note Canvas flipY -> 1 - s puts tip at top of canvas)
    uv.setXY(i, (w + 1) * 0.5, 1 - s);
  }

  pos.needsUpdate = true;
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

interface TerrierLegRig {
  hip: THREE.Group;
  shin: THREE.Group;
}

interface DustPuff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  age: number;
  life: number;
  active: boolean;
}

interface LaunchSparkleParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  baseScale: number;
  roll: number;
  spinSpeed: number;
  twinklePhase: number;
  twinkleFreq: number;
  swirlFreq: number;
  colorR: number;
  colorG: number;
  colorB: number;
  active: boolean;
}

/**
 * Procedural 3D likeness of **Udo** (`udo_8d64da14.png`) —
 * Wirehaired Jack / Parson Russell Terrier:
 * - Pure snowy-white rough terrier body, chest, neck ruff, sturdy legs & paws
 * - Symmetrical dark charcoal-and-silver grizzled mask covering eyes, temples, cheeks & crown
 * - Crisp feathered white forehead blaze leading into a fluffy white bearded terrier muzzle
 * - Expressive soulful dark eyes under wispy wirehair eyebrows + wet jet-black oval terrier nose
 * - Signature high-set semi-drop ("airplane") V-shaped dark grizzled ears with feathered tips
 * - Jaunty upright wagging white terrier tail with subtle dark root spot
 *
 * Local coordinate convention:
 * - Forward direction: +Z
 * - Up direction: +Y (paws rest flush at y = 0)
 */
export class WildDogActor {
  public readonly root = new THREE.Group();
  public readonly dustGroup = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly jawPivot = new THREE.Group();
  private readonly tongueMesh: THREE.Mesh;
  private readonly earLeftPivot = new THREE.Group();
  private readonly earRightPivot = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private readonly legFL: TerrierLegRig;
  private readonly legFR: TerrierLegRig;
  private readonly legBL: TerrierLegRig;
  private readonly legBR: TerrierLegRig;
  private readonly shadowMesh: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly dustPuffs: DustPuff[] = [];
  private dustSpawnAccum = 0;

  private readonly sparkleStarMesh: THREE.InstancedMesh;
  private readonly sparkleMoteMesh: THREE.InstancedMesh;
  private readonly sparkleStars: LaunchSparkleParticle[] = [];
  private readonly sparkleMotes: LaunchSparkleParticle[] = [];
  private sparkleTrailWindowSec = 0;
  private sparkleStarAccum = 0;
  private sparkleMoteAccum = 0;
  private sparklesDirty = false;
  private readonly launchForward = new THREE.Vector3(-1, 0, 0);

  constructor(enableShadows: boolean) {
    this.root.name = 'UdoWirehairTerrierActor';

    const tex = getUdoTextures();

    const bodyCoatMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: tex.bodyColorMap,
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.016,
        color: 0xffffff,
        emissive: 0x201f1d,
        emissiveIntensity: 0.14,
        roughness: 0.9,
        metalness: 0.0,
      }),
    );

    const headCoatMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: tex.headColorMap,
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.018,
        color: 0xffffff,
        emissive: 0x181716,
        emissiveIntensity: 0.12,
        roughness: 0.88,
        metalness: 0.01,
      }),
    );

    const whiteWireTuftMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.014,
        color: 0xf7f6f2,
        emissive: 0x22211e,
        emissiveIntensity: 0.15,
        roughness: 0.92,
        metalness: 0.0,
      }),
    );

    const grizzleDarkTuftMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.014,
        color: 0x242322,
        emissive: 0x090909,
        emissiveIntensity: 0.1,
        roughness: 0.87,
        metalness: 0.02,
      }),
    );

    const silverWispMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdad9d4,
        emissive: 0x1c1b1a,
        emissiveIntensity: 0.12,
        roughness: 0.88,
        metalness: 0.0,
      }),
    );

    const earMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: tex.earColorMap,
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.014,
        color: 0xffffff,
        emissive: 0x0c0c0c,
        emissiveIntensity: 0.1,
        roughness: 0.84,
        metalness: 0.01,
        side: THREE.DoubleSide,
      }),
    );

    const noseMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x111012,
        emissive: 0x050506,
        emissiveIntensity: 0.08,
        roughness: 0.2,
        metalness: 0.08,
      }),
    );

    const eyeDarkMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x120c09,
        roughness: 0.07,
        metalness: 0.14,
      }),
    );

    const eyeRimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0e0d0d,
        roughness: 0.65,
        metalness: 0.02,
      }),
    );

    const eyeCatchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const hiddenCollarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1d1e20,
        roughness: 0.55,
        metalness: 0.15,
      }),
    );

    const tongueMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe67a8b,
        roughness: 0.38,
        metalness: 0.02,
      }),
    );

    const pawPadMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x262526,
        roughness: 0.72,
        metalness: 0.02,
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

    // Ground contact shadow (stays flush on chessboard surface)
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.12, 1.54));
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: tex.shadowMap,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.materials.push(this.shadowMat);
    this.shadowMesh = new THREE.Mesh(shadowGeo, this.shadowMat);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.set(0, 0.015, 0.02);
    this.root.add(this.shadowMesh);

    // Agile Jack/Parson Russell Terrier body height
    this.bodyPivot.position.set(0, 0.44, 0);
    this.root.add(this.bodyPivot);

    // 1. Sculpted snowy-white rough-coated terrier torso
    const torsoMesh = makeMesh(createTerrierBodyGeometry(), bodyCoatMat);
    torsoMesh.position.set(0, 0.02, -0.02);
    this.bodyPivot.add(torsoMesh);

    // Scruffy white terrier neck & chest furnishings (broken-coat texture along chest/shoulders)
    const neckColumn = makeMesh(new THREE.CapsuleGeometry(0.165, 0.16, 8, 12), whiteWireTuftMat);
    neckColumn.rotation.x = 0.62;
    neckColumn.position.set(0, 0.165, 0.285);
    this.bodyPivot.add(neckColumn);

    const bodyScruffTufts: ReadonlyArray<{
      p: [number, number, number];
      s: [number, number, number];
      rot?: [number, number, number];
    }> = [
      { p: [0, 0.03, 0.35], s: [1.05, 0.95, 0.92] }, // scruffy white brisket/chest front
      { p: [-0.14, 0.08, 0.21], s: [0.78, 0.72, 0.95], rot: [0, 0.2, 0] }, // left shoulder wirehair
      { p: [0.14, 0.08, 0.21], s: [0.78, 0.72, 0.95], rot: [0, -0.2, 0] }, // right shoulder wirehair
      { p: [0, 0.19, 0.12], s: [0.85, 0.52, 1.15] }, // subtle rough wither coat
    ];
    for (const bt of bodyScruffTufts) {
      const m = makeMesh(new THREE.SphereGeometry(0.15, 10, 8), whiteWireTuftMat);
      m.position.set(bt.p[0], bt.p[1], bt.p[2]);
      m.scale.set(bt.s[0], bt.s[1], bt.s[2]);
      if (bt.rot) m.rotation.set(bt.rot[0], bt.rot[1], bt.rot[2]);
      this.bodyPivot.add(m);
    }

    // Discreet dark collar tucked mostly beneath his scruffy white neck coat (glimpsed on left in Udo's photo)
    const subtleCollar = makeMesh(new THREE.TorusGeometry(0.162, 0.018, 8, 18), hiddenCollarMat, false);
    subtleCollar.position.set(0, 0.16, 0.285);
    subtleCollar.rotation.x = Math.PI / 2 - 0.58;
    this.bodyPivot.add(subtleCollar);

    // 2. Udo's Head: dark grizzled mask + white center blaze + snowy-white scruffy bearded muzzle!
    this.headPivot.position.set(0, 0.295, 0.355);
    this.bodyPivot.add(this.headPivot);

    const headMesh = makeMesh(createUdoHeadGeometry(), headCoatMat);
    headMesh.position.set(0, 0.02, 0.04);
    this.headPivot.add(headMesh);

    // Sculpted 3D white wirehair muzzle beard & mustache furnishings (gives Udo's unmistakable fluffy white snout!)
    const muzzleMustacheLeft = makeMesh(new THREE.SphereGeometry(0.102, 12, 10), whiteWireTuftMat);
    muzzleMustacheLeft.scale.set(0.96, 0.88, 1.24);
    muzzleMustacheLeft.position.set(-0.068, -0.022, 0.248);
    muzzleMustacheLeft.rotation.y = -0.14;
    this.headPivot.add(muzzleMustacheLeft);

    const muzzleMustacheRight = makeMesh(new THREE.SphereGeometry(0.102, 12, 10), whiteWireTuftMat);
    muzzleMustacheRight.scale.set(0.96, 0.88, 1.24);
    muzzleMustacheRight.position.set(0.068, -0.022, 0.248);
    muzzleMustacheRight.rotation.y = 0.14;
    this.headPivot.add(muzzleMustacheRight);

    const snoutBridgeFluff = makeMesh(new THREE.SphereGeometry(0.092, 12, 10), whiteWireTuftMat);
    snoutBridgeFluff.scale.set(1.04, 0.76, 1.32);
    snoutBridgeFluff.position.set(0, 0.032, 0.255);
    this.headPivot.add(snoutBridgeFluff);

    // Feathered radial wirehair furnishings flaring out at the muzzle/cheek border & eyebrows (signature Udo look!)
    for (const side of [-1, 1]) {
      // Scruffy grizzled-and-silver eyebrow arch above each dark eye
      const browDark = makeMesh(new THREE.ConeGeometry(0.036, 0.115, 6), grizzleDarkTuftMat, false);
      browDark.position.set(side * 0.095, 0.125, 0.165);
      browDark.rotation.set(0.55, side * 0.35, side * -0.82);
      this.headPivot.add(browDark);

      const browSilver = makeMesh(new THREE.ConeGeometry(0.024, 0.095, 5), silverWispMat, false);
      browSilver.position.set(side * 0.062, 0.132, 0.178);
      browSilver.rotation.set(0.62, side * 0.22, side * -0.52);
      this.headPivot.add(browSilver);

      // Wispy white wirehair tufts radiating from upper snout just below the eyes (seen clearly in Udo's photo!)
      const snoutWisp1 = makeMesh(new THREE.ConeGeometry(0.028, 0.105, 5), whiteWireTuftMat, false);
      snoutWisp1.position.set(side * 0.105, 0.015, 0.205);
      snoutWisp1.rotation.set(0.18, side * 0.45, side * -1.18);
      this.headPivot.add(snoutWisp1);

      const snoutWisp2 = makeMesh(new THREE.ConeGeometry(0.026, 0.095, 5), whiteWireTuftMat, false);
      snoutWisp2.position.set(side * 0.112, -0.038, 0.235);
      snoutWisp2.rotation.set(-0.1, side * 0.32, side * -1.35);
      this.headPivot.add(snoutWisp2);

      // Dark grizzled cheek scruff framing the rear of the white beard
      const cheekScruff = makeMesh(new THREE.ConeGeometry(0.04, 0.11, 6), grizzleDarkTuftMat, false);
      cheekScruff.position.set(side * 0.172, -0.018, 0.095);
      cheekScruff.rotation.set(-0.15, side * -0.25, side * -1.25);
      this.headPivot.add(cheekScruff);
    }

    // Tousled center-crown wirehair wisps right along the white blaze at the top of Udo's skull
    for (const offset of [
      { x: 0, z: 0.05, rotZ: 0.06, mat: whiteWireTuftMat },
      { x: -0.032, z: 0.02, rotZ: 0.28, mat: silverWispMat },
      { x: 0.032, z: 0.02, rotZ: -0.28, mat: silverWispMat },
    ]) {
      const crestWisp = makeMesh(new THREE.ConeGeometry(0.024, 0.085, 5), offset.mat, false);
      crestWisp.position.set(offset.x, 0.222, offset.z);
      crestWisp.rotation.set(-0.28, 0, offset.rotZ);
      this.headPivot.add(crestWisp);
    }

    // Prominent heart-oval wet black terrier nose centered in the white scruffy muzzle
    const nose = makeMesh(new THREE.SphereGeometry(0.052, 14, 12), noseMat);
    nose.scale.set(1.28, 0.92, 0.92);
    nose.position.set(0, 0.014, 0.372);
    this.headPivot.add(nose);

    // Subtle nostril curves on nose front
    for (const side of [-1, 1]) {
      const nostril = makeMesh(new THREE.SphereGeometry(0.014, 8, 6), eyeRimMat, false);
      nostril.scale.set(0.85, 1.05, 0.6);
      nostril.position.set(side * 0.024, 0.008, 0.412);
      this.headPivot.add(nostril);
    }

    // Soulful, expressive dark almond-round terrier eyes nestled inside the dark grizzle patches
    for (const side of [-1, 1]) {
      const eyelidRim = makeMesh(new THREE.SphereGeometry(0.05, 12, 10), eyeRimMat, false);
      eyelidRim.scale.set(1.08, 0.92, 0.86);
      eyelidRim.position.set(side * 0.094, 0.074, 0.176);
      this.headPivot.add(eyelidRim);

      const eye = makeMesh(new THREE.SphereGeometry(0.045, 14, 12), eyeDarkMat, false);
      eye.scale.set(1.04, 0.96, 0.95);
      eye.position.set(side * 0.095, 0.075, 0.186);
      this.headPivot.add(eye);

      // Warm lifelike upper catchlight + tiny lower glint
      const glintBig = makeMesh(new THREE.SphereGeometry(0.013, 8, 8), eyeCatchlightMat, false);
      glintBig.position.set(side * 0.095 - 0.012, 0.09, 0.226);
      this.headPivot.add(glintBig);

      const glintSmall = makeMesh(new THREE.SphereGeometry(0.0065, 6, 6), eyeCatchlightMat, false);
      glintSmall.position.set(side * 0.095 + 0.014, 0.066, 0.228);
      this.headPivot.add(glintSmall);
    }

    // Articulated white-bearded lower jaw + happy pink tongue when barking
    this.jawPivot.position.set(0, -0.062, 0.155);
    this.headPivot.add(this.jawPivot);

    const lowerJawBeard = makeMesh(new THREE.SphereGeometry(0.088, 12, 10), whiteWireTuftMat);
    lowerJawBeard.scale.set(1.08, 0.72, 1.48);
    lowerJawBeard.position.set(0, -0.022, 0.105);
    this.jawPivot.add(lowerJawBeard);

    // Extra wispy chin-beard tuft underneath jaw
    const chinTuft = makeMesh(new THREE.ConeGeometry(0.045, 0.09, 6), whiteWireTuftMat, false);
    chinTuft.position.set(0, -0.068, 0.145);
    chinTuft.rotation.x = 2.55;
    this.jawPivot.add(chinTuft);

    this.tongueMesh = makeMesh(new THREE.CapsuleGeometry(0.032, 0.082, 5, 8), tongueMat, false);
    this.tongueMesh.rotation.x = Math.PI / 2 + 0.42;
    this.tongueMesh.scale.set(1.12, 1.0, 0.38);
    this.tongueMesh.position.set(0, -0.008, 0.145);
    this.jawPivot.add(this.tongueMesh);

    // 3. Udo's Signature High-Set Side-Folded ("Airplane") Feathered Dark Terrier Ears!
    const buildUdoEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.145, 0.178, -0.005);

      // Sculpted V-shaped semi-drop dark grizzled ear flap arching out sideways & drooping at the tip
      const earFlap = makeMesh(createUdoFoldedEarGeometry(side), earMat);
      pivot.add(earFlap);

      // Silver-white wirehair wisps right at the upper ear fold (matches Udo's photo!)
      const foldSilverWisp = makeMesh(new THREE.ConeGeometry(0.024, 0.095, 5), silverWispMat, false);
      foldSilverWisp.position.set(side * 0.075, 0.038, 0.025);
      foldSilverWisp.rotation.z = side * -1.28;
      foldSilverWisp.rotation.y = side * -0.25;
      pivot.add(foldSilverWisp);

      // Feathered dark charcoal outer ear-tip fringes drooping gracefully at the pointed outer end
      const tipFringeMain = makeMesh(new THREE.ConeGeometry(0.022, 0.095, 5), grizzleDarkTuftMat, false);
      tipFringeMain.position.set(side * 0.258, -0.095, 0.026);
      tipFringeMain.rotation.z = side * -2.38;
      tipFringeMain.rotation.x = 0.12;
      pivot.add(tipFringeMain);

      const tipFringeSub = makeMesh(new THREE.ConeGeometry(0.016, 0.078, 5), grizzleDarkTuftMat, false);
      tipFringeSub.position.set(side * 0.228, -0.068, 0.012);
      tipFringeSub.rotation.z = side * -2.18;
      pivot.add(tipFringeSub);

      this.headPivot.add(pivot);
    };
    buildUdoEar(-1, this.earLeftPivot);
    buildUdoEar(1, this.earRightPivot);

    // 4. Jaunty Compact Upright-Angled White Wirehair Terrier Tail (with subtle dark root patch)
    this.tailPivot.position.set(0, 0.145, -0.375);
    this.bodyPivot.add(this.tailPivot);

    const tailRootSpot = makeMesh(new THREE.SphereGeometry(0.064, 10, 8), grizzleDarkTuftMat);
    tailRootSpot.position.set(0.018, 0.008, -0.012);
    this.tailPivot.add(tailRootSpot);

    const tailShaft = makeMesh(new THREE.CapsuleGeometry(0.045, 0.135, 6, 10), whiteWireTuftMat);
    tailShaft.rotation.x = -0.46; // jaunty compact terrier tail carriage!
    tailShaft.position.set(0, 0.082, -0.041);
    this.tailPivot.add(tailShaft);

    const tailTipTuft = makeMesh(new THREE.ConeGeometry(0.042, 0.072, 6), whiteWireTuftMat);
    tailTipTuft.rotation.x = -0.46;
    tailTipTuft.position.set(0, 0.16, -0.079);
    this.tailPivot.add(tailTipTuft);

    // 5. Four Sturdy, Slightly Fluffy White Wirehair Terrier Legs & Compact Paws
    const buildTerrierLeg = (x: number, y: number, z: number, isBack: boolean): TerrierLegRig => {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      this.bodyPivot.add(hip);

      const upper = makeMesh(
        new THREE.CapsuleGeometry(isBack ? 0.088 : 0.078, 0.12, 6, 10),
        whiteWireTuftMat,
      );
      upper.position.set(0, -0.095, 0);
      hip.add(upper);

      const shin = new THREE.Group();
      shin.position.set(0, -0.19, 0);
      hip.add(shin);

      const lower = makeMesh(new THREE.CapsuleGeometry(0.064, 0.13, 6, 10), whiteWireTuftMat);
      lower.position.set(0, -0.085, 0.008);
      shin.add(lower);

      // Scruffy white wirehair feathering on rear of foreleg/pastern
      const legFeather = makeMesh(new THREE.ConeGeometry(0.036, 0.09, 5), whiteWireTuftMat, false);
      legFeather.position.set(0, -0.095, -0.048);
      legFeather.rotation.x = -2.65;
      shin.add(legFeather);

      // Compact rounded white terrier cat-paw + dark charcoal sole pad
      const paw = makeMesh(new THREE.SphereGeometry(0.072, 10, 8), whiteWireTuftMat);
      paw.scale.set(1.02, 0.72, 1.28);
      paw.position.set(0, -0.185, 0.034);
      shin.add(paw);

      const solePad = makeMesh(new THREE.SphereGeometry(0.052, 8, 6), pawPadMat, false);
      solePad.scale.set(1.0, 0.35, 1.18);
      solePad.position.set(0, -0.218, 0.032);
      shin.add(solePad);

      return { hip, shin };
    };

    this.legFL = buildTerrierLeg(-0.145, -0.03, 0.235, false);
    this.legFR = buildTerrierLeg(0.145, -0.03, 0.235, false);
    this.legBL = buildTerrierLeg(-0.152, -0.02, -0.245, true);
    this.legBR = buildTerrierLeg(0.152, -0.02, -0.245, true);

    // 6. Energetic paw-kick dust puffs as Udo zooms across the chessboard
    const puffGeo = this.trackGeo(new THREE.SphereGeometry(0.072, 8, 6));
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf7f5ef,
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
        life: 0.38,
        active: false,
      });
    }

    // 7. Magical golden 4-point star glints & fairy-dust motes when Udo leaps from Chess Angel's arms
    const sparkleQuadGeo = this.trackGeo(new THREE.PlaneGeometry(1, 1));
    const sparkleStarMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: tex.sparkleStarMap,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    const sparkleMoteMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: tex.sparkleMoteMap,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );

    this.sparkleStarMesh = new THREE.InstancedMesh(sparkleQuadGeo, sparkleStarMat, SPARKLE_STAR_COUNT);
    this.sparkleStarMesh.frustumCulled = false;
    this.sparkleStarMesh.renderOrder = 6;
    this.dustGroup.add(this.sparkleStarMesh);

    this.sparkleMoteMesh = new THREE.InstancedMesh(sparkleQuadGeo, sparkleMoteMat, SPARKLE_MOTE_COUNT);
    this.sparkleMoteMesh.frustumCulled = false;
    this.sparkleMoteMesh.renderOrder = 6;
    this.dustGroup.add(this.sparkleMoteMesh);

    _sparkleMat4.compose(_sparkleSpawnPos.set(0, 0, 0), _sparkleIdentityQuat, _sparkleZeroScale);
    _sparkleColor.setRGB(0, 0, 0);

    for (let i = 0; i < SPARKLE_STAR_COUNT; i++) {
      this.sparkleStarMesh.setMatrixAt(i, _sparkleMat4);
      this.sparkleStarMesh.setColorAt(i, _sparkleColor);
      this.sparkleStars.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.9,
        baseScale: 0.24,
        roll: 0,
        spinSpeed: 0,
        twinklePhase: 0,
        twinkleFreq: 18,
        swirlFreq: 6,
        colorR: 1,
        colorG: 0.92,
        colorB: 0.5,
        active: false,
      });
    }
    this.sparkleStarMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkleStarMesh.instanceColor) this.sparkleStarMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < SPARKLE_MOTE_COUNT; i++) {
      this.sparkleMoteMesh.setMatrixAt(i, _sparkleMat4);
      this.sparkleMoteMesh.setColorAt(i, _sparkleColor);
      this.sparkleMotes.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        life: 0.85,
        baseScale: 0.1,
        roll: 0,
        spinSpeed: 0,
        twinklePhase: 0,
        twinkleFreq: 15,
        swirlFreq: 7,
        colorR: 1,
        colorG: 0.9,
        colorB: 0.45,
        active: false,
      });
    }
    this.sparkleMoteMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkleMoteMesh.instanceColor) this.sparkleMoteMesh.instanceColor.needsUpdate = true;

    // Baseline terrier scale matching Udo jumping from Chess Angel's arms (dynamically calibrated per viewport in triggerWildDogRun)
    this.root.scale.setScalar(1.62);
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

  private emitSparkleParticle(
    pool: LaunchSparkleParticle[],
    isStar: boolean,
    pos: THREE.Vector3,
    forwardDir: THREE.Vector3,
    dogScale: number,
    isInitialBurst: boolean,
  ): void {
    let slot: LaunchSparkleParticle | undefined;
    for (let i = 0; i < pool.length; i++) {
      if (!pool[i].active) {
        slot = pool[i];
        break;
      }
    }
    if (!slot) return;

    // Pick predominantly warm golden-champagne hues (~90%) with rare soft silver-cream glint (~10%)
    const rPick = Math.random();
    const pal =
      rPick < 0.34
        ? SPARKLE_PALETTE[0]
        : rPick < 0.62
          ? SPARKLE_PALETTE[1]
          : rPick < 0.82
            ? SPARKLE_PALETTE[2]
            : rPick < 0.92
              ? SPARKLE_PALETTE[3]
              : SPARKLE_PALETTE[4];

    slot.active = true;
    slot.age = isInitialBurst ? Math.random() * 0.08 : 0;
    slot.life = isStar
      ? (isInitialBurst ? 0.68 : 0.56) + Math.random() * 0.56
      : (isInitialBurst ? 0.62 : 0.5) + Math.random() * 0.52;

    // Hero star glints + medium & petite star cross flares, paired with delicate golden fairy-dust motes
    const sizeRoll = Math.random();
    slot.baseScale = isStar
      ? (sizeRoll > 0.82 ? 0.28 + Math.random() * 0.13 : 0.14 + Math.random() * 0.13) * dogScale
      : (0.055 + Math.random() * 0.075) * dogScale;

    // Keep 4-point star cross rays mostly upright/horizontal like the video, with gentle magical shimmer tilt
    slot.roll = isStar ? (Math.random() - 0.5) * 0.32 : Math.random() * Math.PI * 2;
    slot.spinSpeed = isStar ? (Math.random() - 0.5) * 0.55 : (Math.random() - 0.5) * 1.4;
    slot.twinklePhase = Math.random() * Math.PI * 2;
    slot.twinkleFreq = 16 + Math.random() * 18;
    slot.swirlFreq = 5 + Math.random() * 6;
    slot.colorR = pal[0];
    slot.colorG = pal[1];
    slot.colorB = pal[2];

    slot.pos.copy(pos);

    // Gentle forward carry + airy dispersion so sparkles form a luminous hanging ribbon from Angel's arms
    const carrySpeed = (isInitialBurst ? 0.55 + Math.random() * 1.25 : 0.35 + Math.random() * 0.85) * dogScale;
    const radialSpread = (isInitialBurst ? 0.62 : 0.42) * dogScale;
    slot.vel.set(
      forwardDir.x * carrySpeed + (Math.random() - 0.5) * radialSpread,
      (Math.random() - 0.38) * 0.58 * dogScale,
      forwardDir.z * carrySpeed + (Math.random() - 0.5) * radialSpread,
    );
    this.sparklesDirty = true;
  }

  /**
   * Triggers the burst & trailing ribbon of warm golden 4-point sparkles right as Udo
   * leaps out of Chess Angel's arms, seamlessly continuing the portrait video's sparkles in 3D.
   */
  public triggerLaunchSparkles(
    launchOrigin: THREE.Vector3,
    forwardDir: THREE.Vector3,
    dogScale: number,
  ): void {
    _sparkleFwd.set(forwardDir.x, 0, forwardDir.z);
    if (_sparkleFwd.lengthSq() < 1e-5) _sparkleFwd.set(-1, 0, 0);
    _sparkleFwd.normalize();
    this.launchForward.copy(_sparkleFwd);
    _sparkleRight.crossVectors(_sparkleUpAxis, _sparkleFwd).normalize();

    this.sparkleTrailWindowSec = 0.98;
    this.sparkleStarAccum = 0;
    this.sparkleMoteAccum = 0;

    // Immediate magical burst right around & behind Udo bridging Chess Angel's elevated arms into 3D space
    for (let i = 0; i < 24; i++) {
      const backDist = (-0.06 + Math.random() * 0.78) * dogScale;
      const sideOffset = (Math.random() - 0.5) * 0.48 * dogScale;
      const liftOffset = (0.18 + Math.random() * 0.62) * dogScale;
      _sparkleSpawnPos
        .copy(launchOrigin)
        .addScaledVector(_sparkleFwd, -backDist)
        .addScaledVector(_sparkleRight, sideOffset);
      _sparkleSpawnPos.y += liftOffset;
      this.emitSparkleParticle(this.sparkleStars, true, _sparkleSpawnPos, _sparkleFwd, dogScale, true);
    }

    for (let i = 0; i < 30; i++) {
      const backDist = (-0.08 + Math.random() * 0.85) * dogScale;
      const sideOffset = (Math.random() - 0.5) * 0.54 * dogScale;
      const liftOffset = (0.14 + Math.random() * 0.66) * dogScale;
      _sparkleSpawnPos
        .copy(launchOrigin)
        .addScaledVector(_sparkleFwd, -backDist)
        .addScaledVector(_sparkleRight, sideOffset);
      _sparkleSpawnPos.y += liftOffset;
      this.emitSparkleParticle(this.sparkleMotes, false, _sparkleSpawnPos, _sparkleFwd, dogScale, true);
    }
  }

  public resetDust(): void {
    this.dustSpawnAccum = 0;
    for (const p of this.dustPuffs) {
      p.active = false;
      p.mesh.visible = false;
      p.mat.opacity = 0;
    }

    this.sparkleTrailWindowSec = 0;
    this.sparkleStarAccum = 0;
    this.sparkleMoteAccum = 0;
    _sparkleMat4.compose(_sparkleSpawnPos.set(0, 0, 0), _sparkleIdentityQuat, _sparkleZeroScale);
    _sparkleColor.setRGB(0, 0, 0);

    for (let i = 0; i < this.sparkleStars.length; i++) {
      this.sparkleStars[i].active = false;
      this.sparkleStarMesh.setMatrixAt(i, _sparkleMat4);
      this.sparkleStarMesh.setColorAt(i, _sparkleColor);
    }
    this.sparkleStarMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkleStarMesh.instanceColor) this.sparkleStarMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < this.sparkleMotes.length; i++) {
      this.sparkleMotes[i].active = false;
      this.sparkleMoteMesh.setMatrixAt(i, _sparkleMat4);
      this.sparkleMoteMesh.setColorAt(i, _sparkleColor);
    }
    this.sparkleMoteMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkleMoteMesh.instanceColor) this.sparkleMoteMesh.instanceColor.needsUpdate = true;
    this.sparklesDirty = false;
  }

  /**
   * Animates Udo's exuberant Jack/Parson Russell Terrier bound, bouncing semi-drop airplane ears,
   * rapid terrier tail wag, barking bearded jaw snap, grounded contact shadow, paw puffs, and
   * golden magical jump sparkles.
   */
  public update(
    dt: number,
    elapsedSec: number,
    worldPos: THREE.Vector3,
    groundY: number,
    barkOpen01: number,
    spawnDust: boolean,
    cameraQuat?: THREE.Quaternion,
    moveTangent?: THREE.Vector3,
  ): void {
    const scamperFreq = 25.0; // springy athletic terrier gallop!
    const phase = elapsedSec * scamperFreq;
    const airHeight = Math.max(0, worldPos.y - groundY);

    // Springy terrier bound & shoulder roll
    const strideBounce = Math.abs(Math.sin(phase)) * 0.145;
    this.bodyPivot.position.y = 0.44 + strideBounce;
    this.bodyPivot.rotation.x = Math.cos(phase) * 0.24 - Math.min(0.32, airHeight * 0.2);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.095;

    // Athletic rotary terrier gallop kinematics
    const setLeg = (rig: TerrierLegRig, p: number, isBack: boolean) => {
      const swing = Math.sin(p) * (isBack ? 0.96 : 0.92);
      rig.hip.rotation.x = swing;
      const kneeFlex = Math.max(0, -Math.cos(p)) * (isBack ? 0.88 : 0.96);
      rig.shin.rotation.x = isBack ? -kneeFlex * 0.82 : kneeFlex;
    };
    setLeg(this.legFL, phase, false);
    setLeg(this.legFR, phase + 0.46, false);
    setLeg(this.legBL, phase + Math.PI, true);
    setLeg(this.legBR, phase + Math.PI + 0.46, true);

    // Alert terrier head carriage, inquisitive tilt & barking bearded lower jaw
    const b = THREE.MathUtils.clamp(barkOpen01, 0, 1);
    this.headPivot.rotation.x = -0.1 - b * 0.22 + Math.sin(phase + 0.5) * 0.085;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 9.2) * 0.15;
    this.headPivot.rotation.z = Math.sin(elapsedSec * 11.5) * 0.085;
    this.jawPivot.rotation.x = 0.1 + b * 0.56;
    this.tongueMesh.position.z = 0.145 + b * 0.036;
    this.tongueMesh.rotation.x = Math.PI / 2 + 0.42 + b * 0.22;

    // Udo's folded semi-drop ("airplane") ears bounce springily up & outward as he bounds!
    const earLift = Math.abs(Math.sin(phase - 0.32)) * 0.34 + Math.min(0.35, airHeight * 0.24);
    this.earLeftPivot.rotation.z = -0.06 - earLift;
    this.earRightPivot.rotation.z = 0.06 + earLift;
    this.earLeftPivot.rotation.x = 0.04 - b * 0.1;
    this.earRightPivot.rotation.x = 0.04 - b * 0.1;

    // Classic rapid, spirited terrier tail wag!
    this.tailPivot.rotation.z = Math.sin(elapsedSec * 36.0) * 0.58;
    this.tailPivot.rotation.x = -0.08 + Math.cos(phase) * 0.18;

    // Keep contact shadow flush on the board plane directly below Udo, fading smoothly outside the board rim
    const dogScale = Math.max(0.5, this.root.scale.x);
    const invScale = 1 / dogScale;
    this.shadowMesh.position.y = (groundY + 0.016 - worldPos.y) * invScale;
    const boardPresence = THREE.MathUtils.clamp(
      1 - Math.max(Math.abs(worldPos.x) - 4.15, Math.abs(worldPos.z) - 4.15, 0) * 1.8,
      0,
      1,
    );
    const shadowFade = THREE.MathUtils.clamp(1 - airHeight * 0.28, 0.08, 1) * boardPresence;
    this.shadowMesh.scale.setScalar(0.76 + shadowFade * 0.26);
    this.shadowMat.opacity = 0.44 * shadowFade;

    // Stream magical golden jump sparkles behind Udo's hindquarters & tail during his leap from Angel's arms
    if (this.sparkleTrailWindowSec > 0 && elapsedSec < this.sparkleTrailWindowSec) {
      const trailIntensity = 1 - elapsedSec / this.sparkleTrailWindowSec;
      if (moveTangent && moveTangent.lengthSq() > 1e-5) {
        _sparkleFwd.set(moveTangent.x, 0, moveTangent.z).normalize();
      } else {
        _sparkleFwd.copy(this.launchForward);
      }
      _sparkleRight.crossVectors(_sparkleUpAxis, _sparkleFwd).normalize();

      const starInterval = THREE.MathUtils.lerp(0.065, 0.02, trailIntensity);
      const moteInterval = THREE.MathUtils.lerp(0.055, 0.016, trailIntensity);
      this.sparkleStarAccum += dt;
      this.sparkleMoteAccum += dt;

      while (this.sparkleStarAccum >= starInterval) {
        this.sparkleStarAccum -= starInterval;
        const backDist = (0.18 + Math.random() * 0.46) * dogScale;
        const sideOffset = (Math.random() - 0.5) * 0.36 * dogScale;
        const liftOffset = (0.18 + Math.random() * 0.48) * dogScale;
        _sparkleSpawnPos
          .copy(worldPos)
          .addScaledVector(_sparkleFwd, -backDist)
          .addScaledVector(_sparkleRight, sideOffset);
        _sparkleSpawnPos.y = Math.max(groundY + 0.08, _sparkleSpawnPos.y + liftOffset);
        this.emitSparkleParticle(this.sparkleStars, true, _sparkleSpawnPos, _sparkleFwd, dogScale, false);
      }

      while (this.sparkleMoteAccum >= moteInterval) {
        this.sparkleMoteAccum -= moteInterval;
        const backDist = (0.14 + Math.random() * 0.52) * dogScale;
        const sideOffset = (Math.random() - 0.5) * 0.42 * dogScale;
        const liftOffset = (0.14 + Math.random() * 0.52) * dogScale;
        _sparkleSpawnPos
          .copy(worldPos)
          .addScaledVector(_sparkleFwd, -backDist)
          .addScaledVector(_sparkleRight, sideOffset);
        _sparkleSpawnPos.y = Math.max(groundY + 0.06, _sparkleSpawnPos.y + liftOffset);
        this.emitSparkleParticle(this.sparkleMotes, false, _sparkleSpawnPos, _sparkleFwd, dogScale, false);
      }
    }

    if (this.sparklesDirty) {
      const billboardBase = cameraQuat ?? _sparkleIdentityQuat;
      let anySparkleActive = false;

      const stepSparklePool = (
        pool: LaunchSparkleParticle[],
        instMesh: THREE.InstancedMesh,
        isStar: boolean,
      ) => {
        for (let i = 0; i < pool.length; i++) {
          const sp = pool[i];
          if (!sp.active) continue;

          sp.age += dt;
          if (sp.age >= sp.life) {
            sp.active = false;
            _sparkleMat4.compose(sp.pos, _sparkleIdentityQuat, _sparkleZeroScale);
            _sparkleColor.setRGB(0, 0, 0);
            instMesh.setMatrixAt(i, _sparkleMat4);
            instMesh.setColorAt(i, _sparkleColor);
            continue;
          }

          anySparkleActive = true;
          const k = sp.age / sp.life;

          // Airy deceleration + subtle magical upward float & flutter
          sp.pos.addScaledVector(sp.vel, dt);
          sp.pos.y += Math.sin(elapsedSec * sp.swirlFreq + sp.twinklePhase) * 0.16 * dt;
          sp.vel.multiplyScalar(Math.max(0, 1 - dt * 2.7));
          sp.vel.y += 0.18 * dt;
          if (sp.pos.y < groundY + 0.05) {
            sp.pos.y = groundY + 0.05;
            if (sp.vel.y < 0) sp.vel.y *= -0.25;
          }

          const popIn = Math.min(1, k / 0.12);
          const fadeOut = Math.pow(1 - k, 1.65);
          const twinkle = isStar
            ? 0.56 + 0.44 * Math.sin(elapsedSec * sp.twinkleFreq + sp.twinklePhase)
            : 0.72 + 0.28 * Math.sin(elapsedSec * sp.twinkleFreq + sp.twinklePhase);
          const brightness = popIn * fadeOut * twinkle;
          const curScale = sp.baseScale * (0.68 + 0.42 * popIn * (1 - 0.35 * k)) * (0.82 + 0.24 * twinkle);

          _sparkleRollQuat.setFromAxisAngle(_sparkleZAxis, sp.roll + sp.spinSpeed * sp.age);
          _sparkleQuat.copy(billboardBase).multiply(_sparkleRollQuat);
          _sparkleScaleVec.setScalar(curScale);
          _sparkleMat4.compose(sp.pos, _sparkleQuat, _sparkleScaleVec);
          instMesh.setMatrixAt(i, _sparkleMat4);

          _sparkleColor.setRGB(
            sp.colorR * brightness,
            sp.colorG * brightness,
            sp.colorB * brightness,
          );
          instMesh.setColorAt(i, _sparkleColor);
        }

        instMesh.instanceMatrix.needsUpdate = true;
        if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
      };

      stepSparklePool(this.sparkleStars, this.sparkleStarMesh, true);
      stepSparklePool(this.sparkleMotes, this.sparkleMoteMesh, false);
      this.sparklesDirty = anySparkleActive;
    }

    // Spawn & advance paw puffs scaled proportionally to Udo when paws touch the chessboard
    const overBoard = Math.abs(worldPos.x) < 4.35 && Math.abs(worldPos.z) < 4.35;
    if (spawnDust && overBoard && airHeight < 0.24 * dogScale) {
      this.dustSpawnAccum += dt;
      if (this.dustSpawnAccum >= 0.044) {
        this.dustSpawnAccum = 0;
        const slot = this.dustPuffs.find((p) => !p.active);
        if (slot) {
          const puffScale = THREE.MathUtils.clamp(dogScale / 1.15, 0.85, 1.55);
          slot.active = true;
          slot.age = 0;
          slot.life = 0.36 + Math.random() * 0.18;
          slot.mesh.visible = true;
          slot.mesh.position.set(
            worldPos.x + (Math.random() - 0.5) * 0.38 * puffScale,
            groundY + 0.08,
            worldPos.z + (Math.random() - 0.5) * 0.38 * puffScale,
          );
          slot.mesh.scale.setScalar((0.55 + Math.random() * 0.42) * puffScale);
          slot.vel.set(
            (Math.random() - 0.5) * 0.82 * puffScale,
            (0.52 + Math.random() * 0.62) * puffScale,
            (Math.random() - 0.5) * 0.82 * puffScale,
          );
          slot.mat.opacity = 0.45;
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
      p.vel.multiplyScalar(Math.max(0, 1 - dt * 3.6));
      p.mesh.scale.setScalar(0.55 + k * 1.35);
      p.mat.opacity = 0.45 * (1 - k) * (1 - k);
    }
  }

  public dispose(): void {
    this.sparkleStarMesh.dispose();
    this.sparkleMoteMesh.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
