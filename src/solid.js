import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const SDF_MAX = 480;

const TYPE_PRESET = {
  frame: { maxHalf: 0.052, bevel: 0.007, roughness: 0.3, metalness: 0.1, clearcoat: 0.38 },
  wheels: { maxHalf: 0.07, bevel: 0.0022, roughness: 0.4, metalness: 0.22, clearcoat: 0.16 },
  handlebar: { maxHalf: 0.03, bevel: 0.004, roughness: 0.34, metalness: 0.18, clearcoat: 0.22 },
  saddle: { maxHalf: 0.04, bevel: 0.006, roughness: 0.66, metalness: 0.04, clearcoat: 0.04 },
  groupset: { maxHalf: 0.046, bevel: 0.0045, roughness: 0.26, metalness: 0.74, clearcoat: 0.1 },
  cassette: { maxHalf: 0.062, bevel: 0.0035, roughness: 0.2, metalness: 0.86, clearcoat: 0.08 },
  brakes: { maxHalf: 0.022, bevel: 0.002, roughness: 0.32, metalness: 0.62, clearcoat: 0.08 },
  bottles: { maxHalf: 0.022, bevel: 0.003, roughness: 0.42, metalness: 0.28, clearcoat: 0.06 },
};

const ROLE_PRESET = {
  interior: { maxHalf: 0.014, bevel: 0.002, roughness: 0.48, metalness: 0.28, clearcoat: 0.04 },
};

const maskCache = new Map();
const geomCache = new Map();

export function presetOf(type, role) {
  if (ROLE_PRESET[role]) return { ...ROLE_PRESET[role] };
  return { ...(TYPE_PRESET[type] ?? TYPE_PRESET.frame) };
}

function imageSize(image) {
  return {
    width: image.width || image.videoWidth || 0,
    height: image.height || image.videoHeight || 0,
  };
}

function downsampleMask(image, maxSize) {
  const { width: srcW, height: srcH } = imageSize(image);
  const scale = maxSize / Math.max(srcW, srcH);
  const width = Math.max(2, Math.round(srcW * scale));
  const height = Math.max(2, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, srcW, srcH).data;
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * srcH) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * srcW) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / width));
      let maxA = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * srcW;
        for (let xx = x0; xx < x1; xx += 1) {
          maxA = Math.max(maxA, src[(row + xx) * 4 + 3]);
        }
      }
      mask[y * width + x] = maxA >= 38 ? 1 : 0;
    }
  }

  return { mask, width, height };
}

function sample(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return mask[y * width + x];
}

const MOORE = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function flood(field, width, height, sx, sy, from, to) {
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;
  if (field[sy * width + sx] !== from) return;
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = y * width + x;
    if (field[i] !== from) continue;
    field[i] = to;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function labeledField(mask, width, height) {
  const field = new Uint8Array(mask);
  for (let x = 0; x < width; x += 1) {
    flood(field, width, height, x, 0, 0, 2);
    flood(field, width, height, x, height - 1, 0, 2);
  }
  for (let y = 0; y < height; y += 1) {
    flood(field, width, height, 0, y, 0, 2);
    flood(field, width, height, width - 1, y, 0, 2);
  }
  return field;
}

function isEdgeAgainst(field, width, height, x, y, against) {
  if (field[y * width + x] !== 1) return false;
  return (
    sample(field, width, height, x - 1, y) === against ||
    sample(field, width, height, x + 1, y) === against ||
    sample(field, width, height, x, y - 1) === against ||
    sample(field, width, height, x, y + 1) === against
  );
}

function traceAgainst(field, width, height, sx, sy, against, visited) {
  const ring = [[sx + 0.5, sy + 0.5]];
  let x = sx;
  let y = sy;
  let dir = 0;
  visited.add(`${sx},${sy},${against}`);

  for (let step = 0; step < width * height; step += 1) {
    let found = false;
    for (let i = 0; i < 8; i += 1) {
      const k = (dir + i) % 8;
      const nx = x + MOORE[k][0];
      const ny = y + MOORE[k][1];
      if (!isEdgeAgainst(field, width, height, nx, ny, against)) continue;
      ring.push([nx + 0.5, ny + 0.5]);
      visited.add(`${nx},${ny},${against}`);
      x = nx;
      y = ny;
      dir = (k + 5) % 8;
      found = true;
      break;
    }
    if (!found) break;
    if (x === sx && y === sy && ring.length > 3) break;
  }

  return ring;
}

function extractRings(mask, width, height) {
  const field = labeledField(mask, width, height);
  const visited = new Set();
  const rings = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (const against of [2, 0]) {
        if (!isEdgeAgainst(field, width, height, x, y, against)) continue;
        const key = `${x},${y},${against}`;
        if (visited.has(key)) continue;
        const ring = traceAgainst(field, width, height, x, y, against, visited);
        if (ring.length >= 14) rings.push(ring);
      }
    }
  }

  return rings;
}

function ringArea(pts) {
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return area / 2;
}

function pointInRing(pt, ring) {
  let odd = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const yi = ring[i][1];
    const yj = ring[j][1];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((ring[j][0] - ring[i][0]) * (pt[1] - yi)) / (yj - yi + 1e-9) + ring[i][0]) {
      odd = !odd;
    }
  }
  return odd;
}

function smoothRing(pts) {
  const n = pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    out[i] = [(a[0] + b[0] * 2 + c[0]) * 0.25, (a[1] + b[1] * 2 + c[1]) * 0.25];
  }
  return out;
}

function setWinding(pts, positive) {
  if (ringArea(pts) > 0 !== positive) pts.reverse();
  return pts;
}

function toWorld(pts, width, height, pose) {
  return pts.map(([x, y]) => [(x / width - 0.5) * pose.w, (0.5 - y / height) * pose.h]);
}

function extractShapes(mask, width, height, pose) {
  const rings = extractRings(mask, width, height)
    .map((ring) => smoothRing(smoothRing(toWorld(ring, width, height, pose))))
    .filter((ring) => Math.abs(ringArea(ring)) > pose.w * pose.h * 0.00012);

  rings.sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));

  const used = new Set();
  const shapes = [];

  for (let i = 0; i < rings.length; i += 1) {
    if (used.has(i)) continue;
    const outer = setWinding(rings[i].slice(), true);
    const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
    used.add(i);
    const outerArea = Math.abs(ringArea(outer));
    for (let j = i + 1; j < rings.length; j += 1) {
      if (used.has(j)) continue;
      if (!pointInRing(rings[j][0], outer)) continue;
      const holeArea = Math.abs(ringArea(rings[j]));
      if (holeArea < outerArea * 0.04) {
        used.add(j);
        continue;
      }
      const hole = setWinding(rings[j].slice(), false);
      shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
      used.add(j);
    }
    shapes.push(shape);
  }

  return shapes;
}

function makeUvGenerator(pose) {
  const toUv = (vertices, index) =>
    new THREE.Vector2(vertices[index * 3] / pose.w + 0.5, vertices[index * 3 + 1] / pose.h + 0.5);

  return {
    generateTopUV(_geometry, vertices, a, b, c) {
      return [toUv(vertices, a), toUv(vertices, b), toUv(vertices, c)];
    },
    generateSideWallUV(_geometry, vertices, a, b, c, d) {
      return [toUv(vertices, a), toUv(vertices, b), toUv(vertices, c), toUv(vertices, d)];
    },
  };
}

export function prepareSolid(src, texture) {
  if (!src || !texture?.image) return maskCache.get(src) ?? null;
  if (maskCache.has(src)) return maskCache.get(src);
  const built = downsampleMask(texture.image, SDF_MAX);
  maskCache.set(src, built);
  return built;
}

function buildGeometry(src, pose, preset) {
  const key = `${src}:${pose.w.toFixed(4)}:${pose.h.toFixed(4)}:${preset.maxHalf}:${preset.bevel}`;
  if (geomCache.has(key)) return geomCache.get(key);

  const data = maskCache.get(src);
  if (!data) return null;
  const shapes = extractShapes(data.mask, data.width, data.height, pose);
  if (shapes.length === 0) return null;

  const depth = preset.maxHalf * 2;
  const extras = {
    depth,
    bevelEnabled: true,
    bevelThickness: Math.min(preset.maxHalf * 0.2, 0.007),
    bevelSize: Math.min(preset.maxHalf * 0.16, 0.005),
    bevelSegments: 1,
    UVGenerator: makeUvGenerator(pose),
  };

  let geometry = null;
  try {
    const pieces = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, extras));
    geometry = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false);
    pieces.forEach((piece) => {
      if (piece !== geometry) piece.dispose();
    });
  } catch {
    return null;
  }
  if (!geometry) return null;
  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal");
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i += 1) {
    const facing = Math.abs(normals.getZ(i));
    const shade = 0.52 + facing * 0.48;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geomCache.set(key, geometry);
  return geometry;
}

export function createVolumeMesh({ texture, src, pose, type, role, layer }) {
  const preset = presetOf(type, role);
  prepareSolid(src, texture);
  const source = buildGeometry(src, pose, preset);

  if (!source) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pose.w, pose.h),
      new THREE.MeshPhysicalMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        alphaTest: 0.04,
        roughness: preset.roughness,
        metalness: preset.metalness,
      }),
    );
    mesh.renderOrder = layer.z;
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.userData.pose = pose;
    mesh.userData.layer = layer;
    return mesh;
  }

  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: 0.34,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    envMapIntensity: 1.08,
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(source.clone(), material);
  mesh.renderOrder = layer.z;
  mesh.position.set(pose.x, pose.y, pose.z);
  mesh.userData.pose = pose;
  mesh.userData.layer = layer;
  mesh.userData.volume = true;
  return mesh;
}

export function disposePartMesh(mesh) {
  mesh.geometry?.dispose();
  if (mesh.material && !Array.isArray(mesh.material)) {
    mesh.material.dispose();
  }
}
