import * as THREE from 'three';

export type MiniHamsterVariant = 'russian-grey' | 'snow-white';

function createHamsterFurTexture(variant: MiniHamsterVariant): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    let seed = variant === 'russian-grey' ? 6143 : 9209;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    if (variant === 'russian-grey') {
      // Plush dark slate-grey Russian dwarf hamster coat with lighter frosted flanks
      const grad = ctx.createLinearGradient(0, 0, 256, 0);
      grad.addColorStop(0, '#5a6069');
      grad.addColorStop(0.28, '#474c54');
      grad.addColorStop(0.5, '#3d4149');
      grad.addColorStop(0.72, '#474c54');
      grad.addColorStop(1, '#5a6069');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      // Soft velvety short fur strokes
      for (let i = 0; i < 720; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const len = 5 + rand() * 11;
        const alpha = 0.08 + rand() * 0.16;
        ctx.strokeStyle =
          rand() > 0.5
            ? `rgba(170, 178, 190, ${alpha.toFixed(3)})`
            : `rgba(26, 29, 34, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + rand() * 1.1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 3, y + len);
        ctx.stroke();
      }
    } else {
      // Silky snowy-white mini hamster fur with subtle pearl warmth
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#fcfaf7');
      grad.addColorStop(1, '#efeae2');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      for (let i = 0; i < 560; i++) {
        const x = rand() * 256;
        const y = rand() * 256;
        const len = 5 + rand() * 10;
        const alpha = 0.08 + rand() * 0.14;
        ctx.strokeStyle =
          rand() > 0.45
            ? `rgba(255, 255, 255, ${(alpha * 1.5).toFixed(3)})`
            : `rgba(218, 210, 202, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + rand() * 1.1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 3, y + len);
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createHamsterShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(48, 48, 4, 48, 48, 42);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.56)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.24)');
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
 * Procedural 3D Mini Dwarf Hamster Actor:
 * - 'russian-grey': dark slate-grey Russian mini hamster with a crisp black dorsal stripe
 *   running from forehead down its back, frosted belly, round ears, shiny button eyes, and tiny paws.
 * - 'snow-white': snowy-white mini hamster with a bright pink button nose, rosy pink ears,
 *   and sculpted little pink paws with fanned pink claws.
 *
 * Local coordinate convention:
 * - Forward direction: +Z
 * - Up direction: +Y (paws rest at y = 0)
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
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly dustPuffs: HamsterDustPuff[] = [];
  private dustSpawnAccum = 0;

  constructor(variant: MiniHamsterVariant, enableShadows: boolean) {
    const isGrey = variant === 'russian-grey';
    this.root.name = isGrey ? 'RussianGreyMiniHamster' : 'SnowWhiteMiniHamster';

    this.furTex = createHamsterFurTexture(variant);
    this.shadowTex = createHamsterShadowTexture();

    const coatMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: this.furTex,
        color: isGrey ? 0xd8dde6 : 0xffffff,
        emissive: isGrey ? 0x16191f : 0x242220,
        emissiveIntensity: isGrey ? 0.16 : 0.18,
        roughness: 0.88,
        metalness: 0.02,
      }),
    );

    const bellyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xdcdad4 : 0xfff8f5,
        emissive: 0x161513,
        emissiveIntensity: 0.12,
        roughness: 0.9,
        metalness: 0.0,
      }),
    );

    // Distinct crisp black dorsal stripe material for the Russian mini hamster
    const blackStripeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0b0c0e,
        roughness: 0.72,
        metalness: 0.05,
      }),
    );

    // Organic mottled grey fur spot materials of subtly varied tones for the white mini hamster
    const greySpotDarkMat = !isGrey
      ? this.trackMat(
          new THREE.MeshStandardMaterial({
            map: this.furTex,
            color: 0x5c636e,
            emissive: 0x14161b,
            emissiveIntensity: 0.14,
            roughness: 0.88,
            metalness: 0.02,
          }),
        )
      : null;
    const greySpotSoftMat = !isGrey
      ? this.trackMat(
          new THREE.MeshStandardMaterial({
            map: this.furTex,
            color: 0x7e8692,
            emissive: 0x181b21,
            emissiveIntensity: 0.14,
            roughness: 0.88,
            metalness: 0.02,
          }),
        )
      : null;

    const pinkNoseMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xd48e98 : 0xff6e98,
        emissive: isGrey ? 0x240c10 : 0x521226,
        emissiveIntensity: isGrey ? 0.16 : 0.34,
        roughness: 0.24,
        metalness: 0.04,
      }),
    );

    const pinkPawMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xc29aa0 : 0xff9eb8,
        emissive: isGrey ? 0x1a1012 : 0x421424,
        emissiveIntensity: isGrey ? 0.12 : 0.24,
        roughness: 0.56,
        metalness: 0.02,
      }),
    );

    const pinkClawMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0xead7da : 0xff5484,
        emissive: isGrey ? 0x151012 : 0x5c0e26,
        emissiveIntensity: isGrey ? 0.1 : 0.36,
        roughness: 0.22,
        metalness: 0.08,
      }),
    );

    const earOuterMat = isGrey ? coatMat : coatMat;
    const earInnerMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0x8f7c82 : 0xffa6be,
        emissive: isGrey ? 0x120d10 : 0x3b1320,
        emissiveIntensity: 0.2,
        roughness: 0.76,
        metalness: 0.0,
      }),
    );

    const eyeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isGrey ? 0x0d0a0c : 0x240b12,
        roughness: 0.08,
        metalness: 0.14,
      }),
    );

    const catchlightMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
      }),
    );

    const whiskerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: isGrey ? 0xc8ced8 : 0xf4e8ec,
        transparent: true,
        opacity: 0.8,
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

    // Grounded soft contact shadow (slimmer silhouette)
    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(0.68, 1.24));
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      opacity: 0.45,
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

    // Sleek low-to-the-ground mini hamster body pivot
    this.bodyPivot.position.set(0, 0.24, 0);
    this.root.add(this.bodyPivot);

    // 1. Trimmer elongated dwarf hamster torso
    const mainBody = makeMesh(new THREE.SphereGeometry(0.32, 20, 16), coatMat);
    mainBody.scale.set(0.68, 0.68, 1.46);
    mainBody.position.set(0, 0.04, -0.04);
    this.bodyPivot.add(mainBody);

    // Tapered hindquarter fullness
    const rump = makeMesh(new THREE.SphereGeometry(0.28, 16, 12), coatMat);
    rump.scale.set(0.72, 0.7, 0.98);
    rump.position.set(0, 0.02, -0.26);
    this.bodyPivot.add(rump);

    // Light plush belly tucked under the slimmer torso
    const belly = makeMesh(new THREE.SphereGeometry(0.25, 14, 12), bellyMat);
    belly.scale.set(0.64, 0.48, 1.44);
    belly.position.set(0, -0.07, -0.02);
    this.bodyPivot.add(belly);

    // RUSSIAN MINI HAMSTER SIGNATURE: Crisp, thin, continuous black dorsal line along the exact back contour!
    if (isGrey) {
      const backPoints: THREE.Vector3[] = [];
      const zSamples = [0.38, 0.28, 0.16, 0.03, -0.1, -0.23, -0.36, -0.45, -0.52];
      for (const z of zSamples) {
        const tMain = (z + 0.04) / (0.32 * 1.46);
        const yMain =
          Math.abs(tMain) < 1 ? 0.04 + 0.32 * 0.68 * Math.sqrt(1 - tMain * tMain) : -1;
        const tRump = (z + 0.26) / (0.28 * 0.98);
        const yRump =
          Math.abs(tRump) < 1 ? 0.02 + 0.28 * 0.7 * Math.sqrt(1 - tRump * tRump) : -1;
        const ySurf = Math.max(yMain, yRump, 0.04);
        // Embed tube center slightly below surface so only a clean crisp narrow stripe ridge shows
        backPoints.push(new THREE.Vector3(0, ySurf - 0.007, z));
      }
      const stripeCurve = new THREE.CatmullRomCurve3(backPoints);
      const dorsalStripe = makeMesh(
        new THREE.TubeGeometry(stripeCurve, 28, 0.024, 8, false),
        blackStripeMat,
        false,
      );
      this.bodyPivot.add(dorsalStripe);
    }

    // Helper to contour organic grey fur spots flush onto any ellipsoid surface of the white mini hamster
    const addEllipsoidSpot = (
      parent: THREE.Group,
      center: [number, number, number],
      radii: [number, number, number],
      dir: [number, number, number],
      spotSize: [number, number, number],
      twistRad: number,
      mat: THREE.Material,
    ) => {
      const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
      const pos = new THREE.Vector3(
        center[0] + radii[0] * d.x,
        center[1] + radii[1] * d.y,
        center[2] + radii[2] * d.z,
      );
      const normal = new THREE.Vector3(d.x / radii[0], d.y / radii[1], d.z / radii[2]).normalize();
      const spot = makeMesh(new THREE.SphereGeometry(1, 14, 10), mat, false);
      spot.scale.set(spotSize[0], spotSize[1], spotSize[2]);
      const alignQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      const twistQ = new THREE.Quaternion().setFromAxisAngle(normal, twistRad);
      spot.quaternion.copy(twistQ).multiply(alignQ);
      // Embed gently beneath the fur contour so each spot merges smoothly without floating edges
      spot.position.copy(pos).addScaledVector(normal, -spotSize[1] * 0.56);
      parent.add(spot);
    };

    // WHITE MINI HAMSTER MARKINGS: Several organic grey spots of different sizes across back, flanks & rump
    if (!isGrey && greySpotDarkMat && greySpotSoftMat) {
      const mainCenter: [number, number, number] = [0, 0.04, -0.04];
      const mainRadii: [number, number, number] = [0.32 * 0.68, 0.32 * 0.68, 0.32 * 1.46];
      const rumpCenter: [number, number, number] = [0, 0.02, -0.26];
      const rumpRadii: [number, number, number] = [0.28 * 0.72, 0.28 * 0.7, 0.28 * 0.98];

      // Large irregular saddle patch (upper-left back)
      addEllipsoidSpot(this.bodyPivot, mainCenter, mainRadii, [-0.42, 0.88, 0.22], [0.115, 0.024, 0.155], 0.35, greySpotDarkMat);
      // Medium-large right rump patch
      addEllipsoidSpot(this.bodyPivot, rumpCenter, rumpRadii, [0.55, 0.74, -0.38], [0.105, 0.023, 0.125], -0.4, greySpotSoftMat);
      // Medium right flank spot
      addEllipsoidSpot(this.bodyPivot, mainCenter, mainRadii, [0.84, 0.42, 0.34], [0.088, 0.021, 0.11], 0.22, greySpotDarkMat);
      // Medium-small mid-back oval spot
      addEllipsoidSpot(this.bodyPivot, mainCenter, mainRadii, [0.18, 0.96, -0.22], [0.072, 0.02, 0.095], -0.25, greySpotDarkMat);
      // Small left shoulder spot
      addEllipsoidSpot(this.bodyPivot, mainCenter, mainRadii, [-0.78, 0.46, 0.42], [0.062, 0.019, 0.074], 0.5, greySpotSoftMat);
      // Small lower-left hip dot
      addEllipsoidSpot(this.bodyPivot, rumpCenter, rumpRadii, [-0.82, 0.44, -0.36], [0.052, 0.018, 0.064], -0.3, greySpotDarkMat);
      // Tiny right-back freckle spot
      addEllipsoidSpot(this.bodyPivot, mainCenter, mainRadii, [0.58, 0.78, 0.24], [0.038, 0.016, 0.044], 0.15, greySpotDarkMat);
    }

    // 2. Trim hamster head + neat cheek pouches
    this.headPivot.position.set(0, 0.055, 0.4);
    this.bodyPivot.add(this.headPivot);

    const cranium = makeMesh(new THREE.SphereGeometry(0.22, 18, 14), coatMat);
    cranium.scale.set(0.84, 0.78, 1.12);
    cranium.position.set(0, 0.03, 0.02);
    this.headPivot.add(cranium);

    // Subtle trim hamster cheeks (both sides)
    for (const side of [-1, 1]) {
      const cheek = makeMesh(
        new THREE.SphereGeometry(0.095, 14, 10),
        isGrey ? bellyMat : coatMat,
      );
      cheek.scale.set(0.95, 0.84, 1.0);
      cheek.position.set(side * 0.105, -0.038, 0.08);
      this.headPivot.add(cheek);
    }

    // Tapered sleek snout
    const snout = makeMesh(new THREE.SphereGeometry(0.095, 14, 12), isGrey ? bellyMat : coatMat);
    snout.scale.set(0.86, 0.72, 1.32);
    snout.position.set(0, -0.02, 0.2);
    this.headPivot.add(snout);

    // Sleek forehead-to-nape black dorsal line continuation on the Russian mini hamster
    if (isGrey) {
      const headLinePoints: THREE.Vector3[] = [];
      const hzSamples = [0.17, 0.1, 0.02, -0.06, -0.15, -0.21];
      for (const z of hzSamples) {
        const tHead = (z - 0.02) / (0.22 * 1.12);
        const yHead =
          Math.abs(tHead) < 1 ? 0.03 + 0.22 * 0.78 * Math.sqrt(1 - tHead * tHead) : 0.11;
        headLinePoints.push(new THREE.Vector3(0, yHead - 0.007, z));
      }
      const headStripeCurve = new THREE.CatmullRomCurve3(headLinePoints);
      const browStripe = makeMesh(
        new THREE.TubeGeometry(headStripeCurve, 16, 0.021, 8, false),
        blackStripeMat,
        false,
      );
      this.headPivot.add(browStripe);
    } else if (greySpotDarkMat && greySpotSoftMat) {
      // Cute mismatched grey head & temple spots on the white mini hamster (snout stays snowy white for the pink nose!)
      const headCenter: [number, number, number] = [0, 0.03, 0.02];
      const headRadii: [number, number, number] = [0.22 * 0.84, 0.22 * 0.78, 0.22 * 1.12];
      addEllipsoidSpot(this.headPivot, headCenter, headRadii, [-0.58, 0.76, -0.28], [0.076, 0.02, 0.088], 0.3, greySpotDarkMat);
      addEllipsoidSpot(this.headPivot, headCenter, headRadii, [0.66, 0.62, 0.42], [0.048, 0.017, 0.056], -0.2, greySpotSoftMat);
    }

    // Tiny delicate button nose (bright pink on the white mini hamster!)
    this.noseMesh = makeMesh(
      new THREE.SphereGeometry(isGrey ? 0.024 : 0.03, 12, 10),
      pinkNoseMat,
      false,
    );
    this.noseMesh.scale.set(1.12, 0.86, 0.9);
    this.noseMesh.position.set(0, -0.008, 0.322);
    this.headPivot.add(this.noseMesh);

    // Glossy round hamster eyes with bright catchlights + delicate whiskers
    for (const side of [-1, 1]) {
      const eye = makeMesh(new THREE.SphereGeometry(0.048, 12, 10), eyeMat, false);
      eye.position.set(side * 0.124, 0.056, 0.168);
      this.headPivot.add(eye);

      const glint = makeMesh(new THREE.SphereGeometry(0.016, 8, 6), catchlightMat, false);
      glint.position.set(side * 0.124 - 0.011, 0.07, 0.208);
      this.headPivot.add(glint);

      // 3 fine whiskers per cheek
      for (let w = -1; w <= 1; w++) {
        const whisker = makeMesh(
          new THREE.CylinderGeometry(0.004, 0.002, 0.2, 4),
          whiskerMat,
          false,
        );
        whisker.rotation.z = side * (Math.PI / 2 + w * 0.18);
        whisker.rotation.y = side * -0.25;
        whisker.position.set(side * 0.105, -0.018 + w * 0.022, 0.24);
        this.headPivot.add(whisker);
      }
    }

    // Cute rounded hamster ears (flat oval cups)
    const buildHamsterEar = (side: number, pivot: THREE.Group) => {
      pivot.position.set(side * 0.118, 0.155, -0.02);
      const outer = makeMesh(new THREE.SphereGeometry(0.076, 12, 10), earOuterMat);
      outer.scale.set(0.95, 1.05, 0.44);
      outer.rotation.y = side * -0.35;
      outer.rotation.z = side * -0.28;
      pivot.add(outer);

      const inner = makeMesh(new THREE.SphereGeometry(0.052, 10, 8), earInnerMat, false);
      inner.scale.set(0.88, 0.96, 0.32);
      inner.position.set(side * -0.008, -0.004, 0.02);
      inner.rotation.y = side * -0.35;
      inner.rotation.z = side * -0.28;
      pivot.add(inner);

      this.headPivot.add(pivot);
    };
    buildHamsterEar(-1, this.earLeftPivot);
    buildHamsterEar(1, this.earRightPivot);

    // 3. Tiny stubby round pom-pom hamster tail
    this.tailMesh = makeMesh(
      new THREE.SphereGeometry(0.056, 10, 8),
      isGrey ? coatMat : coatMat,
    );
    this.tailMesh.scale.set(0.92, 0.88, 1.15);
    this.tailMesh.position.set(0, -0.01, -0.52);
    this.bodyPivot.add(this.tailMesh);

    // 4. Four tiny scampering paws — white mini hamster gets distinct sculpted pink claws!
    const buildHamsterPaw = (pivot: THREE.Group, x: number, y: number, z: number, isBack: boolean) => {
      pivot.position.set(x, y, z);
      this.bodyPivot.add(pivot);

      const stubLeg = makeMesh(
        new THREE.CapsuleGeometry(isBack ? 0.058 : 0.05, 0.075, 5, 8),
        coatMat,
      );
      stubLeg.position.set(0, -0.06, 0);
      pivot.add(stubLeg);

      const foot = makeMesh(new THREE.SphereGeometry(isBack ? 0.062 : 0.055, 10, 8), pinkPawMat);
      foot.scale.set(1.08, 0.56, 1.48);
      foot.position.set(0, -0.145, 0.045);
      pivot.add(foot);

      // 3 distinct fanned little claws on the front of each paw (vibrant pink on white hamster!)
      const clawOffsets = [-0.04, 0, 0.04];
      for (const cx of clawOffsets) {
        const claw = makeMesh(
          new THREE.ConeGeometry(isGrey ? 0.013 : 0.022, isGrey ? 0.045 : 0.088, 6),
          pinkClawMat,
          false,
        );
        claw.rotation.x = Math.PI / 2 + 0.14;
        claw.rotation.z = -cx * 4.2;
        claw.position.set(cx, -0.148, isBack ? 0.145 : 0.135);
        pivot.add(claw);
      }
    };

    buildHamsterPaw(this.pawFL, -0.125, -0.07, 0.23, false);
    buildHamsterPaw(this.pawFR, 0.125, -0.07, 0.23, false);
    buildHamsterPaw(this.pawBL, -0.14, -0.065, -0.23, true);
    buildHamsterPaw(this.pawBR, 0.14, -0.065, -0.23, true);

    // 5. Tiny subtle scurry puffs
    const puffGeo = this.trackGeo(new THREE.SphereGeometry(0.045, 7, 5));
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

    // Clearly visible mini dwarf hamster scale beside 1.0-unit chess squares & Staunton pieces
    this.root.scale.setScalar(0.86);
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
   * Animates ultra-fast mini hamster scurrying, chubby body wiggle, rapid nose twitch,
   * ear flutter, contact shadow projection, and tiny trailing dust puffs.
   */
  public update(
    dt: number,
    elapsedSec: number,
    worldPos: THREE.Vector3,
    groundY: number,
    squeak01: number,
    spawnDust: boolean,
  ): void {
    const scurryFreq = 38.0; // super fast frantic mini-hamster pitter-patter!
    const phase = elapsedSec * scurryFreq;
    const airHeight = Math.max(0, worldPos.y - groundY);

    // Sleek body rapid bounce & agile side-to-side hamster waddle
    const bounce = Math.abs(Math.sin(phase)) * 0.08;
    this.bodyPivot.position.y = 0.24 + bounce;
    this.bodyPivot.rotation.x = Math.cos(phase) * 0.16 - Math.min(0.24, airHeight * 0.25);
    this.bodyPivot.rotation.z = Math.sin(phase * 0.5) * 0.14;
    this.bodyPivot.rotation.y = Math.cos(phase * 0.5) * 0.08;

    // Rapid alternating tiny paw paddling
    this.pawFL.rotation.x = Math.sin(phase) * 1.05;
    this.pawFR.rotation.x = Math.sin(phase + Math.PI) * 1.05;
    this.pawBL.rotation.x = Math.sin(phase + Math.PI + 0.35) * 1.1;
    this.pawBR.rotation.x = Math.sin(phase + 0.35) * 1.1;

    // Nose twitch & excited squeak head perk
    const sq = THREE.MathUtils.clamp(squeak01, 0, 1);
    this.headPivot.rotation.x = -0.08 - sq * 0.22 + Math.sin(phase * 0.5) * 0.06;
    this.headPivot.rotation.y = Math.sin(elapsedSec * 14.0) * 0.14;
    this.noseMesh.position.y = -0.008 + Math.sin(elapsedSec * 32.0) * 0.006;
    const nosePulse = 1 + sq * 0.12;
    this.noseMesh.scale.set(1.12 * nosePulse, 0.86 * nosePulse, 0.9 * nosePulse);

    // Cute twitchy ears & stubby tail wiggle
    const earWiggle = Math.sin(phase * 0.7) * 0.22 + sq * 0.25;
    this.earLeftPivot.rotation.z = 0.1 + earWiggle;
    this.earRightPivot.rotation.z = -0.1 - earWiggle;
    this.tailMesh.position.x = Math.sin(phase * 0.8) * 0.028;

    // Contact shadow stays flush on the chessboard surface
    const invScale = 1 / this.root.scale.x;
    this.shadowMesh.position.y = (groundY + 0.014 - worldPos.y) * invScale;
    const shadowFade = THREE.MathUtils.clamp(1 - airHeight * 0.45, 0.24, 1);
    this.shadowMesh.scale.setScalar(0.8 + shadowFade * 0.25);
    this.shadowMat.opacity = 0.44 * shadowFade;

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
    this.shadowTex.dispose();
  }
}
