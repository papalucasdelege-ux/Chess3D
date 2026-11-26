import * as THREE from 'three';

interface CachedUdoTextures {
  bodyColorMap: THREE.CanvasTexture;
  headColorMap: THREE.CanvasTexture;
  earColorMap: THREE.CanvasTexture;
  wireBumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
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

const SPARKLE_STAR_COUNT = 116;
const SPARKLE_MOTE_COUNT = 168;

const SPARKLE_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [1.0, 0.91, 0.48], // warm radiant champagne gold
  [1.0, 0.97, 0.82], // incandescent cream-white gold
  [1.0, 0.82, 0.31], // rich honey-amber gold
  [1.0, 0.94, 0.62], // luminous lemon-gold glint
  [0.94, 0.97, 1.0], // subtle celestial silver-blue glint echoing Angel's sash
];

/**
 * Generates and caches high-resolution procedural CanvasTextures matching **Video Udo**
 * (the fluffy white & charcoal-grizzle wirehaired Jack/Parson Russell Terrier held in Chess Angel's arms):
 * - `bodyColorMap`: 1024x1024 pure snowy-white shaggy terrier coat with warm ivory-silver fur depth (no dark spots!)
 * - `headColorMap`: 1024x1024 exact Video Udo symmetrical dark charcoal-slate eye/cheek/crown mask with
 *   silvery-grey wirehair streaks, crisp snowy-white forehead blaze, and pure fluffy white bearded muzzle
 * - `earColorMap`: 512x512 dark charcoal-slate terrier ear fur streaked with soft silvery-white crease hairs
 * - `wireBumpMap` & `roughnessMap`: shaggy broken-coat terrier fur micro-relief & soft velvet roughness
 * - `shadowMap`, `sparkleStarMap`, `sparkleMoteMap`: contact shadow + golden magical leap sparkles
 */
function getUdoTextures(): CachedUdoTextures {
  if (cachedUdoTextures) return cachedUdoTextures;

  let seed = 4729;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 1. Body Coat Texture (1024x1024): 100% pure fluffy snowy-white shaggy coat matching Video Udo
  const bodySize = 1024;
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = bodySize;
  bodyCanvas.height = bodySize;
  const bCtx = bodyCanvas.getContext('2d');
  if (bCtx) {
    const grad = bCtx.createLinearGradient(0, 0, 0, bodySize);
    grad.addColorStop(0, '#fbfaf7');
    grad.addColorStop(0.55, '#f6f5f2');
    grad.addColorStop(1, '#efeee9');
    bCtx.fillStyle = grad;
    bCtx.fillRect(0, 0, bodySize, bodySize);

    // Layered soft shaggy white & pale warm-silver fur strokes flowing nose-to-rump
    for (let i = 0; i < 8200; i++) {
      const x = rand() * bodySize;
      const y = rand() * bodySize;
      const len = 12 + rand() * 28;
      const jitterX = (rand() - 0.5) * 8.5;
      const roll = rand();
      const alpha = 0.08 + rand() * 0.14;
      if (roll > 0.42) {
        bCtx.strokeStyle = `rgba(255, 255, 253, ${(alpha * 1.4).toFixed(3)})`;
      } else if (roll > 0.12) {
        bCtx.strokeStyle = `rgba(202, 200, 194, ${alpha.toFixed(3)})`;
      } else {
        bCtx.strokeStyle = `rgba(176, 174, 168, ${(alpha * 0.78).toFixed(3)})`;
      }
      bCtx.lineWidth = 1.1 + rand() * 1.65;
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.quadraticCurveTo(x + jitterX * 0.55, y + len * 0.5, x + jitterX, y + len);
      bCtx.stroke();
    }
  }

  // 2. Head Coat Texture (1024x1024): Video Udo's exact symmetrical dark charcoal mask,
  // crisp white center forehead blaze, and pure snowy-white fluffy bearded snout!
  // UV convention on sculpted head:
  // - v = 0 (back of skull/nape) .. v = 1 (front nose tip); Canvas flipY=true -> py = (1 - v) * size
  // - u = angle / 2PI around Z: u = 0.25 dorsal top (+Y), u = 0.0/0.5 lateral cheeks, u = 0.75 ventral chin (-Y).
  const headSize = 1024;
  const headCanvas = document.createElement('canvas');
  headCanvas.width = headSize;
  headCanvas.height = headSize;
  const hCtx = headCanvas.getContext('2d');
  if (hCtx) {
    const img = hCtx.createImageData(headSize, headSize);
    const data = img.data;

    for (let py = 0; py < headSize; py++) {
      const v = 1 - py / (headSize - 1); // 0 = nape, 0.48 = eyes/stop, 1.0 = nose tip
      for (let px = 0; px < headSize; px++) {
        const u = px / (headSize - 1);
        const angle = u * Math.PI * 2;
        const cosA = Math.cos(angle); // lateral X: +1 right, -1 left, 0 top/bottom centerline
        const sinA = Math.sin(angle); // vertical Y: +1 dorsal top, -1 ventral chin/throat
        const latAbs = Math.abs(cosA);

        let darkMask = 0;

        // Video Udo's mask wraps symmetrically over both temples, eyes, upper cheeks & outer crown,
        // curving cleanly down the lateral cheek (v up to ~0.58) while keeping his fluffy white muzzle,
        // white beard/chin/throat, white neck nape, and bright center forehead blaze crisp snowy-white!
        if (sinA > -0.44 && v < 0.65) {
          // Cheek patches sweep forward around the eyes & upper cheeks then curve gracefully back into the white beard
          const cheekForwardReach =
            0.5 +
            0.115 * Math.exp(-Math.pow((sinA - 0.02) / 0.46, 2)) -
            0.05 * Math.max(0, -sinA - 0.15);
          const frontFade = THREE.MathUtils.clamp((cheekForwardReach - v) / 0.075, 0, 1);

          // Crisp feathered rear edge meeting his snowy-white fluffy neck ruff (matches Video Udo mid-leap!)
          const napeLimit = 0.12 - 0.05 * Math.max(0, sinA);
          const napeFade = THREE.MathUtils.clamp((v - napeLimit) / 0.085, 0, 1);

          // Pure white under-jaw & throat
          const throatFade = THREE.MathUtils.clamp((sinA + 0.34) / 0.22, 0, 1);

          // Iconic bright snowy-white center forehead blaze running straight up between his eyes!
          let blazeWhiteness = 0;
          if (sinA > 0.18) {
            const blazeHalfWidth =
              v > 0.45
                ? 0.145 + (v - 0.45) * 1.65
                : 0.145 + 0.055 * Math.exp(-Math.pow((v - 0.26) / 0.18, 2));
            blazeWhiteness =
              1 - THREE.MathUtils.clamp((latAbs - blazeHalfWidth * 0.58) / (blazeHalfWidth * 0.64), 0, 1);
          }

          darkMask = frontFade * napeFade * throatFade * (1 - blazeWhiteness);

          // Richer dark charcoal accent right around the eye sockets & upper cheek patch
          const eyeZone =
            Math.exp(-Math.pow((v - 0.48) / 0.095, 2)) *
            Math.exp(-Math.pow((latAbs - 0.54) / 0.26, 2)) *
            (sinA > -0.12 ? 1 : 0);
          darkMask = THREE.MathUtils.clamp(darkMask + eyeZone * 0.42 * (1 - blazeWhiteness), 0, 1);
        }

        const grain = (rand() - 0.5) * 16;
        // Warm snowy white (250, 248, 244) vs Video Udo's rich charcoal-slate grizzle (34, 35, 37)
        const r = 250 * (1 - darkMask) + 34 * darkMask + grain * (0.4 + darkMask * 0.55);
        const g = 248 * (1 - darkMask) + 35 * darkMask + grain * (0.4 + darkMask * 0.55);
        const b = 244 * (1 - darkMask) + 37 * darkMask + grain * (0.4 + darkMask * 0.55);

        const idx = (py * headSize + px) * 4;
        data[idx] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
        data[idx + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
        data[idx + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
        data[idx + 3] = 255;
      }
    }
    hCtx.putImageData(img, 0, 0);

    // Rich painterly shaggy wirehair strokes — silver-white & charcoal feathering matching Video Udo
    for (let i = 0; i < 11500; i++) {
      const u = rand();
      const v = rand();
      const px = u * headSize;
      const py = (1 - v) * headSize;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const latAbs = Math.abs(cosA);

      const inMaskZone = sinA > -0.32 && v > 0.1 && v < 0.58 && latAbs > 0.15;
      const len = 10 + rand() * 24;
      const dirX = cosA * (4.0 + rand() * 8.0) + (rand() - 0.5) * 4.5;
      const dirY = (v > 0.48 ? -1 : 1) * len * 0.85;

      if (inMaskZone) {
        // Silvery-grey grizzle highlights woven through charcoal-black cheek & brow fur
        const roll = rand();
        if (roll > 0.7) {
          const alpha = 0.2 + rand() * 0.28;
          hCtx.strokeStyle = `rgba(210, 212, 214, ${alpha.toFixed(3)})`;
        } else if (roll > 0.46) {
          const alpha = 0.22 + rand() * 0.26;
          hCtx.strokeStyle = `rgba(92, 95, 98, ${alpha.toFixed(3)})`;
        } else {
          const alpha = 0.25 + rand() * 0.3;
          hCtx.strokeStyle = `rgba(20, 21, 23, ${alpha.toFixed(3)})`;
        }
      } else {
        // Fluffy snowy-white mustache, chin beard, blaze & neck ruff strands
        const isShadow = rand() > 0.62;
        const alpha = 0.14 + rand() * 0.2;
        hCtx.strokeStyle = isShadow
          ? `rgba(196, 195, 190, ${alpha.toFixed(3)})`
          : `rgba(255, 255, 253, ${(alpha * 1.35).toFixed(3)})`;
      }
      hCtx.lineWidth = 1.0 + rand() * 1.6;
      hCtx.beginPath();
      hCtx.moveTo(px, py);
      hCtx.lineTo(px + dirX, py + dirY);
      hCtx.stroke();
    }
  }

  // 3. Ear Texture (512x512): Video Udo's dark charcoal-slate folded V-ears with soft silver-grey fold highlights
  const earSize = 512;
  const earCanvas = document.createElement('canvas');
  earCanvas.width = earSize;
  earCanvas.height = earSize;
  const eCtx = earCanvas.getContext('2d');
  if (eCtx) {
    const eGrad = eCtx.createLinearGradient(0, 0, 0, earSize);
    eGrad.addColorStop(0, '#1d1f21'); // dark charcoal V-tip
    eGrad.addColorStop(0.55, '#2b2d30');
    eGrad.addColorStop(0.84, '#3e4145'); // soft grizzled upper crease
    eGrad.addColorStop(1, '#4c4f54');
    eCtx.fillStyle = eGrad;
    eCtx.fillRect(0, 0, earSize, earSize);

    // Soft silvery-grey rim & crease feathering matching Video Udo's folded ears
    for (let i = 0; i < 3600; i++) {
      const x = rand() * earSize;
      const y = rand() * earSize;
      const len = 10 + rand() * 24;
      const nearCrease = y > earSize * 0.56;
      const nearEdge = x < earSize * 0.16 || x > earSize * 0.84;
      const silverChance = nearCrease ? 0.42 : nearEdge ? 0.34 : 0.16;
      const isSilver = rand() < silverChance;
      const alpha = isSilver ? 0.18 + rand() * 0.28 : 0.24 + rand() * 0.28;
      eCtx.strokeStyle = isSilver
        ? `rgba(214, 216, 218, ${alpha.toFixed(3)})`
        : `rgba(14, 15, 17, ${alpha.toFixed(3)})`;
      eCtx.lineWidth = 1.1 + rand() * 1.5;
      eCtx.beginPath();
      eCtx.moveTo(x, y);
      eCtx.lineTo(x + (rand() - 0.5) * 6, y - len);
      eCtx.stroke();
    }
  }

  // 4. Shaggy Wirehair Bump Map (512x512, linear data)
  const bumpSize = 512;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = bumpSize;
  bumpCanvas.height = bumpSize;
  const bumpCtx = bumpCanvas.getContext('2d');
  if (bumpCtx) {
    bumpCtx.fillStyle = '#808080';
    bumpCtx.fillRect(0, 0, bumpSize, bumpSize);
    for (let i = 0; i < 7200; i++) {
      const x = rand() * bumpSize;
      const y = rand() * bumpSize;
      const len = 8 + rand() * 19;
      const shade = Math.round(72 + rand() * 124);
      bumpCtx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.48)`;
      bumpCtx.lineWidth = 1.1 + rand() * 1.4;
      bumpCtx.beginPath();
      bumpCtx.moveTo(x, y);
      bumpCtx.lineTo(x + (rand() - 0.5) * 5.5, y + len);
      bumpCtx.stroke();
    }
  }

  // 5. Soft Fur Roughness Variation Map (512x512, linear data)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = bumpSize;
  roughCanvas.height = bumpSize;
  const rCtx = roughCanvas.getContext('2d');
  if (rCtx) {
    rCtx.fillStyle = '#e0e0e0';
    rCtx.fillRect(0, 0, bumpSize, bumpSize);
    for (let i = 0; i < 3600; i++) {
      const x = rand() * bumpSize;
      const y = rand() * bumpSize;
      const len = 9 + rand() * 20;
      const val = Math.round(205 + rand() * 45);
      rCtx.strokeStyle = `rgba(${val}, ${val}, ${val}, 0.36)`;
      rCtx.lineWidth = 1.2 + rand() * 1.5;
      rCtx.beginPath();
      rCtx.moveTo(x, y);
      rCtx.lineTo(x + (rand() - 0.5) * 4.5, y + len);
      rCtx.stroke();
    }
  }

  // 6. Soft Grounded Contact Shadow (128x128)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d');
  if (sCtx) {
    const sGrad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 58);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.54)');
    sGrad.addColorStop(0.56, 'rgba(0, 0, 0, 0.24)');
    sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
  }

  // 7. Magical 4-Point Star Glint Sparkle Texture (128x128) — matches portrait jump sparkles
  const starCanvas = document.createElement('canvas');
  starCanvas.width = 128;
  starCanvas.height = 128;
  const stCtx = starCanvas.getContext('2d');
  if (stCtx) {
    stCtx.clearRect(0, 0, 128, 128);
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

    for (let k = 0; k < 4; k++) {
      drawStarRay(k * (Math.PI * 0.5), 60, 4.3, 1.0);
      drawStarRay(k * (Math.PI * 0.5) + Math.PI * 0.25, 24, 2.0, 0.78);
    }

    const coreGrad = stCtx.createRadialGradient(64, 64, 0, 64, 64, 9);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    coreGrad.addColorStop(0.46, 'rgba(255, 250, 214, 0.94)');
    coreGrad.addColorStop(1, 'rgba(255, 232, 138, 0)');
    stCtx.fillStyle = coreGrad;
    stCtx.beginPath();
    stCtx.arc(64, 64, 9, 0, Math.PI * 2);
    stCtx.fill();
  }

  // 8. Luminous Golden Fairy-Dust Bokeh Mote Texture (64x64)
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
  bodyColorMap.anisotropy = 4;

  const headColorMap = new THREE.CanvasTexture(headCanvas);
  headColorMap.colorSpace = THREE.SRGBColorSpace;
  headColorMap.wrapS = THREE.RepeatWrapping;
  headColorMap.wrapT = THREE.ClampToEdgeWrapping;
  headColorMap.anisotropy = 4;

  const earColorMap = new THREE.CanvasTexture(earCanvas);
  earColorMap.colorSpace = THREE.SRGBColorSpace;
  earColorMap.wrapS = THREE.ClampToEdgeWrapping;
  earColorMap.wrapT = THREE.ClampToEdgeWrapping;
  earColorMap.anisotropy = 4;

  const wireBumpMap = new THREE.CanvasTexture(bumpCanvas);
  wireBumpMap.wrapS = THREE.RepeatWrapping;
  wireBumpMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

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
    roughnessMap,
    shadowMap,
    sparkleStarMap,
    sparkleMoteMap,
  };
  return cachedUdoTextures;
}

/**
 * Sculpts Video Udo's compact, plush, shaggy snowy-white wirehaired terrier torso:
 * - Proper right-handed Rx(+PI/2) remapping (`-sz -> y`, `sy -> z`) so ALL normals face cleanly outward!
 * - Deep fluffy chest/brisket ruff, soft muscular back, gentle waist tuck, plush rounded hindquarters
 * - Subtle organic shaggy fur-wave contour so his white coat reads genuinely fluffy from every angle
 */
function createTerrierBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 44, 34);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  const halfLen = 0.545;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (rump) .. +1 (front chest)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5;
    const radial = Math.sqrt(sx * sx + sz * sz);
    // Proper rotation Rx(+PI/2): x = sx, y = -sz, z = sy (det = +1 -> strictly outward normals!)
    const angle = Math.atan2(-sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? -sz / radial : 0; // +1 dorsal back, -1 ventral chest/belly

    // Plush furry chest/shoulders (t ≈ +0.36), athletic terrier waist tuck (t ≈ -0.18), rounded fluffy rump
    const ribWidth =
      0.214 *
      (1.0 +
        0.145 * Math.exp(-Math.pow((t - 0.34) / 0.44, 2)) -
        0.085 * Math.exp(-Math.pow((t + 0.16) / 0.36, 2)) +
        0.075 * Math.exp(-Math.pow((t + 0.58) / 0.34, 2)));

    // Level athletic terrier topline with slightly plush wither ruff
    const topHeight =
      0.19 *
      (1.0 +
        0.095 * Math.exp(-Math.pow((t - 0.44) / 0.4, 2)) +
        0.03 * Math.exp(-Math.pow((t + 0.52) / 0.36, 2)));

    // Fluffy white chest ruff in front, clean athletic belly tuck toward rear so his longer legs read clearly
    const bellyDepth =
      0.198 *
      (1.0 +
        0.2 * Math.exp(-Math.pow((t - 0.38) / 0.44, 2)) -
        0.24 * Math.exp(-Math.pow((t + 0.34) / 0.42, 2)));

    // Subtle shaggy terrier coat waves along lower chest, flanks & haunches
    const shaggyWave =
      1.0 +
      0.019 * Math.sin(t * 15.0 + cosA * 4.5) * (1 - t * t) * (sinA < 0.25 ? 1.25 : 0.7) +
      0.013 * Math.cos(sinA * 10.0 - t * 11.0) * (1 - t * t);

    const x = cosA * radial * ribWidth * shaggyWave;
    const y = (sinA >= 0 ? sinA * topHeight : sinA * bellyDepth) * radial * shaggyWave;
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
 * Sculpts Video Udo's exact appealing wirehaired terrier head:
 * - Proper right-handed Rx(+PI/2) remapping (`det = +1`) for strictly outward normals & lighting
 * - Broad expressive dark-masked cranium & rounded cheeks
 * - Gentle orbital sockets & raised bushy brow ridge so his soulful dark eyes nestle organically
 * - Distinct terrier stop dropping into his iconic ROUND, PLUMP, SHAGGY WHITE MUSTACHE/BEARD MUZZLE
 *   (noticeably rounder & cuter than a long pointy snout, matching Udo in Chess Angel's arms!)
 */
function createUdoHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 52, 38);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (nape) .. +1 (snout tip)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5; // 0 = nape, 0.5 = eyes/stop, 1.0 = nose tip
    const radial = Math.sqrt(sx * sx + sz * sz);
    // Proper rotation Rx(+PI/2): det = +1 -> outward normals!
    const angle = Math.atan2(-sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? -sz / radial : 0; // +1 forehead/bridge, -1 jaw/beard
    const absCos = Math.abs(cosA);

    // Distinct puppy-terrier stop step-down between rounded forehead cranium (t < 0) and fluffy muzzle (t > 0.08)
    const stopStep = 0.5 * (1 - Math.tanh((t - 0.02) * 5.6)); // ~1 on cranium, ~0 on muzzle

    // Full fluffy cheek-beard & round mustache cushions framing the lower snout (signature Video Udo silhouette!)
    const mustachePuff =
      0.044 *
      Math.exp(-Math.pow((t - 0.52) / 0.34, 2)) *
      Math.exp(-Math.pow((sinA + 0.16) / 0.52, 2)) *
      (0.55 + 0.45 * absCos);

    // Subtle dark-masked zygomatic cheek fullness beneath the eyes
    const cheekFluff =
      0.024 *
      Math.exp(-Math.pow((t + 0.1) / 0.34, 2)) *
      Math.exp(-Math.pow((sinA + 0.18) / 0.48, 2)) *
      absCos;

    // Gentle orbital eye-socket recesses + expressive shaggy brow ridge above eyes
    const eyeSocket =
      -0.016 *
      Math.exp(-Math.pow((t - 0.04) / 0.16, 2)) *
      Math.exp(-Math.pow((sinA - 0.32) / 0.2, 2)) *
      Math.exp(-Math.pow((absCos - 0.58) / 0.24, 2));

    const browRidge =
      0.02 *
      Math.exp(-Math.pow((t - 0.02) / 0.2, 2)) *
      Math.exp(-Math.pow((sinA - 0.62) / 0.2, 2)) *
      Math.exp(-Math.pow((absCos - 0.48) / 0.32, 2));

    // Delicate vertical philtrum crease between left & right white mustache puffs right under the nose
    const philtrum =
      -0.014 *
      Math.exp(-Math.pow((t - 0.84) / 0.16, 2)) *
      Math.exp(-Math.pow((sinA + 0.22) / 0.28, 2)) *
      Math.exp(-Math.pow(cosA / 0.22, 2));

    // Compact, full, adorably boxy-round muzzle width & rounded skull
    const muzzleEndRound = t > 0.7 ? 1.0 - 0.22 * Math.pow((t - 0.7) / 0.3, 1.8) : 1.0;
    const widthProfile =
      (0.156 + 0.082 * stopStep) * muzzleEndRound + mustachePuff + cheekFluff + eyeSocket;
    const topProfile = (0.118 + 0.095 * stopStep) * muzzleEndRound + browRidge + eyeSocket * 0.4;
    const botProfile =
      (0.132 + 0.036 * stopStep) * muzzleEndRound + mustachePuff * 0.55 + philtrum * 0.35;

    const x = cosA * radial * widthProfile;
    let y = (sinA >= 0 ? sinA * topProfile : sinA * botProfile) * radial;
    // Expressive puppy-terrier forehead lift + slightly level/blunt nose tip
    y += 0.036 * stopStep - (1 - stopStep) * 0.022;

    // Compact, cute snout length matching Video Udo (slightly shorter & fuller than a long working terrier!)
    const z = (t >= 0 ? t * 0.305 : t * 0.242) + mustachePuff * 0.25 + philtrum;
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
 * Sculpts Video Udo's signature high-set **folded forward-drop V-shaped button ear**
 * (solid 3D closed lofted mesh with thick rounded margins, subtle concave inner fold,
 * and guaranteed outward-facing normals for both left and right ears — NOT a flat airplane wing!).
 */
function createUdoButtonEarGeometry(side: number): THREE.BufferGeometry {
  // Smooth 3D spine path from skull root -> slight upward-outward arch -> folded forward-downward V-flap framing cheek
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(side * 0.056, 0.044, 0.024),
    new THREE.Vector3(side * 0.118, 0.022, 0.068),
    new THREE.Vector3(side * 0.146, -0.058, 0.098),
    new THREE.Vector3(side * 0.132, -0.142, 0.116),
  ]);

  const lenSegs = 20;
  const ringSegs = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const chordDir = new THREE.Vector3();
  const thickDir = new THREE.Vector3();
  const refForward = new THREE.Vector3(0, 0, 1);
  const v = new THREE.Vector3();

  for (let i = 0; i <= lenSegs; i++) {
    const s = i / lenSegs; // 0 = ear base on skull, 1 = softly rounded dark V-tip
    spineCurve.getPointAt(s, pt);
    spineCurve.getTangentAt(s, tan).normalize();

    // Build stable right-handed frame (thickDir, chordDir, tan) along the folded V-flap
    // so chordDir spans front-to-back across the triangular ear flap and thickDir gives solid 3D ear thickness
    chordDir.crossVectors(tan, new THREE.Vector3(side, 0.18, 0.15));
    if (chordDir.lengthSq() < 1e-4) chordDir.copy(refForward);
    chordDir.normalize();
    thickDir.crossVectors(chordDir, tan).normalize();
    // Ensure thickDir consistently points outward away from the skull
    if (thickDir.x * side < -0.2) {
      thickDir.negate();
      chordDir.negate();
    }

    // Triangular V-ear flap width: broad near the upper fold (s ≈ 0.34), tapering gracefully to a softly rounded V-tip
    const capRound =
      s < 0.06
        ? Math.sin((s / 0.06) * Math.PI * 0.5)
        : s > 0.9
          ? Math.cos(((s - 0.9) / 0.1) * Math.PI * 0.5)
          : 1.0;
    const flapHalfWidth =
      (0.092 * Math.sin(Math.pow(s, 0.62) * Math.PI * 0.88 + 0.22) * (1 - 0.62 * s * s) + 0.012 * (1 - s)) *
      Math.max(0.06, capRound);
    const flapHalfThick = (0.022 * (1 - 0.58 * s) + 0.005) * Math.max(0.08, capRound);

    for (let j = 0; j <= ringSegs; j++) {
      const uRing = j / ringSegs;
      const theta = uRing * Math.PI * 2;
      const cosT = Math.cos(theta); // along ear thickness (+outward, -inner cheek side)
      const sinT = Math.sin(theta); // along flap width (-rear margin .. +front margin)

      // Subtle natural ear cup concavity on the inner side facing the cheek
      const cupOffset = -0.014 * (1 - sinT * sinT) * Math.sin(s * Math.PI);

      v.copy(pt)
        .addScaledVector(thickDir, cosT * flapHalfThick + cupOffset)
        .addScaledVector(chordDir, sinT * flapHalfWidth);
      positions.push(v.x, v.y, v.z);
      uvs.push(uRing, s);
    }
  }

  const rowStride = ringSegs + 1;
  // Verify winding orientation from a mid-flap quad against thickDir so normals ALWAYS point outward
  const midI = Math.floor(lenSegs * 0.5);
  const a0 = midI * rowStride;
  const b0 = a0 + 1;
  const c0 = a0 + rowStride;
  const pA = new THREE.Vector3(positions[a0 * 3], positions[a0 * 3 + 1], positions[a0 * 3 + 2]);
  const pB = new THREE.Vector3(positions[b0 * 3], positions[b0 * 3 + 1], positions[b0 * 3 + 2]);
  const pC = new THREE.Vector3(positions[c0 * 3], positions[c0 * 3 + 1], positions[c0 * 3 + 2]);
  spineCurve.getPointAt(midI / lenSegs, pt);
  const testNorm = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pC, pA));
  const radialOut = new THREE.Vector3().subVectors(pA, pt);
  const flipWinding = testNorm.dot(radialOut) < 0;

  for (let i = 0; i < lenSegs; i++) {
    for (let j = 0; j < ringSegs; j++) {
      const a = i * rowStride + j;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      if (flipWinding) {
        indices.push(a, c, b);
        indices.push(b, c, d);
      } else {
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts a soft, organic, gently curved shaggy fur lock (replaces spiky raw ConeGeometry!).
 * Always maintains positive Jacobian determinant -> clean outward normals.
 */
function createSculptedFurLockGeometry(
  rx: number,
  ry: number,
  rz: number,
  tipTaper = 0.24,
  curveBackZ = 0.0,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 14, 12);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 base .. +1 soft feathered tip
    const sz = pos.getZ(i);

    const u = (sy + 1) * 0.5; // 0 at base -> 1 at tip
    const profile = THREE.MathUtils.lerp(1.0, tipTaper, Math.pow(u, 1.35)) * (1.0 + 0.14 * Math.sin(u * Math.PI));
    const x = sx * rx * profile;
    const y = sy * ry;
    const z = sz * rz * profile + curveBackZ * u * u;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts Video Udo's cute prominent glossy rounded-triangle black terrier nose with subtle twin nostrils.
 */
function createTerrierNoseGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 22, 18);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    // Classic cute rounded heart/inverted-triangle dog nose silhouette
    const triWidth = sy > 0 ? 1.24 + sy * 0.06 : 1.24 + sy * 0.44;
    const topFlat = sy > 0.35 ? -0.14 * (sy - 0.35) : 0;
    const centerCleft =
      sz > 0.1 && sy < 0.2
        ? -0.12 * Math.exp(-Math.pow(sx / 0.18, 2)) * (0.2 - sy) * sz
        : 0;
    const nostrilDimple =
      sz > 0.25
        ? -0.16 *
          Math.exp(-Math.pow((Math.abs(sx) - 0.46) / 0.22, 2)) *
          Math.exp(-Math.pow((sy + 0.04) / 0.26, 2)) *
          sz
        : 0;

    const x = sx * 0.056 * triWidth;
    const y = (sy * 0.044 + topFlat * 0.044);
    const z = sz * 0.045 + nostrilDimple * 0.032 + centerCleft * 0.025;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a flush curved spherical-cap cornea catchlight sitting smoothly on the eye surface.
 */
function createFlushEyeGlintGeometry(eyeRadius: number, angularRadius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(
    eyeRadius + 0.0016,
    12,
    8,
    0,
    Math.PI * 2,
    0,
    angularRadius,
  );
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Sculpts a happy curved pink terrier tongue peeking out during Video Udo's joyful open-mouth leap/bark.
 */
function createSculptedTongueGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i); // -1 root .. +1 tip

    const u = (sz + 1) * 0.5;
    const width = 0.042 * (0.78 + 0.26 * Math.sin(u * Math.PI));
    const curlDown = -0.032 * u * u;
    const centerGroove = sy > 0 ? -0.005 * Math.exp(-Math.pow(sx / 0.28, 2)) : 0;

    const x = sx * width;
    const y = sy * 0.014 + curlDown + centerGroove;
    const z = u * 0.108;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts Video Udo's pure-white fluffy tapered carrot terrier tail (pivoting cleanly at y = 0).
 */
function createSculptedTerrierTailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 18, 16);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 rump root .. +1 fluffy tapered tip
    const sz = pos.getZ(i);

    const u = (sy + 1) * 0.5; // 0 base -> 1 tip
    // Plump fluffy white base tapering smoothly into a lively slightly-curved carrot tip (no dark spot!)
    const radius = 0.056 * (1 - 0.66 * Math.pow(u, 1.35)) * (1 + 0.12 * Math.sin(u * Math.PI));
    const shaggy = 1 + 0.06 * Math.sin(u * 14 + sx * 4) * (1 - u);
    const x = sx * radius * shaggy;
    const y = u * 0.255;
    // Jaunty natural backward-and-slightly-upward terrier tail curve
    const z = sz * radius * shaggy - u * 0.115 + u * u * 0.042;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts a soft shaggy white terrier upper thigh/shoulder or feathered lower leg segment.
 */
function createSculptedLegSegmentGeometry(
  rxTop: number,
  rxBot: number,
  length: number,
  featherBack: number,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 16, 14);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // +1 top .. -1 bottom
    const sz = pos.getZ(i);

    const u = (1 - sy) * 0.5; // 0 top -> 1 bottom
    const r = THREE.MathUtils.lerp(rxTop, rxBot, Math.pow(u, 0.85));
    // Soft shaggy fur feathering along the back of the leg (like Video Udo's fluffy legs!)
    const rearFluff = sz < 0 ? 1 + featherBack * Math.sin(u * Math.PI) * (-sz) : 1;
    const x = sx * r;
    const y = sy * (length * 0.5);
    const z = sz * r * 1.08 * rearFluff;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
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
 * Procedural 3D likeness of **Video Udo** (the fluffy wirehaired terrier held in Chess Angel's arms):
 * - Pure snowy-white plush shaggy terrier body, fluffy chest ruff, feathered legs, white paws & carrot tail
 * - Symmetrical dark charcoal-slate grizzle eye/cheek/crown mask with silvery-grey wirehair streaks
 * - Crisp snowy-white center forehead blaze flowing into a full, rounded, fluffy white mustache & beard
 * - Expressive dark eyes nestled under sculpted bushy eyebrows + glossy rounded-triangle black nose
 * - High-set dark charcoal-slate folded forward-drop ("button") V-ears framing his cheeks
 * - Cheerful open-mouth smile with curved pink tongue during leaps & barks + golden magical leap sparkles
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

    // Warm velvety PBR fur materials matching Video Udo's painterly plush white & charcoal coat
    const bodyCoatMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.bodyColorMap,
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.017,
        roughnessMap: tex.roughnessMap,
        color: 0xffffff,
        emissive: 0x242320,
        emissiveIntensity: 0.16,
        roughness: 0.91,
        metalness: 0.0,
        sheen: 0.65,
        sheenRoughness: 0.78,
        sheenColor: new THREE.Color(0xfffdf8),
      }),
    );

    const headCoatMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.headColorMap,
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.019,
        roughnessMap: tex.roughnessMap,
        color: 0xffffff,
        emissive: 0x1b1b1a,
        emissiveIntensity: 0.13,
        roughness: 0.9,
        metalness: 0.0,
        sheen: 0.62,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(0xe6e8ec),
      }),
    );

    const whiteWireTuftMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.015,
        roughnessMap: tex.roughnessMap,
        color: 0xf9f8f4,
        emissive: 0x262522,
        emissiveIntensity: 0.17,
        roughness: 0.92,
        metalness: 0.0,
        sheen: 0.68,
        sheenRoughness: 0.76,
        sheenColor: new THREE.Color(0xffffff),
      }),
    );

    const grizzleDarkTuftMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.015,
        color: 0x2a2c2f,
        emissive: 0x0b0c0d,
        emissiveIntensity: 0.1,
        roughness: 0.88,
        metalness: 0.0,
        sheen: 0.52,
        sheenRoughness: 0.82,
        sheenColor: new THREE.Color(0x9ca2aa),
      }),
    );

    const silverWispMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.012,
        color: 0xd6d8dc,
        emissive: 0x1e1f21,
        emissiveIntensity: 0.12,
        roughness: 0.89,
        metalness: 0.0,
        sheen: 0.58,
        sheenRoughness: 0.78,
        sheenColor: new THREE.Color(0xf7f8fa),
      }),
    );

    const earMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: tex.earColorMap,
        bumpMap: tex.wireBumpMap,
        bumpScale: 0.015,
        roughnessMap: tex.roughnessMap,
        color: 0xffffff,
        emissive: 0x0d0e10,
        emissiveIntensity: 0.11,
        roughness: 0.86,
        metalness: 0.0,
        sheen: 0.54,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(0xaab0b8),
      }),
    );

    const noseMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x101113,
        emissive: 0x040406,
        emissiveIntensity: 0.06,
        roughness: 0.14,
        metalness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
      }),
    );

    const eyeDarkMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x180e08, // warm soulful dark espresso-obsidian like Video Udo's eyes
        roughness: 0.03,
        metalness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        reflectivity: 1.0,
        ior: 1.52,
      }),
    );

    const eyeRimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x111112,
        roughness: 0.62,
        metalness: 0.0,
      }),
    );

    const eyeCatchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const mouthInnerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x451f26,
        roughness: 0.58,
        metalness: 0.0,
      }),
    );

    const tongueMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xed7b90,
        emissive: 0x3a1019,
        emissiveIntensity: 0.16,
        roughness: 0.28,
        metalness: 0.0,
        clearcoat: 0.45,
        clearcoatRoughness: 0.24,
      }),
    );

    const pawPadMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x353234,
        roughness: 0.72,
        metalness: 0.0,
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
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.14, 2.02));
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

    // Athletic, sleek, long-legged terrier stance matching Video Udo (paws rest flush at y = 0)
    this.bodyPivot.position.set(0, 0.606, 0);
    this.root.add(this.bodyPivot);

    // 1. Sculpted pure snowy-white shaggy terrier torso (NO dark hip spot, NO black collar!)
    const torsoMesh = makeMesh(createTerrierBodyGeometry(), bodyCoatMat);
    torsoMesh.position.set(0, 0.015, -0.02);
    this.bodyPivot.add(torsoMesh);

    // Lush pure-white shaggy neck & chest ruff seamlessly bridging shoulders and head (matches Video Udo!)
    const neckColumn = makeMesh(createSculptedLegSegmentGeometry(0.168, 0.195, 0.28, 0.18), whiteWireTuftMat);
    neckColumn.rotation.x = 0.56;
    neckColumn.position.set(0, 0.145, 0.418);
    this.bodyPivot.add(neckColumn);

    // Sculpted layered snowy-white chest ruff, shoulder fluff, belly feathering & plump haunch fluff
    const sharedChestLock = this.trackGeo(createSculptedFurLockGeometry(0.115, 0.135, 0.105, 0.45, -0.02));
    const sharedFlankLock = this.trackGeo(createSculptedFurLockGeometry(0.088, 0.115, 0.082, 0.36, -0.025));

    const bodyFluffConfigs: ReadonlyArray<{
      geo: THREE.BufferGeometry;
      p: [number, number, number];
      s: [number, number, number];
      rot: [number, number, number];
    }> = [
      // Plush layered white chest ruff (prominent in Video Udo sitting & leaping!)
      { geo: sharedChestLock, p: [0, 0.015, 0.515], s: [1.3, 1.02, 1.05], rot: [0.35, 0, 0] },
      { geo: sharedFlankLock, p: [-0.085, -0.02, 0.485], s: [0.94, 0.92, 0.9], rot: [0.42, -0.35, 0.28] },
      { geo: sharedFlankLock, p: [0.085, -0.02, 0.485], s: [0.94, 0.92, 0.9], rot: [0.42, 0.35, -0.28] },
      // Fluffy upper-neck nape ruff right behind his dark cheek mask
      { geo: sharedChestLock, p: [0, 0.19, 0.325], s: [1.18, 0.72, 1.12], rot: [-0.45, 0, 0] },
      { geo: sharedFlankLock, p: [-0.15, 0.095, 0.368], s: [0.96, 0.9, 1.05], rot: [0.18, -0.32, 0.35] },
      { geo: sharedFlankLock, p: [0.15, 0.095, 0.368], s: [0.96, 0.9, 1.05], rot: [0.18, 0.32, -0.35] },
      // Soft shaggy white belly & hip feathering
      { geo: sharedFlankLock, p: [-0.145, -0.05, -0.215], s: [0.9, 0.82, 1.54], rot: [-0.55, -0.25, 0.25] },
      { geo: sharedFlankLock, p: [0.145, -0.05, -0.215], s: [0.9, 0.82, 1.54], rot: [-0.55, 0.25, -0.25] },
      { geo: sharedFlankLock, p: [-0.142, 0.02, -0.445], s: [0.94, 0.92, 0.95], rot: [-0.45, -0.22, 0.18] },
      { geo: sharedFlankLock, p: [0.142, 0.02, -0.445], s: [0.94, 0.92, 0.95], rot: [-0.45, 0.22, -0.18] },
    ];
    for (const bf of bodyFluffConfigs) {
      const m = new THREE.Mesh(bf.geo, whiteWireTuftMat);
      m.castShadow = enableShadows;
      m.receiveShadow = enableShadows;
      m.position.set(bf.p[0], bf.p[1], bf.p[2]);
      m.scale.set(bf.s[0], bf.s[1], bf.s[2]);
      m.rotation.set(bf.rot[0], bf.rot[1], bf.rot[2]);
      this.bodyPivot.add(m);
    }

    // 2. Video Udo's Head — slightly larger appealing proportions, symmetrical charcoal mask,
    // crisp white forehead blaze, and iconic round fluffy white wirehair mustache & beard!
    this.headPivot.position.set(0, 0.28, 0.488);
    this.headPivot.scale.setScalar(1.09);
    this.bodyPivot.add(this.headPivot);

    const headMesh = makeMesh(createUdoHeadGeometry(), headCoatMat);
    headMesh.position.set(0, 0.02, 0.045);
    this.headPivot.add(headMesh);

    // Sculpted soft fluffy white mustache/muzzle puffs (no boxy balls, blends warmly into snout!)
    const sharedMustacheGeo = this.trackGeo(createSculptedFurLockGeometry(0.088, 0.076, 0.105, 0.62, -0.015));
    const sharedBeardSweepGeo = this.trackGeo(createSculptedFurLockGeometry(0.044, 0.082, 0.046, 0.28, -0.018));
    const sharedBrowLockGeo = this.trackGeo(createSculptedFurLockGeometry(0.036, 0.068, 0.034, 0.26, 0.016));
    const sharedCheekLockGeo = this.trackGeo(createSculptedFurLockGeometry(0.048, 0.075, 0.046, 0.3, -0.014));

    // Rounded bushy white upper snout bridge & twin mustache cushions framing the glossy black nose
    const snoutBridgeFluff = makeMesh(
      createSculptedFurLockGeometry(0.084, 0.056, 0.098, 0.68, 0),
      whiteWireTuftMat,
    );
    snoutBridgeFluff.position.set(0, 0.032, 0.225);
    this.headPivot.add(snoutBridgeFluff);

    for (const side of [-1, 1]) {
      // Full rounded fluffy white mustache cushion on each side of the nose
      const mustache = new THREE.Mesh(sharedMustacheGeo, whiteWireTuftMat);
      mustache.castShadow = enableShadows;
      mustache.receiveShadow = enableShadows;
      mustache.position.set(side * 0.066, -0.018, 0.228);
      mustache.rotation.set(0.15, side * 0.26, side * -0.18);
      this.headPivot.add(mustache);

      // Soft curved white wirehair whisker-beard sweeps flaring outward from the fluffy muzzle
      const beardSweepUpper = new THREE.Mesh(sharedBeardSweepGeo, whiteWireTuftMat);
      beardSweepUpper.position.set(side * 0.118, -0.012, 0.195);
      beardSweepUpper.rotation.set(0.24, side * 0.42, side * -1.32);
      this.headPivot.add(beardSweepUpper);

      const beardSweepLower = new THREE.Mesh(sharedBeardSweepGeo, whiteWireTuftMat);
      beardSweepLower.scale.set(0.95, 0.92, 0.9);
      beardSweepLower.position.set(side * 0.115, -0.056, 0.212);
      beardSweepLower.rotation.set(-0.18, side * 0.28, side * -1.58);
      this.headPivot.add(beardSweepLower);

      // Video Udo's expressive shaggy bushy terrier eyebrows (layered charcoal + warm silver-white wisps!)
      const browDarkOuter = new THREE.Mesh(sharedBrowLockGeo, grizzleDarkTuftMat);
      browDarkOuter.position.set(side * 0.098, 0.132, 0.162);
      browDarkOuter.rotation.set(0.72, side * 0.28, side * -0.96);
      this.headPivot.add(browDarkOuter);

      const browSilverInner = new THREE.Mesh(sharedBrowLockGeo, silverWispMat);
      browSilverInner.scale.set(0.78, 0.85, 0.78);
      browSilverInner.position.set(side * 0.06, 0.138, 0.174);
      browSilverInner.rotation.set(0.78, side * 0.16, side * -0.58);
      this.headPivot.add(browSilverInner);

      // Soft dark-charcoal grizzle cheek scruff framing the side of the face behind the white beard
      const cheekDark = new THREE.Mesh(sharedCheekLockGeo, grizzleDarkTuftMat);
      cheekDark.position.set(side * 0.174, -0.008, 0.088);
      cheekDark.rotation.set(-0.22, side * -0.2, side * -1.34);
      this.headPivot.add(cheekDark);
    }

    // Soft tousled snowy-white crown fur tufts along the top of the white forehead blaze
    const sharedCrownTuft = this.trackGeo(createSculptedFurLockGeometry(0.032, 0.052, 0.038, 0.34, -0.012));
    for (const c of [
      { x: 0, y: 0.218, z: 0.062, rotZ: 0.04, mat: whiteWireTuftMat },
      { x: -0.032, y: 0.212, z: 0.038, rotZ: 0.34, mat: silverWispMat },
      { x: 0.032, y: 0.212, z: 0.038, rotZ: -0.34, mat: silverWispMat },
    ]) {
      const tuft = new THREE.Mesh(sharedCrownTuft, c.mat);
      tuft.position.set(c.x, c.y, c.z);
      tuft.rotation.set(-0.34, 0, c.rotZ);
      this.headPivot.add(tuft);
    }

    // Prominent glossy rounded-triangle wet jet-black nose centered atop the fluffy white mustache
    const nose = makeMesh(createTerrierNoseGeometry(), noseMat);
    nose.position.set(0, 0.012, 0.338);
    this.headPivot.add(nose);

    // Soulful, slightly larger dark espresso-obsidian terrier eyes with flush curved cornea catchlights
    const eyeRadius = 0.047;
    const sharedEyeGeo = this.trackGeo(new THREE.SphereGeometry(eyeRadius, 20, 16));
    const sharedEyelidGeo = this.trackGeo(new THREE.TorusGeometry(eyeRadius * 0.96, 0.008, 8, 22));
    const sharedGlintMainGeo = this.trackGeo(createFlushEyeGlintGeometry(eyeRadius, 0.28));
    const sharedGlintSubGeo = this.trackGeo(createFlushEyeGlintGeometry(eyeRadius, 0.14));

    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.094, 0.076, 0.178);
      eyeGroup.rotation.y = side * 0.28;
      eyeGroup.rotation.x = -0.06;
      this.headPivot.add(eyeGroup);

      const eyelidRim = new THREE.Mesh(sharedEyelidGeo, eyeRimMat);
      eyelidRim.scale.set(1.06, 0.94, 0.85);
      eyelidRim.position.set(0, 0, -0.006);
      eyeGroup.add(eyelidRim);

      const eye = new THREE.Mesh(sharedEyeGeo, eyeDarkMat);
      eye.scale.set(1.04, 0.98, 0.95);
      eyeGroup.add(eye);

      // Flush curved studio catchlights (zero surface protrusion from oblique angles!)
      const glintMain = new THREE.Mesh(sharedGlintMainGeo, eyeCatchlightMat);
      glintMain.rotation.x = -0.34;
      glintMain.rotation.y = -0.22;
      eyeGroup.add(glintMain);

      const glintSub = new THREE.Mesh(sharedGlintSubGeo, eyeCatchlightMat);
      glintSub.rotation.x = 0.34;
      glintSub.rotation.y = 0.24;
      eyeGroup.add(glintSub);
    }

    // Articulated fluffy white-bearded lower jaw + happy curved pink tongue (matches Video Udo's leaping smile!)
    this.jawPivot.position.set(0, -0.058, 0.148);
    this.headPivot.add(this.jawPivot);

    const lowerJawBeard = makeMesh(
      createSculptedFurLockGeometry(0.088, 0.056, 0.112, 0.68, 0),
      whiteWireTuftMat,
    );
    lowerJawBeard.position.set(0, -0.028, 0.096);
    this.jawPivot.add(lowerJawBeard);

    // Soft shaggy rounded chin beard underneath jaw (replaces pointy cone!)
    const chinBeard = makeMesh(
      createSculptedFurLockGeometry(0.064, 0.068, 0.062, 0.42, -0.015),
      whiteWireTuftMat,
      false,
    );
    chinBeard.position.set(0, -0.062, 0.128);
    chinBeard.rotation.x = 2.68;
    this.jawPivot.add(chinBeard);

    const mouthBed = makeMesh(new THREE.SphereGeometry(0.052, 10, 8), mouthInnerMat, false);
    mouthBed.scale.set(1.02, 0.42, 1.35);
    mouthBed.position.set(0, 0.002, 0.092);
    this.jawPivot.add(mouthBed);

    this.tongueMesh = makeMesh(createSculptedTongueGeometry(), tongueMat, false);
    this.tongueMesh.position.set(0, 0.004, 0.072);
    this.jawPivot.add(this.tongueMesh);

    // 3. Video Udo's Signature High-Set Folded Forward-Drop ("Button") Dark Charcoal V-Ears!
    const sharedEarCreaseTuft = this.trackGeo(createSculptedFurLockGeometry(0.032, 0.054, 0.036, 0.32, 0.012));
    const buildUdoEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.142, 0.172, 0.015);

      // Solid sculpted 3D folded V-drop terrier ear framing the cheek (matches Video Udo in arms & mid-leap!)
      const earFlap = makeMesh(createUdoButtonEarGeometry(side), earMat);
      pivot.add(earFlap);

      // Soft silvery-grey wirehair tuft tucked naturally at the upper ear crease
      const creaseWisp = new THREE.Mesh(sharedEarCreaseTuft, silverWispMat);
      creaseWisp.position.set(side * 0.042, 0.036, 0.022);
      creaseWisp.rotation.set(0.28, side * 0.22, side * -1.05);
      pivot.add(creaseWisp);

      this.headPivot.add(pivot);
    };
    buildUdoEar(-1, this.earLeftPivot);
    buildUdoEar(1, this.earRightPivot);

    // 4. Video Udo's Pure Snowy-White Fluffy Tapered Carrot Terrier Tail (NO dark root spot!)
    this.tailPivot.position.set(0, 0.132, -0.522);
    this.bodyPivot.add(this.tailPivot);

    const tailMesh = makeMesh(createSculptedTerrierTailGeometry(), whiteWireTuftMat);
    this.tailPivot.add(tailMesh);

    // 5. Four Long Athletic Snowy-White Shaggy Terrier Legs & Soft Multi-Toed White Paws
    const sharedFrontUpper = this.trackGeo(createSculptedLegSegmentGeometry(0.08, 0.059, 0.315, 0.24));
    const sharedBackUpper = this.trackGeo(createSculptedLegSegmentGeometry(0.096, 0.064, 0.322, 0.28));
    const sharedLowerLeg = this.trackGeo(createSculptedLegSegmentGeometry(0.059, 0.047, 0.296, 0.26));
    const sharedLegFeather = this.trackGeo(createSculptedFurLockGeometry(0.04, 0.082, 0.042, 0.32, -0.015));
    const sharedPawMain = this.trackGeo(createSculptedFurLockGeometry(0.068, 0.044, 0.084, 0.78, 0));
    const sharedToeGeo = this.trackGeo(new THREE.SphereGeometry(0.021, 8, 6));
    const sharedSolePad = this.trackGeo(new THREE.SphereGeometry(0.046, 8, 6));

    const buildTerrierLeg = (x: number, y: number, z: number, isBack: boolean): TerrierLegRig => {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      this.bodyPivot.add(hip);

      const upper = new THREE.Mesh(isBack ? sharedBackUpper : sharedFrontUpper, whiteWireTuftMat);
      upper.castShadow = enableShadows;
      upper.receiveShadow = enableShadows;
      upper.position.set(0, -0.135, isBack ? -0.012 : 0);
      hip.add(upper);

      const shin = new THREE.Group();
      shin.position.set(0, -0.27, 0);
      hip.add(shin);

      const lower = new THREE.Mesh(sharedLowerLeg, whiteWireTuftMat);
      lower.castShadow = enableShadows;
      lower.receiveShadow = enableShadows;
      lower.position.set(0, -0.126, 0.008);
      shin.add(lower);

      // Soft shaggy white fur feathering along back of lower leg/pastern
      const legFeather = new THREE.Mesh(sharedLegFeather, whiteWireTuftMat);
      legFeather.position.set(0, -0.13, -0.04);
      legFeather.rotation.x = -2.55;
      shin.add(legFeather);

      // Fluffy rounded pure-white terrier paw resting flush at y = 0
      const paw = new THREE.Mesh(sharedPawMain, whiteWireTuftMat);
      paw.castShadow = enableShadows;
      paw.receiveShadow = enableShadows;
      paw.position.set(0, -0.256, 0.032);
      shin.add(paw);

      // 4 soft rounded snowy-white furry toes matching Video Udo's cute paws
      for (const ang of [-0.42, -0.14, 0.14, 0.42]) {
        const toe = new THREE.Mesh(sharedToeGeo, whiteWireTuftMat);
        toe.scale.set(0.92, 0.85, 1.32);
        toe.position.set(Math.sin(ang) * 0.052, -0.267, 0.078 + Math.cos(ang) * 0.022);
        toe.rotation.y = ang;
        shin.add(toe);
      }

      // Discreet recessed dark paw sole pad tucked strictly underneath (not bulging out sides!)
      const solePad = new THREE.Mesh(sharedSolePad, pawPadMat);
      solePad.scale.set(0.92, 0.28, 1.08);
      solePad.position.set(0, -0.285, 0.032);
      shin.add(solePad);

      return { hip, shin };
    };

    this.legFL = buildTerrierLeg(-0.142, -0.04, 0.38, false);
    this.legFR = buildTerrierLeg(0.142, -0.04, 0.38, false);
    this.legBL = buildTerrierLeg(-0.15, -0.04, -0.396, true);
    this.legBR = buildTerrierLeg(0.15, -0.04, -0.396, true);

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

    const sizeRoll = Math.random();
    slot.baseScale = isStar
      ? (sizeRoll > 0.86
          ? 0.2 + Math.random() * 0.08
          : sizeRoll > 0.42
            ? 0.085 + Math.random() * 0.07
            : 0.042 + Math.random() * 0.043) * dogScale
      : (0.024 + Math.random() * 0.04) * dogScale;

    slot.roll = isStar ? (Math.random() - 0.5) * 0.32 : Math.random() * Math.PI * 2;
    slot.spinSpeed = isStar ? (Math.random() - 0.5) * 0.55 : (Math.random() - 0.5) * 1.4;
    slot.twinklePhase = Math.random() * Math.PI * 2;
    slot.twinkleFreq = 16 + Math.random() * 18;
    slot.swirlFreq = 5 + Math.random() * 6;
    slot.colorR = pal[0];
    slot.colorG = pal[1];
    slot.colorB = pal[2];

    slot.pos.copy(pos);

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

    this.sparkleTrailWindowSec = 1.15;
    this.sparkleStarAccum = 0;
    this.sparkleMoteAccum = 0;

    // Dense shimmering veil of fine smaller golden stars wrapping right around Udo's portrait-to-3D exit
    for (let i = 0; i < 54; i++) {
      const backDist = (-0.24 + Math.random() * 1.16) * dogScale;
      const sideOffset = (Math.random() - 0.5) * 1.12 * dogScale;
      const liftOffset = (0.04 + Math.random() * 0.7) * dogScale;
      _sparkleSpawnPos
        .copy(launchOrigin)
        .addScaledVector(_sparkleFwd, -backDist)
        .addScaledVector(_sparkleRight, sideOffset);
      _sparkleSpawnPos.y += liftOffset;
      this.emitSparkleParticle(this.sparkleStars, true, _sparkleSpawnPos, _sparkleFwd, dogScale, true);
    }

    // Lush cloud of tiny golden fairy-dust motes camouflaging the transition edge
    for (let i = 0; i < 82; i++) {
      const backDist = (-0.26 + Math.random() * 1.2) * dogScale;
      const sideOffset = (Math.random() - 0.5) * 1.18 * dogScale;
      const liftOffset = (0.02 + Math.random() * 0.74) * dogScale;
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
   * Animates Video Udo's joyful terrier bound, bouncing folded V-drop ears,
   * rapid snowy-white carrot tail wag, cheerful open-mouth barking smile & pink tongue,
   * grounded contact shadow, paw puffs, and golden magical jump sparkles.
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
    const scamperFreq = 25.0;
    const phase = elapsedSec * scamperFreq;
    const airHeight = Math.max(0, worldPos.y - groundY);

    // Springy terrier bound & shoulder roll
    const strideBounce = Math.abs(Math.sin(phase)) * 0.15;
    this.bodyPivot.position.y = 0.606 + strideBounce;
    this.bodyPivot.rotation.x = Math.cos(phase) * 0.23 - Math.min(0.3, airHeight * 0.19);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.09;

    // Athletic rotary terrier gallop kinematics
    const setLeg = (rig: TerrierLegRig, p: number, isBack: boolean) => {
      const swing = Math.sin(p) * (isBack ? 0.94 : 0.9);
      rig.hip.rotation.x = swing;
      const kneeFlex = Math.max(0, -Math.cos(p)) * (isBack ? 0.86 : 0.94);
      rig.shin.rotation.x = isBack ? -kneeFlex * 0.8 : kneeFlex;
    };
    setLeg(this.legFL, phase, false);
    setLeg(this.legFR, phase + 0.46, false);
    setLeg(this.legBL, phase + Math.PI, true);
    setLeg(this.legBR, phase + Math.PI + 0.46, true);

    // Joyful terrier head carriage, expressive open-mouth smile (especially mid-leap!) & barking jaw
    const b = THREE.MathUtils.clamp(barkOpen01, 0, 1);
    const leapSmile = Math.min(0.35, airHeight * 0.16);
    const mouthOpen = Math.max(b, leapSmile);
    this.headPivot.rotation.x = -0.09 - b * 0.2 + Math.sin(phase + 0.5) * 0.08;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 9.2) * 0.14;
    this.headPivot.rotation.z = Math.sin(elapsedSec * 11.5) * 0.08;
    this.jawPivot.rotation.x = 0.14 + mouthOpen * 0.52;
    this.tongueMesh.position.z = 0.072 + mouthOpen * 0.028;
    this.tongueMesh.rotation.x = 0.12 + mouthOpen * 0.24;

    // Folded forward-drop V-ears bounce playfully outward/upward with each stride & leap
    const earFlop = Math.abs(Math.sin(phase - 0.3)) * 0.28 + Math.min(0.32, airHeight * 0.2);
    this.earLeftPivot.rotation.z = -0.04 - earFlop;
    this.earRightPivot.rotation.z = 0.04 + earFlop;
    this.earLeftPivot.rotation.x = -0.04 - earFlop * 0.35 - b * 0.08;
    this.earRightPivot.rotation.x = -0.04 - earFlop * 0.35 - b * 0.08;

    // Spirited rapid terrier tail wag
    this.tailPivot.rotation.z = Math.sin(elapsedSec * 36.0) * 0.56;
    this.tailPivot.rotation.x = -0.06 + Math.cos(phase) * 0.16;

    // Keep contact shadow flush on the board plane directly below Udo
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

      const starInterval = THREE.MathUtils.lerp(0.042, 0.011, trailIntensity);
      const moteInterval = THREE.MathUtils.lerp(0.032, 0.0085, trailIntensity);
      this.sparkleStarAccum += dt;
      this.sparkleMoteAccum += dt;

      while (this.sparkleStarAccum >= starInterval) {
        this.sparkleStarAccum -= starInterval;
        const backDist = (-0.06 + Math.random() * 0.62) * dogScale;
        const sideOffset = (Math.random() - 0.5) * 0.62 * dogScale;
        const liftOffset = (0.08 + Math.random() * 0.52) * dogScale;
        _sparkleSpawnPos
          .copy(worldPos)
          .addScaledVector(_sparkleFwd, -backDist)
          .addScaledVector(_sparkleRight, sideOffset);
        _sparkleSpawnPos.y = Math.max(groundY + 0.08, _sparkleSpawnPos.y + liftOffset);
        this.emitSparkleParticle(this.sparkleStars, true, _sparkleSpawnPos, _sparkleFwd, dogScale, false);
      }

      while (this.sparkleMoteAccum >= moteInterval) {
        this.sparkleMoteAccum -= moteInterval;
        const backDist = (-0.08 + Math.random() * 0.68) * dogScale;
        const sideOffset = (Math.random() - 0.5) * 0.68 * dogScale;
        const liftOffset = (0.06 + Math.random() * 0.56) * dogScale;
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
