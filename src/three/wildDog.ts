import * as THREE from 'three';

interface CachedUdoTextures {
  bodyColorMap: THREE.CanvasTexture;
  headColorMap: THREE.CanvasTexture;
  earColorMap: THREE.CanvasTexture;
  eyeColorMap: THREE.CanvasTexture;
  wireBumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  shadowMap: THREE.CanvasTexture;
  sparkleStarMap: THREE.CanvasTexture;
  sparkleMoteMap: THREE.CanvasTexture;
}

let cachedUdoTextures: CachedUdoTextures | null = null;

const IS_MOBILE_DEVICE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

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
 * Generates and caches high-resolution procedural CanvasTextures matching **Jan's Udo & Video Udo**
 * (the fluffy white & charcoal-grizzle wirehaired Jack/Parson Russell Terrier held in Chess Angel's arms):
 * - `bodyColorMap`: 1024x1024 luminous warm snowy-white shaggy terrier coat with painterly pearl-silver fur clump depth
 * - `headColorMap`: 1024x1024 exact Video Udo / Jan's Udo symmetrical charcoal-grizzle temple/eye/cheek patches,
 *   flame-shaped snowy-white forehead blaze narrowing between the eyes, pure white nape, and fluffy white bearded snout
 * - `earColorMap`: 512x512 dark charcoal-slate folded V-ear leather streaked with fine silver-white crease hairs
 * - `eyeColorMap`: 256x256 soulful warm chestnut-amber terrier iris surrounding a deep jet-black pupil & dark limbal ring
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

  // 1. Body Coat Texture (1024x1024): Pure fluffy snowy-white shaggy terrier coat with painterly fur-lock shading
  const bodySize = 1024;
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.width = bodySize;
  bodyCanvas.height = bodySize;
  const bCtx = bodyCanvas.getContext('2d');
  if (bCtx) {
    // Subtle dorsal-to-ventral warm ivory -> soft pearl-silver undercoat gradient matching Video Udo
    const grad = bCtx.createLinearGradient(0, 0, 0, bodySize);
    grad.addColorStop(0, '#fcfbf8');
    grad.addColorStop(0.52, '#f6f5f1');
    grad.addColorStop(1, '#eaecf0');
    bCtx.fillStyle = grad;
    bCtx.fillRect(0, 0, bodySize, bodySize);

    // Broad soft painterly undercoat lock shadows (echoing the illustrated fur clumps in builtin_dog_run.mp4)
    for (let i = 0; i < 620; i++) {
      const x = rand() * bodySize;
      const y = rand() * bodySize;
      const len = 34 + rand() * 54;
      const curve = (rand() - 0.5) * 22;
      const alpha = 0.055 + rand() * 0.075;
      bCtx.strokeStyle =
        rand() > 0.45
          ? `rgba(188, 195, 206, ${alpha.toFixed(3)})`
          : `rgba(255, 254, 250, ${(alpha * 1.35).toFixed(3)})`;
      bCtx.lineWidth = 5.5 + rand() * 8.5;
      bCtx.lineCap = 'round';
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.quadraticCurveTo(x + curve * 0.5, y + len * 0.52, x + curve, y + len);
      bCtx.stroke();
    }

    // Crisp individual shaggy white & warm-silver wirehair topcoat strands flowing nose-to-rump
    for (let i = 0; i < 9600; i++) {
      const x = rand() * bodySize;
      const y = rand() * bodySize;
      const len = 14 + rand() * 30;
      const jitterX = (rand() - 0.5) * 9.5;
      const roll = rand();
      const alpha = 0.09 + rand() * 0.16;
      if (roll > 0.38) {
        bCtx.strokeStyle = `rgba(255, 255, 253, ${(alpha * 1.48).toFixed(3)})`;
      } else if (roll > 0.12) {
        bCtx.strokeStyle = `rgba(198, 203, 211, ${alpha.toFixed(3)})`;
      } else {
        bCtx.strokeStyle = `rgba(168, 174, 184, ${(alpha * 0.82).toFixed(3)})`;
      }
      bCtx.lineWidth = 1.1 + rand() * 1.7;
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.quadraticCurveTo(x + jitterX * 0.55, y + len * 0.5, x + jitterX, y + len);
      bCtx.stroke();
    }
  }

  // 2. Head Coat Texture (1024x1024): Jan's Udo & Video Udo exact symmetrical charcoal-grizzle eye/cheek saddle mask,
  // flame-shaped white center forehead blaze narrowing cleanly between the eyes, pure white nape, and snowy-white muzzle!
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
      const v = 1 - py / (headSize - 1); // 0 = nape, 0.50 = eyes/stop, 1.0 = nose tip
      for (let px = 0; px < headSize; px++) {
        const u = px / (headSize - 1);
        const angle = u * Math.PI * 2;
        const cosA = Math.cos(angle); // lateral X: +1 right, -1 left, 0 top/bottom centerline
        const sinA = Math.sin(angle); // vertical Y: +1 dorsal top, -1 ventral chin/throat
        const latAbs = Math.abs(cosA);

        let darkMask = 0;

        // Multi-frequency angular wirehair tuft modulation so mask edges look like genuine jagged terrier hair locks
        const furLockMod =
          0.024 * Math.sin(latAbs * 26.0 + v * 19.0) +
          0.015 * Math.cos(sinA * 22.0 - v * 27.0);

        // Video Udo's dark patches wrap over both temples, eyes & upper-rear cheeks (v ≈ 0.20 .. 0.57),
        // leaving the entire neck nape (v < 0.20), throat/under-jaw, forehead flame blaze, and fluffy muzzle pure white!
        if (sinA > -0.42 && v < 0.63) {
          // Cheek patch reaches forward around the eye (sinA ≈ 0.28) and sweeps into 2-3 feathered cheek points (sinA ≈ -0.08)
          const eyeForwardPeak = 0.085 * Math.exp(-Math.pow((sinA - 0.24) / 0.28, 2));
          const cheekPointPeak = 0.072 * Math.exp(-Math.pow((sinA + 0.06) / 0.22, 2)) * latAbs;
          const cheekForwardReach =
            0.478 + eyeForwardPeak + cheekPointPeak - 0.07 * Math.max(0, -sinA - 0.18) + furLockMod;
          const frontFade = THREE.MathUtils.clamp((cheekForwardReach - v) / 0.058, 0, 1);

          // Cleanly feathered rear cheek & temple border meeting Udo's 100% snowy-white neck scruff (matches udo_leap_6_0.png!)
          const napeLimit = 0.205 - 0.035 * Math.max(0, sinA - 0.2) + furLockMod * 0.85;
          const napeFade = THREE.MathUtils.clamp((v - napeLimit) / 0.065, 0, 1);

          // Pure snowy-white lower cheek, jaw & throat
          const throatFade = THREE.MathUtils.clamp((sinA + 0.28 + furLockMod * 0.6) / 0.19, 0, 1);

          // Jan's Udo & Video Udo iconic flame/diamond white center blaze:
          // - Broad snowy-white muzzle in front (v > 0.52)
          // - Narrows into a crisp white bridge right between the dark eye patches (v ≈ 0.45..0.50)
          // - Flares wider into a feathered diamond/flame on the upper forehead & crown (v ≈ 0.24..0.38)
          let blazeWhiteness = 0;
          if (sinA > 0.12) {
            const bridgePinch = -0.065 * Math.exp(-Math.pow((v - 0.475) / 0.065, 2));
            const foreheadFlame = 0.135 * Math.exp(-Math.pow((v - 0.315) / 0.115, 2));
            const muzzleOpen = v > 0.48 ? Math.pow((v - 0.48) / 0.14, 1.35) * 0.48 : 0;
            const blazeFeather = 0.022 * Math.sin(v * 42.0) + 0.014 * Math.cos(v * 67.0);
            const blazeHalfWidth = Math.max(
              0.085,
              0.175 + bridgePinch + foreheadFlame + muzzleOpen + blazeFeather,
            );
            blazeWhiteness =
              1 - THREE.MathUtils.clamp((latAbs - blazeHalfWidth * 0.68) / (blazeHalfWidth * 0.52), 0, 1);
          }

          darkMask = frontFade * napeFade * throatFade * (1 - blazeWhiteness);

          // Deeper velvety charcoal eyeliner/orbital shading right around Udo's soulful eyes
          const eyeZone =
            Math.exp(-Math.pow((v - 0.49) / 0.078, 2)) *
            Math.exp(-Math.pow((latAbs - 0.53) / 0.22, 2)) *
            (sinA > -0.05 && sinA < 0.78 ? 1 : 0);
          darkMask = THREE.MathUtils.clamp(darkMask + eyeZone * 0.48 * (1 - blazeWhiteness), 0, 1);
        }

        // Grizzle wirehair tone modulation inside dark patches (rich charcoal-slate #1e2024 mixed with silver-ash #454950)
        const grizzleWave =
          0.5 + 0.5 * Math.sin(latAbs * 38.0 - v * 31.0 + sinA * 17.0);
        const darkR = 26 + grizzleWave * 22;
        const darkG = 28 + grizzleWave * 23;
        const darkB = 31 + grizzleWave * 25;

        const grain = (rand() - 0.5) * 15;
        const r = 252 * (1 - darkMask) + darkR * darkMask + grain * (0.35 + darkMask * 0.6);
        const g = 250 * (1 - darkMask) + darkG * darkMask + grain * (0.35 + darkMask * 0.6);
        const b = 246 * (1 - darkMask) + darkB * darkMask + grain * (0.35 + darkMask * 0.6);

        const idx = (py * headSize + px) * 4;
        data[idx] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
        data[idx + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
        data[idx + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
        data[idx + 3] = 255;
      }
    }
    hCtx.putImageData(img, 0, 0);

    // Rich directional wirehair strokes — silver-white grizzle strands sweeping outward/backward across the dark patches
    // and crisp snowy-white waterfall mustache/blaze hair strokes matching udo_close_3_2.png & udo_8d64da14.png!
    hCtx.lineCap = 'round';
    for (let i = 0; i < 14500; i++) {
      const u = rand();
      const v = rand();
      const px = u * headSize;
      const py = (1 - v) * headSize;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const latAbs = Math.abs(cosA);

      const inMaskZone = sinA > -0.26 && v > 0.21 && v < 0.55 && latAbs > 0.19;
      const onBlazeBorder =
        sinA > 0.16 && v > 0.22 && v < 0.54 && latAbs > 0.11 && latAbs < 0.34;
      const len = 11 + rand() * 26;
      const dirX = Math.sign(cosA || 1) * (4.5 + rand() * 9.5) + (rand() - 0.5) * 4.0;
      const dirY = (v > 0.5 ? 0.55 : 0.92) * len;

      if (onBlazeBorder && rand() < 0.62) {
        // Feathered bright white & silver hairs fanning from the white center blaze into the dark brow/crown!
        const alpha = 0.28 + rand() * 0.34;
        hCtx.strokeStyle = `rgba(248, 249, 250, ${alpha.toFixed(3)})`;
        hCtx.lineWidth = 1.2 + rand() * 1.7;
      } else if (inMaskZone) {
        // Authentic salt-and-pepper / silver-grizzle wirehair streaks over deep charcoal-black fur
        const roll = rand();
        if (roll > 0.66) {
          const alpha = 0.24 + rand() * 0.32;
          hCtx.strokeStyle = `rgba(222, 225, 230, ${alpha.toFixed(3)})`;
        } else if (roll > 0.4) {
          const alpha = 0.24 + rand() * 0.28;
          hCtx.strokeStyle = `rgba(104, 109, 116, ${alpha.toFixed(3)})`;
        } else {
          const alpha = 0.3 + rand() * 0.34;
          hCtx.strokeStyle = `rgba(16, 18, 21, ${alpha.toFixed(3)})`;
        }
        hCtx.lineWidth = 1.05 + rand() * 1.65;
      } else {
        // Lush snowy-white mustache furnishings, forehead blaze & pure-white neck scruff strands
        const isSoftShadow = rand() > 0.64;
        const alpha = 0.15 + rand() * 0.22;
        hCtx.strokeStyle = isSoftShadow
          ? `rgba(192, 198, 208, ${alpha.toFixed(3)})`
          : `rgba(255, 255, 253, ${(alpha * 1.45).toFixed(3)})`;
        hCtx.lineWidth = 1.1 + rand() * 1.8;
      }
      hCtx.beginPath();
      hCtx.moveTo(px, py);
      hCtx.quadraticCurveTo(px + dirX * 0.55, py + dirY * 0.45, px + dirX, py + dirY);
      hCtx.stroke();
    }
  }

  // 3. Ear Texture (512x512): Video Udo's dark charcoal-slate folded V-ears with silver fold wisps & warm inner-ear shadow
  const earSize = 512;
  const earCanvas = document.createElement('canvas');
  earCanvas.width = earSize;
  earCanvas.height = earSize;
  const eCtx = earCanvas.getContext('2d');
  if (eCtx) {
    // Vertical s gradient: y=0 -> s=1 (dark V-tip), y=earSize -> s=0 (grizzled skull base/fold)
    const eGrad = eCtx.createLinearGradient(0, 0, 0, earSize);
    eGrad.addColorStop(0, '#181a1d'); // crisp dark charcoal V-tip
    eGrad.addColorStop(0.48, '#26292e');
    eGrad.addColorStop(0.78, '#3a3e45'); // grizzled fold crest
    eGrad.addColorStop(1, '#4c5058');
    eCtx.fillStyle = eGrad;
    eCtx.fillRect(0, 0, earSize, earSize);

    // Subtle warm dusky-taupe tint on the inner underside of the folded ear (uRing in 0.28..0.72 -> cosT < 0)
    const underGrad = eCtx.createLinearGradient(0, 0, earSize, 0);
    underGrad.addColorStop(0, 'rgba(24, 26, 30, 0)');
    underGrad.addColorStop(0.32, 'rgba(68, 52, 54, 0.28)');
    underGrad.addColorStop(0.5, 'rgba(84, 62, 64, 0.38)');
    underGrad.addColorStop(0.68, 'rgba(68, 52, 54, 0.28)');
    underGrad.addColorStop(1, 'rgba(24, 26, 30, 0)');
    eCtx.fillStyle = underGrad;
    eCtx.fillRect(0, 0, earSize, earSize);

    // Fine directional charcoal & silvery-white wirehair strokes along ear crease and margins
    eCtx.lineCap = 'round';
    for (let i = 0; i < 4200; i++) {
      const x = rand() * earSize;
      const y = rand() * earSize;
      const len = 10 + rand() * 24;
      const nearCrease = y > earSize * 0.54;
      const nearMargin = Math.abs(x - earSize * 0.25) < earSize * 0.08 || Math.abs(x - earSize * 0.75) < earSize * 0.08;
      const silverChance = nearCrease ? 0.48 : nearMargin ? 0.36 : 0.15;
      const isSilver = rand() < silverChance;
      const alpha = isSilver ? 0.2 + rand() * 0.3 : 0.26 + rand() * 0.3;
      eCtx.strokeStyle = isSilver
        ? `rgba(226, 229, 234, ${alpha.toFixed(3)})`
        : `rgba(14, 15, 18, ${alpha.toFixed(3)})`;
      eCtx.lineWidth = 1.05 + rand() * 1.5;
      eCtx.beginPath();
      eCtx.moveTo(x, y);
      eCtx.lineTo(x + (rand() - 0.5) * 5.5, y - len);
      eCtx.stroke();
    }
  }

  // 4. Soulful Terrier Eye Texture (256x256): Deep jet-black pupil + warm rich chestnut-amber iris + dark limbal ring
  // Matches Video Udo's warm expressive brown-rimmed dark eyes in udo_close_3_2.png & udo_close_5_2.png!
  const eyeSize = 256;
  const eyeCanvas = document.createElement('canvas');
  eyeCanvas.width = eyeSize;
  eyeCanvas.height = eyeSize;
  const eyCtx = eyeCanvas.getContext('2d');
  if (eyCtx) {
    const cx = eyeSize * 0.5;
    const cy = eyeSize * 0.5;
    eyCtx.fillStyle = '#120d0a';
    eyCtx.fillRect(0, 0, eyeSize, eyeSize);

    // Warm dark-chestnut to golden-espresso iris ring
    const irisGrad = eyCtx.createRadialGradient(cx, cy + 4, eyeSize * 0.14, cx, cy, eyeSize * 0.44);
    irisGrad.addColorStop(0.0, '#140a05');
    irisGrad.addColorStop(0.42, '#5c2e12');
    irisGrad.addColorStop(0.68, '#7d431d'); // warm chestnut-amber crescent seen in Video Udo!
    irisGrad.addColorStop(0.86, '#3b1c0a');
    irisGrad.addColorStop(0.96, '#140b07'); // crisp dark limbal ring
    irisGrad.addColorStop(1.0, '#0f0b09');
    eyCtx.fillStyle = irisGrad;
    eyCtx.beginPath();
    eyCtx.arc(cx, cy, eyeSize * 0.46, 0, Math.PI * 2);
    eyCtx.fill();

    // Subtle radial iris stroma fibers
    for (let i = 0; i < 120; i++) {
      const ang = (i / 120) * Math.PI * 2 + (rand() - 0.5) * 0.04;
      const r0 = eyeSize * (0.19 + rand() * 0.04);
      const r1 = eyeSize * (0.37 + rand() * 0.06);
      const warm = rand() > 0.42;
      eyCtx.strokeStyle = warm ? 'rgba(158, 92, 42, 0.24)' : 'rgba(32, 14, 6, 0.28)';
      eyCtx.lineWidth = 1.2;
      eyCtx.beginPath();
      eyCtx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      eyCtx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      eyCtx.stroke();
    }

    // Soft upper-eyelid shadow across top of iris + warm lower crescent glow
    const lidShade = eyCtx.createLinearGradient(0, cy - eyeSize * 0.42, 0, cy + eyeSize * 0.42);
    lidShade.addColorStop(0, 'rgba(6, 4, 3, 0.65)');
    lidShade.addColorStop(0.48, 'rgba(6, 4, 3, 0.08)');
    lidShade.addColorStop(0.82, 'rgba(168, 96, 40, 0.16)');
    lidShade.addColorStop(1, 'rgba(18, 9, 5, 0.35)');
    eyCtx.fillStyle = lidShade;
    eyCtx.beginPath();
    eyCtx.arc(cx, cy, eyeSize * 0.45, 0, Math.PI * 2);
    eyCtx.fill();

    // Deep glossy jet-black round pupil
    const pupilGrad = eyCtx.createRadialGradient(cx, cy, 0, cx, cy, eyeSize * 0.235);
    pupilGrad.addColorStop(0, '#030304');
    pupilGrad.addColorStop(0.82, '#060506');
    pupilGrad.addColorStop(1, 'rgba(12, 7, 5, 0)');
    eyCtx.fillStyle = pupilGrad;
    eyCtx.beginPath();
    eyCtx.arc(cx, cy, eyeSize * 0.235, 0, Math.PI * 2);
    eyCtx.fill();
  }

  // 5. Shaggy Wirehair Bump Map (512x512, linear data)
  const bumpSize = 512;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = bumpSize;
  bumpCanvas.height = bumpSize;
  const bumpCtx = bumpCanvas.getContext('2d');
  if (bumpCtx) {
    bumpCtx.fillStyle = '#808080';
    bumpCtx.fillRect(0, 0, bumpSize, bumpSize);
    bumpCtx.lineCap = 'round';
    for (let i = 0; i < 8200; i++) {
      const x = rand() * bumpSize;
      const y = rand() * bumpSize;
      const len = 8 + rand() * 20;
      const shade = Math.round(66 + rand() * 136);
      bumpCtx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.52)`;
      bumpCtx.lineWidth = 1.15 + rand() * 1.5;
      bumpCtx.beginPath();
      bumpCtx.moveTo(x, y);
      bumpCtx.lineTo(x + (rand() - 0.5) * 6.0, y + len);
      bumpCtx.stroke();
    }
  }

  // 6. Soft Fur Roughness Variation Map (512x512, linear data)
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

  // 7. Soft Grounded Contact Shadow (128x128)
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

  // 8. Magical 4-Point Star Glint Sparkle Texture (128x128) — matches portrait jump sparkles
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

  // 9. Luminous Golden Fairy-Dust Bokeh Mote Texture (64x64)
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

  const eyeColorMap = new THREE.CanvasTexture(eyeCanvas);
  eyeColorMap.colorSpace = THREE.SRGBColorSpace;
  eyeColorMap.wrapS = THREE.ClampToEdgeWrapping;
  eyeColorMap.wrapT = THREE.ClampToEdgeWrapping;
  eyeColorMap.anisotropy = 4;

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
    eyeColorMap,
    wireBumpMap,
    roughnessMap,
    shadowMap,
    sparkleStarMap,
    sparkleMoteMap,
  };
  return cachedUdoTextures;
}

/**
 * Sculpts Video Udo's compact, athletic, plush shaggy snowy-white wirehaired terrier torso:
 * - Proper right-handed Rx(+PI/2) remapping (`-sz -> y`, `sy -> z`) so ALL normals face cleanly outward!
 * - Deep fluffy chest/brisket ruff, level terrier back, gentle waist tuck, plush rounded hindquarters
 * - Organic layered shaggy fur-lock waves matching Udo's leaping silhouette in builtin_dog_run.mp4
 */
function createTerrierBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 46, 36);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  const halfLen = 0.548;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (rump) .. +1 (front chest)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5;
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(-sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? -sz / radial : 0; // +1 dorsal back, -1 ventral chest/belly

    // Plush furry chest/shoulders (t ≈ +0.35), athletic terrier waist tuck (t ≈ -0.18), rounded fluffy haunches
    const ribWidth =
      0.216 *
      (1.0 +
        0.155 * Math.exp(-Math.pow((t - 0.34) / 0.44, 2)) -
        0.085 * Math.exp(-Math.pow((t + 0.16) / 0.36, 2)) +
        0.08 * Math.exp(-Math.pow((t + 0.56) / 0.35, 2)));

    // Level athletic terrier topline with plush wither scruff
    const topHeight =
      0.192 *
      (1.0 +
        0.105 * Math.exp(-Math.pow((t - 0.44) / 0.4, 2)) +
        0.035 * Math.exp(-Math.pow((t + 0.52) / 0.36, 2)));

    // Deep fluffy white brisket in front, clean athletic terrier tuck-up before hind stifles (matches udo_leap_6_0.png!)
    const bellyDepth =
      0.204 *
      (1.0 +
        0.22 * Math.exp(-Math.pow((t - 0.38) / 0.44, 2)) -
        0.25 * Math.exp(-Math.pow((t + 0.34) / 0.4, 2)));

    // Shaggy wirehair terrier coat waves along lower chest, flanks & haunches
    const shaggyWave =
      1.0 +
      0.024 * Math.sin(t * 16.0 + Math.abs(cosA) * 5.0) * (1 - t * t) * (sinA < 0.28 ? 1.35 : 0.72) +
      0.015 * Math.cos(sinA * 11.0 - t * 13.0) * (1 - t * t);

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
 * Sculpts Jan's Udo & Video Udo's exact wirehaired terrier head:
 * - Proper right-handed Rx(+PI/2) remapping (`det = +1`) for strictly outward normals & lighting
 * - Broad expressive dark-masked cranium & rounded zygomatic cheeks
 * - Gentle orbital sockets & raised shaggy brow ridge so his soulful warm-amber eyes nestle organically
 * - Distinct terrier stop dropping into his iconic PLUMP, ROUNDED, WATERFALL-MUSTACHED WHITE MUZZLE!
 */
function createUdoHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 56, 40);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (nape) .. +1 (snout tip)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5; // 0 = nape, 0.5 = eyes/stop, 1.0 = nose tip
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(-sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? -sz / radial : 0; // +1 forehead/bridge, -1 jaw/beard
    const absCos = Math.abs(cosA);

    // Distinct terrier stop step-down between rounded forehead cranium (t < 0) and plush white muzzle (t > 0.06)
    const stopStep = 0.5 * (1 - Math.tanh((t - 0.01) * 5.8));

    // Lush rounded waterfall mustache cushions framing the sides & lower corners of the snout (signature Video Udo!)
    const mustachePuff =
      0.052 *
      Math.exp(-Math.pow((t - 0.5) / 0.35, 2)) *
      Math.exp(-Math.pow((sinA + 0.18) / 0.54, 2)) *
      (0.52 + 0.48 * absCos);

    // Feathered charcoal-masked cheek fullness beneath & behind the eyes
    const cheekFluff =
      0.028 *
      Math.exp(-Math.pow((t + 0.08) / 0.34, 2)) *
      Math.exp(-Math.pow((sinA + 0.14) / 0.48, 2)) *
      absCos;

    // Gentle orbital eye-socket recesses + expressive shaggy brow ridge above eyes
    const eyeSocket =
      -0.018 *
      Math.exp(-Math.pow((t - 0.03) / 0.15, 2)) *
      Math.exp(-Math.pow((sinA - 0.33) / 0.19, 2)) *
      Math.exp(-Math.pow((absCos - 0.56) / 0.23, 2));

    const browRidge =
      0.024 *
      Math.exp(-Math.pow((t - 0.01) / 0.2, 2)) *
      Math.exp(-Math.pow((sinA - 0.63) / 0.2, 2)) *
      Math.exp(-Math.pow((absCos - 0.46) / 0.32, 2));

    // Delicate vertical philtrum crease between left & right white mustache cushions right under the black nose
    const philtrum =
      -0.016 *
      Math.exp(-Math.pow((t - 0.84) / 0.16, 2)) *
      Math.exp(-Math.pow((sinA + 0.22) / 0.28, 2)) *
      Math.exp(-Math.pow(cosA / 0.22, 2));

    // Plump, adorably rounded wirehair terrier muzzle & broad cranium
    const muzzleEndRound = t > 0.68 ? 1.0 - 0.21 * Math.pow((t - 0.68) / 0.32, 1.8) : 1.0;
    const widthProfile =
      (0.16 + 0.084 * stopStep) * muzzleEndRound + mustachePuff + cheekFluff + eyeSocket;
    const topProfile = (0.12 + 0.096 * stopStep) * muzzleEndRound + browRidge + eyeSocket * 0.4;
    const botProfile =
      (0.128 + 0.036 * stopStep) * muzzleEndRound + mustachePuff * 0.58 + philtrum * 0.35;

    const x = cosA * radial * widthProfile;
    let y = (sinA >= 0 ? sinA * topProfile : sinA * botProfile) * radial;
    y += 0.038 * stopStep - (1 - stopStep) * 0.02;

    const z = (t >= 0 ? t * 0.302 : t * 0.244) + mustachePuff * 0.26 + philtrum;
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
 * Sculpts Udo's signature downward-curving snowy-white waterfall mustache curtain on each side of his snout
 * (arches smoothly outward from the upper muzzle and drapes downward past the mouth corners — NO sideways spikes!).
 */
function createCurvedMustacheCurtainGeometry(side: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.038, 0.016, 0.258),
    new THREE.Vector3(side * 0.092, 0.002, 0.238),
    new THREE.Vector3(side * 0.126, -0.044, 0.205),
    new THREE.Vector3(side * 0.118, -0.102, 0.172),
  ]);

  const lenSegs = 14;
  const ringSegs = 12;
  const positions: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const upRef = new THREE.Vector3(0, 0, 1);
  const v = new THREE.Vector3();

  for (let i = 0; i <= lenSegs; i++) {
    const s = i / lenSegs;
    curve.getPointAt(s, pt);
    curve.getTangentAt(s, tan).normalize();

    n1.crossVectors(tan, upRef);
    if (n1.lengthSq() < 1e-4) n1.set(side, 0, 0);
    n1.normalize();
    n2.crossVectors(n1, tan).normalize();

    const env =
      s < 0.12
        ? Math.sin((s / 0.12) * Math.PI * 0.5)
        : Math.pow(1 - s, 0.72) * (1 + 0.24 * Math.sin(s * Math.PI));
    const rWide = Math.max(0.005, 0.056 * env);
    const rThick = Math.max(0.004, 0.036 * env);

    for (let j = 0; j <= ringSegs; j++) {
      const theta = (j / ringSegs) * Math.PI * 2;
      const flute = 1 + 0.08 * Math.cos(theta * 3);
      v.copy(pt)
        .addScaledVector(n1, Math.cos(theta) * rThick * flute)
        .addScaledVector(n2, Math.sin(theta) * rWide * flute);
      positions.push(v.x, v.y, v.z);
    }
  }

  const stride = ringSegs + 1;
  const midI = Math.floor(lenSegs * 0.45);
  const a0 = midI * stride;
  const pA = new THREE.Vector3(positions[a0 * 3], positions[a0 * 3 + 1], positions[a0 * 3 + 2]);
  const pB = new THREE.Vector3(positions[(a0 + 1) * 3], positions[(a0 + 1) * 3 + 1], positions[(a0 + 1) * 3 + 2]);
  const pC = new THREE.Vector3(positions[(a0 + stride) * 3], positions[(a0 + stride) * 3 + 1], positions[(a0 + stride) * 3 + 2]);
  curve.getPointAt(midI / lenSegs, pt);
  const flip =
    new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pC, pA)).dot(pA.clone().sub(pt)) < 0;

  for (let i = 0; i < lenSegs; i++) {
    for (let j = 0; j < ringSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (flip) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts Jan's Udo & Video Udo's signature high-set **folded forward-drop V-shaped terrier button ear**:
 * - Rises from the high corner of the cranium to a distinct grizzled terrier fold crest,
 *   then drops cleanly forward-and-slightly-outward so the broad triangular dark charcoal V-flap
 *   frames the upper temple & cheek exactly as in udo_close_3_2.png, udo_leap_6_0.png & udo_8d64da14.png!
 */
function createUdoButtonEarGeometry(side: number): THREE.BufferGeometry {
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), // high skull attachment
    new THREE.Vector3(side * 0.046, 0.052, 0.018), // upward rise into fuzzy fold crest
    new THREE.Vector3(side * 0.098, 0.036, 0.058), // crisp terrier fold hinge
    new THREE.Vector3(side * 0.132, -0.048, 0.094), // broad folded triangular V-blade
    new THREE.Vector3(side * 0.126, -0.142, 0.114), // neat pointed-rounded dark V-tip
  ]);

  const lenSegs = 22;
  const ringSegs = 16;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const chordDir = new THREE.Vector3();
  const thickDir = new THREE.Vector3();
  const outwardHint = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= lenSegs; i++) {
    const s = i / lenSegs; // 0 = skull root, ~0.30 = fold crest, 1 = V-tip
    spineCurve.getPointAt(s, pt);
    spineCurve.getTangentAt(s, tan).normalize();

    // Orient ear blade normal (thickDir) forward-and-outward so the flat triangular V-flap faces the viewer/front-side!
    outwardHint.set(side * 0.68, 0.28 * (1 - s), 0.72).normalize();
    chordDir.crossVectors(outwardHint, tan);
    if (chordDir.lengthSq() < 1e-4) chordDir.set(-side * 0.5, 0, 0.86);
    chordDir.normalize();
    thickDir.crossVectors(tan, chordDir).normalize();
    if (thickDir.dot(outwardHint) < 0) {
      thickDir.negate();
      chordDir.negate();
    }

    // Classic triangular V-flap width: widest right across the upper fold (s ≈ 0.34), tapering cleanly to a neat V-tip
    const tipTaper =
      s < 0.06
        ? Math.sin((s / 0.06) * Math.PI * 0.5)
        : s > 0.88
          ? Math.cos(((s - 0.88) / 0.12) * Math.PI * 0.5) * 0.85 + 0.15 * (1 - s)
          : 1.0;
    const vTriangleProfile =
      s < 0.32
        ? 0.056 + 0.048 * Math.sin((s / 0.32) * Math.PI * 0.5)
        : 0.104 * Math.pow(1 - (s - 0.32) / 0.68, 0.82) + 0.012 * (1 - s);
    const flapHalfWidth = Math.max(0.008, vTriangleProfile * Math.max(0.1, tipTaper));
    const flapHalfThick = Math.max(0.004, (0.018 * (1 - 0.55 * s) + 0.0045) * Math.max(0.12, tipTaper));

    for (let j = 0; j <= ringSegs; j++) {
      const uRing = j / ringSegs;
      const theta = uRing * Math.PI * 2;
      const cosT = Math.cos(theta); // +1 outer charcoal surface, -1 inner underside facing temple
      const sinT = Math.sin(theta); // -1 .. +1 across triangular flap width

      // Subtle natural ear-leather concavity on the inner side + crisp fold ridge at s ≈ 0.30
      const cupOffset = -0.011 * (1 - sinT * sinT) * Math.sin(s * Math.PI);
      const foldCrestLift = 0.009 * Math.exp(-Math.pow((s - 0.3) / 0.11, 2)) * Math.max(0, cosT);

      v.copy(pt)
        .addScaledVector(thickDir, cosT * flapHalfThick + cupOffset + foldCrestLift)
        .addScaledVector(chordDir, sinT * flapHalfWidth);
      positions.push(v.x, v.y, v.z);
      uvs.push(uRing, s);
    }
  }

  const rowStride = ringSegs + 1;
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
 * Creates a spherical eyeball with distortion-free planar-frontal UV projection along +Z
 * so `eyeColorMap` (jet-black pupil + warm chestnut-amber iris + dark limbal ring) maps dead-center!
 */
function createUdoEyeGeometry(radius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 22, 18);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / radius;
    const y = pos.getY(i) / radius;
    const z = pos.getZ(i) / radius;
    if (z >= 0) {
      uv.setXY(i, 0.5 + x * 0.48, 0.5 + y * 0.48);
    } else {
      uv.setXY(i, 0.02, 0.02);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Sculpts a soft, organic, gently curved shaggy fur lock (strictly outward normals).
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

    const u = (sy + 1) * 0.5;
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
 * Sculpts Video Udo's cute prominent glossy rounded-triangle black terrier nose with twin nostrils & philtrum cleft.
 */
function createTerrierNoseGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 24, 20);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    const triWidth = sy > 0 ? 1.26 + sy * 0.05 : 1.26 + sy * 0.46;
    const topFlat = sy > 0.32 ? -0.15 * (sy - 0.32) : 0;
    const centerCleft =
      sz > 0.1 && sy < 0.22
        ? -0.14 * Math.exp(-Math.pow(sx / 0.17, 2)) * (0.22 - sy) * sz
        : 0;
    const nostrilDimple =
      sz > 0.22
        ? -0.19 *
          Math.exp(-Math.pow((Math.abs(sx) - 0.46) / 0.21, 2)) *
          Math.exp(-Math.pow((sy + 0.04) / 0.25, 2)) *
          sz
        : 0;

    const x = sx * 0.058 * triWidth;
    const y = sy * 0.045 + topFlat * 0.045;
    const z = sz * 0.047 + nostrilDimple * 0.034 + centerCleft * 0.026;
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
 * Sculpts Udo's happy curved rosy-pink terrier tongue peeking over his dark smiling lower lip!
 */
function createSculptedTongueGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    const u = (sz + 1) * 0.5;
    const width = 0.043 * (0.78 + 0.26 * Math.sin(u * Math.PI));
    const curlDown = -0.03 * u * u;
    const centerGroove = sy > 0 ? -0.005 * Math.exp(-Math.pow(sx / 0.28, 2)) : 0;

    const x = sx * width;
    const y = sy * 0.014 + curlDown + centerGroove;
    const z = u * 0.11;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts Video Udo's pure snowy-white fluffy tapered carrot terrier tail at his exact ~46° jaunty backward-upward angle
 * (matching udo_close_3_2.png, udo_close_5_2.png & udo_leap_6_0.png — NOT sticking straight vertically!).
 */
function createSculptedTerrierTailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 20, 16);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 rump root .. +1 neat tapered white tip
    const sz = pos.getZ(i);

    const u = (sy + 1) * 0.5;
    const radius = 0.058 * (1 - 0.72 * Math.pow(u, 1.32)) * (1 + 0.15 * Math.sin(u * Math.PI));
    // Extra shaggy feathering along underside of tail (sz < 0) matching udo_leap_6_0.png!
    const underFeather = sz < 0 ? 1 + 0.28 * Math.sin(u * Math.PI) * (-sz) : 1;
    const shaggy = 1 + 0.07 * Math.sin(u * 15 + sx * 4) * (1 - u);
    const x = sx * radius * shaggy;
    // Jaunty ~45° backward-and-upward carrot tail trajectory with gentle cheerful upward tip lift
    const y = u * 0.185 + u * u * 0.032;
    const z = sz * radius * shaggy * underFeather - u * 0.215;
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
    const rearFluff = sz < 0 ? 1 + featherBack * Math.sin(u * Math.PI) * (-sz) : 1;
    const x = sx * r;
    const y = sy * (length * 0.5);
    const z = sz * r * 1.1 * rearFluff;
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
 * High-precision procedural 3D likeness of **Jan's Udo & Video Udo**
 * (the fluffy white & charcoal-grizzle wirehaired Jack/Parson Russell Terrier in Chess Angel's arms):
 * - Pure snowy-white plush shaggy terrier body with painterly fur locks, elbow feathering, white paws with dark claw/pad tips, and jaunty ~46° carrot tail
 * - Symmetrical dark charcoal-slate grizzle temple/eye/cheek mask streaked with silver-white wirehairs & feathered cheek points
 * - Signature flame-shaped snowy-white forehead blaze narrowing between the eyes and opening into a pure white neck scruff
 * - Soulful warm chestnut-amber iris + jet-black pupil eyes framed by dark eyelids & arching white/charcoal wirehair eyebrows
 * - Lush downward-curving snowy-white waterfall mustache curtains, glossy black terrier nose, dark smiling lip line & subtle white lower teeth glint
 * - High-set dark charcoal-slate folded forward-drop V-shaped terrier button ears with wispy silver-white inner-fold tufts
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

    const makeFurMaterial = (opts: {
      map?: THREE.Texture;
      color: number;
      emissive: number;
      emissiveIntensity: number;
      bumpScale: number;
      roughness: number;
      sheenColor: number;
      useRoughMap?: boolean;
    }): THREE.Material => {
      if (IS_MOBILE_DEVICE) {
        return this.trackMat(
          new THREE.MeshStandardMaterial({
            map: opts.map,
            bumpMap: tex.wireBumpMap,
            bumpScale: opts.bumpScale,
            roughnessMap: opts.useRoughMap ? tex.roughnessMap : undefined,
            color: opts.color,
            emissive: opts.emissive,
            emissiveIntensity: opts.emissiveIntensity,
            roughness: opts.roughness,
            metalness: 0.0,
          }),
        );
      }
      return this.trackMat(
        new THREE.MeshPhysicalMaterial({
          map: opts.map,
          bumpMap: tex.wireBumpMap,
          bumpScale: opts.bumpScale,
          roughnessMap: opts.useRoughMap ? tex.roughnessMap : undefined,
          color: opts.color,
          emissive: opts.emissive,
          emissiveIntensity: opts.emissiveIntensity,
          roughness: opts.roughness,
          metalness: 0.0,
          sheen: 0.66,
          sheenRoughness: 0.76,
          sheenColor: new THREE.Color(opts.sheenColor),
        }),
      );
    };

    const bodyCoatMat = makeFurMaterial({
      map: tex.bodyColorMap,
      color: 0xffffff,
      emissive: 0x242320,
      emissiveIntensity: 0.16,
      bumpScale: 0.019,
      roughness: 0.9,
      sheenColor: 0xfffdf8,
      useRoughMap: true,
    });

    const headCoatMat = makeFurMaterial({
      map: tex.headColorMap,
      color: 0xffffff,
      emissive: 0x1b1b1a,
      emissiveIntensity: 0.13,
      bumpScale: 0.02,
      roughness: 0.89,
      sheenColor: 0xebeef2,
      useRoughMap: true,
    });

    const whiteWireTuftMat = makeFurMaterial({
      map: tex.bodyColorMap,
      color: 0xfbfaf6,
      emissive: 0x252421,
      emissiveIntensity: 0.16,
      bumpScale: 0.017,
      roughness: 0.91,
      sheenColor: 0xffffff,
      useRoughMap: true,
    });

    const grizzleDarkTuftMat = makeFurMaterial({
      color: 0x26282c,
      emissive: 0x0a0b0d,
      emissiveIntensity: 0.1,
      bumpScale: 0.016,
      roughness: 0.87,
      sheenColor: 0xa4aab4,
    });

    const silverWispMat = makeFurMaterial({
      color: 0xe2e5ea,
      emissive: 0x202225,
      emissiveIntensity: 0.13,
      bumpScale: 0.013,
      roughness: 0.88,
      sheenColor: 0xfafbfd,
    });

    const earMat = makeFurMaterial({
      map: tex.earColorMap,
      color: 0xffffff,
      emissive: 0x0d0e10,
      emissiveIntensity: 0.11,
      bumpScale: 0.015,
      roughness: 0.85,
      sheenColor: 0xb2b8c2,
      useRoughMap: true,
    });

    const noseMat = this.trackMat(
      IS_MOBILE_DEVICE
        ? new THREE.MeshStandardMaterial({
            color: 0x101113,
            emissive: 0x050507,
            emissiveIntensity: 0.06,
            roughness: 0.18,
            metalness: 0.05,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0x101113,
            emissive: 0x050507,
            emissiveIntensity: 0.06,
            roughness: 0.13,
            metalness: 0.04,
            clearcoat: 1.0,
            clearcoatRoughness: 0.09,
          }),
    );

    const eyeIrisMat = this.trackMat(
      IS_MOBILE_DEVICE
        ? new THREE.MeshStandardMaterial({
            map: tex.eyeColorMap,
            color: 0xffffff,
            emissive: 0x1a0d05,
            emissiveIntensity: 0.18,
            roughness: 0.06,
            metalness: 0.04,
          })
        : new THREE.MeshPhysicalMaterial({
            map: tex.eyeColorMap,
            color: 0xffffff,
            emissive: 0x1a0d05,
            emissiveIntensity: 0.18,
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
        color: 0x111214,
        roughness: 0.56,
        metalness: 0.0,
      }),
    );

    const eyeCatchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const lipDarkMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x151619,
        roughness: 0.42,
        metalness: 0.02,
      }),
    );

    const teethWhiteMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbf9f2,
        emissive: 0x2c2a24,
        emissiveIntensity: 0.15,
        roughness: 0.24,
        metalness: 0.0,
      }),
    );

    const mouthInnerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b171e,
        roughness: 0.58,
        metalness: 0.0,
      }),
    );

    const tongueMat = this.trackMat(
      IS_MOBILE_DEVICE
        ? new THREE.MeshStandardMaterial({
            color: 0xed7c90,
            emissive: 0x3a1019,
            emissiveIntensity: 0.16,
            roughness: 0.3,
            metalness: 0.0,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0xed7c90,
            emissive: 0x3a1019,
            emissiveIntensity: 0.16,
            roughness: 0.26,
            metalness: 0.0,
            clearcoat: 0.48,
            clearcoatRoughness: 0.22,
          }),
    );

    const pawPadClawMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2a292c,
        roughness: 0.55,
        metalness: 0.04,
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

    // Athletic, sleek terrier stance matching Video Udo (paws rest flush at y = 0)
    this.bodyPivot.position.set(0, 0.606, 0);
    this.root.add(this.bodyPivot);

    // 1. Sculpted pure snowy-white shaggy terrier torso
    const torsoMesh = makeMesh(createTerrierBodyGeometry(), bodyCoatMat);
    torsoMesh.position.set(0, 0.015, -0.02);
    this.bodyPivot.add(torsoMesh);

    // Lush pure-white shaggy neck & chest ruff seamlessly bridging shoulders and head
    const neckColumn = makeMesh(createSculptedLegSegmentGeometry(0.172, 0.202, 0.29, 0.24), whiteWireTuftMat);
    neckColumn.rotation.x = 0.54;
    neckColumn.position.set(0, 0.148, 0.416);
    this.bodyPivot.add(neckColumn);

    // Layered snowy-white chest brisket, neck scruff, shoulder locks, belly skirt & haunch feathering (matches udo_leap_6_0.png!)
    const sharedChestLock = this.trackGeo(createSculptedFurLockGeometry(0.118, 0.142, 0.108, 0.42, -0.024));
    const sharedFlankLock = this.trackGeo(createSculptedFurLockGeometry(0.086, 0.122, 0.082, 0.32, -0.028));
    const sharedScruffLock = this.trackGeo(createSculptedFurLockGeometry(0.056, 0.098, 0.058, 0.26, -0.022));

    const bodyFluffConfigs: ReadonlyArray<{
      geo: THREE.BufferGeometry;
      p: [number, number, number];
      s: [number, number, number];
      rot: [number, number, number];
    }> = [
      // Plush layered white chest brisket locks (prominent in Video Udo sitting & leaping!)
      { geo: sharedChestLock, p: [0, 0.012, 0.522], s: [1.32, 1.05, 1.06], rot: [0.38, 0, 0] },
      { geo: sharedFlankLock, p: [-0.092, -0.028, 0.492], s: [0.96, 0.96, 0.92], rot: [0.46, -0.34, 0.26] },
      { geo: sharedFlankLock, p: [0.092, -0.028, 0.492], s: [0.96, 0.96, 0.92], rot: [0.46, 0.34, -0.26] },
      { geo: sharedScruffLock, p: [0, -0.072, 0.445], s: [1.15, 0.95, 1.0], rot: [0.85, 0, 0] },
      // Pure snowy-white backward-swept neck scruff tufts right behind Udo's dark ear/cheek mask (udo_leap_6_0.png!)
      { geo: sharedChestLock, p: [0, 0.198, 0.318], s: [1.16, 0.76, 1.14], rot: [-0.52, 0, 0] },
      { geo: sharedScruffLock, p: [-0.118, 0.175, 0.345], s: [0.95, 0.95, 1.0], rot: [-0.68, -0.28, 0.32] },
      { geo: sharedScruffLock, p: [0.118, 0.175, 0.345], s: [0.95, 0.95, 1.0], rot: [-0.68, 0.28, -0.32] },
      { geo: sharedFlankLock, p: [-0.156, 0.092, 0.362], s: [0.98, 0.94, 1.06], rot: [0.16, -0.32, 0.34] },
      { geo: sharedFlankLock, p: [0.156, 0.092, 0.362], s: [0.98, 0.94, 1.06], rot: [0.16, 0.32, -0.34] },
      // Shaggy white lower rib/belly skirt & rounded haunch locks
      { geo: sharedFlankLock, p: [-0.148, -0.056, 0.05], s: [0.88, 0.85, 1.38], rot: [-0.62, -0.22, 0.24] },
      { geo: sharedFlankLock, p: [0.148, -0.056, 0.05], s: [0.88, 0.85, 1.38], rot: [-0.62, 0.22, -0.24] },
      { geo: sharedFlankLock, p: [-0.146, -0.048, -0.225], s: [0.92, 0.84, 1.48], rot: [-0.56, -0.24, 0.24] },
      { geo: sharedFlankLock, p: [0.146, -0.048, -0.225], s: [0.92, 0.84, 1.48], rot: [-0.56, 0.24, -0.24] },
      { geo: sharedFlankLock, p: [-0.146, 0.018, -0.452], s: [0.96, 0.94, 0.98], rot: [-0.48, -0.22, 0.18] },
      { geo: sharedFlankLock, p: [0.146, 0.018, -0.452], s: [0.96, 0.94, 0.98], rot: [-0.48, 0.22, -0.18] },
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

    // 2. Jan's Udo & Video Udo's Head — appealing proportions, symmetrical charcoal-grizzle saddle mask,
    // flame-shaped white forehead blaze, soulful chestnut-amber eyes, and downward-curving waterfall white mustache!
    this.headPivot.position.set(0, 0.284, 0.49);
    this.headPivot.scale.setScalar(1.1);
    this.bodyPivot.add(this.headPivot);

    const headMesh = makeMesh(createUdoHeadGeometry(), headCoatMat);
    headMesh.position.set(0, 0.02, 0.045);
    this.headPivot.add(headMesh);

    const sharedMustachePuffGeo = this.trackGeo(createSculptedFurLockGeometry(0.092, 0.078, 0.108, 0.64, -0.016));
    const sharedBrowLockGeo = this.trackGeo(createSculptedFurLockGeometry(0.036, 0.072, 0.034, 0.24, 0.016));
    const sharedCheekPointGeo = this.trackGeo(createSculptedFurLockGeometry(0.044, 0.078, 0.044, 0.24, -0.018));

    // Plush white upper snout bridge cushion leading up between the eyes
    const snoutBridgeFluff = makeMesh(
      createSculptedFurLockGeometry(0.082, 0.056, 0.1, 0.68, 0),
      whiteWireTuftMat,
    );
    snoutBridgeFluff.position.set(0, 0.032, 0.226);
    this.headPivot.add(snoutBridgeFluff);

    // Dark smiling upper lip rim tucked right under Udo's white mustache cushions
    const upperLipArc = makeMesh(new THREE.TorusGeometry(0.068, 0.011, 8, 18, Math.PI), lipDarkMat, false);
    upperLipArc.rotation.x = Math.PI / 2 + 0.14;
    upperLipArc.scale.set(1.04, 1.32, 0.85);
    upperLipArc.position.set(0, -0.048, 0.212);
    this.headPivot.add(upperLipArc);

    for (const side of [-1, 1]) {
      // Full rounded snowy-white upper mustache cushion on each side of the glossy black nose
      const mustachePuff = new THREE.Mesh(sharedMustachePuffGeo, whiteWireTuftMat);
      mustachePuff.castShadow = enableShadows;
      mustachePuff.receiveShadow = enableShadows;
      mustachePuff.position.set(side * 0.068, -0.016, 0.232);
      mustachePuff.rotation.set(0.16, side * 0.24, side * -0.16);
      this.headPivot.add(mustachePuff);

      // Authentic downward-draping waterfall mustache curtain (matches udo_close_3_2.png & udo_leap_6_0.png!)
      const mustacheCurtain = makeMesh(createCurvedMustacheCurtainGeometry(side), whiteWireTuftMat);
      this.headPivot.add(mustacheCurtain);

      // Secondary tucked lower-outer mustache lock draping gently downward beside the smile
      const lowerWhiskerDrape = new THREE.Mesh(sharedCheekPointGeo, whiteWireTuftMat);
      lowerWhiskerDrape.scale.set(0.95, 1.08, 0.98);
      lowerWhiskerDrape.position.set(side * 0.104, -0.066, 0.205);
      lowerWhiskerDrape.rotation.set(-2.62, side * 0.22, side * -0.34);
      this.headPivot.add(lowerWhiskerDrape);

      // Expressive shaggy wirehair terrier eyebrows:
      // Crisp white/silver inner brow wisps arching up-and-out from the center white blaze + charcoal outer brow lock!
      const browWhiteInner = new THREE.Mesh(sharedBrowLockGeo, whiteWireTuftMat);
      browWhiteInner.scale.set(0.76, 0.92, 0.76);
      browWhiteInner.position.set(side * 0.056, 0.138, 0.18);
      browWhiteInner.rotation.set(0.76, side * 0.18, side * -0.52);
      this.headPivot.add(browWhiteInner);

      const browSilverMid = new THREE.Mesh(sharedBrowLockGeo, silverWispMat);
      browSilverMid.scale.set(0.74, 0.86, 0.74);
      browSilverMid.position.set(side * 0.082, 0.138, 0.172);
      browSilverMid.rotation.set(0.74, side * 0.24, side * -0.78);
      this.headPivot.add(browSilverMid);

      const browDarkOuter = new THREE.Mesh(sharedBrowLockGeo, grizzleDarkTuftMat);
      browDarkOuter.position.set(side * 0.106, 0.13, 0.158);
      browDarkOuter.rotation.set(0.68, side * 0.28, side * -1.04);
      this.headPivot.add(browDarkOuter);

      // Feathered charcoal-grizzle cheek points framing the rear cheek right behind the white mustache (udo_leap_6_0.png!)
      const cheekDarkUpper = new THREE.Mesh(sharedCheekPointGeo, grizzleDarkTuftMat);
      cheekDarkUpper.position.set(side * 0.176, 0.008, 0.092);
      cheekDarkUpper.rotation.set(-2.35, side * -0.25, side * -0.48);
      this.headPivot.add(cheekDarkUpper);

      const cheekSilverWisp = new THREE.Mesh(sharedCheekPointGeo, silverWispMat);
      cheekSilverWisp.scale.set(0.72, 0.82, 0.72);
      cheekSilverWisp.position.set(side * 0.178, -0.012, 0.082);
      cheekSilverWisp.rotation.set(-2.45, side * -0.22, side * -0.42);
      this.headPivot.add(cheekSilverWisp);
    }

    // Soft tousled snowy-white & silver crown fur wisps along the flame-shaped forehead blaze (matches udo_close_3_2.png & udo_8d64da14.png!)
    const sharedCrownTuft = this.trackGeo(createSculptedFurLockGeometry(0.032, 0.056, 0.038, 0.3, -0.014));
    for (const c of [
      { x: 0, y: 0.22, z: 0.068, rotZ: 0.03, mat: whiteWireTuftMat },
      { x: -0.028, y: 0.215, z: 0.048, rotZ: 0.3, mat: whiteWireTuftMat },
      { x: 0.028, y: 0.215, z: 0.048, rotZ: -0.3, mat: whiteWireTuftMat },
      { x: -0.056, y: 0.206, z: 0.032, rotZ: 0.52, mat: silverWispMat },
      { x: 0.056, y: 0.206, z: 0.032, rotZ: -0.52, mat: silverWispMat },
    ]) {
      const tuft = new THREE.Mesh(sharedCrownTuft, c.mat);
      tuft.position.set(c.x, c.y, c.z);
      tuft.rotation.set(-0.38, 0, c.rotZ);
      this.headPivot.add(tuft);
    }

    // Prominent glossy rounded-triangle wet jet-black nose centered atop the white waterfall mustache
    const nose = makeMesh(createTerrierNoseGeometry(), noseMat);
    nose.position.set(0, 0.014, 0.34);
    this.headPivot.add(nose);

    // Soulful warm chestnut-amber iris + jet-black pupil terrier eyes with sculpted upper/lower dark eyelids & catchlights
    const eyeRadius = 0.048;
    const sharedEyeGeo = this.trackGeo(createUdoEyeGeometry(eyeRadius));
    const sharedEyelidRimGeo = this.trackGeo(new THREE.TorusGeometry(eyeRadius * 0.97, 0.0085, 8, 24));
    const sharedUpperLidHoodGeo = this.trackGeo(
      new THREE.SphereGeometry(eyeRadius * 1.07, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.38),
    );
    const sharedGlintMainGeo = this.trackGeo(createFlushEyeGlintGeometry(eyeRadius, 0.26));
    const sharedGlintSubGeo = this.trackGeo(createFlushEyeGlintGeometry(eyeRadius, 0.13));

    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.093, 0.076, 0.18);
      eyeGroup.rotation.y = side * 0.26;
      eyeGroup.rotation.x = -0.05;
      this.headPivot.add(eyeGroup);

      // Almond-shaped dark eyeliner rim
      const eyelidRim = new THREE.Mesh(sharedEyelidRimGeo, eyeRimMat);
      eyelidRim.scale.set(1.08, 0.92, 0.88);
      eyelidRim.rotation.z = side * -0.1;
      eyelidRim.position.set(0, 0, -0.004);
      eyeGroup.add(eyelidRim);

      // Subtle expressive upper eyelid hood giving Udo his gentle, soulful gaze
      const upperLid = new THREE.Mesh(sharedUpperLidHoodGeo, eyeRimMat);
      upperLid.rotation.x = -0.22;
      upperLid.rotation.z = side * -0.12;
      upperLid.scale.set(1.06, 0.95, 1.02);
      eyeGroup.add(upperLid);

      const eye = new THREE.Mesh(sharedEyeGeo, eyeIrisMat);
      eye.scale.set(1.04, 0.97, 0.95);
      eyeGroup.add(eye);

      // Crisp studio catchlights matching Video Udo's upper-left highlight + lower-right wet glint
      const glintMain = new THREE.Mesh(sharedGlintMainGeo, eyeCatchlightMat);
      glintMain.rotation.x = -0.34;
      glintMain.rotation.y = -0.24;
      eyeGroup.add(glintMain);

      const glintSub = new THREE.Mesh(sharedGlintSubGeo, eyeCatchlightMat);
      glintSub.rotation.x = 0.34;
      glintSub.rotation.y = 0.24;
      eyeGroup.add(glintSub);
    }

    // Articulated fluffy white-bearded lower jaw + dark smiling lower lip rim + subtle white lower teeth + pink tongue
    // (matches Video Udo's exact joyful open-mouth smile in udo_close_5_2.png & udo_leap_6_0.png!)
    this.jawPivot.position.set(0, -0.058, 0.148);
    this.headPivot.add(this.jawPivot);

    const lowerJawBeard = makeMesh(
      createSculptedFurLockGeometry(0.084, 0.054, 0.11, 0.66, 0),
      whiteWireTuftMat,
    );
    lowerJawBeard.position.set(0, -0.028, 0.095);
    this.jawPivot.add(lowerJawBeard);

    // Compact rounded snowy-white goatee chin tuft (matches udo_leap_6_0.png!)
    const chinBeard = makeMesh(
      createSculptedFurLockGeometry(0.06, 0.066, 0.06, 0.4, -0.016),
      whiteWireTuftMat,
      false,
    );
    chinBeard.position.set(0, -0.06, 0.124);
    chinBeard.rotation.x = 2.66;
    this.jawPivot.add(chinBeard);

    // Dark charcoal smiling lower lip U-rim
    const lowerLipArc = makeMesh(new THREE.TorusGeometry(0.056, 0.011, 8, 18, Math.PI), lipDarkMat, false);
    lowerLipArc.rotation.x = Math.PI / 2 - 0.08;
    lowerLipArc.scale.set(1.02, 1.38, 0.9);
    lowerLipArc.position.set(0, 0.002, 0.072);
    this.jawPivot.add(lowerLipArc);

    // Subtle tiny bright white lower teeth row & canine tips glimpsed when Udo smiles/barks (udo_close_5_2.png & udo_leap_6_0.png!)
    const lowerTeethArc = makeMesh(
      new THREE.TorusGeometry(0.044, 0.0065, 6, 14, Math.PI * 0.82),
      teethWhiteMat,
      false,
    );
    lowerTeethArc.rotation.x = Math.PI / 2 - 0.06;
    lowerTeethArc.rotation.z = Math.PI * 0.09;
    lowerTeethArc.scale.set(1.0, 1.25, 0.95);
    lowerTeethArc.position.set(0, 0.007, 0.084);
    this.jawPivot.add(lowerTeethArc);

    const mouthBed = makeMesh(new THREE.SphereGeometry(0.05, 10, 8), mouthInnerMat, false);
    mouthBed.scale.set(1.0, 0.42, 1.35);
    mouthBed.position.set(0, 0.001, 0.09);
    this.jawPivot.add(mouthBed);

    this.tongueMesh = makeMesh(createSculptedTongueGeometry(), tongueMat, false);
    this.tongueMesh.position.set(0, 0.005, 0.068);
    this.jawPivot.add(this.tongueMesh);

    // 3. Jan's Udo & Video Udo's Signature High-Set Folded Forward-Drop Dark Charcoal V-Ears!
    const sharedEarCreaseTuft = this.trackGeo(createSculptedFurLockGeometry(0.03, 0.058, 0.032, 0.26, 0.012));
    const buildUdoEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.136, 0.176, 0.018);

      // Sculpted 3D folded V-drop terrier ear framing the temple & upper cheek
      const earFlap = makeMesh(createUdoButtonEarGeometry(side), earMat);
      pivot.add(earFlap);

      // Wispy silver-white inner-fold & upper-crease wirehair tufts (prominent in udo_8d64da14.png & udo_close_3_2.png!)
      const creaseWispOuter = new THREE.Mesh(sharedEarCreaseTuft, silverWispMat);
      creaseWispOuter.position.set(side * 0.048, 0.04, 0.026);
      creaseWispOuter.rotation.set(0.32, side * 0.24, side * -1.08);
      pivot.add(creaseWispOuter);

      const innerCanalWisp = new THREE.Mesh(sharedEarCreaseTuft, whiteWireTuftMat);
      innerCanalWisp.scale.set(0.78, 0.85, 0.78);
      innerCanalWisp.position.set(side * 0.068, -0.008, 0.048);
      innerCanalWisp.rotation.set(0.45, side * 0.35, side * -1.42);
      pivot.add(innerCanalWisp);

      this.headPivot.add(pivot);
    };
    buildUdoEar(-1, this.earLeftPivot);
    buildUdoEar(1, this.earRightPivot);

    // 4. Video Udo's Pure Snowy-White Fluffy Tapered Carrot Terrier Tail (~46° jaunty angle + base fluff)
    this.tailPivot.position.set(0, 0.128, -0.515);
    this.bodyPivot.add(this.tailPivot);

    const tailMesh = makeMesh(createSculptedTerrierTailGeometry(), whiteWireTuftMat);
    this.tailPivot.add(tailMesh);

    const tailBaseFluff = makeMesh(
      createSculptedFurLockGeometry(0.062, 0.078, 0.058, 0.36, -0.018),
      whiteWireTuftMat,
      false,
    );
    tailBaseFluff.position.set(0, 0.02, -0.032);
    tailBaseFluff.rotation.x = -0.78;
    this.tailPivot.add(tailBaseFluff);

    // 5. Four Fluffy Feathered Snowy-White Terrier Legs (with prominent elbow tufts & dark claw/pad tips!)
    const sharedFrontUpper = this.trackGeo(createSculptedLegSegmentGeometry(0.084, 0.062, 0.315, 0.32));
    const sharedBackUpper = this.trackGeo(createSculptedLegSegmentGeometry(0.102, 0.068, 0.324, 0.34));
    const sharedLowerLeg = this.trackGeo(createSculptedLegSegmentGeometry(0.062, 0.048, 0.296, 0.3));
    const sharedLegFeather = this.trackGeo(createSculptedFurLockGeometry(0.042, 0.088, 0.044, 0.28, -0.018));
    const sharedPawMain = this.trackGeo(createSculptedFurLockGeometry(0.068, 0.044, 0.084, 0.78, 0));
    const sharedToeGeo = this.trackGeo(new THREE.SphereGeometry(0.0215, 8, 6));
    const sharedClawTipGeo = this.trackGeo(new THREE.ConeGeometry(0.0075, 0.02, 6));
    sharedClawTipGeo.rotateX(Math.PI * 0.62);
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

      // Signature backward-pointing shaggy elbow/stifle fur tuft (clearly visible on leaping Udo in udo_leap_6_0.png!)
      const upperElbowTuft = new THREE.Mesh(sharedLegFeather, whiteWireTuftMat);
      upperElbowTuft.scale.set(1.05, 1.08, 1.05);
      upperElbowTuft.position.set(0, isBack ? -0.21 : -0.225, isBack ? -0.058 : -0.052);
      upperElbowTuft.rotation.x = -2.25;
      hip.add(upperElbowTuft);

      const shin = new THREE.Group();
      shin.position.set(0, -0.27, 0);
      hip.add(shin);

      const lower = new THREE.Mesh(sharedLowerLeg, whiteWireTuftMat);
      lower.castShadow = enableShadows;
      lower.receiveShadow = enableShadows;
      lower.position.set(0, -0.126, 0.008);
      shin.add(lower);

      // Shaggy white fur feathering along back of lower leg/pastern
      const legFeather = new THREE.Mesh(sharedLegFeather, whiteWireTuftMat);
      legFeather.position.set(0, -0.128, -0.042);
      legFeather.rotation.x = -2.52;
      shin.add(legFeather);

      // Fluffy rounded pure-white terrier paw resting flush at y = 0
      const paw = new THREE.Mesh(sharedPawMain, whiteWireTuftMat);
      paw.castShadow = enableShadows;
      paw.receiveShadow = enableShadows;
      paw.position.set(0, -0.256, 0.032);
      shin.add(paw);

      // 4 rounded snowy-white furry toes + subtle dark charcoal claw/pad tips (visible in udo_close_3_2.png & udo_leap_6_0.png!)
      for (const ang of [-0.42, -0.14, 0.14, 0.42]) {
        const tx = Math.sin(ang) * 0.052;
        const tz = 0.078 + Math.cos(ang) * 0.022;
        const toe = new THREE.Mesh(sharedToeGeo, whiteWireTuftMat);
        toe.scale.set(0.94, 0.86, 1.32);
        toe.position.set(tx, -0.266, tz);
        toe.rotation.y = ang;
        shin.add(toe);

        const clawTip = new THREE.Mesh(sharedClawTipGeo, pawPadClawMat);
        clawTip.position.set(tx * 1.04, -0.277, tz + Math.cos(ang) * 0.022);
        clawTip.rotation.y = ang;
        shin.add(clawTip);
      }

      // Dark charcoal sole pad tucked neatly underneath paw
      const solePad = new THREE.Mesh(sharedSolePad, pawPadClawMat);
      solePad.scale.set(0.94, 0.28, 1.1);
      solePad.position.set(0, -0.285, 0.034);
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
   * spirited snowy-white carrot tail wag, cheerful open-mouth barking smile & pink tongue,
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

    // During initial airborne leap from Chess Angel's arms, strike Video Udo's tucked-forepaw leaping pose!
    const leapPoseFactor = THREE.MathUtils.clamp((airHeight - 0.18) * 0.9, 0, 1);

    // Springy terrier bound & shoulder roll
    const strideBounce = Math.abs(Math.sin(phase)) * 0.15 * (1 - 0.45 * leapPoseFactor);
    this.bodyPivot.position.y = 0.606 + strideBounce;
    this.bodyPivot.rotation.x =
      Math.cos(phase) * 0.22 * (1 - 0.55 * leapPoseFactor) - Math.min(0.28, airHeight * 0.17);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.085;

    // Athletic rotary terrier gallop kinematics + graceful tucked-paw mid-air leap pose (matches udo_leap_6_0.png!)
    const setLeg = (rig: TerrierLegRig, p: number, isBack: boolean) => {
      const gallopHip = Math.sin(p) * (isBack ? 0.94 : 0.9);
      const gallopShin = Math.max(0, -Math.cos(p)) * (isBack ? -0.7 : 0.94);
      const leapHip = isBack ? 0.42 : -0.62;
      const leapShin = isBack ? -0.52 : 1.08;
      rig.hip.rotation.x = THREE.MathUtils.lerp(gallopHip, leapHip + gallopHip * 0.28, leapPoseFactor);
      rig.shin.rotation.x = THREE.MathUtils.lerp(gallopShin, leapShin + gallopShin * 0.22, leapPoseFactor);
    };
    setLeg(this.legFL, phase, false);
    setLeg(this.legFR, phase + 0.46, false);
    setLeg(this.legBL, phase + Math.PI, true);
    setLeg(this.legBR, phase + Math.PI + 0.46, true);

    // Joyful terrier head carriage, expressive open-mouth smile (especially mid-leap!) & barking jaw
    const b = THREE.MathUtils.clamp(barkOpen01, 0, 1);
    const leapSmile = Math.min(0.42, airHeight * 0.2);
    const mouthOpen = Math.max(b, leapSmile);
    this.headPivot.rotation.x = -0.08 - b * 0.18 + Math.sin(phase + 0.5) * 0.075;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 8.8) * 0.13;
    this.headPivot.rotation.z = Math.sin(elapsedSec * 11.2) * 0.075;
    this.jawPivot.rotation.x = 0.15 + mouthOpen * 0.52;
    this.tongueMesh.position.z = 0.068 + mouthOpen * 0.03;
    this.tongueMesh.rotation.x = 0.12 + mouthOpen * 0.24;

    // Folded forward-drop V-ears bounce playfully outward/upward with each stride & leap
    const earFlop = Math.abs(Math.sin(phase - 0.3)) * 0.25 + Math.min(0.28, airHeight * 0.18);
    this.earLeftPivot.rotation.z = -0.03 - earFlop;
    this.earRightPivot.rotation.z = 0.03 + earFlop;
    this.earLeftPivot.rotation.x = -0.03 - earFlop * 0.32 - b * 0.07;
    this.earRightPivot.rotation.x = -0.03 - earFlop * 0.32 - b * 0.07;

    // Spirited rapid terrier carrot-tail wag
    this.tailPivot.rotation.y = Math.sin(elapsedSec * 34.0) * 0.44;
    this.tailPivot.rotation.z = Math.sin(elapsedSec * 34.0) * 0.28;
    this.tailPivot.rotation.x = -0.04 + Math.cos(phase) * 0.14 - leapPoseFactor * 0.12;

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
