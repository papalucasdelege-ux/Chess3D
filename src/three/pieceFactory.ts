import * as THREE from 'three';
import type { PieceColor, PieceType } from '../shared/types';

export interface PieceMaterialSet {
  body: THREE.MeshStandardMaterial;
  collar: THREE.MeshStandardMaterial;
  groove: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
}

// Reusable cached geometries per piece type so draw efficiency stays optimal
export interface PieceGeometryCache {
  contactShadow: THREE.PlaneGeometry;

  pawnBody: THREE.LatheGeometry;

  rookBody: THREE.LatheGeometry;
  rookWellFloor: THREE.CylinderGeometry;
  rookMerlon: THREE.ExtrudeGeometry;

  knightBase: THREE.LatheGeometry;
  knightNeckBody: THREE.BufferGeometry;
  knightCheek: THREE.SphereGeometry;
  knightMuzzle: THREE.SphereGeometry;
  knightNostril: THREE.SphereGeometry;
  knightBrow: THREE.SphereGeometry;
  knightEye: THREE.SphereGeometry;
  knightManeRidge: THREE.ExtrudeGeometry;
  knightEar: THREE.ExtrudeGeometry;

  bishopBody: THREE.BufferGeometry;

  queenBody: THREE.LatheGeometry;

  kingBody: THREE.LatheGeometry;
  kingCross: THREE.ExtrudeGeometry;
}

/**
 * Generates a high-resolution, lathe-turned hardwood profile using Catmull-Rom
 * spline interpolation on curved spans while preserving crisp wood-turner
 * fillet ridges and incised grooves where points are closely spaced.
 */
function makeTurnedWoodLathe(
  controlPoints: Array<[number, number]>,
  radialSegments = 44,
): THREE.LatheGeometry {
  const dense: THREE.Vector2[] = [];
  for (let i = 0; i < controlPoints.length; i++) {
    const [r, y] = controlPoints[i];
    dense.push(new THREE.Vector2(Math.max(0.0001, r), y));
    if (i < controlPoints.length - 1) {
      const [rNext, yNext] = controlPoints[i + 1];
      const dist = Math.hypot(rNext - r, yNext - y);
      // Subdivide smooth spans gently while keeping tight turning beads sharp
      if (dist > 0.055 && i > 0 && i < controlPoints.length - 2) {
        const p0 = controlPoints[i - 1];
        const p1 = controlPoints[i];
        const p2 = controlPoints[i + 1];
        const p3 = controlPoints[i + 2];
        const steps = Math.min(6, Math.ceil(dist / 0.028));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const t2 = t * t;
          const t3 = t2 * t;
          // Centripetal-like Catmull-Rom with muted tension (0.35) to prevent overshoot on turnings
          const interp = (a: number, b: number, c: number, d: number) =>
            0.5 *
            (2 * b +
              (-a + c) * t * 0.7 +
              (2 * a - 5 * b + 4 * c - d) * t2 * 0.7 +
              (-a + 3 * b - 3 * c + d) * t3 * 0.7);
          const sr = Math.max(0.0001, interp(p0[0], p1[0], p2[0], p3[0]));
          const sy = p1[1] + (p2[1] - p1[1]) * t;
          dense.push(new THREE.Vector2(sr, sy));
        }
      }
    }
  }
  const geo = new THREE.LatheGeometry(dense, radialSegments);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved, softly beveled crenellation merlon that follows the circular turret rim
 * of a hand-turned wooden Staunton Rook.
 */
function createCurvedRookMerlon(): THREE.ExtrudeGeometry {
  const innerR = 0.168;
  const outerR = 0.252;
  const halfAngle = 0.305; // ~35° arc per merlon (6 merlons with crisp embrasure gaps)
  const s = new THREE.Shape();
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = -halfAngle + (i / steps) * (halfAngle * 2);
    const x = Math.cos(a) * outerR;
    const y = Math.sin(a) * outerR;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -halfAngle + (i / steps) * (halfAngle * 2);
    s.lineTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
  }
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.125,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.011,
    bevelSegments: 3,
    curveSegments: 10,
  });
  // Extrude is along +Z; rotate so merlon stands vertically along +Y
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted 3D hand-carved Staunton Knight horse bust.
 * Uses a beveled anatomical silhouette with organic lateral sculpting so the
 * chest is full and broad while the muzzle, brow, and jaw taper naturally in 3D
 * instead of looking like a flat cookie-cutter extrusion.
 */
function createCarvedKnightBody(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Bottom neck join seated into the turned pedestal
  s.moveTo(-0.175, 0.0);
  s.lineTo(0.185, 0.0);
  // Broad muscular chest curving gracefully forward and up to throatlatch
  s.bezierCurveTo(0.225, 0.15, 0.195, 0.31, 0.145, 0.43);
  // Under-jaw & chin curve
  s.bezierCurveTo(0.19, 0.45, 0.245, 0.46, 0.285, 0.485);
  // Sculpted mouth & lower lip notch
  s.bezierCurveTo(0.325, 0.505, 0.345, 0.555, 0.325, 0.605);
  // Rounded muzzle & nostril ridge
  s.bezierCurveTo(0.305, 0.65, 0.26, 0.675, 0.21, 0.695);
  // Subtle Roman-arched bridge of nose up to brow
  s.bezierCurveTo(0.145, 0.725, 0.085, 0.77, 0.035, 0.825);
  // Forelock / crown of poll
  s.bezierCurveTo(-0.01, 0.87, -0.075, 0.885, -0.13, 0.85);
  // Dramatic arched Staunton stallion neck & crest
  s.bezierCurveTo(-0.245, 0.775, -0.295, 0.6, -0.275, 0.39);
  s.bezierCurveTo(-0.26, 0.23, -0.225, 0.09, -0.175, 0.0);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.095,
    bevelSize: 0.048,
    bevelSegments: 6,
    curveSegments: 22,
  });

  // Center thickness around Z=0 before organic 3D wood-carving taper
  geo.translate(0, 0, -0.08);

  // Sculpt lateral thickness organically: full rounded chest & jowls, tapered muzzle & crest
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); // forward (+x = muzzle, -x = mane)
    const y = pos.getY(i); // height (0..0.9)
    const z = pos.getZ(i); // lateral thickness

    // Taper smoothly toward muzzle (+x) and top of poll (+y), swell softly at chest & cheeks
    const muzzleTaper = x > 0.12 ? Math.max(0.46, 1 - (x - 0.12) * 2.05) : 1.0;
    const crestTaper = x < -0.12 ? Math.max(0.54, 1 - (-0.12 - x) * 1.95) : 1.0;
    const heightTaper = y > 0.62 ? Math.max(0.62, 1 - (y - 0.62) * 1.15) : 1.0;
    const chestSwell = y < 0.32 ? 1.0 + Math.sin((y / 0.32) * Math.PI) * 0.16 : 1.0;
    const cheekSwell =
      Math.exp(-((x - 0.04) * (x - 0.04) * 34 + (y - 0.63) * (y - 0.63) * 38)) * 0.22;

    const lateralScale = muzzleTaper * crestTaper * heightTaper * chestSwell + cheekSwell;
    pos.setZ(i, z * lateralScale);
  }
  pos.needsUpdate = true;

  // Rotate so muzzle (+X) points toward -Z (White faces opponent along -Z)
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Hand-carved scalloped mane ridge curving down the Knight's arched neck crest.
 */
function createCarvedKnightMane(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.195, 0.04);
  // Scalloped carved mane locks ascending the neck arch
  s.bezierCurveTo(-0.27, 0.16, -0.305, 0.28, -0.32, 0.41);
  s.bezierCurveTo(-0.335, 0.56, -0.295, 0.72, -0.18, 0.845);
  s.lineTo(-0.11, 0.82);
  s.bezierCurveTo(-0.215, 0.71, -0.245, 0.55, -0.23, 0.38);
  s.bezierCurveTo(-0.22, 0.24, -0.19, 0.13, -0.145, 0.05);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.046,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.016,
    bevelSegments: 3,
    curveSegments: 18,
  });
  geo.translate(0, 0, -0.023);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Leaf-shaped hand-carved horse ear.
 */
function createCarvedKnightEar(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.042, 0.02, 0.046, 0.085, 0.012, 0.155);
  s.quadraticCurveTo(0, 0.172, -0.012, 0.155);
  s.bezierCurveTo(-0.042, 0.085, -0.038, 0.02, 0, 0);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -0.011);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Hand-carved flared Staunton Cross Pattée for the King's crown.
 * Arms flare gracefully outward with chamfered wood-carved edges.
 */
function createCarvedKingCross(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  // Bottom stem sitting cleanly on the imperial crown cushion
  s.moveTo(-0.044, 0.0);
  s.lineTo(0.044, 0.0);
  // Pinch inward into lower neck of cross
  s.quadraticCurveTo(0.032, 0.055, 0.036, 0.095);
  // Right arm flaring outward
  s.quadraticCurveTo(0.072, 0.095, 0.112, 0.08);
  s.lineTo(0.118, 0.156);
  s.quadraticCurveTo(0.072, 0.144, 0.036, 0.146);
  // Top arm flaring upward
  s.quadraticCurveTo(0.036, 0.195, 0.054, 0.242);
  s.quadraticCurveTo(0.0, 0.254, -0.054, 0.242);
  s.quadraticCurveTo(-0.036, 0.195, -0.036, 0.146);
  // Left arm flaring outward
  s.quadraticCurveTo(-0.072, 0.144, -0.118, 0.156);
  s.lineTo(-0.112, 0.08);
  s.quadraticCurveTo(-0.072, 0.095, -0.036, 0.095);
  s.quadraticCurveTo(-0.032, 0.055, -0.044, 0.0);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.038,
    bevelEnabled: true,
    bevelThickness: 0.013,
    bevelSize: 0.009,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.translate(0, 0, -0.019);
  geo.computeVertexNormals();
  return geo;
}

interface CutVertex {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
}

function lerpCutVertex(a: CutVertex, b: CutVertex, t: number): CutVertex {
  const nx = a.nx + (b.nx - a.nx) * t;
  const ny = a.ny + (b.ny - a.ny) * t;
  const nz = a.nz + (b.nz - a.nz) * t;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    nx: nx / nLen,
    ny: ny / nLen,
    nz: nz / nLen,
    u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t,
  };
}

/**
 * Clips a convex polygon against the half-space evalDist(v) >= 0 using
 * exact linear interpolation for positions, normals, and UVs.
 */
function clipPolygonHalfSpace(
  poly: CutVertex[],
  evalDist: (v: CutVertex) => number,
): CutVertex[] {
  if (poly.length < 3) return [];
  const out: CutVertex[] = [];
  const EPS = 1e-7;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = evalDist(a);
    const db = evalDist(b);
    const inA = da >= -EPS;
    const inB = db >= -EPS;

    if (inA && inB) {
      out.push(b);
    } else if (inA && !inB) {
      const denom = da - db;
      const t = Math.abs(denom) > 1e-12 ? Math.max(0, Math.min(1, da / denom)) : 0;
      out.push(lerpCutVertex(a, b, t));
    } else if (!inA && inB) {
      const denom = da - db;
      const t = Math.abs(denom) > 1e-12 ? Math.max(0, Math.min(1, da / denom)) : 0;
      out.push(lerpCutVertex(a, b, t));
      out.push(b);
    }
  }
  return out.length >= 3 ? out : [];
}

// Exact 45° Staunton Bishop mitre saw-kerf parameters (shared with crevice AO)
const BISHOP_KERF_Y0 = 0.995;
const BISHOP_KERF_HALF_WIDTH = 0.027;
const BISHOP_KERF_V_MIN = -0.048;

/**
 * Turns a high-resolution Staunton Bishop and slices an exact, watertight 45°
 * diagonal saw-kerf cleft directly through the convex ovoid mitre head with
 * crisp flat-planed interior cut faces and zero mesh artifacts.
 */
function createCarvedBishopBody(): THREE.BufferGeometry {
  const baseLathe = makeTurnedWoodLathe(
    [
      [0.001, 0.0],
      [0.342, 0.0],
      [0.348, 0.048],
      [0.326, 0.09],
      [0.304, 0.108],
      [0.32, 0.132],
      [0.276, 0.172],
      [0.222, 0.224],
      [0.234, 0.244],
      [0.198, 0.27],
      [0.152, 0.42],
      [0.122, 0.59],
      [0.106, 0.69],
      [0.195, 0.728], // prominent beveled Staunton bishop collar
      [0.19, 0.752],
      [0.135, 0.774], // twin neck bead
      [0.155, 0.795],
      [0.126, 0.818],
      // Strictly convex ovoid Staunton mitre head (y = 0.818..1.240)
      [0.168, 0.862],
      [0.198, 0.912],
      [0.212, 0.965],
      [0.211, 1.018],
      [0.197, 1.072],
      [0.172, 1.124],
      [0.136, 1.172],
      [0.088, 1.214],
      [0.044, 1.24], // finial neck
      [0.068, 1.29], // carved teardrop finial
      [0.052, 1.335],
      [0.02, 1.356],
      [0.001, 1.362],
    ],
    64,
  );

  const nonIndexed = baseLathe.toNonIndexed();
  baseLathe.dispose();

  const srcPos = nonIndexed.attributes.position;
  const srcNorm = nonIndexed.attributes.normal;
  const srcUv = nonIndexed.attributes.uv;

  const S = Math.SQRT1_2;
  const y0 = BISHOP_KERF_Y0;
  const h = BISHOP_KERF_HALF_WIDTH;
  const vMin = BISHOP_KERF_V_MIN;

  // Orthonormal 45° cut coordinates:
  // u = ((y - y0) - x) * sqrt(1/2)  (perpendicular to 45° saw cut; +u is upper-left)
  // v = ((y - y0) + x) * sqrt(1/2)  (along 45° saw cut; +v is outward upper-right)
  const evalU = (p: CutVertex) => ((p.y - y0) - p.x) * S;
  const evalV = (p: CutVertex) => ((p.y - y0) + p.x) * S;

  const outPositions: number[] = [];
  const outNormals: number[] = [];
  const outUvs: number[] = [];

  const pushTri = (a: CutVertex, b: CutVertex, c: CutVertex) => {
    outPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    outNormals.push(a.nx, a.ny, a.nz, b.nx, b.ny, b.nz, c.nx, c.ny, c.nz);
    outUvs.push(a.u, a.v, b.u, b.v, c.u, c.v);
  };

  const pushPoly = (poly: CutVertex[]) => {
    for (let i = 1; i < poly.length - 1; i++) {
      pushTri(poly[0], poly[i], poly[i + 1]);
    }
  };

  // Boundary vertex collectors for the 3 planar interior cut faces
  const upperWallPts: CutVertex[] = []; // plane u = +h, v >= vMin
  const lowerWallPts: CutVertex[] = []; // plane u = -h, v >= vMin
  const floorWallPts: CutVertex[] = []; // plane v = vMin, |u| <= h
  const ON_PLANE_EPS = 1e-4;

  const readVertex = (idx: number): CutVertex => ({
    x: srcPos.getX(idx),
    y: srcPos.getY(idx),
    z: srcPos.getZ(idx),
    nx: srcNorm.getX(idx),
    ny: srcNorm.getY(idx),
    nz: srcNorm.getZ(idx),
    u: srcUv.getX(idx),
    v: srcUv.getY(idx),
  });

  for (let i = 0; i < srcPos.count; i += 3) {
    const v0 = readVertex(i);
    const v1 = readVertex(i + 1);
    const v2 = readVertex(i + 2);

    const minY = Math.min(v0.y, v1.y, v2.y);
    const maxY = Math.max(v0.y, v1.y, v2.y);

    // Pedestal, stem, collar, and finial stay 100% untouched
    if (maxY < 0.82 || minY > 1.24) {
      pushTri(v0, v1, v2);
      continue;
    }

    const tri = [v0, v1, v2];
    const uVals = tri.map(evalU);
    const vVals = tri.map(evalV);

    // Fast path: triangle completely outside the 45° kerf slab
    if (
      Math.min(uVals[0], uVals[1], uVals[2]) >= h ||
      Math.max(uVals[0], uVals[1], uVals[2]) <= -h ||
      Math.max(vVals[0], vVals[1], vVals[2]) <= vMin
    ) {
      pushTri(v0, v1, v2);
      continue;
    }

    // Exact disjoint partition of R^3 \ { |u| < h && v > vMin } with shared seam vertices
    const r1 = clipPolygonHalfSpace(tri, (p) => evalU(p) - h);
    if (r1.length >= 3) {
      const r1Front = clipPolygonHalfSpace(r1, (p) => evalV(p) - vMin);
      const r1Back = clipPolygonHalfSpace(r1, (p) => vMin - evalV(p));
      pushPoly(r1Front);
      pushPoly(r1Back);
      for (const p of r1Front) {
        if (Math.abs(evalU(p) - h) < ON_PLANE_EPS && evalV(p) >= vMin - ON_PLANE_EPS) {
          upperWallPts.push(p);
        }
      }
    }

    const r2 = clipPolygonHalfSpace(tri, (p) => -h - evalU(p));
    if (r2.length >= 3) {
      const r2Front = clipPolygonHalfSpace(r2, (p) => evalV(p) - vMin);
      const r2Back = clipPolygonHalfSpace(r2, (p) => vMin - evalV(p));
      pushPoly(r2Front);
      pushPoly(r2Back);
      for (const p of r2Front) {
        if (Math.abs(evalU(p) + h) < ON_PLANE_EPS && evalV(p) >= vMin - ON_PLANE_EPS) {
          lowerWallPts.push(p);
        }
      }
    }

    const r3Band = clipPolygonHalfSpace(
      clipPolygonHalfSpace(tri, (p) => evalU(p) + h),
      (p) => h - evalU(p),
    );
    if (r3Band.length >= 3) {
      const r3 = clipPolygonHalfSpace(r3Band, (p) => vMin - evalV(p));
      pushPoly(r3);
      for (const p of r3) {
        if (Math.abs(evalV(p) - vMin) < ON_PLANE_EPS && Math.abs(evalU(p)) <= h + ON_PLANE_EPS) {
          floorWallPts.push(p);
        }
      }
    }
  }

  nonIndexed.dispose();

  // Helper to deduplicate and fan-triangulate a strictly convex planar cut wall
  // where (axisA × axisB) equals the outward unit normal (nx, ny, nz).
  const appendConvexPlanarCap = (
    rawPts: CutVertex[],
    nx: number,
    ny: number,
    nz: number,
    projectA: (p: CutVertex) => number,
    projectB: (p: CutVertex) => number,
  ) => {
    if (rawPts.length < 3) return;
    const unique: Array<{ p: CutVertex; a: number; b: number }> = [];
    for (const p of rawPts) {
      const a = projectA(p);
      const b = projectB(p);
      let duplicate = false;
      for (let j = 0; j < unique.length; j++) {
        if (Math.hypot(unique[j].a - a, unique[j].b - b) < 1e-4) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) {
        unique.push({ p, a, b });
      }
    }
    if (unique.length < 3) return;

    let ca = 0;
    let cb = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const item of unique) {
      ca += item.a;
      cb += item.b;
      cx += item.p.x;
      cy += item.p.y;
      cz += item.p.z;
    }
    ca /= unique.length;
    cb /= unique.length;
    cx /= unique.length;
    cy /= unique.length;
    cz /= unique.length;

    unique.sort((p1, p2) => Math.atan2(p1.b - cb, p1.a - ca) - Math.atan2(p2.b - cb, p2.a - ca));

    const makeFlatVertex = (x: number, y: number, z: number): CutVertex => ({
      x,
      y,
      z,
      nx,
      ny,
      nz,
      u: 0.5 + z * 1.35,
      v: Math.max(0, Math.min(1, y / 1.362)),
    });

    const center = makeFlatVertex(cx, cy, cz);
    for (let i = 0; i < unique.length; i++) {
      const cur = unique[i].p;
      const nxt = unique[(i + 1) % unique.length].p;
      pushTri(
        center,
        makeFlatVertex(cur.x, cur.y, cur.z),
        makeFlatVertex(nxt.x, nxt.y, nxt.z),
      );
    }
  };

  // Wall A: Upper overhanging 45° cut ceiling (u = +h, v >= vMin)
  // Outward normal = -e_u = (+S, -S, 0) = e_v × e_z  -> (A = v, B = z)
  appendConvexPlanarCap(upperWallPts, S, -S, 0, evalV, (p) => p.z);

  // Wall B: Lower 45° cut shelf (u = -h, v >= vMin)
  // Outward normal = +e_u = (-S, +S, 0) = e_z × e_v  -> (A = z, B = v)
  appendConvexPlanarCap(lowerWallPts, -S, S, 0, (p) => p.z, evalV);

  // Wall C: Deep back floor of the 45° saw kerf (v = vMin, |u| <= h)
  // Outward normal = +e_v = (+S, +S, 0) = e_u × e_z  -> (A = u, B = z)
  appendConvexPlanarCap(floorWallPts, S, S, 0, evalU, (p) => p.z);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(outNormals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(outUvs, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Turns a single-piece Staunton hardwood Queen and carves 8 sturdy, chunky,
 * softly rounded coronet scallops directly into the thick flared wooden rim,
 * framing a solid turned dome and substantial rounded wood finial.
 */
function createCarvedQueenBody(): THREE.LatheGeometry {
  const geo = makeTurnedWoodLathe(
    [
      [0.001, 0.0],
      [0.372, 0.0],
      [0.378, 0.056],
      [0.354, 0.098],
      [0.33, 0.118],
      [0.348, 0.146],
      [0.298, 0.19],
      [0.244, 0.246],
      [0.258, 0.268],
      [0.218, 0.298],
      [0.166, 0.48],  // graceful turned baluster
      [0.134, 0.7],
      [0.12, 0.85],
      [0.228, 0.896], // bold turned double collar
      [0.222, 0.922],
      [0.158, 0.948],
      [0.185, 0.974], // secondary collar bead
      [0.148, 1.004],
      [0.188, 1.095], // flared tulip coronet cup
      [0.228, 1.185],
      [0.256, 1.25],
      [0.272, 1.31],  // thick solid wood coronet wall
      [0.272, 1.355], // outer rounded wood crest shoulder
      [0.254, 1.378], // sturdy rounded wooden crown crest top
      [0.224, 1.376], // inner crest bevel
      [0.205, 1.348],
      [0.196, 1.275], // carved interior crown groove
      [0.176, 1.312], // solid turned central wooden dome
      [0.134, 1.368],
      [0.082, 1.404],
      [0.044, 1.422], // sturdy finial neck collar
      [0.064, 1.448], // turned wood finial orb
      [0.074, 1.484],
      [0.062, 1.522],
      [0.032, 1.546],
      [0.001, 1.554],
    ],
    64,
  );

  // Carve 8 bold, rounded wood-gouge U-scallops around the thick flared coronet rim
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);

    // Affect only the outer/top flared coronet ring (r > 0.192, y > 1.20), leaving the inner dome untouched
    if (y > 1.2 && r > 0.192) {
      const theta = Math.atan2(z, x);
      // 8 broad wooden lobes (cos = +1 at rounded crests, -1 at carved valleys)
      const wave = Math.cos(theta * 8);
      const tY = Math.min(1, Math.max(0, (y - 1.2) / 0.155));
      const smoothY = tY * tY * (3 - 2 * tY);
      const tR = Math.min(1, Math.max(0, (r - 0.192) / 0.028));
      const smoothR = tR * tR * (3 - 2 * tR);
      const mask = smoothY * smoothR;

      // Carve deep smooth U-valleys while keeping thick, sturdy rounded wooden crests
      const valleyDip = ((1 - wave) * 0.5) * 0.095 * mask;
      const crestFlare = 1 + wave * 0.028 * mask;

      pos.setX(i, x * crestFlare);
      pos.setZ(i, z * crestFlare);
      pos.setY(i, y - valleyDip);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const _shadeColor = new THREE.Color();

/**
 * Bakes subtle sculptural cavity & turning-cove contrast into vertex colors
 * (read when `vertexColors: true` on `whitePieceMats`) so Staunton collars, neck coves,
 * base plinth creases, Bishop mitre clefts, and Queen coronet scallops pop with crisp 3D definition.
 */
function bakePieceCreviceContrast(
  geo: THREE.BufferGeometry,
  mode: 'lathe' | 'carved' | 'bishop',
  outerRadiusRef = 0.26,
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  if (!pos || !norm) return geo;

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = norm.getY(i);

    // Smooth continuous underside & crown accent (zero step discontinuities on curved meshes)
    const underHang = ny < 0 ? Math.pow(Math.min(1, -ny), 1.35) * 0.14 : 0;
    const crownCatch = ny > 0.3 ? Math.pow((ny - 0.3) / 0.7, 1.2) * 0.045 : 0;

    let cavityShade = 0;
    if (mode === 'lathe' || mode === 'bishop') {
      const r = Math.hypot(x, z);
      const radialRatio = Math.min(1, r / Math.max(0.08, outerRadiusRef));
      cavityShade = (1 - radialRatio) * 0.075;
      if (y < 0.032 && r > 0.15) {
        const t = 1 - y / 0.032;
        cavityShade += t * t * 0.11;
      }
    }

    // Subtle natural ambient occlusion inside the Bishop's deep 45° saw-kerf walls
    let minLum = 0.82;
    if (mode === 'bishop' && y > 0.9 && y < 1.22) {
      const kerfU = ((y - BISHOP_KERF_Y0) - x) * Math.SQRT1_2;
      const kerfV = ((y - BISHOP_KERF_Y0) + x) * Math.SQRT1_2;
      if (
        Math.abs(kerfU) <= BISHOP_KERF_HALF_WIDTH + 0.002 &&
        kerfV >= BISHOP_KERF_V_MIN - 0.002
      ) {
        const depthT = Math.max(0, Math.min(1, 1 - (kerfV - BISHOP_KERF_V_MIN) / 0.24));
        cavityShade += 0.07 + depthT * depthT * 0.17;
        minLum = 0.66;
      }
    }

    const lum = Math.max(minLum, Math.min(1.02, 1.0 - underHang - cavityShade + crownCatch));
    const shadowDepth = Math.max(0, 1.0 - lum);
    const sR = lum;
    const sG = Math.max(minLum - 0.03, lum - shadowDepth * 0.03);
    const sB = Math.max(minLum - 0.05, lum - shadowDepth * 0.06);

    _shadeColor.setRGB(sR, sG, sB, THREE.SRGBColorSpace);
    colors[i * 3] = _shadeColor.r;
    colors[i * 3 + 1] = _shadeColor.g;
    colors[i * 3 + 2] = _shadeColor.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createPieceGeometryCache(): PieceGeometryCache {
  const cache: PieceGeometryCache = {
    contactShadow: new THREE.PlaneGeometry(0.72, 0.72),

    // PAWN (height ~0.95) — continuous wood-turned Staunton silhouette with double base molding, concave stem, beveled collar, ovoid head
    pawnBody: makeTurnedWoodLathe([
      [0.001, 0.0],
      [0.308, 0.0],
      [0.312, 0.048], // lower plinth lip
      [0.295, 0.082], // turned cove
      [0.278, 0.095], // bead ridge
      [0.292, 0.116],
      [0.258, 0.148], // ogee slope
      [0.212, 0.19],  // carved base fillet
      [0.222, 0.208],
      [0.195, 0.232],
      [0.148, 0.34],  // graceful concave baluster stem
      [0.112, 0.47],
      [0.096, 0.545], // slender neck under collar
      [0.168, 0.578], // classic crisp Staunton beveled collar disk
      [0.164, 0.598],
      [0.104, 0.62],  // neck cove
      [0.118, 0.652], // smooth swell into ovoid finial head
      [0.162, 0.725],
      [0.168, 0.785],
      [0.146, 0.855],
      [0.098, 0.915],
      [0.042, 0.942],
      [0.001, 0.948],
    ]),

    // ROOK (height ~1.16) — lathe-turned tower with carved moldings, concave flared capital, hollow well, and 6 curved crenellations
    rookBody: makeTurnedWoodLathe([
      [0.001, 0.0],
      [0.348, 0.0],
      [0.352, 0.05], // base plinth
      [0.33, 0.088],
      [0.31, 0.105],  // turned torus bead
      [0.326, 0.13],
      [0.282, 0.168], // cove molding
      [0.236, 0.212],
      [0.246, 0.232], // lower shaft ring
      [0.212, 0.258],
      [0.194, 0.42],  // subtle entasis tower shaft
      [0.178, 0.61],
      [0.174, 0.72],
      [0.216, 0.752], // neck astragal ring
      [0.192, 0.782],
      [0.232, 0.84],  // flared concave turret capital
      [0.256, 0.915],
      [0.256, 0.995], // parapet outer wall
      [0.172, 0.995], // parapet rim top
      [0.165, 0.915], // recessed hollow well wall
      [0.001, 0.915],
    ]),
    rookWellFloor: new THREE.CylinderGeometry(0.166, 0.166, 0.015, 28),
    rookMerlon: createCurvedRookMerlon(),

    // KNIGHT (height ~1.24) — richly turned Staunton pedestal + 3D sculpted horse anatomy
    knightBase: makeTurnedWoodLathe([
      [0.001, 0.0],
      [0.352, 0.0],
      [0.358, 0.052],
      [0.335, 0.092],
      [0.312, 0.11],
      [0.328, 0.136],
      [0.285, 0.175],
      [0.238, 0.222],
      [0.254, 0.248], // carved collar ring beneath horse bust
      [0.218, 0.278],
      [0.228, 0.315],
      [0.195, 0.345],
      [0.001, 0.35],
    ]),
    knightNeckBody: createCarvedKnightBody(),
    knightCheek: new THREE.SphereGeometry(0.088, 18, 14),
    knightMuzzle: new THREE.SphereGeometry(0.068, 16, 12),
    knightNostril: new THREE.SphereGeometry(0.022, 12, 10),
    knightBrow: new THREE.SphereGeometry(0.036, 12, 10),
    knightEye: new THREE.SphereGeometry(0.017, 10, 8),
    knightManeRidge: createCarvedKnightMane(),
    knightEar: createCarvedKnightEar(),

    // BISHOP (height ~1.36) — classic tall turned wood Staunton stem, collar rings, ovoid mitre with carved diagonal cleft & teardrop finial
    bishopBody: createCarvedBishopBody(),

    // QUEEN (height ~1.55) — solid turned wood column, thick scalloped 8-lobe carved coronet, domed cushion & sturdy wood finial
    queenBody: createCarvedQueenBody(),

    // KING (height ~1.72) — commanding wide Staunton pedestal, stately baluster, imperial inverted-bell crown + carved Cross Pattée
    kingBody: makeTurnedWoodLathe([
      [0.001, 0.0],
      [0.392, 0.0],
      [0.398, 0.06],
      [0.372, 0.104],
      [0.346, 0.126],
      [0.366, 0.156],
      [0.314, 0.204],
      [0.258, 0.262],
      [0.272, 0.286],
      [0.232, 0.318],
      [0.182, 0.52],  // authoritative tall turned baluster
      [0.15, 0.76],
      [0.136, 0.93],
      [0.252, 0.98],  // bold imperial collar disk
      [0.246, 1.01],
      [0.178, 1.038],
      [0.205, 1.066], // neck bead molding
      [0.168, 1.096],
      [0.218, 1.21],  // inverted-bell imperial crown
      [0.266, 1.32],
      [0.278, 1.365], // crown rim ring
      [0.252, 1.392],
      [0.185, 1.432], // domed cushion top
      [0.095, 1.462],
      [0.055, 1.472], // cross pedestal base
      [0.001, 1.474],
    ]),
    kingCross: createCarvedKingCross(),
  };

  bakePieceCreviceContrast(cache.pawnBody, 'lathe', 0.24);
  bakePieceCreviceContrast(cache.rookBody, 'lathe', 0.28);
  bakePieceCreviceContrast(cache.rookMerlon, 'carved');
  bakePieceCreviceContrast(cache.knightBase, 'lathe', 0.29);
  bakePieceCreviceContrast(cache.knightNeckBody, 'carved');
  bakePieceCreviceContrast(cache.knightCheek, 'carved');
  bakePieceCreviceContrast(cache.knightMuzzle, 'carved');
  bakePieceCreviceContrast(cache.knightNostril, 'carved');
  bakePieceCreviceContrast(cache.knightBrow, 'carved');
  bakePieceCreviceContrast(cache.knightManeRidge, 'carved');
  bakePieceCreviceContrast(cache.knightEar, 'carved');
  bakePieceCreviceContrast(cache.bishopBody, 'bishop', 0.26);
  bakePieceCreviceContrast(cache.queenBody, 'lathe', 0.3);
  bakePieceCreviceContrast(cache.kingBody, 'lathe', 0.31);
  bakePieceCreviceContrast(cache.kingCross, 'carved');

  return cache;
}

export function disposePieceGeometryCache(cache: PieceGeometryCache): void {
  Object.values(cache).forEach((geo) => geo.dispose());
}

function enableShadows(mesh: THREE.Mesh, shadowActive: boolean, shadowEligible = true): THREE.Mesh {
  mesh.userData.shadowEligible = shadowEligible;
  mesh.castShadow = shadowEligible && shadowActive;
  mesh.receiveShadow = shadowEligible && shadowActive;
  return mesh;
}

/**
 * Builds a hand-carved Staunton wood chess piece grounded cleanly at y = 0.
 */
export function buildSculptedPiece(
  type: PieceType,
  color: PieceColor,
  cache: PieceGeometryCache,
  materials: PieceMaterialSet,
  castShadow: boolean,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `piece_${color}_${type}`;
  group.userData = { pieceType: type, pieceColor: color };

  // Subtle physical base-crevice contact line tucked strictly beneath the turned wood base lip (never a dark halo around the piece)
  const baseScale = type === 'p' ? 0.88 : type === 'k' ? 1.1 : type === 'q' ? 1.04 : 0.98;
  const aoDisc = new THREE.Mesh(cache.contactShadow, materials.contactShadow);
  aoDisc.rotation.x = -Math.PI / 2;
  aoDisc.scale.set(baseScale, baseScale, 1);
  aoDisc.position.set(0, 0.003, 0);
  aoDisc.userData.isContactShadow = true;
  group.add(aoDisc);

  switch (type) {
    case 'p': {
      const body = enableShadows(new THREE.Mesh(cache.pawnBody, materials.body), castShadow);
      group.add(body);
      break;
    }

    case 'r': {
      const body = enableShadows(new THREE.Mesh(cache.rookBody, materials.body), castShadow);
      const well = enableShadows(new THREE.Mesh(cache.rookWellFloor, materials.groove), castShadow, false);
      well.position.y = 0.922;
      group.add(body, well);

      // 6 curved, beveled turret battlements seated seamlessly around the circular parapet
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const merlon = enableShadows(new THREE.Mesh(cache.rookMerlon, materials.body), castShadow);
        merlon.position.y = 0.985;
        merlon.rotation.y = angle;
        group.add(merlon);
      }
      break;
    }

    case 'n': {
      const base = enableShadows(new THREE.Mesh(cache.knightBase, materials.body), castShadow);
      const bust = enableShadows(new THREE.Mesh(cache.knightNeckBody, materials.body), castShadow);
      bust.position.y = 0.315;

      // Sculpted lateral jowls / cheeks for organic 3D horse-head fullness from every angle
      const cheekL = enableShadows(new THREE.Mesh(cache.knightCheek, materials.body), castShadow);
      cheekL.scale.set(0.68, 1.08, 1.32);
      cheekL.position.set(-0.082, 0.915, -0.025);
      cheekL.rotation.set(0.28, 0.14, 0.08);

      const cheekR = enableShadows(new THREE.Mesh(cache.knightCheek, materials.body), castShadow);
      cheekR.scale.set(0.68, 1.08, 1.32);
      cheekR.position.set(0.082, 0.915, -0.025);
      cheekR.rotation.set(0.28, -0.14, -0.08);

      // Rounded sculpted muzzle tip & flared wood-carved nostrils
      const muzzle = enableShadows(new THREE.Mesh(cache.knightMuzzle, materials.body), castShadow);
      muzzle.scale.set(0.82, 0.95, 1.15);
      muzzle.position.set(0, 0.875, -0.265);
      muzzle.rotation.x = 0.42;

      const nostrilL = enableShadows(new THREE.Mesh(cache.knightNostril, materials.collar), castShadow, false);
      nostrilL.position.set(-0.044, 0.895, -0.288);
      const nostrilR = enableShadows(new THREE.Mesh(cache.knightNostril, materials.collar), castShadow, false);
      nostrilR.position.set(0.044, 0.895, -0.288);

      // Sculpted brow ridges and subtle carved eyes
      const browL = enableShadows(new THREE.Mesh(cache.knightBrow, materials.body), castShadow);
      browL.scale.set(0.75, 0.65, 1.2);
      browL.position.set(-0.072, 1.045, -0.098);
      const browR = enableShadows(new THREE.Mesh(cache.knightBrow, materials.body), castShadow);
      browR.scale.set(0.75, 0.65, 1.2);
      browR.position.set(0.072, 1.045, -0.098);

      const eyeL = enableShadows(new THREE.Mesh(cache.knightEye, materials.groove), castShadow, false);
      eyeL.position.set(-0.084, 1.022, -0.105);
      const eyeR = enableShadows(new THREE.Mesh(cache.knightEye, materials.groove), castShadow, false);
      eyeR.position.set(0.084, 1.022, -0.105);

      // Hand-carved flowing mane crest along the arched neck
      const mane = enableShadows(new THREE.Mesh(cache.knightManeRidge, materials.collar), castShadow);
      mane.position.y = 0.315;

      // Sculpted leaf-shaped ears angled alertly forward & slightly outward
      const earL = enableShadows(new THREE.Mesh(cache.knightEar, materials.body), castShadow);
      earL.position.set(-0.068, 1.135, 0.082);
      earL.rotation.set(0.22, 0.35, 0.22);

      const earR = enableShadows(new THREE.Mesh(cache.knightEar, materials.body), castShadow);
      earR.position.set(0.068, 1.135, 0.082);
      earR.rotation.set(0.22, -0.35, -0.22);

      group.add(
        base,
        bust,
        cheekL,
        cheekR,
        muzzle,
        nostrilL,
        nostrilR,
        browL,
        browR,
        eyeL,
        eyeR,
        mane,
        earL,
        earR,
      );

      // Face opponent: White faces -Z (0 rad), Black faces +Z (PI rad)
      if (color === 'b') {
        group.rotation.y = Math.PI;
      }
      break;
    }

    case 'b': {
      const body = enableShadows(new THREE.Mesh(cache.bishopBody, materials.body), castShadow);
      // Angle the 45° saw-kerf ~19° toward the player so both the crisp diagonal
      // silhouette notch and the recessed wooden cut shelf read clearly from either side
      body.rotation.y = color === 'w' ? -0.34 : Math.PI - 0.34;
      group.add(body);
      break;
    }

    case 'q': {
      const body = enableShadows(new THREE.Mesh(cache.queenBody, materials.body), castShadow);
      group.add(body);
      break;
    }

    case 'k': {
      const body = enableShadows(new THREE.Mesh(cache.kingBody, materials.body), castShadow);

      // Authentic hand-carved flared Cross Pattée rising cleanly from the imperial crown cushion
      const cross = enableShadows(new THREE.Mesh(cache.kingCross, materials.body), castShadow);
      cross.position.y = 1.462;

      group.add(body, cross);
      break;
    }
  }

  return group;
}
