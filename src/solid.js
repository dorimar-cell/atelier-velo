import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const PREP_MAX = 256;
const MESH_MAX = 220;

const TYPE_PRESET = {
  frame: { maxHalf: 0.09, zScale: 1.12, roughness: 0.52, metalness: 0.02, clearcoat: 0.05 },
  wheels: { maxHalf: 0.07, zScale: 1, roughness: 0.54, metalness: 0.04, clearcoat: 0.04 },
  handlebar: { maxHalf: 0.042, zScale: 1.18, roughness: 0.56, metalness: 0.03, clearcoat: 0.04 },
  saddle: { maxHalf: 0.072, zScale: 1.7, roughness: 0.68, metalness: 0.02, clearcoat: 0.02 },
  groupset: { maxHalf: 0.05, zScale: 1.08, roughness: 0.44, metalness: 0.16, clearcoat: 0.04 },
  cassette: { maxHalf: 0.07, zScale: 1, roughness: 0.38, metalness: 0.22, clearcoat: 0.03 },
  brakes: { maxHalf: 0.016, zScale: 0.85, roughness: 0.46, metalness: 0.12, clearcoat: 0.03 },
  bottles: { maxHalf: 0.036, zScale: 1.42, roughness: 0.55, metalness: 0.04, clearcoat: 0.03 },
};

const ROLE_PRESET = {
  interior: { maxHalf: 0.016, zScale: 0.52, roughness: 0.58, metalness: 0.08, clearcoat: 0.02 },
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
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
  const width = Math.max(2, Math.round(srcW * scale));
  const height = Math.max(2, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, srcW, srcH).data;
  const mask = new Uint8Array(width * height);
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * srcH) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * srcW) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / width));
      let maxA = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        const row = yy * srcW;
        for (let xx = x0; xx < x1; xx += 1) {
          const i = (row + xx) * 4;
          const a = src[i + 3];
          if (a > maxA) maxA = a;
          if (a >= 16) {
            r += src[i] * a;
            g += src[i + 1] * a;
            b += src[i + 2] * a;
            weight += a;
          }
        }
      }
      const o = y * width + x;
      mask[o] = maxA >= 38 ? 1 : 0;
      const p = o * 4;
      if (weight > 0) {
        rgba[p] = Math.round(r / weight);
        rgba[p + 1] = Math.round(g / weight);
        rgba[p + 2] = Math.round(b / weight);
        rgba[p + 3] = maxA;
      }
    }
  }

  return { mask, rgba, width, height };
}

function shrinkForMesh(data, maxSize) {
  if (Math.max(data.width, data.height) <= maxSize) return data;
  const width = Math.max(2, Math.round((data.width * maxSize) / Math.max(data.width, data.height)));
  const height = Math.max(2, Math.round((data.height * maxSize) / Math.max(data.width, data.height)));
  const mask = new Uint8Array(width * height);
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * data.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * data.height) / height));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * data.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * data.width) / width));
      let any = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const i = yy * data.width + xx;
          if (data.mask[i]) any = 1;
          const p = i * 4;
          if (data.rgba[p + 3] >= 16) {
            r += data.rgba[p];
            g += data.rgba[p + 1];
            b += data.rgba[p + 2];
            a += data.rgba[p + 3];
            n += 1;
          }
        }
      }
      const o = y * width + x;
      mask[o] = any;
      if (n > 0) {
        const p = o * 4;
        rgba[p] = Math.round(r / n);
        rgba[p + 1] = Math.round(g / n);
        rgba[p + 2] = Math.round(b / n);
        rgba[p + 3] = Math.round(a / n);
      }
    }
  }

  return { mask, rgba, width, height };
}

function distanceTransform(mask, width, height) {
  const inf = 1e8;
  const dt = new Float32Array(width * height);
  const s2 = Math.SQRT2;
  for (let i = 0; i < dt.length; i += 1) dt[i] = mask[i] ? inf : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      let v = dt[i];
      if (x > 0) v = Math.min(v, dt[i - 1] + 1);
      if (y > 0) v = Math.min(v, dt[i - width] + 1);
      if (x > 0 && y > 0) v = Math.min(v, dt[i - width - 1] + s2);
      if (x + 1 < width && y > 0) v = Math.min(v, dt[i - width + 1] + s2);
      dt[i] = v;
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      let v = dt[i];
      if (x + 1 < width) v = Math.min(v, dt[i + 1] + 1);
      if (y + 1 < height) v = Math.min(v, dt[i + width] + 1);
      if (x + 1 < width && y + 1 < height) v = Math.min(v, dt[i + width + 1] + s2);
      if (x > 0 && y + 1 < height) v = Math.min(v, dt[i + width - 1] + s2);
      dt[i] = v;
    }
  }

  return dt;
}

function maxFilter(src, width, height, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let m = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        m = Math.max(m, src[y * width + xx]);
      }
      tmp[y * width + x] = m;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let m = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        m = Math.max(m, tmp[yy * width + x]);
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

function boxBlur(src, width, height) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          sum += src[yy * width + xx];
          n += 1;
        }
      }
      out[y * width + x] = sum / n;
    }
  }
  return out;
}

function dilate(mask, width, height) {
  const out = new Uint8Array(mask);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}

function sampleRgba(rgba, width, height, px, py) {
  const x = Math.min(width - 1, Math.max(0, Math.round(px)));
  const y = Math.min(height - 1, Math.max(0, Math.round(py)));
  const i = (y * width + x) * 4;
  return [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255, rgba[i + 3] / 255];
}

function fitCircle(mask, width, height) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      sx += x + 0.5;
      sy += y + 0.5;
      n += 1;
    }
  }
  if (n < 12) return null;
  let cx = sx / n;
  let cy = sy / n;
  const dist = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      dist.push(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  dist.sort((a, b) => a - b);
  let radius = dist[Math.min(dist.length - 1, Math.floor(dist.length * 0.995))];
  let ox = 0;
  let oy = 0;
  let on = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < radius * 0.9) continue;
      ox += x + 0.5;
      oy += y + 0.5;
      on += 1;
    }
  }
  if (on > 16) {
    cx = ox / on;
    cy = oy / on;
    const outer = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!mask[y * width + x]) continue;
        outer.push(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
      }
    }
    outer.sort((a, b) => a - b);
    radius = outer[Math.min(outer.length - 1, Math.floor(outer.length * 0.997))];
  }
  return { cx, cy, radius, count: n };
}

function radialStats(mask, rgba, width, height, cx, cy, radius, bins = 72) {
  const density = new Float32Array(bins);
  const count = new Float32Array(bins);
  const color = Array.from({ length: bins }, () => [0, 0, 0]);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const bin = Math.min(bins - 1, Math.max(0, Math.floor((d / radius) * bins)));
      count[bin] += 1;
      if (!mask[y * width + x]) continue;
      density[bin] += 1;
      const p = (y * width + x) * 4;
      color[bin][0] += rgba[p];
      color[bin][1] += rgba[p + 1];
      color[bin][2] += rgba[p + 2];
    }
  }
  for (let i = 0; i < bins; i += 1) {
    if (density[i] > 0) {
      color[i][0] /= density[i];
      color[i][1] /= density[i];
      color[i][2] /= density[i];
    }
    density[i] = count[i] ? density[i] / count[i] : 0;
  }
  return { density, color, bins };
}

function detectWheelBands(stats) {
  const { density, color, bins } = stats;
  let outer = bins - 1;
  while (outer > 8 && density[outer] < 0.22) outer -= 1;
  let inner = outer;
  while (inner > 8 && density[inner] > 0.28) inner -= 1;

  let tan = outer;
  let tanScore = -1e9;
  for (let i = Math.floor(bins * 0.72); i <= outer; i += 1) {
    if (density[i] < 0.4) continue;
    const score = color[i][0] - color[i][2];
    if (score > tanScore) {
      tanScore = score;
      tan = i;
    }
  }

  const tireInner = tanScore > 10 ? Math.min(tan, Math.floor(bins * 0.88)) : Math.floor(bins * 0.86);
  let rimInner = inner;
  if (rimInner > tireInner - 4) rimInner = Math.floor(bins * 0.74);
  rimInner = Math.min(rimInner, tireInner - 3);

  let hub = 2;
  while (hub < bins * 0.22 && density[hub] > 0.2) hub += 1;

  return {
    tireOuter: outer / bins,
    tireInner: Math.max(0.8, tireInner / bins),
    rimInner: Math.max(0.62, Math.min(0.8, rimInner / bins)),
    hubOuter: Math.max(0.07, Math.min(0.16, hub / bins)),
  };
}

function projectUv(x, y, cx, cy, width, height, sx, sy) {
  return [(cx + x / sx) / width, 1 - (cy - y / sy) / height];
}

function paintGeomFromImage(geometry, rgba, width, height, cx, cy, sx, sy, origin) {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const [r, g, b, a] = sampleRgba(
      rgba,
      width,
      height,
      cx + (pos.getX(i) - origin.x) / sx,
      cy - (pos.getY(i) - origin.y) / sy,
    );
    const shade = a > 0.12 ? 1 : 0.35;
    colors[i * 3] = r * shade;
    colors[i * 3 + 1] = g * shade;
    colors[i * 3 + 2] = b * shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function setRingUvs(geometry, cx, cy, width, height, sx, sy) {
  const pos = geometry.getAttribute("position");
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const [u, v] = projectUv(pos.getX(i), pos.getY(i), cx, cy, width, height, sx, sy);
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function skin(preset, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    roughness: preset.roughness,
    metalness: preset.metalness,
    clearcoat: preset.clearcoat,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.26,
    specularIntensity: 0.28,
    ...extra,
  });
}

function buildInflateGeometry(data, pose, preset) {
  const grid = shrinkForMesh(data, MESH_MAX);
  const { mask, width, height } = grid;
  const dt = boxBlur(distanceTransform(mask, width, height), width, height);
  const localR = maxFilter(dt, width, height, 2);
  const solid = dilate(mask, width, height);
  const sx = pose.w / width;
  const sy = pose.h / height;
  const sz = ((sx + sy) * 0.5) * (preset.zScale ?? 1);
  const indexOf = new Int32Array(width * height).fill(-1);
  const heights = new Float32Array(width * height);
  const positions = [];
  const uvs = [];
  const coords = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!solid[i]) continue;
      const d = dt[i];
      const radius = Math.max(d, localR[i]);
      let z = Math.sqrt(Math.max(0, d * (2 * radius - d))) * sz;
      if (mask[i]) z = Math.max(z, 0.0016);
      heights[i] = Math.min(z, preset.maxHalf);
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const next = heights.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (!mask[i] || dt[i] < 1.15) continue;
        let sum = heights[i] * 2;
        let n = 2;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const j = (y + dy) * width + (x + dx);
          if (!solid[j]) continue;
          sum += heights[j];
          n += 1;
        }
        next[i] = Math.min(preset.maxHalf, sum / n);
      }
    }
    heights.set(next);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!solid[i]) continue;
      indexOf[i] = positions.length / 3;
      coords.push(x, y);
      positions.push((x + 0.5) * sx - pose.w * 0.5, pose.h * 0.5 - (y + 0.5) * sy, heights[i]);
      uvs.push((x + 0.5) / width, 1 - (y + 0.5) / height);
    }
  }

  const nFront = positions.length / 3;
  if (nFront < 8) return null;
  for (let i = 0; i < nFront; i += 1) {
    positions.push(positions[i * 3], positions[i * 3 + 1], -positions[i * 3 + 2]);
    uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
  }

  const indices = [];
  const at = (x, y) => indexOf[y * width + x];
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      indices.push(d, c, b, d, b, a);
      indices.push(d + nFront, b + nFront, c + nFront, d + nFront, a + nFront, b + nFront);
    }
  }
  if (indices.length < 12) return null;

  const heightAt = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return solid[y * width + x] ? heights[y * width + x] : 0;
  };
  const normals = new Float32Array((nFront * 2) * 3);
  for (let i = 0; i < nFront; i += 1) {
    const x = coords[i * 2];
    const y = coords[i * 2 + 1];
    const dzwx = (heightAt(x + 1, y) - heightAt(x - 1, y)) / (2 * sx);
    const dzwy = (heightAt(x, y - 1) - heightAt(x, y + 1)) / (2 * sy);
    let nx = -dzwx;
    let ny = -dzwy;
    let nz = 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
    normals[(i + nFront) * 3] = nx;
    normals[(i + nFront) * 3 + 1] = ny;
    normals[(i + nFront) * 3 + 2] = -nz;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function buildWheelKit(data, pose) {
  const { mask, rgba, width, height } = data;
  const circle = fitCircle(mask, width, height);
  if (!circle) return null;
  const bands = detectWheelBands(radialStats(mask, rgba, width, height, circle.cx, circle.cy, circle.radius));
  const sx = pose.w / width;
  const sy = pose.h / height;
  const ox = (circle.cx / width - 0.5) * pose.w;
  const oy = (0.5 - circle.cy / height) * pose.h;
  const worldR = circle.radius * ((sx + sy) * 0.5);
  const tireOuter = worldR * bands.tireOuter;
  const tireInner = worldR * bands.tireInner;
  const rimInner = worldR * bands.rimInner;
  const hubR = worldR * bands.hubOuter;
  const tube = Math.max((tireOuter - tireInner) * 0.62, worldR * 0.052);
  const major = (tireOuter + tireInner) * 0.5;
  const rimOuter = tireInner * 0.99;
  const rimDepth = Math.max(rimOuter - rimInner, worldR * 0.08);
  const rimHalf = Math.max(rimDepth * 0.46, worldR * 0.034);

  const tire = new THREE.TorusGeometry(major, tube, 14, 64);
  paintGeomFromImage(tire, rgba, width, height, circle.cx, circle.cy, sx, sy, { x: 0, y: 0 });
  tire.computeVertexNormals();

  const rimPoints = [
    new THREE.Vector2(rimInner, -rimHalf * 0.22),
    new THREE.Vector2(rimInner + rimDepth * 0.32, -rimHalf),
    new THREE.Vector2(rimOuter, -rimHalf * 0.42),
    new THREE.Vector2(rimOuter, rimHalf * 0.42),
    new THREE.Vector2(rimInner + rimDepth * 0.32, rimHalf),
    new THREE.Vector2(rimInner, rimHalf * 0.22),
  ];
  const rim = new THREE.LatheGeometry(rimPoints, 56);
  rim.rotateX(Math.PI / 2);
  paintGeomFromImage(rim, rgba, width, height, circle.cx, circle.cy, sx, sy, { x: 0, y: 0 });
  rim.computeVertexNormals();

  const rimFace = new THREE.RingGeometry(rimInner, rimOuter, 72);
  setRingUvs(rimFace, circle.cx, circle.cy, width, height, sx, sy);
  rimFace.translate(0, 0, rimHalf * 0.9);

  const spokes = new THREE.CircleGeometry(rimInner * 0.985, 64);
  setRingUvs(spokes, circle.cx, circle.cy, width, height, sx, sy);

  const hub = new THREE.CylinderGeometry(hubR, hubR * 0.92, rimHalf * 2.15, 28);
  hub.rotateX(Math.PI / 2);
  paintGeomFromImage(hub, rgba, width, height, circle.cx, circle.cy, sx, sy, { x: 0, y: 0 });

  return { tire, rim, rimFace, spokes, hub, origin: { x: ox, y: oy } };
}

function buildCassetteKit(data, pose, preset) {
  const { mask, width, height } = data;
  const circle = fitCircle(mask, width, height);
  if (!circle) return null;
  const sx = pose.w / width;
  const sy = pose.h / height;
  const ox = (circle.cx / width - 0.5) * pose.w;
  const oy = (0.5 - circle.cy / height) * pose.h;
  const worldR = circle.radius * ((sx + sy) * 0.5);
  const hole = worldR * 0.14;
  const count = 11;
  const depth = preset.maxHalf * 2;
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const radius = THREE.MathUtils.lerp(worldR, worldR * 0.34, t);
    const geo = new THREE.CylinderGeometry(radius, radius * 0.98, depth / count, 48);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -preset.maxHalf + (i + 0.5) * (depth / count));
    pieces.push(geo);
  }
  const stack = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!stack) return null;
  stack.computeVertexNormals();

  const face = new THREE.RingGeometry(hole, worldR, 72);
  setRingUvs(face, circle.cx, circle.cy, width, height, sx, sy);
  face.translate(0, 0, preset.maxHalf * 0.92);
  return { stack, face, origin: { x: ox, y: oy } };
}

function cacheKey(kind, src, pose, preset) {
  return `${kind}:${src}:${pose.w.toFixed(4)}:${pose.h.toFixed(4)}:${preset.maxHalf}:${preset.zScale ?? 1}`;
}

export function prepareSolid(src, texture) {
  if (!src || !texture?.image) return maskCache.get(src) ?? null;
  if (maskCache.has(src)) return maskCache.get(src);
  const built = downsampleMask(texture.image, PREP_MAX);
  maskCache.set(src, built);
  return built;
}

function planeFallback(texture, pose, preset, layer) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(pose.w, pose.h),
    skin(preset, {
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.48,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.04,
    }),
  );
  mesh.renderOrder = layer.z;
  mesh.position.set(pose.x, pose.y, pose.z);
  mesh.userData.pose = pose;
  mesh.userData.layer = layer;
  return mesh;
}

function tag(object, pose, layer) {
  object.position.set(pose.x, pose.y, pose.z);
  object.renderOrder = layer.z;
  object.userData.pose = pose;
  object.userData.layer = layer;
  object.userData.volume = true;
  return object;
}

function inflateMesh(texture, src, pose, preset, layer) {
  const data = maskCache.get(src);
  if (!data) return null;
  const key = cacheKey("inflate", src, pose, preset);
  let geometry = geomCache.get(key);
  if (!geometry) {
    geometry = buildInflateGeometry(data, pose, preset);
    if (!geometry) return null;
    geomCache.set(key, geometry);
  }
  const mesh = new THREE.Mesh(
    geometry.clone(),
    skin(preset, {
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.52,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      alphaTest: 0.08,
      metalness: 0.02,
      envMapIntensity: 0.18,
      specularIntensity: 0.16,
    }),
  );
  return tag(mesh, pose, layer);
}

function wheelMesh(texture, src, pose, preset, layer) {
  const data = maskCache.get(src);
  if (!data) return null;
  const key = cacheKey("wheel", src, pose, preset);
  let kit = geomCache.get(key);
  if (!kit) {
    kit = buildWheelKit(data, pose);
    if (!kit) return null;
    geomCache.set(key, kit);
  }
  const group = new THREE.Group();
  const { x, y } = kit.origin;
  const tire = new THREE.Mesh(
    kit.tire.clone(),
    skin(preset, {
      vertexColors: true,
      color: "#2b2927",
      roughness: 0.7,
      metalness: 0.02,
      clearcoat: 0.02,
      envMapIntensity: 0.16,
    }),
  );
  const rim = new THREE.Mesh(
    kit.rim.clone(),
    skin(preset, {
      vertexColors: true,
      color: "#1c1c1e",
      roughness: 0.48,
      metalness: 0.08,
      clearcoat: 0.06,
      envMapIntensity: 0.2,
    }),
  );
  const rimFace = new THREE.Mesh(
    kit.rimFace.clone(),
    skin(preset, {
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.48,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
      metalness: 0,
      roughness: 0.52,
      envMapIntensity: 0.14,
      specularIntensity: 0.12,
    }),
  );
  const spokes = new THREE.Mesh(
    kit.spokes.clone(),
    skin(preset, {
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.48,
      transparent: true,
      alphaTest: 0.12,
      side: THREE.DoubleSide,
      depthWrite: true,
      roughness: 0.58,
      metalness: 0.02,
      envMapIntensity: 0.14,
      specularIntensity: 0.12,
    }),
  );
  const hub = new THREE.Mesh(
    kit.hub.clone(),
    skin(preset, {
      vertexColors: true,
      color: "#2a2a2c",
      roughness: 0.42,
      metalness: 0.18,
      envMapIntensity: 0.22,
    }),
  );
  for (const mesh of [tire, rim, rimFace, spokes, hub]) {
    mesh.position.set(x, y, 0);
    mesh.renderOrder = layer.z;
    group.add(mesh);
  }
  return tag(group, pose, layer);
}

function cassetteMesh(texture, src, pose, preset, layer) {
  const data = maskCache.get(src);
  if (!data) return null;
  const key = cacheKey("cassette", src, pose, preset);
  let kit = geomCache.get(key);
  if (!kit) {
    kit = buildCassetteKit(data, pose, preset);
    if (!kit) return null;
    geomCache.set(key, kit);
  }
  const group = new THREE.Group();
  const stack = new THREE.Mesh(
    kit.stack.clone(),
    skin(preset, {
      color: "#8d8c89",
      roughness: 0.36,
      metalness: 0.42,
      envMapIntensity: 0.28,
    }),
  );
  const face = new THREE.Mesh(
    kit.face.clone(),
    skin(preset, {
      map: texture,
      emissiveMap: texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.48,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      depthWrite: true,
      metalness: 0.08,
      roughness: 0.46,
      envMapIntensity: 0.16,
      specularIntensity: 0.14,
    }),
  );
  stack.position.set(kit.origin.x, kit.origin.y, 0);
  face.position.set(kit.origin.x, kit.origin.y, 0);
  stack.renderOrder = layer.z;
  face.renderOrder = layer.z + 1;
  group.add(stack, face);
  return tag(group, pose, layer);
}

export function warmupVolume(src, pose, type, role) {
  const preset = presetOf(type, role);
  const data = maskCache.get(src);
  if (!data) return;
  if (type === "wheels") {
    const key = cacheKey("wheel", src, pose, preset);
    if (!geomCache.has(key)) {
      const kit = buildWheelKit(data, pose);
      if (kit) geomCache.set(key, kit);
    }
    return;
  }
  if (type === "cassette") {
    const key = cacheKey("cassette", src, pose, preset);
    if (!geomCache.has(key)) {
      const kit = buildCassetteKit(data, pose, preset);
      if (kit) geomCache.set(key, kit);
    }
    return;
  }
  const key = cacheKey("inflate", src, pose, preset);
  if (!geomCache.has(key)) {
    const geometry = buildInflateGeometry(data, pose, preset);
    if (geometry) geomCache.set(key, geometry);
  }
}

export function createVolumeMesh({ texture, src, pose, type, role, layer }) {
  const preset = presetOf(type, role);
  prepareSolid(src, texture);
  if (type === "wheels") return wheelMesh(texture, src, pose, preset, layer) ?? planeFallback(texture, pose, preset, layer);
  if (type === "cassette") return cassetteMesh(texture, src, pose, preset, layer) ?? planeFallback(texture, pose, preset, layer);
  return inflateMesh(texture, src, pose, preset, layer) ?? planeFallback(texture, pose, preset, layer);
}

export function disposePartMesh(mesh) {
  mesh.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material && !Array.isArray(node.material)) node.material.dispose();
  });
}
