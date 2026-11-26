import * as THREE from 'three';

export type MiniHamsterVariant = 'russian-grey' | 'snow-white';

const cachedFurTexturesByVariant = new Map<
  MiniHamsterVariant,
  {
    colorMap: THREE.CanvasTexture;
    headColorMap: THREE.CanvasTexture | null;
    bumpMap: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  }
>();
let cachedHamsterShadowTexture: THREE.CanvasTexture | null = null;

/**
 * Generates high-resolution 1024x1024 anatomically UV-mapped procedural fur textures
 * (albedo + directional micro-fur bump map + soft fur roughness variation map)
 * for a Campbell's Russian Dwarf Hamster (`Phodopus campbelli`).
 *
 * UV convention on the sculpted torso & head:
 * - `u` (0..1): angle around the longitudinal Z-axis (`u = 0.25` = dorsal centerline top,
 *   `u = 0.0 / 0.5 / 1.0` = lateral flanks, `u = 0.75` = ventral belly).
 * - `v` (0..1): longitudinal position (`v = 0` = rump/tail base, `v = 1` = shoulders/nose).
 */
function createCampbellFurTextures(variant: MiniHamsterVariant): {
  colorMap: THREE.CanvasTexture;
  headColorMap: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const cached = cachedFurTexturesByVariant.get(variant);
  if (cached) return cached;

  const size = 1024;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d');

  let headCanvas: HTMLCanvasElement | null = null;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  let seed = variant === 'russian-grey' ? 6143 : 9209;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  if (ctx) {
    if (variant === 'russian-grey') {
      // Rich agouti slate-grey plush dwarf hamster coat with subtle lighter silvery-grey underflanks
      // and a crisp jet-dark dorsal stripe strictly along the back (NOT on the head).
      const img = ctx.getImageData(0, 0, size, size);
      const data = img.data;
      for (let py = 0; py < size; py++) {
        const v = 1 - py / (size - 1);
        for (let px = 0; px < size; px++) {
          const u = px / (size - 1);
          let dTop = Math.abs(u - 0.25);
          if (dTop > 0.5) dTop = 1 - dTop;

          const idx = (py * size + px) * 4;
          const grain = (rand() - 0.5) * 14;
          // Subtle Campbell's three-arch flank undulation along the lower sides
          const archWave = 0.022 * Math.sin(v * Math.PI * 3.0);
          const flankShift = THREE.MathUtils.clamp((dTop - (0.24 + archWave)) / 0.22, 0, 1);
          const dorsalDepth = 1 - THREE.MathUtils.clamp(dTop / 0.16, 0, 1);

          // Medium-dark slate-grey coat with soft smoky-silver ventral blend
          const r = 88 - dorsalDepth * 10 + flankShift * 26 + grain;
          const g = 93 - dorsalDepth * 10 + flankShift * 26 + grain;
          const b = 102 - dorsalDepth * 9 + flankShift * 24 + grain;

          data[idx] = Math.round(THREE.MathUtils.clamp(r, 0, 255));
          data[idx + 1] = Math.round(THREE.MathUtils.clamp(g, 0, 255));
          data[idx + 2] = Math.round(THREE.MathUtils.clamp(b, 0, 255));
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      // Multi-layer velvety short-coat fur strokes (undercoat + fine guard hairs flowing nose-to-rump)
      for (let i = 0; i < 6800; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const len = 7 + rand() * 18;
        const drift = (rand() - 0.5) * 3.6;
        const roll = rand();
        const alpha = 0.06 + rand() * 0.13;
        if (roll > 0.56) {
          ctx.strokeStyle = `rgba(148, 155, 168, ${alpha.toFixed(3)})`;
        } else if (roll > 0.16) {
          ctx.strokeStyle = `rgba(46, 51, 60, ${alpha.toFixed(3)})`;
        } else {
          // Subtle warm agouti tipping on sparse guard hairs
          ctx.strokeStyle = `rgba(128, 122, 118, ${(alpha * 0.75).toFixed(3)})`;
        }
        ctx.lineWidth = 0.8 + rand() * 1.25;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + drift, y + len);
        ctx.stroke();
      }

      // Snapshot the pure unstriped grey coat for the head so his dorsal stripe stays ONLY on his back
      headCanvas = document.createElement('canvas');
      headCanvas.width = size;
      headCanvas.height = size;
      const hCtx = headCanvas.getContext('2d');
      if (hCtx) {
        hCtx.drawImage(colorCanvas, 0, 0);
        // Subtle lighter velvety fur around the cheeks & whisker muzzle on the head texture
        const cheekGlow = hCtx.createLinearGradient(0, 0, 0, size * 0.34);
        cheekGlow.addColorStop(0, 'rgba(132, 138, 148, 0.22)');
        cheekGlow.addColorStop(1, 'rgba(132, 138, 148, 0)');
        hCtx.fillStyle = cheekGlow;
        hCtx.fillRect(0, 0, size, size * 0.34);
      }

      // Paint the crisp feathered jet-dark dorsal stripe strictly along his back
      // (tapers gracefully to a point near the tail base v ≈ 0.04 and upper shoulders v ≈ 0.89)
      const stripeX = 0.25 * size;
      for (let py = 0; py < size; py++) {
        const v = 1 - py / (size - 1); // 0 = rump, 1 = front shoulders
        if (v > 0.9 || v < 0.03) continue;
        const shoulderFade = v > 0.76 ? THREE.MathUtils.clamp((0.9 - v) / 0.14, 0, 1) : 1;
        const rumpFade = v < 0.12 ? THREE.MathUtils.clamp((v - 0.03) / 0.09, 0, 1) : 1;
        const taper = Math.min(shoulderFade, rumpFade);
        const halfW = (0.023 + Math.sin(v * Math.PI) * 0.011) * size * (0.25 + 0.75 * taper);
        if (halfW < 1) continue;
        const gStripe = ctx.createLinearGradient(stripeX - halfW * 1.45, 0, stripeX + halfW * 1.45, 0);
        gStripe.addColorStop(0, 'rgba(14, 16, 22, 0)');
        gStripe.addColorStop(0.26, `rgba(16, 18, 24, ${(0.96 * taper).toFixed(3)})`);
        gStripe.addColorStop(0.5, `rgba(9, 11, 16, ${(1.0 * taper).toFixed(3)})`);
        gStripe.addColorStop(0.74, `rgba(16, 18, 24, ${(0.96 * taper).toFixed(3)})`);
        gStripe.addColorStop(1, 'rgba(14, 16, 22, 0)');
        ctx.fillStyle = gStripe;
        ctx.fillRect(stripeX - halfW * 1.45, py, halfW * 2.9, 2.0);
      }

      // Fine feathered dark hairs along the dorsal stripe border for natural organic blending
      for (let i = 0; i < 650; i++) {
        const v = 0.06 + rand() * 0.81;
        const py = (1 - v) * size;
        const spread = (rand() - 0.5) * 0.064 * size;
        const x = stripeX + spread;
        const len = 6 + rand() * 14;
        ctx.strokeStyle = `rgba(16, 18, 24, ${(0.24 + rand() * 0.32).toFixed(3)})`;
        ctx.lineWidth = 1.0 + rand() * 1.1;
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x + (rand() - 0.5) * 2.2, py + len);
        ctx.stroke();
      }
    } else {
      // Crisp snowy-white plush coat with distinct organic darker-grey spots of varied sizes
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#eef1f6');
      grad.addColorStop(0.5, '#f7f8fb');
      grad.addColorStop(1, '#ebeef4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      const paintSpot = (
        uCenter: number,
        vCenter: number,
        rx: number,
        ry: number,
        angleRad: number,
        rgb: [number, number, number],
        opacity: number,
      ) => {
        const [r, g, b] = rgb;
        const srx = rx * 2;
        const sry = ry * 2;
        for (const wrapOffset of [-size, 0, size]) {
          const cx = uCenter * size + wrapOffset;
          const cy = (1 - vCenter) * size;
          if (cx + srx * 1.4 < 0 || cx - srx * 1.4 > size) continue;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angleRad);
          const rg = ctx.createRadialGradient(
            0,
            0,
            Math.min(srx, sry) * 0.34,
            0,
            0,
            Math.max(srx, sry),
          );
          rg.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${opacity})`);
          rg.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${(opacity * 0.95).toFixed(3)})`);
          rg.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = rg;
          ctx.scale(1, sry / srx);
          ctx.beginPath();
          ctx.arc(0, 0, srx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      };

      // Organic pied darker-grey patches across white back, flanks, rump, shoulders & crown
      paintSpot(0.18, 0.56, 66, 78, 0.28, [56, 61, 70], 0.97);
      paintSpot(0.36, 0.26, 54, 64, -0.34, [64, 70, 80], 0.96);
      paintSpot(0.42, 0.62, 42, 50, 0.22, [52, 57, 66], 0.96);
      paintSpot(0.24, 0.37, 34, 42, -0.22, [60, 66, 76], 0.95);
      paintSpot(0.08, 0.41, 32, 36, 0.45, [70, 76, 86], 0.94);
      paintSpot(0.14, 0.2, 26, 30, -0.35, [54, 60, 70], 0.95);
      paintSpot(0.31, 0.74, 24, 28, 0.18, [50, 56, 66], 0.95);
      paintSpot(0.27, 0.51, 16, 18, -0.15, [48, 54, 64], 0.94);
      paintSpot(0.46, 0.43, 18, 22, 0.3, [64, 70, 80], 0.93);
      paintSpot(0.21, 0.14, 14, 16, 0.2, [58, 64, 74], 0.93);
      paintSpot(0.16, 0.81, 32, 36, 0.25, [56, 62, 72], 0.95);
      paintSpot(0.37, 0.84, 21, 23, -0.28, [68, 74, 84], 0.93);

      // Silky plush snow-white & silver-grey directional fur strokes
      for (let i = 0; i < 6600; i++) {
        const x = rand() * size;
        const y = rand() * size;
        const len = 7 + rand() * 17;
        const alpha = 0.07 + rand() * 0.12;
        ctx.strokeStyle =
          rand() > 0.44
            ? `rgba(242, 245, 250, ${alpha.toFixed(3)})`
            : `rgba(88, 94, 106, ${(alpha * 0.85).toFixed(3)})`;
        ctx.lineWidth = 0.85 + rand() * 1.25;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 3.4, y + len);
        ctx.stroke();
      }
    }
  }

  // High-definition directional short-coat plush fur bump texture (linear data)
  if (bCtx) {
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 6 + rand() * 15;
      const shade = Math.round(78 + rand() * 116);
      bCtx.strokeStyle = `rgba(${shade}, ${shade}, ${shade}, 0.46)`;
      bCtx.lineWidth = 1.0 + rand() * 1.1;
      bCtx.beginPath();
      bCtx.moveTo(x, y);
      bCtx.lineTo(x + (rand() - 0.5) * 3.2, y + len);
      bCtx.stroke();
    }
  }

  // Subtle fur roughness micro-variation (keeps coat soft & velvety matte: 0.84..0.96)
  if (rCtx) {
    rCtx.fillStyle = '#e2e2e2';
    rCtx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 8 + rand() * 18;
      const val = Math.round(212 + rand() * 38);
      rCtx.strokeStyle = `rgba(${val}, ${val}, ${val}, 0.35)`;
      rCtx.lineWidth = 1.2 + rand() * 1.4;
      rCtx.beginPath();
      rCtx.moveTo(x, y);
      rCtx.lineTo(x + (rand() - 0.5) * 3.0, y + len);
      rCtx.stroke();
    }
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.ClampToEdgeWrapping;
  colorMap.anisotropy = 4;

  let headColorMap: THREE.CanvasTexture | null = null;
  if (headCanvas) {
    headColorMap = new THREE.CanvasTexture(headCanvas);
    headColorMap.colorSpace = THREE.SRGBColorSpace;
    headColorMap.wrapS = THREE.RepeatWrapping;
    headColorMap.wrapT = THREE.ClampToEdgeWrapping;
    headColorMap.anisotropy = 4;
  }

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  const created = { colorMap, headColorMap, bumpMap, roughnessMap };
  cachedFurTexturesByVariant.set(variant, created);
  return created;
}

const HAMSTER_BODY_HALF_LEN = 0.425; // Compact, authentically plump Russian dwarf hamster torso

/**
 * Evaluates a point on the sculpted Campbell's Dwarf Hamster torso surface for given
 * longitudinal parameter `t` (-1 rump .. +1 shoulders) and circumferential angle (`cosA`, `sinA`).
 * Shared between the torso mesh and the conformal flush dorsal stripe ribbon for zero-gap alignment.
 */
function evalCampbellBodyPoint(
  t: number,
  radial: number,
  cosA: number,
  sinA: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  // Iconic chubby pear/teardrop dwarf hamster width:
  // fullest across plush tucked hindquarters (t ≈ -0.32), gently narrowing through mid-back into furry shoulders
  const pearWidth =
    0.296 *
    (1.0 +
      0.175 * Math.exp(-Math.pow((t + 0.32) / 0.48, 2)) -
      0.06 * Math.exp(-Math.pow((t - 0.22) / 0.36, 2)) -
      0.135 * Math.exp(-Math.pow((t - 0.72) / 0.38, 2)));

  // Lower-flank plushness + sculpted tucked haunch fullness at the rear hips
  const lowerFlank = sinA < 0.22 ? 1.0 + 0.088 * Math.exp(-Math.pow((sinA + 0.22) / 0.42, 2)) : 1.0;
  const haunchRoll =
    0.036 *
    Math.exp(-Math.pow((t + 0.48) / 0.32, 2)) *
    Math.exp(-Math.pow((sinA + 0.14) / 0.48, 2)) *
    Math.abs(cosA);

  // Subtle scapular shoulder cushion blending cleanly into the neckless head collar
  const shoulderPad =
    0.018 *
    Math.exp(-Math.pow((t - 0.58) / 0.28, 2)) *
    Math.exp(-Math.pow((sinA - 0.25) / 0.55, 2));

  // Natural arched spine profile with plump rounded rump dome and slight thoracic dip near neck
  const dorsalHeight =
    0.246 *
    (1.0 +
      0.145 * Math.exp(-Math.pow((t + 0.22) / 0.54, 2)) +
      0.028 * Math.exp(-Math.pow((t - 0.42) / 0.36, 2)) -
      0.06 * Math.exp(-Math.pow((t - 0.85) / 0.24, 2)));
  const ventralDepth = 0.184;

  // Soft organic fur-plush micro-undulation so silhouette reads velvety rather than mathematically sterile
  const furPlush =
    1.0 +
    0.008 * Math.sin(t * 17.0 + cosA * 5.0) * (1 - t * t) +
    0.006 * Math.cos(sinA * 11.0 - t * 12.0) * (1 - t * t);

  const x = (cosA * radial * pearWidth * lowerFlank + Math.sign(cosA) * haunchRoll * radial) * furPlush;
  let y = (sinA >= 0 ? sinA * (dorsalHeight + shoulderPad) : sinA * ventralDepth) * radial * furPlush;

  // Gentle natural spinal arch along mid-back and slight forward chest fullness
  y += 0.024 * Math.exp(-Math.pow((t + 0.16) / 0.62, 2)) * (1 - Math.abs(t) * 0.35);
  y -= 0.016 * Math.exp(-Math.pow((t - 0.78) / 0.3, 2)) * Math.max(0, -sinA);

  // Softly flattened ventral belly skimming snugly over the chessboard
  if (y < -0.152) {
    y = -0.152 + (y + 0.152) * 0.34;
  }

  // Slight rump dimple right around the tail insertion at t ≈ -1
  const rumpPinch = t < -0.82 ? 1.0 - 0.04 * Math.pow((-t - 0.82) / 0.18, 2) : 1.0;
  const z = (t < 0 ? t * HAMSTER_BODY_HALF_LEN * 1.03 : t * HAMSTER_BODY_HALF_LEN * 0.96) * rumpPinch;

  return out.set(x, y, z);
}

/**
 * Sculpts a continuous, high-resolution anatomically authentic Campbell's Dwarf Hamster torso:
 * - Chubby teardrop/pear proportions with plush lower flanks & tucked haunch rolls
 * - Naturally arched dorsal spine & softly flattened ventral belly
 * - Thick furred shoulder collar that merges seamlessly into the head (no skinny neck gap)
 */
function createCampbellBodyGeometry(): THREE.BufferGeometry {
  const segU = 52;
  const segV = 40;
  const geo = new THREE.SphereGeometry(1, segU, segV);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const tmp = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (rump) .. +1 (shoulders)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = (t + 1) * 0.5;
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(-sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? -sz / radial : 0;

    evalCampbellBodyPoint(t, radial, cosA, sinA, tmp);
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);

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
 * Creates a razor-flush, smoothly tapered conformal dorsal fur stripe ribbon
 * hugging strictly along the grey Russian hamster's back (rump to upper shoulders, NEVER on head).
 * Eliminates the blunt cylindrical ridge/caps of a TubeGeometry while staying crisp from every angle.
 */
function createConformalDorsalStripeGeometry(bodyOffsetY: number, bodyOffsetZ: number): THREE.BufferGeometry {
  const lenSegs = 36;
  const widthSegs = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tmp = new THREE.Vector3();

  const tStart = -0.92;
  const tEnd = 0.76;

  for (let i = 0; i <= lenSegs; i++) {
    const s = i / lenSegs; // 0 (rump) .. 1 (upper shoulders)
    const t = THREE.MathUtils.lerp(tStart, tEnd, s);
    const radial = Math.sqrt(Math.max(0.0004, 1 - t * t));

    // Graceful lance-shaped width taper: crisp point at rump & nape, widest along mid-back
    const endTaper = Math.pow(Math.sin(s * Math.PI), 0.58);
    const halfAngleSpan = (0.045 + 0.042 * Math.sin(s * Math.PI)) * endTaper;
    const liftCenter = 0.0032 * endTaper;

    for (let j = 0; j <= widthSegs; j++) {
      const wNorm = j / widthSegs; // 0..1 across stripe width
      const wSigned = wNorm * 2 - 1; // -1..+1
      const ang = Math.PI * 0.5 + wSigned * halfAngleSpan;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);

      evalCampbellBodyPoint(t, radial, cosA, sinA, tmp);
      // Taper edge thickness cleanly into the body fur so edges never look raised or boxy
      const edgeFade = Math.max(0, 1 - wSigned * wSigned);
      const lift = liftCenter * edgeFade - 0.0012 * (1 - edgeFade);

      positions.push(
        tmp.x + cosA * lift * 0.5,
        tmp.y + bodyOffsetY + lift,
        tmp.z + bodyOffsetZ,
      );
      uvs.push(wNorm, s);
    }
  }

  const rowStride = widthSegs + 1;
  for (let i = 0; i < lenSegs; i++) {
    for (let j = 0; j < widthSegs; j++) {
      const a = i * rowStride + j;
      const b = a + 1;
      const c = a + rowStride;
      const d = c + 1;
      indices.push(a, b, c);
      indices.push(b, d, c);
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
 * Sculpts ONE seamless, continuous Campbell's Dwarf Hamster head (`Phodopus campbelli`):
 * - Domed cranium & soft furry brow ridges
 * - Integrated subtle orbital sockets so glossy eyes sit naturally inside the skull (no glued eye balls!)
 * - Plump stuffed cheek-pouch jowls flaring warmly below the eyes and blending into the shoulders
 * - Short blunt Roman-arched rodent muzzle with integrated twin mystacial whisker cushions
 * - Delicate vertical philtrum cleft (split upper lip) right beneath the rhinarium nose
 */
function createCampbellHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 48, 36);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i); // -1 (nape/neck collar) .. +1 (snout tip)
    const sz = pos.getZ(i);

    const t = sy;
    const vNorm = 0.66 + (t + 1) * 0.16;
    const radial = Math.sqrt(sx * sx + sz * sz);
    const angle = Math.atan2(-sz, sx);
    const cosA = radial > 1e-5 ? sx / radial : 0;
    const sinA = radial > 1e-5 ? -sz / radial : 0;
    const absCos = Math.abs(cosA);

    // Base blunt-muzzle oval skull profile (round at crown & nape, softly blunt at nose tip)
    const muzzleTaperW = t > 0 ? 1.0 - 0.52 * Math.pow(t, 1.82) : 1.0 + 0.04 * Math.abs(t) - 0.06 * t * t;
    const muzzleTaperTop = t > 0 ? 1.0 - 0.44 * Math.pow(t, 1.55) : 1.0 - 0.02 * t * t;
    const muzzleTaperBot = t > 0 ? 1.0 - 0.4 * Math.pow(t, 1.68) : 1.0 + 0.06 * Math.abs(t);

    // Full, adorable stuffed hamster cheek pouches swelling laterally & slightly downward
    const cheekPouch =
      0.066 *
      Math.exp(-Math.pow((t - 0.02) / 0.44, 2)) *
      Math.exp(-Math.pow((sinA + 0.22) / 0.5, 2)) *
      Math.pow(absCos, 0.85);

    // Thick neck-collar plushness at the rear of the skull so the head joins the shoulders seamlessly
    const napeCollar =
      0.028 *
      Math.exp(-Math.pow((t + 0.72) / 0.34, 2)) *
      (0.75 + 0.25 * Math.max(0, -sinA));

    // Integrated twin mystacial whisker cushions on the front sides of the muzzle
    const whiskerPad =
      0.026 *
      Math.exp(-Math.pow((t - 0.74) / 0.2, 2)) *
      Math.exp(-Math.pow((sinA + 0.26) / 0.34, 2)) *
      Math.exp(-Math.pow((absCos - 0.66) / 0.38, 2));

    // Delicate vertical philtrum groove (cleft upper lip) between the two whisker cushions
    const philtrumCleft =
      -0.014 *
      Math.exp(-Math.pow((t - 0.84) / 0.16, 2)) *
      Math.exp(-Math.pow((sinA + 0.36) / 0.28, 2)) *
      Math.exp(-Math.pow(cosA / 0.22, 2));

    // Gentle brow ridge just above the eyes + subtle orbital recess so eyes nestle organically
    const eyeSocketRecess =
      -0.015 *
      Math.exp(-Math.pow((t - 0.38) / 0.18, 2)) *
      Math.exp(-Math.pow((sinA - 0.26) / 0.22, 2)) *
      Math.exp(-Math.pow((absCos - 0.86) / 0.22, 2));

    const browArch =
      0.012 *
      Math.exp(-Math.pow((t - 0.34) / 0.22, 2)) *
      Math.exp(-Math.pow((sinA - 0.58) / 0.2, 2)) *
      Math.exp(-Math.pow((absCos - 0.72) / 0.28, 2));

    const widthR = 0.218 * muzzleTaperW + cheekPouch + napeCollar + whiskerPad + eyeSocketRecess;
    const heightTop = 0.192 * muzzleTaperTop + napeCollar * 0.55 + browArch + eyeSocketRecess * 0.4;
    const heightBot = 0.16 * muzzleTaperBot + napeCollar * 0.75 + whiskerPad * 0.45 + philtrumCleft * 0.4;

    const x = cosA * radial * widthR;
    // Soft Roman-nose downward curve toward the blunt snout tip
    const nasalCurveY = t > 0 ? -0.052 * Math.pow(t, 1.72) : -0.008 * Math.abs(t);
    const y = (sinA >= 0 ? sinA * heightTop : sinA * heightBot) * radial + nasalCurveY;
    const zBase = t >= 0 ? t * 0.256 : t * 0.228;
    const z = zBase + whiskerPad * 0.55 + philtrumCleft;

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
 * Sculpts a delicate heart/shield-shaped moist rodent rhinarium nose with subtle nostril dimples.
 */
function createRhinariumNoseGeometry(scaleFactor: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 20, 16);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    // Broader across upper nostril bridge, gently heart-tapered downward into the philtrum
    const heartWidth = sy > 0 ? 1.14 + sy * 0.08 : 1.14 + sy * 0.34;
    // Subtle center top dip + twin comma-shaped nostril indents on the front
    const topDimple = sy > 0.35 ? -0.1 * Math.exp(-Math.pow(sx / 0.32, 2)) * (sy - 0.35) : 0;
    const nostrilIndent =
      sz > 0.2
        ? -0.14 *
          Math.exp(-Math.pow((Math.abs(sx) - 0.44) / 0.22, 2)) *
          Math.exp(-Math.pow((sy + 0.06) / 0.28, 2)) *
          sz
        : 0;

    const x = sx * 0.025 * heartWidth * scaleFactor;
    const y = (sy * 0.02 + topDimple * 0.02) * scaleFactor;
    const z = (sz * 0.019 + nostrilIndent * 0.018) * scaleFactor;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts an authentic folded petal-cupped Campbell's dwarf hamster ear shell:
 * - Rounded teardrop contour pinched gracefully at the ear base
 * - Concave inner concha bowl with a subtly rolled rim (helix)
 * - Optional inner-pinna mode that hugs the exact concave surface with zero edge gap
 */
function createCampbellEarShellGeometry(
  radiusX: number,
  radiusY: number,
  cupDepth: number,
  isInnerLiner: boolean,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 24, 18);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    // Natural petal silhouette: softly pinched base (sy < 0), rounded upper rim (sy > 0)
    const baseTaper = sy < 0 ? 1.0 + sy * 0.34 : 1.0 + sy * 0.07 - 0.08 * sy * sy;
    const x = sx * radiusX * baseTaper;
    const y = sy * radiusY;

    const r2 = Math.min(1, sx * sx + sy * sy);
    const r = Math.sqrt(r2);
    // Deep cupped concha + delicate inward-curled outer helix lip near r ≈ 0.88
    const helixCurl = Math.pow(r, 3.2) * (isInnerLiner ? 0.004 : 0.011);
    // Subtle natural vertical tulip fold characteristic of alert dwarf hamster ears
    const tulipFold = Math.abs(sx) * 0.008 * (1 - sy * 0.35);
    const cupZ = -cupDepth * (1 - r2) + helixCurl + tulipFold;
    const thickness = sz * (isInnerLiner ? 0.0045 : 0.0135);
    const z = cupZ + thickness;

    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a smooth curved spherical-cap cornea specular highlight that sits flush on the eyeball
 * surface (never poking out like a sphere pimple from oblique camera angles).
 */
function createFlushEyeGlintGeometry(eyeRadius: number, angularRadius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(
    eyeRadius + 0.0014,
    12,
    8,
    0,
    Math.PI * 2,
    0,
    angularRadius,
  );
  // Rotate so the cap pole faces +Z (front of eye)
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Builds a gracefully tapered whisker (`BufferGeometry`) along a 3D spline,
 * starting fuller at the mystacial follicle and tapering to a hair-fine tip.
 */
function createTaperedWhiskerGeometry(
  curve: THREE.CatmullRomCurve3,
  radiusBase: number,
  radiusTip: number,
  tubularSegs = 12,
  radialSegs = 5,
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const positions: number[] = [];
  const indices: number[] = [];
  const pt = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const u = i / tubularSegs;
    curve.getPointAt(u, pt);
    const r = THREE.MathUtils.lerp(radiusBase, radiusTip, Math.pow(u, 0.72));
    const N = frames.normals[i];
    const B = frames.binormals[i];

    for (let j = 0; j < radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      v.copy(pt)
        .addScaledVector(N, cosT * r)
        .addScaledVector(B, sinT * r);
      positions.push(v.x, v.y, v.z);
    }
  }

  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const nextJ = (j + 1) % radialSegs;
      const a = i * radialSegs + j;
      const b = i * radialSegs + nextJ;
      const c = (i + 1) * radialSegs + j;
      const d = (i + 1) * radialSegs + nextJ;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts a tiny arched rodent digit claw curving naturally downward (instead of a sharp straight cone).
 */
function createCurvedClawGeometry(length: number, baseRadius: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.002, 0),
    new THREE.Vector3(0, 0.003, length * 0.48),
    new THREE.Vector3(0, -length * 0.24, length),
  ]);
  return createTaperedWhiskerGeometry(curve, baseRadius, baseRadius * 0.14, 6, 5);
}

/**
 * Sculpts an organic tucked upper thigh / forearm haunch cushion that blends legs smoothly into the coat.
 */
function createSculptedLimbHaunchGeometry(isBack: boolean): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 18, 14);
  const pos = geo.attributes.position;

  const rx = isBack ? 0.072 : 0.056;
  const ry = isBack ? 0.095 : 0.082;
  const rz = isBack ? 0.092 : 0.068;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    // Fuller rounded thigh/shoulder at top (sy > 0), tapering sleekly into the ankle/wrist at bottom (sy < 0)
    const taper = sy < 0 ? 1.0 + sy * 0.42 : 1.0 + sy * 0.12;
    const x = sx * rx * taper;
    const y = sy * ry;
    // Slight backward-tucked knee/elbow bend
    const zBend = sy < 0 ? -sy * (isBack ? 0.022 : 0.014) : 0;
    const z = sz * rz * taper + zBend;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts an organic flattened dwarf-hamster paw cushion (furry dorsal hood or soft pink palm/sole).
 */
function createSculptedPawFootGeometry(
  rx: number,
  ry: number,
  rz: number,
  flatBottom: boolean,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i);

    // Narrower at heel/wrist (sz < 0), gently fanned wider toward knuckles (sz > 0)
    const fan = sz > 0 ? 1.0 + sz * 0.22 : 1.0 + sz * 0.26;
    const x = sx * rx * fan;
    let y = sy * ry;
    if (flatBottom && y < -ry * 0.42) {
      y = -ry * 0.42 + (y + ry * 0.42) * 0.25;
    }
    const z = sz * rz;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpts an authentic tiny teardrop fluffy dwarf-hamster stub tail (pivoting cleanly at z = 0).
 */
function createSculptedTailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i);
    const sy = pos.getY(i);
    const sz = pos.getZ(i); // +1 = rump attachment, -1 = fluffy tail tip

    const u = (1 - sz) * 0.5; // 0 at rump base -> 1 at tip
    const profile = Math.sin(Math.pow(u, 0.72) * Math.PI) * 0.92 + (1 - u) * 0.34;
    const x = sx * 0.036 * profile;
    // Cute tiny upward tilt toward the fluffy pom-pom tip
    const y = sy * 0.032 * profile + u * 0.012;
    const z = -u * 0.095;
    pos.setXYZ(i, x, y, z);
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createHamsterShadowTexture(): THREE.CanvasTexture {
  if (cachedHamsterShadowTexture) return cachedHamsterShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(48, 48, 6, 48, 48, 42);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
    grad.addColorStop(0.56, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 96, 96);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedHamsterShadowTexture = tex;
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
 * - 'russian-grey': slate-grey dwarf hamster with sculpted plump pear-oval torso,
 *   conformal tapered jet-black dorsal stripe strictly along his back, seamless sculpted head
 *   with stuffed cheek pouches, Roman muzzle & philtrum cleft, folded petal-cupped ears,
 *   nested glossy obsidian eyes with flush cornea glints, tapered whiskers, and furry multi-toed paws.
 * - 'snow-white': pied snow-white dwarf hamster with distinct darker-grey organic fur spots,
 *   sculpted rosy-pink heart rhinarium nose, soft pink cupped inner ears, and pink paws & curved claws.
 *
 * Local coordinate convention:
 * - Forward direction: +Z
 * - Up direction: +Y (paw soles rest flush at y = 0)
 */
export class MiniHamsterActor {
  public readonly root = new THREE.Group();
  public readonly dustGroup = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly headPivot = new THREE.Group();
  private readonly noseMesh: THREE.Mesh;
  private readonly jawPivot = new THREE.Group();
  private readonly earLeftPivot = new THREE.Group();
  private readonly earRightPivot = new THREE.Group();
  private readonly tailPivot = new THREE.Group();
  private readonly pawFL = new THREE.Group();
  private readonly pawFR = new THREE.Group();
  private readonly pawBL = new THREE.Group();
  private readonly pawBR = new THREE.Group();
  private readonly shadowMesh: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;

  private readonly furTex: THREE.CanvasTexture;
  private readonly headFurTex: THREE.CanvasTexture | null;
  private readonly furBumpTex: THREE.CanvasTexture;
  private readonly furRoughTex: THREE.CanvasTexture;
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
    this.headFurTex = furTextures.headColorMap;
    this.furBumpTex = furTextures.bumpMap;
    this.furRoughTex = furTextures.roughnessMap;
    this.shadowTex = createHamsterShadowTexture();

    // Velvety microfiber-sheen PBR coat material for genuine soft plush fur reading under scene lighting
    const coatMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        map: this.furTex,
        bumpMap: this.furBumpTex,
        bumpScale: 0.014,
        roughnessMap: this.furRoughTex,
        color: 0xffffff,
        emissive: isGrey ? 0x0b0d11 : 0x242830,
        emissiveIntensity: isGrey ? 0.08 : 0.19,
        roughness: 0.92,
        metalness: 0.0,
        sheen: 0.72,
        sheenRoughness: 0.78,
        sheenColor: new THREE.Color(isGrey ? 0xb7c0ce : 0xffffff),
      }),
    );

    // Pure unstriped grey plush fur for the grey hamster's head (dorsal stripe stays strictly on his back)
    const headCoatMat = this.headFurTex
      ? this.trackMat(
          new THREE.MeshPhysicalMaterial({
            map: this.headFurTex,
            bumpMap: this.furBumpTex,
            bumpScale: 0.013,
            roughnessMap: this.furRoughTex,
            color: 0xffffff,
            emissive: 0x0b0d11,
            emissiveIntensity: 0.08,
            roughness: 0.92,
            metalness: 0.0,
            sheen: 0.72,
            sheenRoughness: 0.78,
            sheenColor: new THREE.Color(0xb7c0ce),
          }),
        )
      : coatMat;

    // Matching solid velvety fur for chin, tail, and hairy Phodopus feet
    const softFurMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        bumpMap: this.furBumpTex,
        bumpScale: 0.009,
        roughnessMap: this.furRoughTex,
        color: isGrey ? 0x626873 : 0xf2f4f9,
        emissive: isGrey ? 0x0b0d11 : 0x242830,
        emissiveIntensity: isGrey ? 0.08 : 0.17,
        roughness: 0.93,
        metalness: 0.0,
        sheen: 0.68,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(isGrey ? 0xc2cad6 : 0xffffff),
      }),
    );

    const darkGreyStripeMat = isGrey
      ? this.trackMat(
          new THREE.MeshPhysicalMaterial({
            bumpMap: this.furBumpTex,
            bumpScale: 0.008,
            color: 0x101218,
            emissive: 0x030406,
            emissiveIntensity: 0.06,
            roughness: 0.88,
            metalness: 0.0,
            sheen: 0.35,
            sheenRoughness: 0.85,
            sheenColor: new THREE.Color(0x4b515e),
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        )
      : null;

    const earOuterMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        bumpMap: this.furBumpTex,
        bumpScale: 0.005,
        color: isGrey ? 0x4e5460 : 0xdce1ea,
        emissive: isGrey ? 0x0a0c10 : 0x22252c,
        emissiveIntensity: isGrey ? 0.09 : 0.14,
        roughness: 0.86,
        metalness: 0.0,
        sheen: 0.52,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color(isGrey ? 0xaab2c0 : 0xffffff),
      }),
    );

    const earInnerMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isGrey ? 0x736970 : 0xffa6bf,
        emissive: isGrey ? 0x100e11 : 0x421423,
        emissiveIntensity: isGrey ? 0.14 : 0.22,
        roughness: 0.68,
        metalness: 0.0,
        sheen: 0.28,
        sheenRoughness: 0.72,
        sheenColor: new THREE.Color(isGrey ? 0x9b8e94 : 0xffd0de),
      }),
    );

    // Moist glossy rhinarium nose with high clearcoat contrast against matte fur
    const pinkNoseMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isGrey ? 0x6b5d64 : 0xff5e92,
        emissive: isGrey ? 0x120d10 : 0x5c1129,
        emissiveIntensity: isGrey ? 0.1 : 0.36,
        roughness: 0.16,
        metalness: 0.02,
        clearcoat: 1.0,
        clearcoatRoughness: 0.12,
      }),
    );

    const mouthInnerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0x4a323a : 0xd96082,
        roughness: 0.55,
        metalness: 0.0,
      }),
    );

    const pawSkinMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isGrey ? 0x9f959a : 0xffa0bc,
        emissive: isGrey ? 0x151416 : 0x3e1422,
        emissiveIntensity: isGrey ? 0.12 : 0.22,
        roughness: 0.48,
        metalness: 0.0,
        clearcoat: 0.18,
        clearcoatRoughness: 0.45,
      }),
    );

    const tinyClawMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isGrey ? 0xd2d6dd : 0xff6494,
        emissive: isGrey ? 0x16171a : 0x4d1024,
        emissiveIntensity: isGrey ? 0.08 : 0.26,
        roughness: 0.18,
        metalness: 0.04,
        clearcoat: 0.85,
        clearcoatRoughness: 0.14,
      }),
    );

    // Glossy obsidian "boba" eyes with crisp wet cornea reflections
    const eyeMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isGrey ? 0x09080b : 0x19070d,
        roughness: 0.03,
        metalness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        reflectivity: 1.0,
        ior: 1.52,
      }),
    );

    const eyelidRimMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isGrey ? 0x3d424c : 0xd8dde6,
        roughness: 0.86,
        metalness: 0.0,
        sheen: 0.45,
        sheenRoughness: 0.82,
      }),
    );

    const catchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const whiskerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: isGrey ? 0xdce0e7 : 0xfaf2f5,
        transparent: true,
        opacity: 0.74,
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

    // Grounded soft contact shadow matching the compact teardrop dwarf hamster silhouette
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(0.84, 1.18));
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
    this.shadowMesh.position.set(0, 0.015, 0.01);
    this.root.add(this.shadowMesh);

    // Low-slung dwarf hamster body pivot (belly skims snugly just above paws, soles rest flush at y = 0)
    this.bodyPivot.position.set(0, 0.21, -0.01);
    this.root.add(this.bodyPivot);

    // 1. Continuous sculpted Campbell's Dwarf Hamster torso
    const bodyOffsetY = 0.014;
    const bodyOffsetZ = -0.035;
    const bodyMesh = makeMesh(createCampbellBodyGeometry(), coatMat);
    bodyMesh.position.set(0, bodyOffsetY, bodyOffsetZ);
    this.bodyPivot.add(bodyMesh);

    // Flush lance-tapered conformal dorsal stripe strictly along the grey hamster's back (never on head)
    if (isGrey && darkGreyStripeMat) {
      const bodyStripe = makeMesh(
        createConformalDorsalStripeGeometry(bodyOffsetY, bodyOffsetZ),
        darkGreyStripeMat,
        false,
      );
      this.bodyPivot.add(bodyStripe);
    }

    // 2. Seamless Sculpted Head nestled directly into the furred shoulder collar (zero skinny neck!)
    this.headPivot.position.set(0, 0.026, 0.295);
    this.bodyPivot.add(this.headPivot);

    const headMesh = makeMesh(createCampbellHeadGeometry(), headCoatMat);
    headMesh.position.set(0, 0.012, 0.055);
    this.headPivot.add(headMesh);

    // Subtle tucked articulated lower chin / squeak jaw tucked neatly beneath the sculpted philtrum
    this.jawPivot.position.set(0, -0.068, 0.218);
    this.headPivot.add(this.jawPivot);

    const lowerChin = makeMesh(createSculptedPawFootGeometry(0.044, 0.024, 0.048, false), softFurMat, false);
    lowerChin.position.set(0, -0.008, 0.022);
    this.jawPivot.add(lowerChin);

    const tinyMouth = makeMesh(new THREE.SphereGeometry(0.019, 10, 8), mouthInnerMat, false);
    tinyMouth.scale.set(1.15, 0.45, 0.72);
    tinyMouth.position.set(0, 0.006, 0.046);
    this.jawPivot.add(tinyMouth);

    // Sculpted heart-shaped moist rhinarium nose right at the blunt muzzle tip
    this.noseMesh = makeMesh(
      createRhinariumNoseGeometry(isGrey ? 0.96 : 1.12),
      pinkNoseMat,
      false,
    );
    this.noseMesh.position.set(0, -0.028, 0.306);
    this.headPivot.add(this.noseMesh);

    // Shared eye & flush glint geometries (reused for left and right eyes)
    const eyeRadius = 0.044;
    const sharedEyeGeo = this.trackGeo(new THREE.SphereGeometry(eyeRadius, 20, 16));
    const sharedEyelidGeo = this.trackGeo(new THREE.TorusGeometry(eyeRadius * 0.96, 0.0075, 8, 22));
    const sharedGlintMainGeo = this.trackGeo(createFlushEyeGlintGeometry(eyeRadius, 0.27));
    const sharedGlintSubGeo = this.trackGeo(createFlushEyeGlintGeometry(eyeRadius, 0.14));

    // Nested glossy obsidian eyes with curved eyelid rims, flush cornea glints & tapered vibrissae
    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.132, 0.048, 0.165);
      eyeGroup.rotation.y = side * 0.44;
      eyeGroup.rotation.x = -0.08;
      this.headPivot.add(eyeGroup);

      // Subtle contoured fur eyelid ring hugging the eyeball smoothly inside the sculpted orbital socket
      const lidRim = new THREE.Mesh(sharedEyelidGeo, eyelidRimMat);
      lidRim.scale.set(1.06, 0.94, 0.85);
      lidRim.position.set(0, 0, -0.006);
      eyeGroup.add(lidRim);

      const eye = new THREE.Mesh(sharedEyeGeo, eyeMat);
      eye.scale.set(1.02, 0.98, 0.94);
      eyeGroup.add(eye);

      // Flush curved studio catchlights (zero surface protrusion from any angle)
      const glintMain = new THREE.Mesh(sharedGlintMainGeo, catchlightMat);
      glintMain.rotation.x = -0.38;
      glintMain.rotation.y = side * 0.22;
      eyeGroup.add(glintMain);

      const glintSub = new THREE.Mesh(sharedGlintSubGeo, catchlightMat);
      glintSub.rotation.x = 0.34;
      glintSub.rotation.y = side * -0.26;
      eyeGroup.add(glintSub);

      // 5 gracefully arched, finely tapered Campbell's mystacial vibrissae (whiskers) per cheek
      const whiskerConfigs = [
        { yOff: 0.015, zOff: 0.004, spreadY: 0.042, reachX: 0.215, sweepZ: -0.045, baseR: 0.0029 },
        { yOff: 0.006, zOff: 0.01, spreadY: 0.018, reachX: 0.245, sweepZ: -0.068, baseR: 0.0031 },
        { yOff: -0.003, zOff: 0.006, spreadY: -0.006, reachX: 0.238, sweepZ: -0.06, baseR: 0.003 },
        { yOff: -0.012, zOff: 0.002, spreadY: -0.026, reachX: 0.205, sweepZ: -0.04, baseR: 0.0026 },
        { yOff: -0.019, zOff: -0.006, spreadY: -0.046, reachX: 0.168, sweepZ: -0.02, baseR: 0.0023 },
      ];
      for (const wc of whiskerConfigs) {
        const wCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.064, -0.036 + wc.yOff, 0.248 + wc.zOff),
          new THREE.Vector3(
            side * (0.064 + wc.reachX * 0.52),
            -0.036 + wc.yOff + wc.spreadY * 0.62,
            0.248 + wc.zOff + wc.sweepZ * 0.42,
          ),
          new THREE.Vector3(
            side * (0.064 + wc.reachX),
            -0.036 + wc.yOff + wc.spreadY,
            0.248 + wc.zOff + wc.sweepZ,
          ),
        ]);
        const whisker = makeMesh(
          createTaperedWhiskerGeometry(wCurve, wc.baseR, 0.0005, 10, 5),
          whiskerMat,
          false,
        );
        this.headPivot.add(whisker);
      }

      // 2 delicate tiny supraorbital brow vibrissae arching above each eye
      for (let b = 0; b < 2; b++) {
        const browCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * (0.118 - b * 0.01), 0.098 + b * 0.006, 0.152 - b * 0.016),
          new THREE.Vector3(side * (0.156 - b * 0.006), 0.132 + b * 0.01, 0.132 - b * 0.024),
          new THREE.Vector3(side * (0.188 - b * 0.004), 0.146 + b * 0.012, 0.104 - b * 0.03),
        ]);
        const browWhisker = makeMesh(
          createTaperedWhiskerGeometry(browCurve, 0.002, 0.0004, 7, 4),
          whiskerMat,
          false,
        );
        this.headPivot.add(browWhisker);
      }
    }

    // Authentic folded petal-cupped Campbell's ears angled outward & slightly back with zero-gap inner pinnae
    const buildCampbellEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.136, 0.145, -0.012);

      const earCup = new THREE.Group();
      earCup.rotation.y = side * -0.46;
      earCup.rotation.z = side * -0.32;
      earCup.rotation.x = -0.16;
      pivot.add(earCup);

      const outer = makeMesh(createCampbellEarShellGeometry(0.082, 0.096, 0.03, false), earOuterMat);
      outer.position.set(0, 0.028, 0);
      earCup.add(outer);

      // Conformal recessed pink inner concha hugging the exact curved bowl
      const inner = makeMesh(createCampbellEarShellGeometry(0.066, 0.078, 0.026, true), earInnerMat, false);
      inner.position.set(0, 0.024, 0.009);
      earCup.add(inner);

      // Tiny furred tragus/ear-base tuft seamlessly grounding the ear into the crown fur
      const baseTuft = makeMesh(createSculptedPawFootGeometry(0.034, 0.026, 0.028, false), headCoatMat, false);
      baseTuft.position.set(0, -0.036, 0.004);
      earCup.add(baseTuft);

      this.headPivot.add(pivot);
    };
    buildCampbellEar(-1, this.earLeftPivot);
    buildCampbellEar(1, this.earRightPivot);

    // 3. Sculpted stubby teardrop fluffy dwarf-hamster tail pivoting cleanly from the rump
    this.tailPivot.position.set(0, -0.044, -0.456);
    this.bodyPivot.add(this.tailPivot);
    const tailMesh = makeMesh(createSculptedTailGeometry(), softFurMat);
    this.tailPivot.add(tailMesh);

    // 4. Sculpted Phodopus ("hairy-footed") legs with plush haunches, 4-toe forepaws, 5-toe hind feet & curved claws
    const sharedFrontHaunch = this.trackGeo(createSculptedLimbHaunchGeometry(false));
    const sharedBackHaunch = this.trackGeo(createSculptedLimbHaunchGeometry(true));
    const sharedFrontFurryTop = this.trackGeo(createSculptedPawFootGeometry(0.048, 0.028, 0.062, false));
    const sharedBackFurryTop = this.trackGeo(createSculptedPawFootGeometry(0.056, 0.032, 0.078, false));
    const sharedFrontSole = this.trackGeo(createSculptedPawFootGeometry(0.044, 0.02, 0.064, true));
    const sharedBackSole = this.trackGeo(createSculptedPawFootGeometry(0.052, 0.022, 0.08, true));
    const sharedDigitGeo = this.trackGeo(new THREE.CapsuleGeometry(0.0095, 0.024, 4, 7));
    const sharedFrontClawGeo = this.trackGeo(
      createCurvedClawGeometry(isGrey ? 0.022 : 0.03, isGrey ? 0.0062 : 0.0076),
    );
    const sharedBackClawGeo = this.trackGeo(
      createCurvedClawGeometry(isGrey ? 0.026 : 0.034, isGrey ? 0.0068 : 0.0082),
    );

    const buildPhodopusPaw = (pivot: THREE.Group, x: number, y: number, z: number, isBack: boolean) => {
      pivot.position.set(x, y, z);
      this.bodyPivot.add(pivot);

      // Plush furry tucked upper thigh (hind) or forearm (front) emerging smoothly from the torso
      const haunch = new THREE.Mesh(isBack ? sharedBackHaunch : sharedFrontHaunch, softFurMat);
      haunch.castShadow = enableShadows;
      haunch.receiveShadow = enableShadows;
      haunch.position.set(0, -0.042, isBack ? -0.012 : 0.004);
      pivot.add(haunch);

      // Hairy Phodopus dorsal foot cushion
      const furryTop = new THREE.Mesh(isBack ? sharedBackFurryTop : sharedFrontFurryTop, softFurMat);
      furryTop.castShadow = enableShadows;
      furryTop.receiveShadow = enableShadows;
      furryTop.position.set(0, isBack ? -0.106 : -0.104, isBack ? 0.034 : 0.028);
      pivot.add(furryTop);

      // Soft flattened pink palm/sole resting flush at y = 0
      const footPad = new THREE.Mesh(isBack ? sharedBackSole : sharedFrontSole, pawSkinMat);
      footPad.castShadow = enableShadows;
      footPad.receiveShadow = enableShadows;
      footPad.position.set(0, isBack ? -0.124 : -0.12, isBack ? 0.04 : 0.034);
      pivot.add(footPad);

      // Authentic anatomy: 4 fanned toes on forepaws, 5 slightly elongated splayed toes on hind paws
      const toeAngles = isBack
        ? [-0.52, -0.25, 0.0, 0.25, 0.52]
        : [-0.46, -0.15, 0.15, 0.46];
      const clawGeo = isBack ? sharedBackClawGeo : sharedFrontClawGeo;

      for (const ang of toeAngles) {
        const outerShorten = 1.0 - Math.abs(ang) * 0.28;
        const tx = Math.sin(ang) * (isBack ? 0.056 : 0.046);
        const tz = (isBack ? 0.094 : 0.076) + Math.cos(ang) * (isBack ? 0.024 : 0.018) * outerShorten;
        const ty = isBack ? -0.128 : -0.124;

        const toe = new THREE.Mesh(sharedDigitGeo, pawSkinMat);
        toe.scale.set(0.95, 0.85 * outerShorten, 0.92);
        toe.rotation.x = Math.PI / 2 + 0.16;
        toe.rotation.z = -ang;
        toe.position.set(tx, ty, tz);
        pivot.add(toe);

        const claw = new THREE.Mesh(clawGeo, tinyClawMat);
        claw.rotation.y = ang;
        claw.position.set(tx + Math.sin(ang) * 0.014, ty - 0.002, tz + Math.cos(ang) * 0.015);
        pivot.add(claw);
      }
    };

    buildPhodopusPaw(this.pawFL, -0.144, -0.07, 0.212, false);
    buildPhodopusPaw(this.pawFR, 0.144, -0.07, 0.212, false);
    buildPhodopusPaw(this.pawBL, -0.168, -0.066, -0.236, true);
    buildPhodopusPaw(this.pawBR, 0.168, -0.066, -0.236, true);

    // 5. Tiny subtle scurry dust puffs
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
   * curved paw stride lift, rapid nose twitch, squeak jaw chatter, cupped ear flutter,
   * stub tail wag, contact shadow projection, and scurry dust puffs.
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
    const bounce = Math.abs(Math.sin(phase)) * 0.056;
    this.bodyPivot.position.y = 0.21 + bounce;
    this.bodyPivot.rotation.x = Math.cos(phase) * 0.12 - Math.min(0.22, airHeight * 0.24);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.115;
    this.bodyPivot.rotation.y = Math.cos(phase * 0.5) * 0.09;

    // Rapid alternating Phodopus paw stride with subtle upward foot tuck during swing phase
    const flSwing = Math.sin(phase);
    const frSwing = Math.sin(phase + Math.PI);
    const blSwing = Math.sin(phase + Math.PI + 0.35);
    const brSwing = Math.sin(phase + 0.35);

    this.pawFL.rotation.x = flSwing * 0.92;
    this.pawFL.position.y = -0.07 + Math.max(0, Math.cos(phase)) * 0.022;
    this.pawFR.rotation.x = frSwing * 0.92;
    this.pawFR.position.y = -0.07 + Math.max(0, Math.cos(phase + Math.PI)) * 0.022;

    this.pawBL.rotation.x = blSwing * 0.98;
    this.pawBL.position.y = -0.066 + Math.max(0, Math.cos(phase + Math.PI + 0.35)) * 0.024;
    this.pawBR.rotation.x = brSwing * 0.98;
    this.pawBR.position.y = -0.066 + Math.max(0, Math.cos(phase + 0.35)) * 0.024;

    // Rapid nose twitch, curious head bob, and subtle squeak jaw opening
    const sq = THREE.MathUtils.clamp(squeak01, 0, 1);
    this.headPivot.rotation.x = -0.04 - sq * 0.17 + Math.sin(phase * 0.5) * 0.048;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 14.0) * 0.11;
    this.jawPivot.rotation.x = sq * (0.28 + Math.sin(elapsedSec * 48.0) * 0.08);
    this.noseMesh.position.y = -0.028 + Math.sin(elapsedSec * 34.0) * 0.0052;
    const nosePulse = 1 + sq * 0.13;
    this.noseMesh.scale.set(nosePulse, nosePulse, nosePulse);

    // Cupped petal ear flutter & stubby teardrop tail wag from base pivot
    const earWiggle = Math.sin(phase * 0.7) * 0.17 + sq * 0.22;
    this.earLeftPivot.rotation.z = 0.07 + earWiggle;
    this.earRightPivot.rotation.z = -0.07 - earWiggle;
    this.tailPivot.rotation.y = Math.sin(phase * 0.8) * 0.28;
    this.tailPivot.rotation.x = Math.cos(phase * 0.8) * 0.12;

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
  }
}
