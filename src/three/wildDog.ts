import * as THREE from 'three';

function createFluffyWhiteFurTexture(
  baseHex: string,
  highlightHex: string,
  shadowHex: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, highlightHex);
    grad.addColorStop(0.55, baseHex);
    grad.addColorStop(1, shadowHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Soft curly cotton-cloud fur tufts (Maltese / Bichon Frisé fluffy coat)
    let seed = 8831;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 420; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 4 + rand() * 11;
      const alpha = 0.08 + rand() * 0.16;
      const isWarmShadow = rand() > 0.56;
      ctx.fillStyle = isWarmShadow
        ? `rgba(218, 210, 198, ${alpha.toFixed(3)})`
        : `rgba(255, 255, 255, ${(alpha * 1.4).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 360; i++) {
      const x = rand() * 256;
      const y = rand() * 256;
      const r = 3 + rand() * 7;
      const a0 = rand() * Math.PI * 2;
      const alpha = 0.09 + rand() * 0.14;
      ctx.strokeStyle =
        rand() > 0.45
          ? `rgba(255, 255, 255, ${alpha.toFixed(3)})`
          : `rgba(205, 196, 185, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.2 + rand() * 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, a0, a0 + Math.PI * (0.7 + rand() * 0.6));
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createPuppyShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 5, 64, 64, 56);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
    grad.addColorStop(0.54, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface PuppyLegRig {
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

/**
 * Composite procedural 3D small white fluffy sweet puppy actor (Bichon / Maltese cloud puppy)
 * with layered snowy-white cotton-fluff puffs, big glossy dark puppy eyes with bright catchlights,
 * tiny button nose, bouncing floppy fluffy ears, snapping barking jaw + happy pink tongue,
 * pink ribbon collar with golden bell, curly pom-pom wagging tail, 4 tiny scampering legs,
 * grounded contact shadow, and playful paw-kick puffs.
 *
 * Local coordinate convention:
 * - Forward direction: +Z
 * - Up direction: +Y (paws touch y = 0 at rest)
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
  private readonly legFL: PuppyLegRig;
  private readonly legFR: PuppyLegRig;
  private readonly legBL: PuppyLegRig;
  private readonly legBR: PuppyLegRig;
  private readonly shadowMesh: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;

  private readonly snowFurTex: THREE.CanvasTexture;
  private readonly ivoryFurTex: THREE.CanvasTexture;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly dustPuffs: DustPuff[] = [];
  private dustSpawnAccum = 0;

  constructor(enableShadows: boolean) {
    this.root.name = 'FluffyWhitePuppyActor';

    this.snowFurTex = createFluffyWhiteFurTexture('#fcfbf8', '#ffffff', '#ebe5dc');
    this.ivoryFurTex = createFluffyWhiteFurTexture('#f7f1e8', '#fffdf9', '#dfd5c7');
    this.shadowTex = createPuppyShadowTexture();

    const whiteFluffMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: this.snowFurTex,
        color: 0xffffff,
        emissive: 0x22201d,
        emissiveIntensity: 0.16,
        roughness: 0.92,
        metalness: 0.0,
      }),
    );
    const warmCreamFluffMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: this.ivoryFurTex,
        color: 0xfffaf2,
        emissive: 0x1e1b17,
        emissiveIntensity: 0.14,
        roughness: 0.94,
        metalness: 0.0,
      }),
    );
    const blushEarInnerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf9d8dc,
        roughness: 0.82,
        metalness: 0.0,
      }),
    );
    const noseMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x181314,
        roughness: 0.18,
        metalness: 0.06,
      }),
    );
    const eyeDarkMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x160f0c,
        roughness: 0.08,
        metalness: 0.12,
      }),
    );
    const eyeCatchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );
    const collarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf46b8b,
        emissive: 0x45111e,
        emissiveIntensity: 0.25,
        roughness: 0.42,
        metalness: 0.04,
      }),
    );
    const goldBellMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd15c,
        emissive: 0x4a3308,
        emissiveIntensity: 0.2,
        roughness: 0.18,
        metalness: 0.88,
      }),
    );
    const tongueMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xff849c,
        roughness: 0.36,
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

    // Ground contact shadow (moves dynamically in Y to stay flush on the chessboard)
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.18, 1.48));
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
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

    // Compact low-slung puppy body pivot (short cute legs)
    this.bodyPivot.position.set(0, 0.42, 0);
    this.root.add(this.bodyPivot);

    // 1. Fluffy cloud torso built from overlapping soft cotton-puff spheres
    const coreTorso = makeMesh(new THREE.CapsuleGeometry(0.24, 0.34, 8, 14), whiteFluffMat);
    coreTorso.rotation.x = Math.PI / 2;
    coreTorso.scale.set(1.06, 1.0, 1.04);
    coreTorso.position.set(0, 0.03, 0.0);
    this.bodyPivot.add(coreTorso);

    // Fluffy cloud tufts sculpting a plush bichon/maltese coat silhouette
    const bodyPuffs: ReadonlyArray<{
      p: [number, number, number];
      r: number;
      s?: [number, number, number];
      cream?: boolean;
    }> = [
      { p: [0, 0.07, 0.22], r: 0.27, s: [1.05, 1.0, 1.0] }, // plush chest cloud
      { p: [0, -0.02, 0.33], r: 0.21, s: [1.0, 0.94, 0.9], cream: true }, // front chest ruff
      { p: [-0.15, 0.06, 0.14], r: 0.18 }, // left shoulder puff
      { p: [0.15, 0.06, 0.14], r: 0.18 }, // right shoulder puff
      { p: [0, 0.15, 0.02], r: 0.21, s: [1.08, 0.85, 1.15] }, // fluffy back tuft
      { p: [-0.16, 0.05, -0.14], r: 0.19, cream: true }, // left hip fluff
      { p: [0.16, 0.05, -0.14], r: 0.19, cream: true }, // right hip fluff
      { p: [0, 0.06, -0.25], r: 0.24, s: [1.06, 0.98, 1.02] }, // round fluffy rump
      { p: [0, -0.09, 0.0], r: 0.2, s: [0.95, 0.72, 1.35], cream: true }, // soft belly fluff
    ];

    for (const puff of bodyPuffs) {
      const m = makeMesh(
        new THREE.SphereGeometry(puff.r, 14, 12),
        puff.cream ? warmCreamFluffMat : whiteFluffMat,
      );
      m.position.set(puff.p[0], puff.p[1], puff.p[2]);
      if (puff.s) m.scale.set(puff.s[0], puff.s[1], puff.s[2]);
      this.bodyPivot.add(m);
    }

    // 2. Sweet rose-pink ribbon collar + tiny golden bell charm
    const collar = makeMesh(new THREE.TorusGeometry(0.195, 0.034, 10, 22), collarMat);
    collar.position.set(0, 0.19, 0.31);
    collar.rotation.x = Math.PI / 2 - 0.52;
    this.bodyPivot.add(collar);

    const bell = makeMesh(new THREE.SphereGeometry(0.052, 12, 10), goldBellMat);
    bell.position.set(0, 0.06, 0.48);
    this.bodyPivot.add(bell);

    // 3. Big adorable round fluffy puppy head
    this.headPivot.position.set(0, 0.32, 0.38);
    this.bodyPivot.add(this.headPivot);

    // Main round cloud head
    const cranium = makeMesh(new THREE.SphereGeometry(0.27, 18, 14), whiteFluffMat);
    cranium.scale.set(1.06, 1.02, 1.0);
    cranium.position.set(0, 0.05, 0.04);
    this.headPivot.add(cranium);

    // Fluffy top-of-head crown tuft & puffy sweet cheeks
    const headPuffs: ReadonlyArray<{
      p: [number, number, number];
      r: number;
      s?: [number, number, number];
      cream?: boolean;
    }> = [
      { p: [0, 0.24, 0.03], r: 0.16, s: [1.15, 0.82, 1.05] }, // top cloud puff
      { p: [-0.18, 0.0, 0.12], r: 0.145, s: [1.0, 0.92, 1.0] }, // left fluffy cheek
      { p: [0.18, 0.0, 0.12], r: 0.145, s: [1.0, 0.92, 1.0] }, // right fluffy cheek
      { p: [0, 0.14, 0.17], r: 0.13, s: [1.25, 0.85, 0.85] }, // sweet fluffy brow
      { p: [-0.075, -0.02, 0.24], r: 0.095, cream: true }, // left muzzle puff
      { p: [0.075, -0.02, 0.24], r: 0.095, cream: true }, // right muzzle puff
      { p: [0, 0.01, 0.25], r: 0.098, s: [1.18, 0.9, 0.95] }, // upper short puppy snout
    ];

    for (const puff of headPuffs) {
      const m = makeMesh(
        new THREE.SphereGeometry(puff.r, 12, 10),
        puff.cream ? warmCreamFluffMat : whiteFluffMat,
      );
      m.position.set(puff.p[0], puff.p[1], puff.p[2]);
      if (puff.s) m.scale.set(puff.s[0], puff.s[1], puff.s[2]);
      this.headPivot.add(m);
    }

    // Tiny glossy black button nose
    const nose = makeMesh(new THREE.SphereGeometry(0.052, 12, 10), noseMat);
    nose.scale.set(1.24, 0.88, 0.86);
    nose.position.set(0, 0.036, 0.345);
    this.headPivot.add(nose);

    // Big glossy sweet dark puppy eyes with twin sparkling catchlights
    for (const side of [-1, 1]) {
      const eye = makeMesh(new THREE.SphereGeometry(0.056, 14, 12), eyeDarkMat, false);
      eye.position.set(side * 0.118, 0.095, 0.246);
      this.headPivot.add(eye);

      // Primary upper-left catchlight sparkle
      const glintBig = makeMesh(new THREE.SphereGeometry(0.019, 8, 8), eyeCatchlightMat, false);
      glintBig.position.set(side * 0.118 - 0.016, 0.114, 0.292);
      this.headPivot.add(glintBig);

      // Tiny secondary lower catchlight
      const glintSmall = makeMesh(new THREE.SphereGeometry(0.009, 6, 6), eyeCatchlightMat, false);
      glintSmall.position.set(side * 0.118 + 0.018, 0.082, 0.296);
      this.headPivot.add(glintSmall);
    }

    // Articulated cute small lower jaw + happy bouncing pink puppy tongue
    this.jawPivot.position.set(0, -0.055, 0.15);
    this.headPivot.add(this.jawPivot);

    const lowerJaw = makeMesh(new THREE.SphereGeometry(0.088, 10, 8), warmCreamFluffMat);
    lowerJaw.scale.set(1.15, 0.65, 1.32);
    lowerJaw.position.set(0, -0.02, 0.095);
    this.jawPivot.add(lowerJaw);

    this.tongueMesh = makeMesh(new THREE.CapsuleGeometry(0.036, 0.085, 5, 8), tongueMat, false);
    this.tongueMesh.rotation.x = Math.PI / 2 + 0.45;
    this.tongueMesh.scale.set(1.15, 1.0, 0.42);
    this.tongueMesh.position.set(0, -0.015, 0.145);
    this.jawPivot.add(this.tongueMesh);

    // Soft fluffy floppy puppy ears (layered puffs + subtle blush underside)
    const buildFluffyEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.23, 0.16, 0.02);

      const earTop = makeMesh(new THREE.SphereGeometry(0.115, 12, 10), whiteFluffMat);
      earTop.scale.set(0.75, 1.15, 0.92);
      earTop.position.set(side * 0.04, -0.04, 0.0);
      pivot.add(earTop);

      const earDrop = makeMesh(new THREE.SphereGeometry(0.11, 12, 10), warmCreamFluffMat);
      earDrop.scale.set(0.68, 1.25, 0.95);
      earDrop.position.set(side * 0.075, -0.16, 0.01);
      earDrop.rotation.z = side * 0.18;
      pivot.add(earDrop);

      const earInner = makeMesh(new THREE.SphereGeometry(0.072, 10, 8), blushEarInnerMat, false);
      earInner.scale.set(0.35, 1.05, 0.72);
      earInner.position.set(side * 0.028, -0.12, 0.025);
      pivot.add(earInner);

      this.headPivot.add(pivot);
    };
    buildFluffyEar(-1, this.earLeftPivot);
    buildFluffyEar(1, this.earRightPivot);

    // 4. Curly fluffy white pom-pom puppy tail curving joyfully over its back
    this.tailPivot.position.set(0, 0.14, -0.34);
    this.bodyPivot.add(this.tailPivot);

    const tailPuffs: ReadonlyArray<{ p: [number, number, number]; r: number; cream?: boolean }> = [
      { p: [0, 0.06, -0.07], r: 0.11, cream: true },
      { p: [0, 0.18, -0.12], r: 0.125 },
      { p: [0, 0.29, -0.06], r: 0.135 },
      { p: [0, 0.34, 0.04], r: 0.125, cream: true },
    ];
    for (const tp of tailPuffs) {
      const m = makeMesh(
        new THREE.SphereGeometry(tp.r, 12, 10),
        tp.cream ? warmCreamFluffMat : whiteFluffMat,
      );
      m.position.set(tp.p[0], tp.p[1], tp.p[2]);
      this.tailPivot.add(m);
    }

    // 5. Four short, stubby, fluffy cloud puppy legs with tiny round paws
    const buildPuppyLeg = (x: number, y: number, z: number, isBack: boolean): PuppyLegRig => {
      const hip = new THREE.Group();
      hip.position.set(x, y, z);
      this.bodyPivot.add(hip);

      const upper = makeMesh(
        new THREE.SphereGeometry(isBack ? 0.11 : 0.1, 12, 10),
        whiteFluffMat,
      );
      upper.scale.set(0.95, 1.35, 0.98);
      upper.position.set(0, -0.09, 0);
      hip.add(upper);

      const shin = new THREE.Group();
      shin.position.set(0, -0.18, 0);
      hip.add(shin);

      const lower = makeMesh(new THREE.CapsuleGeometry(0.068, 0.12, 5, 10), whiteFluffMat);
      lower.position.set(0, -0.08, 0);
      shin.add(lower);

      const paw = makeMesh(new THREE.SphereGeometry(0.076, 10, 8), warmCreamFluffMat);
      paw.scale.set(1.06, 0.72, 1.24);
      paw.position.set(0, -0.175, 0.028);
      shin.add(paw);

      return { hip, shin };
    };

    this.legFL = buildPuppyLeg(-0.155, -0.04, 0.21, false);
    this.legFR = buildPuppyLeg(0.155, -0.04, 0.21, false);
    this.legBL = buildPuppyLeg(-0.16, -0.03, -0.22, true);
    this.legBR = buildPuppyLeg(0.16, -0.03, -0.22, true);

    // 6. Playful little white/ivory fluff & dust puffs kicked up by scampering paws
    const puffGeo = this.trackGeo(new THREE.SphereGeometry(0.075, 8, 6));
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfbf7f0,
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
        life: 0.4,
        active: false,
      });
    }

    // Small, sweet puppy scale relative to 1.0-unit chess squares & ~1.4-unit Kings
    this.root.scale.setScalar(0.84);
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
   * Animates the joyful high-energy puppy scamper/bound, bouncing floppy ears,
   * hyperspeed pom-pom tail wag, happy yipping jaw snap, grounded contact shadow,
   * and tiny trailing paw puffs.
   */
  public update(
    dt: number,
    elapsedSec: number,
    worldPos: THREE.Vector3,
    groundY: number,
    barkOpen01: number,
    spawnDust: boolean,
  ): void {
    const scamperFreq = 24.5; // fast, bouncy small-puppy zoomies!
    const phase = elapsedSec * scamperFreq;
    const airHeight = Math.max(0, worldPos.y - groundY);

    // Bouncy little cloud-puppy hop & excited wiggle
    const strideBounce = Math.abs(Math.sin(phase)) * 0.145;
    this.bodyPivot.position.y = 0.42 + strideBounce;
    this.bodyPivot.rotation.x = Math.cos(phase) * 0.25 - Math.min(0.32, airHeight * 0.2);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.11;

    // Fast stubby puppy gallop kinematics
    const setLeg = (rig: PuppyLegRig, p: number, isBack: boolean) => {
      const swing = Math.sin(p) * (isBack ? 0.94 : 0.9);
      rig.hip.rotation.x = swing;
      const kneeFlex = Math.max(0, -Math.cos(p)) * (isBack ? 0.85 : 0.95);
      rig.shin.rotation.x = isBack ? -kneeFlex * 0.8 : kneeFlex;
    };
    setLeg(this.legFL, phase, false);
    setLeg(this.legFR, phase + 0.48, false);
    setLeg(this.legBL, phase + Math.PI, true);
    setLeg(this.legBR, phase + Math.PI + 0.48, true);

    // Sweet head bob, playful side-to-side glance & excited yipping jaw
    const b = THREE.MathUtils.clamp(barkOpen01, 0, 1);
    this.headPivot.rotation.x = -0.12 - b * 0.24 + Math.sin(phase + 0.5) * 0.09;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 9.5) * 0.16;
    this.headPivot.rotation.z = Math.sin(elapsedSec * 12.0) * 0.08;
    this.jawPivot.rotation.x = 0.12 + b * 0.58;
    this.tongueMesh.position.z = 0.145 + b * 0.035;
    this.tongueMesh.rotation.x = Math.PI / 2 + 0.45 + b * 0.24;

    // Fluffy floppy ears bounce outward & flutter wildly as the puppy zooms
    const earBounce = Math.abs(Math.sin(phase - 0.35)) * 0.46 + Math.min(0.45, airHeight * 0.28);
    this.earLeftPivot.rotation.z = -0.18 - earBounce;
    this.earRightPivot.rotation.z = 0.18 + earBounce;
    this.earLeftPivot.rotation.x = -0.12 - b * 0.14;
    this.earRightPivot.rotation.x = -0.12 - b * 0.14;

    // Hyperspeed ecstatic pom-pom tail wag
    this.tailPivot.rotation.z = Math.sin(elapsedSec * 34.0) * 0.65;
    this.tailPivot.rotation.x = -0.12 + Math.cos(phase) * 0.2;

    // Keep contact shadow flush on the board plane directly below the puppy
    const invScale = 1 / this.root.scale.x;
    this.shadowMesh.position.y = (groundY + 0.016 - worldPos.y) * invScale;
    const shadowFade = THREE.MathUtils.clamp(1 - airHeight * 0.36, 0.22, 1);
    this.shadowMesh.scale.setScalar(0.75 + shadowFade * 0.28);
    this.shadowMat.opacity = 0.44 * shadowFade;

    // Spawn & advance tiny playful paw puffs when paws touch the board
    if (spawnDust && airHeight < 0.18) {
      this.dustSpawnAccum += dt;
      if (this.dustSpawnAccum >= 0.044) {
        this.dustSpawnAccum = 0;
        const slot = this.dustPuffs.find((p) => !p.active);
        if (slot) {
          slot.active = true;
          slot.age = 0;
          slot.life = 0.34 + Math.random() * 0.18;
          slot.mesh.visible = true;
          slot.mesh.position.set(
            worldPos.x + (Math.random() - 0.5) * 0.34,
            groundY + 0.07,
            worldPos.z + (Math.random() - 0.5) * 0.34,
          );
          slot.mesh.scale.setScalar(0.5 + Math.random() * 0.4);
          slot.vel.set(
            (Math.random() - 0.5) * 0.72,
            0.48 + Math.random() * 0.58,
            (Math.random() - 0.5) * 0.72,
          );
          slot.mat.opacity = 0.46;
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
      p.mat.opacity = 0.46 * (1 - k) * (1 - k);
    }
  }

  public dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.snowFurTex.dispose();
    this.ivoryFurTex.dispose();
    this.shadowTex.dispose();
  }
}
