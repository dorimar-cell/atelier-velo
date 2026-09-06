import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const PREP_MAX = 320;
const MESH_MAX = 420;
const AXLE_COLOR = "#2b2b2d";
const STEEL_COLOR = "#9a9894";

const TYPE_PRESET = {
  frame: { maxHalf: 0.078, zScale: 1.04, roughness: 0.56, metalness: 0.02, clearcoat: 0.04 },
  wheels: { maxHalf: 0.07, zScale: 1, roughness: 0.54, metalness: 0.04, clearcoat: 0.04 },
  handlebar: { maxHalf: 0.034, zScale: 1.04, roughness: 0.6, metalness: 0.03, clearcoat: 0.03 },
  saddle: { maxHalf: 0.03, zScale: 1.02, roughness: 0.66, metalness: 0.02, clearcoat: 0.02 },
  groupset: { maxHalf: 0.042, zScale: 1.02, roughness: 0.46, metalness: 0.14, clearcoat: 0.04 },
  cassette: { maxHalf: 0.07, zScale: 1, roughness: 0.38, metalness: 0.22, clearcoat: 0.03 },
  brakes: { maxHalf: 0.016, zScale: 0.86, roughness: 0.42, metalness: 0.18, clearcoat: 0.04, keepHoles: true },
  bottles: { maxHalf: 0.028, zScale: 1.08, roughness: 0.56, metalness: 0.04, clearcoat: 0.03 },
};

const ROLE_PRESET = {
  interior: { maxHalf: 0.008, zScale: 0.34, roughness: 0.62, metalness: 0.03, clearcoat: 0.02 },
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
      mask[o] = maxA >= 88 ? 1 : 0;
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

function boxBlurN(src, width, height, passes) {
  let cur = src;
  for (let i = 0; i < passes; i += 1) cur = boxBlur(cur, width, height);
  return cur;
}

function sampleField(field, width, height, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const xx0 = Math.min(width - 1, Math.max(0, x0));
  const yy0 = Math.min(height - 1, Math.max(0, y0));
  const a = field[yy0 * width + xx0];
  const b = field[yy0 * width + x1];
  const c = field[y1 * width + xx0];
  const d = field[y1 * width + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function signedDistance(mask, width, height) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) inv[i] = mask[i] ? 0 : 1;
  const inside = distanceTransform(mask, width, height);
  const outside = distanceTransform(inv, width, height);
  const sdf = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) sdf[i] = mask[i] ? inside[i] : -outside[i];
  return sdf;
}

function resampleField(src, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sx = ((x + 0.5) * srcW) / dstW - 0.5;
      const sy = ((y + 0.5) * srcH) / dstH - 0.5;
      out[y * dstW + x] = sampleField(src, srcW, srcH, sx, sy);
    }
  }
  return out;
}

function meshLimit(pose) {
  const span = Math.max(pose.w, pose.h);
  if (span > 1.55) return Math.min(MESH_MAX, 420);
  if (span > 0.9) return 340;
  return 260;
}

function maskToLocal(x, y, width, height, pose) {
  return {
    x: (x / width - 0.5) * pose.w,
    y: (0.5 - y / height) * pose.h,
  };
}

function topCentroid(mask, width, height, x0, y0, x1, y1) {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(width, Math.ceil(x1));
  const bottom = Math.min(height, Math.ceil(y1));
  let minY = height;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (!mask[y * width + x]) continue;
      if (y < minY) minY = y;
    }
  }
  if (minY >= height) return null;
  const band = Math.max(2, Math.floor((bottom - top) * 0.045));
  return maskCentroid(mask, width, height, left, minY, right, Math.min(bottom, minY + band + 1));
}

function sliceAxis(mask, width, height, x0, x1, y0, y1) {
  const pts = [];
  for (let y = y0; y < y1; y += 1) {
    const c = maskCentroid(mask, width, height, x0, y, x1, y + 1);
    if (c) pts.push(c);
  }
  if (pts.length < 3) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, dx: b.x - a.x, dy: b.y - a.y, n: pts.length };
}

function deepColor(rgba, field, width, height, minDepth = 1.5) {
  const samples = [];
  for (let i = 0; i < field.length; i += 1) {
    if (field[i] < minDepth) continue;
    const p = i * 4;
    if (rgba[p + 3] < 24) continue;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    samples.push([r, g, b, (r + g + b) / 3]);
  }
  if (!samples.length) return averageOpaqueColor(rgba, field.map((v) => (v > 0 ? 1 : 0)), width, height);
  samples.sort((a, b) => a[3] - b[3]);
  const median = samples[Math.floor(samples.length / 2)][3];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const sample of samples) {
    if (Math.abs(sample[3] - median) > 36) continue;
    r += sample[0];
    g += sample[1];
    b += sample[2];
    n += 1;
  }
  if (!n) {
    const mid = samples[Math.floor(samples.length / 2)];
    return new THREE.Color(mid[0] / 255, mid[1] / 255, mid[2] / 255);
  }
  return new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
}

function clipMask(mask, width, height, x0, x1) {
  const out = new Uint8Array(mask.length);
  const left = Math.max(0, Math.floor(x0));
  const right = Math.min(width, Math.ceil(x1));
  for (let y = 0; y < height; y += 1) {
    for (let x = left; x < right; x += 1) out[y * width + x] = mask[y * width + x];
  }
  return out;
}

function scoreCircle(mask, width, height, cx, cy, radius) {
  if (radius < 6) return 0;
  let ringOn = 0;
  let ringTot = 0;
  let innerOn = 0;
  let innerTot = 0;
  const r0 = radius * 0.16;
  const r1 = radius * 0.78;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius * 1.03) continue;
      const on = mask[y * width + x];
      if (d >= r1) {
        ringTot += 1;
        if (on) ringOn += 1;
      } else if (d >= r0) {
        innerTot += 1;
        if (on) innerOn += 1;
      }
    }
  }
  if (ringTot < 12) return 0;
  const ring = ringOn / ringTot;
  if (ring < 0.2) return 0;
  const inner = innerTot ? innerOn / innerTot : 0;
  const compact = Math.min(1, (2 * radius) / Math.min(width, height));
  return ring * 0.78 + Math.min(inner, 0.85) * 0.16 + compact * 0.06;
}

function fitRotorCircle(mask, width, height) {
  const candidates = [fitCircle(mask, width, height)];
  if (width > height * 1.08) {
    candidates.push(fitCircle(clipMask(mask, width, height, 0, width * 0.72), width, height));
    candidates.push(fitCircle(clipMask(mask, width, height, width * 0.28, width), width, height));
    candidates.push(fitCircle(clipMask(mask, width, height, 0, Math.min(width, height * 1.08)), width, height));
    candidates.push(fitCircle(clipMask(mask, width, height, Math.max(0, width - height * 1.08), width), width, height));
  }
  let best = null;
  let bestScore = 0.26;
  for (const circle of candidates) {
    if (!circle) continue;
    const score = scoreCircle(mask, width, height, circle.cx, circle.cy, circle.radius);
    if (score > bestScore) {
      best = circle;
      bestScore = score;
    }
  }
  return best;
}

function extractCaliperMask(mask, width, height, circle) {
  const seen = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  const qx = new Int32Array(mask.length);
  const qy = new Int32Array(mask.length);
  let kept = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (!mask[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      qx[0] = x;
      qy[0] = y;
      tail = 1;
      seen[start] = 1;
      const cells = [];
      let maxD = 0;
      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        const i = cy * width + cx;
        cells.push(i);
        const d = Math.hypot(cx + 0.5 - circle.cx, cy + 0.5 - circle.cy);
        if (d > maxD) maxD = d;
        const next = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of next) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!mask[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx[tail] = nx;
          qy[tail] = ny;
          tail += 1;
        }
      }
      if (maxD < circle.radius * 1.16 || cells.length < 22) continue;
      for (const i of cells) {
        const cx = i % width;
        const cy = Math.floor(i / width);
        const d = Math.hypot(cx + 0.5 - circle.cx, cy + 0.5 - circle.cy);
        if (d < circle.radius * 1.05) continue;
        out[i] = 1;
        kept += 1;
      }
    }
  }
  return kept >= 22 ? out : null;
}

function sampleRgba(rgba, width, height, px, py) {
  const x = Math.min(width - 1, Math.max(0, Math.round(px)));
  const y = Math.min(height - 1, Math.max(0, Math.round(py)));
  const i = (y * width + x) * 4;
  return [rgba[i] / 255, rgba[i + 1] / 255, rgba[i + 2] / 255, rgba[i + 3] / 255];
}

function fillSmallHoles(mask, width, height) {
  const out = new Uint8Array(mask);
  const seen = new Uint8Array(mask.length);
  const maxArea = Math.max(28, Math.floor(width * height * 0.012));
  const qx = new Int32Array(mask.length);
  const qy = new Int32Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (out[start] || seen[start]) continue;
      let head = 0;
      let tail = 0;
      qx[tail] = x;
      qy[tail] = y;
      tail += 1;
      seen[start] = 1;
      let area = 0;
      let border = false;
      const cells = [];
      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        const i = cy * width + cx;
        cells.push(i);
        area += 1;
        if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) border = true;
        const next = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of next) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (out[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx[tail] = nx;
          qy[tail] = ny;
          tail += 1;
        }
      }
      if (!border && area <= maxArea) {
        for (const i of cells) out[i] = 1;
      }
    }
  }
  return out;
}

function averageOpaqueColor(rgba, mask, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const p = i * 4;
    if (rgba[p + 3] < 24) continue;
    r += rgba[p];
    g += rgba[p + 1];
    b += rgba[p + 2];
    n += 1;
  }
  if (!n) return new THREE.Color("#7a7a7a");
  return new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
}

function bandAverage(rgba, mask, width, height, cx, cy, r0, r1, maxLum = 256) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r0 || d >= r1) continue;
      const p = i * 4;
      if (rgba[p + 3] < 24) continue;
      if ((rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3 > maxLum) continue;
      r += rgba[p];
      g += rgba[p + 1];
      b += rgba[p + 2];
      n += 1;
    }
  }
  if (!n) return [0.12, 0.12, 0.13];
  return [r / n / 255, g / n / 255, b / n / 255];
}

function nearestOpaqueUv(mask, width, height, x, y) {
  if (mask[y * width + x]) return [(x + 0.5) / width, 1 - (y + 0.5) / height];
  for (let radius = 1; radius <= 7; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        if (!mask[yy * width + xx]) continue;
        return [(xx + 0.5) / width, 1 - (yy + 0.5) / height];
      }
    }
  }
  return [(x + 0.5) / width, 1 - (y + 0.5) / height];
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
    hubOuter: Math.max(0.045, Math.min(0.1, hub / bins)),
    hasTan: tanScore > 10,
  };
}

function projectUv(x, y, cx, cy, width, height, sx, sy) {
  return [(cx + x / sx) / width, 1 - (cy - y / sy) / height];
}

function paintGeomWithFallback(geometry, rgba, width, height, cx, cy, sx, sy, origin, fallback) {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const [fr, fg, fb] = fallback;
  for (let i = 0; i < pos.count; i += 1) {
    const [r, g, b, a] = sampleRgba(
      rgba,
      width,
      height,
      cx + (pos.getX(i) - origin.x) / sx,
      cy - (pos.getY(i) - origin.y) / sy,
    );
    const useSample = a > 0.14;
    colors[i * 3] = useSample ? r : fr;
    colors[i * 3 + 1] = useSample ? g : fg;
    colors[i * 3 + 2] = useSample ? b : fb;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function paintTire(geometry, rgba, width, height, cx, cy, sx, sy, major, tube, tireColor, tanColor, hasTan) {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const radial = Math.hypot(x, y);
    const [r, g, b, a] = sampleRgba(rgba, width, height, cx + x / sx, cy - y / sy);
    let cr;
    let cg;
    let cb;
    if (hasTan && (Math.abs(z) > tube * 0.22 || (radial > major * 0.98 && radial < major + tube * 0.72))) {
      [cr, cg, cb] = a > 0.18 ? [r, g, b] : tanColor;
    } else if (radial > major && a <= 0.14) {
      [cr, cg, cb] = tireColor;
    } else if (a > 0.14) {
      cr = r;
      cg = g;
      cb = b;
    } else {
      [cr, cg, cb] = hasTan ? tanColor : tireColor;
    }
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
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

function flipFacing(geometry) {
  const index = geometry.getIndex();
  if (index) {
    const arr = index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const mid = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = mid;
    }
    index.needsUpdate = true;
  }
  const normals = geometry.getAttribute("normal");
  if (normals) {
    for (let i = 0; i < normals.count; i += 1) {
      normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
    }
    normals.needsUpdate = true;
  } else {
    geometry.computeVertexNormals();
  }
  return geometry;
}

function makeGeometry(positions, uvs, indices) {
  if (indices.length < 3) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (uvs) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildInflateKit(data, pose, preset, maskOverride) {
  const sourceMask = maskOverride ?? data.mask;
  const filled = preset.keepHoles || maskOverride ? sourceMask : fillSmallHoles(sourceMask, data.width, data.height);
  const limit = meshLimit(pose);
  const srcW = data.width;
  const srcH = data.height;
  const scale = Math.min(1, limit / Math.max(srcW, srcH));
  const width = Math.max(2, Math.round(srcW * scale));
  const height = Math.max(2, Math.round(srcH * scale));
  const sdfHi = boxBlurN(signedDistance(filled, srcW, srcH), srcW, srcH, 2);
  const sdf = boxBlurN(resampleField(sdfHi, srcW, srcH, width, height), width, height, 2);
  const localR = maxFilter(
    sdf.map((v) => Math.max(0, v)),
    width,
    height,
    3,
  );
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < sdf.length; i += 1) solid[i] = sdf[i] > 0.28 ? 1 : 0;
  const mask = solid;
  const sx = pose.w / width;
  const sy = pose.h / height;
  const sz = ((sx + sy) * 0.5) * (preset.zScale ?? 1);
  const minHalf = Math.max(0.0048, preset.maxHalf * 0.2);
  const indexOf = new Int32Array(width * height).fill(-1);
  const heights = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!solid[i]) continue;
      const d = Math.max(0, sdf[i]);
      const radius = Math.max(d, localR[i]);
      let z = Math.sqrt(Math.max(0, d * (2 * radius - d))) * sz;
      z = Math.max(z, minHalf);
      heights[i] = Math.min(z, preset.maxHalf);
    }
  }

  for (let pass = 0; pass < 8; pass += 1) {
    const next = heights.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (!mask[i] || sdf[i] < 0.55) continue;
        let sum = heights[i] * 3;
        let n = 3;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const j = (y + dy) * width + (x + dx);
          if (!solid[j]) continue;
          sum += heights[j];
          n += 1;
        }
        next[i] = Math.min(preset.maxHalf, Math.max(minHalf, sum / n));
      }
    }
    heights.set(next);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!solid[i]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !solid[i - 1] ||
        !solid[i + 1] ||
        !solid[i - width] ||
        !solid[i + width];
      const edgeZ = Math.max(0.0064, minHalf * 0.34);
      if (edge || sdf[i] < 1.15) {
        const t = Math.min(1, Math.max(0, sdf[i] / 1.15));
        heights[i] = edgeZ + (heights[i] - edgeZ) * t * t;
      }
      if (edge) heights[i] = Math.min(heights[i], Math.max(0.007, minHalf * 0.42));
    }
  }

  const frontPos = [];
  const frontUv = [];
  const backPos = [];
  const backUv = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!solid[i]) continue;
      indexOf[i] = frontPos.length / 3;
      const px = (x + 0.5) * sx - pose.w * 0.5;
      const py = pose.h * 0.5 - (y + 0.5) * sy;
      const pz = heights[i];
      frontPos.push(px, py, pz);
      backPos.push(px, py, -pz);
      const [u, v] = nearestOpaqueUv(mask, width, height, x, y);
      frontUv.push(u, v);
      backUv.push(u, v);
    }
  }

  const nFront = frontPos.length / 3;
  if (nFront < 8) return null;

  const frontIndex = [];
  const backIndex = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? -1 : indexOf[y * width + x]);
  const addFront = (i, j, k) => {
    frontIndex.push(i, j, k);
    backIndex.push(i, k, j);
  };

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const a = at(x, y);
      const b = at(x + 1, y);
      const c = at(x + 1, y + 1);
      const d = at(x, y + 1);
      if (a >= 0 && b >= 0 && c >= 0 && d >= 0) {
        addFront(d, c, b);
        addFront(d, b, a);
        continue;
      }
      if (d >= 0 && c >= 0 && b >= 0) addFront(d, c, b);
      else if (d >= 0 && b >= 0 && a >= 0) addFront(d, b, a);
      else if (a >= 0 && b >= 0 && c >= 0) addFront(a, b, c);
      else if (a >= 0 && c >= 0 && d >= 0) addFront(a, c, d);
    }
  }
  if (frontIndex.length < 12) return null;

  const open = new Set();
  const flip = (i, j) => `${j},${i}`;
  const walk = (i, j) => {
    const rev = flip(i, j);
    if (open.has(rev)) open.delete(rev);
    else open.add(`${i},${j}`);
  };
  for (let i = 0; i < frontIndex.length; i += 3) {
    walk(frontIndex[i], frontIndex[i + 1]);
    walk(frontIndex[i + 1], frontIndex[i + 2]);
    walk(frontIndex[i + 2], frontIndex[i]);
  }

  const neigh = Array.from({ length: nFront }, () => []);
  for (const key of open) {
    const [i, j] = key.split(",").map(Number);
    neigh[i].push(j);
    neigh[j].push(i);
  }
  for (let pass = 0; pass < 7; pass += 1) {
    const nextX = new Float32Array(nFront);
    const nextY = new Float32Array(nFront);
    for (let i = 0; i < nFront; i += 1) {
      nextX[i] = frontPos[i * 3];
      nextY[i] = frontPos[i * 3 + 1];
      if (neigh[i].length < 2) continue;
      let sx = 0;
      let sy = 0;
      for (const j of neigh[i]) {
        sx += frontPos[j * 3];
        sy += frontPos[j * 3 + 1];
      }
      nextX[i] = frontPos[i * 3] * 0.58 + (sx / neigh[i].length) * 0.42;
      nextY[i] = frontPos[i * 3 + 1] * 0.58 + (sy / neigh[i].length) * 0.42;
    }
    for (let i = 0; i < nFront; i += 1) {
      frontPos[i * 3] = nextX[i];
      frontPos[i * 3 + 1] = nextY[i];
      backPos[i * 3] = nextX[i];
      backPos[i * 3 + 1] = nextY[i];
    }
  }

  const wallPos = [];
  const wallUv = [];
  const wallIndex = [];
  for (const key of open) {
    const [i, j] = key.split(",").map(Number);
    const zi = Math.abs(frontPos[i * 3 + 2]);
    const zj = Math.abs(frontPos[j * 3 + 2]);
    if (zi <= 0.0075 && zj <= 0.0075) continue;
    const base = wallPos.length / 3;
    wallPos.push(
      frontPos[i * 3],
      frontPos[i * 3 + 1],
      frontPos[i * 3 + 2],
      backPos[i * 3],
      backPos[i * 3 + 1],
      backPos[i * 3 + 2],
      backPos[j * 3],
      backPos[j * 3 + 1],
      backPos[j * 3 + 2],
      frontPos[j * 3],
      frontPos[j * 3 + 1],
      frontPos[j * 3 + 2],
    );
    const u0 = frontUv[i * 2];
    const v0 = frontUv[i * 2 + 1];
    const u1 = frontUv[j * 2];
    const v1 = frontUv[j * 2 + 1];
    wallUv.push(u0, v0, u0, v0, u1, v1, u1, v1);
    wallIndex.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return {
    front: makeGeometry(frontPos, frontUv, frontIndex),
    back: makeGeometry(backPos, backUv, backIndex),
    walls: makeGeometry(wallPos, wallUv, wallIndex),
    color: deepColor(data.rgba, sdfHi, srcW, srcH, 1.8),
  };
}

function mergeParts(pieces) {
  const stack = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (stack) stack.computeVertexNormals();
  return stack;
}

function buildAxleGeometry(worldR, rimHalf, role) {
  const rear = role === "rear";
  const shellR = worldR * 0.052;
  const flangeR = worldR * 0.074;
  const axleR = worldR * 0.019;
  const capR = worldR * 0.026;
  const shellHalf = Math.max(worldR * (rear ? 0.088 : 0.068), rimHalf * 1.05);
  const axleHalf = worldR * (rear ? 0.198 : 0.15);
  const flangeH = Math.max(worldR * 0.011, 0.0055);
  const body = [];
  const caps = [];

  const shell = new THREE.CylinderGeometry(shellR, shellR, shellHalf * 2, 28, 1, true);
  shell.rotateX(Math.PI / 2);
  body.push(shell);

  const driveFlange = new THREE.CylinderGeometry(flangeR, flangeR * 0.9, flangeH, 28);
  driveFlange.rotateX(Math.PI / 2);
  driveFlange.translate(0, 0, shellHalf * 0.76);
  body.push(driveFlange);

  const discFlange = new THREE.CylinderGeometry(flangeR * (rear ? 0.9 : 1), flangeR * 0.84, flangeH * 0.9, 28);
  discFlange.rotateX(Math.PI / 2);
  discFlange.translate(0, 0, -shellHalf * 0.76);
  body.push(discFlange);

  if (rear) {
    const freehub = new THREE.CylinderGeometry(shellR * 0.84, shellR * 0.8, worldR * 0.068, 24);
    freehub.rotateX(Math.PI / 2);
    freehub.translate(0, 0, shellHalf * 0.62 + worldR * 0.028);
    body.push(freehub);

    const carrier = new THREE.CylinderGeometry(shellR * 1.14, shellR * 1.02, worldR * 0.014, 28);
    carrier.rotateX(Math.PI / 2);
    carrier.translate(0, 0, -shellHalf * 0.76 - worldR * 0.011);
    body.push(carrier);

    const lock = new THREE.CylinderGeometry(shellR * 0.76, shellR * 0.7, worldR * 0.009, 20);
    lock.rotateX(Math.PI / 2);
    lock.translate(0, 0, -shellHalf * 0.76 - worldR * 0.02);
    body.push(lock);
  }

  const shaft = new THREE.CylinderGeometry(axleR, axleR, axleHalf * 2, 20, 1, true);
  shaft.rotateX(Math.PI / 2);

  for (const sign of [-1, 1]) {
    const z = sign * axleHalf;
    const washer = new THREE.CylinderGeometry(capR * 1.08, capR, worldR * 0.006, 20);
    washer.rotateX(Math.PI / 2);
    washer.translate(0, 0, z - sign * worldR * 0.011);
    caps.push(washer);
    const cap = new THREE.CylinderGeometry(capR * 0.92, capR * 0.86, worldR * 0.013, 12);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 0, z);
    caps.push(cap);
    const hex = new THREE.CylinderGeometry(capR * 0.42, capR * 0.36, worldR * 0.009, 6);
    hex.rotateX(Math.PI / 2);
    hex.translate(0, 0, z + sign * worldR * 0.006);
    caps.push(hex);
  }

  return {
    hub: mergeParts(body),
    shaft,
    caps: mergeParts(caps),
    spokeInner: Math.max(flangeR * 1.15, worldR * 0.095),
    axleHalf,
  };
}

function buildWheelKit(data, pose, role) {
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
  const tube = Math.max((tireOuter - tireInner) * 0.62, worldR * 0.052);
  const major = (tireOuter + tireInner) * 0.5;
  const rimOuter = tireInner * 0.99;
  const rimDepth = Math.max(rimOuter - rimInner, worldR * 0.08);
  const rimHalf = Math.max(rimDepth * 0.46, worldR * 0.034);
  const axle = buildAxleGeometry(worldR, rimHalf, role);
  if (!axle.hub) return null;
  const tireColor = bandAverage(rgba, mask, width, height, circle.cx, circle.cy, circle.radius * 0.86, circle.radius * 1.02);
  const tanColor = bandAverage(rgba, mask, width, height, circle.cx, circle.cy, circle.radius * 0.88, circle.radius * 0.97);
  const rimColor = bandAverage(
    rgba,
    mask,
    width,
    height,
    circle.cx,
    circle.cy,
    circle.radius * bands.rimInner,
    circle.radius * bands.tireInner * 0.96,
    118,
  );

  const tire = new THREE.TorusGeometry(major, tube, 14, 64);
  paintTire(tire, rgba, width, height, circle.cx, circle.cy, sx, sy, major, tube, tireColor, tanColor, bands.hasTan);
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
  paintGeomWithFallback(rim, rgba, width, height, circle.cx, circle.cy, sx, sy, { x: 0, y: 0 }, rimColor);
  rim.computeVertexNormals();

  const rimFace = new THREE.RingGeometry(rimInner, rimOuter, 72);
  setRingUvs(rimFace, circle.cx, circle.cy, width, height, sx, sy);
  rimFace.translate(0, 0, rimHalf * 0.9);
  const rimFaceBack = rimFace.clone();
  rimFaceBack.translate(0, 0, -rimHalf * 1.8);

  const spokes = new THREE.RingGeometry(axle.spokeInner, rimInner * 0.985, 64);
  setRingUvs(spokes, circle.cx, circle.cy, width, height, sx, sy);
  spokes.translate(0, 0, rimHalf * 0.14);
  const spokesBack = spokes.clone();
  spokesBack.translate(0, 0, -rimHalf * 0.28);
  flipFacing(spokesBack);

  return {
    tire,
    rim,
    rimFace,
    rimFaceBack,
    spokes,
    spokesBack,
    hub: axle.hub,
    shaft: axle.shaft,
    caps: axle.caps,
    origin: { x: ox, y: oy },
    rimColor,
  };
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
  const hole = worldR * 0.15;
  const count = 11;
  const depth = Math.min(preset.maxHalf * 1.85, worldR * 0.7);
  const pieces = [];
  const barrel = new THREE.CylinderGeometry(worldR * 0.17, worldR * 0.165, depth * 0.86, 24);
  barrel.rotateX(Math.PI / 2);
  pieces.push(barrel);
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const radius = THREE.MathUtils.lerp(worldR * 0.98, worldR * 0.36, t);
    const thick = Math.max(depth * 0.036, 0.0032);
    const geo = new THREE.CylinderGeometry(radius, radius * 0.985, thick, 48);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, -depth * 0.4 + i * ((depth * 0.8) / (count - 1)));
    pieces.push(geo);
  }
  const lock = new THREE.CylinderGeometry(worldR * 0.27, worldR * 0.25, depth * 0.05, 28);
  lock.rotateX(Math.PI / 2);
  lock.translate(0, 0, depth * 0.44);
  pieces.push(lock);
  const stack = mergeParts(pieces);
  if (!stack) return null;

  const face = new THREE.RingGeometry(hole, worldR, 72);
  setRingUvs(face, circle.cx, circle.cy, width, height, sx, sy);
  face.translate(0, 0, depth * 0.46);
  return { stack, face, origin: { x: ox, y: oy } };
}

function buildBrakeKit(data, pose, preset) {
  const { mask, width, height } = data;
  const circle = fitRotorCircle(mask, width, height);
  if (!circle) return null;
  if (circle.radius < Math.min(width, height) * 0.22) return null;
  if (height > width * 1.15 && circle.radius * 2 > width * 0.72) return null;
  const sx = pose.w / width;
  const sy = pose.h / height;
  const ox = (circle.cx / width - 0.5) * pose.w;
  const oy = (0.5 - circle.cy / height) * pose.h;
  const worldR = circle.radius * ((sx + sy) * 0.5) * 1.004;
  const hole = worldR * 0.118;
  const trackInner = worldR * 0.78;
  const thick = Math.max(0.0034, Math.min(preset.maxHalf * 0.7, worldR * 0.017));
  const rotorPoints = [
    new THREE.Vector2(trackInner, -thick * 0.28),
    new THREE.Vector2(trackInner + worldR * 0.025, -thick * 0.48),
    new THREE.Vector2(worldR * 0.988, -thick * 0.48),
    new THREE.Vector2(worldR * 0.988, thick * 0.48),
    new THREE.Vector2(trackInner + worldR * 0.025, thick * 0.48),
    new THREE.Vector2(trackInner, thick * 0.28),
  ];
  const rotor = new THREE.LatheGeometry(rotorPoints, 80);
  rotor.rotateX(Math.PI / 2);
  rotor.computeVertexNormals();

  const face = new THREE.RingGeometry(hole, worldR * 1.002, 96);
  setRingUvs(face, circle.cx, circle.cy, width, height, sx, sy);
  face.translate(0, 0, thick * 0.52);
  const faceBack = face.clone();
  faceBack.translate(0, 0, -thick * 1.04);
  flipFacing(faceBack);

  const hat = new THREE.CylinderGeometry(hole * 1.16, hole * 1.04, thick * 0.9, 24, 1, true);
  hat.rotateX(Math.PI / 2);
  hat.computeVertexNormals();

  return {
    rotor,
    face,
    faceBack,
    hat,
    origin: { x: ox, y: oy },
    caliperMask: extractCaliperMask(mask, width, height, circle),
    thick,
  };
}

function cacheKey(kind, src, pose, preset, extra = "") {
  return `${kind}:${src}:${pose.w.toFixed(4)}:${pose.h.toFixed(4)}:${preset.maxHalf}:${preset.zScale ?? 1}:${extra}`;
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

function steererAnchor(data, pose) {
  const { mask, width, height } = data;
  const xMax = Math.max(4, Math.floor(width * 0.45));
  let minY = height;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < xMax; x += 1) {
      if (!mask[y * width + x]) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxY <= minY) return null;
  const yCut = maxY - Math.max(2, Math.floor((maxY - minY) * 0.22));
  const axis = sliceAxis(mask, width, height, 0, xMax, yCut, maxY + 1);
  const c = maskCentroid(mask, width, height, 0, yCut, xMax, maxY + 1);
  if (!c) return null;
  const local = maskToLocal(c.x, c.y, width, height, pose);
  const tilt = axis ? Math.atan2(axis.dx * (pose.w / width), -axis.dy * (pose.h / height)) : 0;
  return { ...local, tilt };
}

function makeSteerer(data, pose, preset) {
  const anchor = steererAnchor(data, pose);
  if (!anchor) return null;
  const radius = Math.max(0.0075, Math.min(pose.w * 0.026, 0.011));
  const length = Math.max(pose.h * 0.4, 0.06);
  const geo = new THREE.CylinderGeometry(radius, radius * 0.88, length, 20);
  geo.translate(0, -length * 0.46, 0);
  const mesh = new THREE.Mesh(
    geo,
    skin(preset, {
      color: AXLE_COLOR,
      roughness: 0.44,
      metalness: 0.22,
      envMapIntensity: 0.2,
    }),
  );
  mesh.position.set(anchor.x, anchor.y, 0);
  mesh.rotation.z = anchor.tilt;
  return mesh;
}

function maskCentroid(mask, width, height, x0, y0, x1, y1) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (!mask[y * width + x]) continue;
      sx += x + 0.5;
      sy += y + 0.5;
      n += 1;
    }
  }
  if (n < 6) return null;
  return { x: sx / n, y: sy / n, n };
}

function pegSkin(preset, color) {
  return skin(preset, {
    color,
    roughness: 0.5,
    metalness: 0.08,
    envMapIntensity: 0.14,
  });
}

function postAnchor(data, pose) {
  const { mask, width, height } = data;
  let maxY = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    maxY = Math.max(maxY, Math.floor(i / width));
  }
  const y0 = Math.max(0, maxY - Math.max(4, Math.floor(height * 0.2)));
  const axis = sliceAxis(mask, width, height, 0, width, y0, maxY + 1);
  const c = maskCentroid(mask, width, height, 0, y0, width, maxY + 1);
  if (!c) return null;
  const local = maskToLocal(c.x, c.y, width, height, pose);
  const tilt = axis ? Math.atan2(axis.dx * (pose.w / width), -axis.dy * (pose.h / height)) : 0;
  return { ...local, tilt };
}

function makePostPeg(data, pose, preset, color) {
  const anchor = postAnchor(data, pose);
  if (!anchor) return null;
  const radius = Math.max(0.0068, Math.min(pose.w * 0.022, 0.01));
  const length = Math.max(pose.h * 0.3, 0.062);
  const geo = new THREE.CylinderGeometry(radius, radius * 0.86, length, 18);
  geo.translate(0, -length * 0.46, 0);
  const mesh = new THREE.Mesh(geo, pegSkin(preset, color ?? AXLE_COLOR));
  mesh.position.set(anchor.x, anchor.y, 0);
  mesh.rotation.z = anchor.tilt;
  return mesh;
}

function makeMountPeg(data, pose, preset, color) {
  const { mask, width, height } = data;
  const anchor = maskCentroid(mask, width, height, 0, 0, width, height);
  if (!anchor) return null;
  const x = (anchor.x / width - 0.5) * pose.w;
  const y = (0.5 - anchor.y / height) * pose.h;
  const radius = Math.max(0.0055, Math.min(pose.w, pose.h) * 0.07);
  const length = Math.max(0.028, Math.min(pose.w, pose.h) * 0.28);
  const geo = new THREE.CylinderGeometry(radius, radius * 0.9, length, 12);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -length * 0.38);
  const mesh = new THREE.Mesh(geo, pegSkin(preset, color ?? AXLE_COLOR));
  mesh.position.set(x, y, 0);
  return mesh;
}

function addInflateParts(group, kit, texture, preset, wallOnlyColor = false) {
  const faceMat = skin(preset, {
    map: texture,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.16,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    alphaTest: 0,
    metalness: Math.min(preset.metalness, 0.04),
    envMapIntensity: 0.16,
    specularIntensity: 0.14,
  });
  const wallMat = skin(preset, {
    color: kit.color.clone().multiplyScalar(0.86),
    roughness: Math.min(0.8, preset.roughness + 0.24),
    metalness: Math.min(preset.metalness, 0.02),
    envMapIntensity: 0.07,
    specularIntensity: 0.06,
  });
  if (kit.front) group.add(new THREE.Mesh(kit.front.clone(), wallOnlyColor ? wallMat.clone() : faceMat));
  if (kit.back) group.add(new THREE.Mesh(kit.back.clone(), wallOnlyColor ? wallMat.clone() : faceMat.clone()));
  if (kit.walls) group.add(new THREE.Mesh(kit.walls.clone(), wallMat));
}

function inflateMesh(texture, src, pose, preset, layer) {
  const data = maskCache.get(src);
  if (!data) return null;
  const key = cacheKey("inflate", src, pose, preset, String(meshLimit(pose)));
  let kit = geomCache.get(key);
  if (!kit) {
    kit = buildInflateKit(data, pose, preset);
    if (!kit) return null;
    geomCache.set(key, kit);
  }
  const group = new THREE.Group();
  addInflateParts(group, kit, texture, preset);
  if (layer.role === "interior") {
    group.traverse((node) => {
      if (!node.material) return;
      node.material.polygonOffset = true;
      node.material.polygonOffsetFactor = 1;
      node.material.polygonOffsetUnits = 1;
    });
  }
  if (layer.role === "handlebar") {
    const steerer = makeSteerer(data, pose, preset);
    if (steerer) group.add(steerer);
  }
  if (layer.role === "saddle") {
    const peg = makePostPeg(data, pose, preset, kit.color);
    if (peg) group.add(peg);
  }
  if (layer.role === "seat" || layer.role === "down") {
    const peg = makeMountPeg(data, pose, preset, kit.color);
    if (peg) group.add(peg);
  }
  return tag(group, pose, layer);
}

function photoSkin(texture, preset, extra = {}) {
  return skin(preset, {
    map: texture,
    emissiveMap: texture,
    emissive: 0xffffff,
    emissiveIntensity: 0.44,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
    depthWrite: true,
    metalness: 0.02,
    roughness: 0.54,
    envMapIntensity: 0.14,
    specularIntensity: 0.12,
    ...extra,
  });
}

function wheelMesh(texture, src, pose, preset, layer) {
  const data = maskCache.get(src);
  if (!data) return null;
  const key = cacheKey("wheel", src, pose, preset, layer.role);
  let kit = geomCache.get(key);
  if (!kit) {
    kit = buildWheelKit(data, pose, layer.role);
    if (!kit) return null;
    geomCache.set(key, kit);
  }
  const group = new THREE.Group();
  const { x, y } = kit.origin;
  const tire = new THREE.Mesh(
    kit.tire.clone(),
    skin(preset, {
      vertexColors: true,
      color: "#ffffff",
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
      color: "#ffffff",
      roughness: 0.48,
      metalness: 0.08,
      clearcoat: 0.06,
      envMapIntensity: 0.2,
    }),
  );
  const rimFace = new THREE.Mesh(kit.rimFace.clone(), photoSkin(texture, preset, { metalness: 0, roughness: 0.52 }));
  const rimFaceBack = new THREE.Mesh(
    kit.rimFaceBack.clone(),
    photoSkin(texture, preset, { metalness: 0, roughness: 0.52, emissiveIntensity: 0.4 }),
  );
  const spokes = new THREE.Mesh(kit.spokes.clone(), photoSkin(texture, preset, { alphaTest: 0.12, roughness: 0.58 }));
  const spokesBack = new THREE.Mesh(
    kit.spokesBack.clone(),
    photoSkin(texture, preset, { alphaTest: 0.12, roughness: 0.58, emissiveIntensity: 0.4 }),
  );
  const hub = new THREE.Mesh(
    kit.hub.clone(),
    skin(preset, {
      color: AXLE_COLOR,
      roughness: 0.36,
      metalness: 0.4,
      envMapIntensity: 0.28,
    }),
  );
  const shaft = new THREE.Mesh(
    kit.shaft.clone(),
    skin(preset, {
      color: "#5a5a5e",
      roughness: 0.28,
      metalness: 0.58,
      envMapIntensity: 0.32,
    }),
  );
  const caps = new THREE.Mesh(
    kit.caps.clone(),
    skin(preset, {
      color: "#3a3a3d",
      roughness: 0.32,
      metalness: 0.5,
      envMapIntensity: 0.3,
    }),
  );
  for (const mesh of [tire, rim, rimFaceBack, spokesBack, rimFace, spokes, hub, shaft, caps]) {
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
      color: STEEL_COLOR,
      roughness: 0.34,
      metalness: 0.46,
      envMapIntensity: 0.3,
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

function brakeMesh(texture, src, pose, preset, layer) {
  const data = maskCache.get(src);
  if (!data) return null;
  const key = cacheKey("brake", src, pose, preset);
  let kit = geomCache.get(key);
  if (kit === undefined) {
    kit = buildBrakeKit(data, pose, preset);
    geomCache.set(key, kit);
  }
  if (!kit) return null;
  const group = new THREE.Group();
  const rotorPhoto = photoSkin(texture, preset, {
    metalness: 0.2,
    roughness: 0.38,
    alphaTest: 0.28,
    transparent: false,
    emissiveIntensity: 0.3,
    side: THREE.FrontSide,
  });
  const face = new THREE.Mesh(kit.face.clone(), rotorPhoto);
  const faceBack = new THREE.Mesh(kit.faceBack.clone(), rotorPhoto.clone());
  for (const mesh of [faceBack, face]) {
    mesh.position.set(kit.origin.x, kit.origin.y, 0);
    mesh.renderOrder = layer.z;
    group.add(mesh);
  }
  if (kit.caliperMask) {
    const calKey = cacheKey("inflate", src, pose, preset, "caliper-thin");
    let calKit = geomCache.get(calKey);
    if (!calKit) {
      calKit = buildInflateKit(
        data,
        pose,
        { ...preset, maxHalf: 0.007, zScale: 0.52, keepHoles: true },
        kit.caliperMask,
      );
      if (calKit) geomCache.set(calKey, calKit);
    }
    if (calKit) addInflateParts(group, calKit, texture, preset);
  }
  return tag(group, pose, layer);
}

export function warmupVolume(src, pose, type, role) {
  const preset = presetOf(type, role);
  const data = maskCache.get(src);
  if (!data) return;
  if (type === "wheels") {
    const key = cacheKey("wheel", src, pose, preset, role);
    if (!geomCache.has(key)) {
      const kit = buildWheelKit(data, pose, role);
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
  if (type === "brakes") {
    const key = cacheKey("brake", src, pose, preset);
    if (!geomCache.has(key)) {
      const kit = buildBrakeKit(data, pose, preset);
      geomCache.set(key, kit);
      if (kit) return;
    } else if (geomCache.get(key)) {
      return;
    }
  }
  const key = cacheKey("inflate", src, pose, preset, String(meshLimit(pose)));
  if (!geomCache.has(key)) {
    const kit = buildInflateKit(data, pose, preset);
    if (kit) geomCache.set(key, kit);
  }
}

export function partAnchor(src, pose, role) {
  const data = maskCache.get(src);
  if (!data) return null;
  if (role === "handlebar") return steererAnchor(data, pose);
  if (role === "saddle") return postAnchor(data, pose);
  return { x: 0, y: 0, tilt: 0 };
}

export function frameSockets(src, pose) {
  const data = maskCache.get(src);
  if (!data) return null;
  const { mask, width, height } = data;
  const head = topCentroid(mask, width, height, width * 0.7, 0, width, height * 0.45);
  const seat = topCentroid(mask, width, height, width * 0.16, 0, width * 0.52, height * 0.4);
  if (!head || !seat) return null;
  return {
    head: maskToLocal(head.x, head.y, width, height, pose),
    seat: maskToLocal(seat.x, seat.y, width, height, pose),
  };
}

export function createVolumeMesh({ texture, src, pose, type, role, layer }) {
  const preset = presetOf(type, role);
  prepareSolid(src, texture);
  if (type === "wheels") return wheelMesh(texture, src, pose, preset, layer) ?? planeFallback(texture, pose, preset, layer);
  if (type === "cassette") return cassetteMesh(texture, src, pose, preset, layer) ?? planeFallback(texture, pose, preset, layer);
  if (type === "brakes") {
    return (
      brakeMesh(texture, src, pose, preset, layer) ??
      inflateMesh(texture, src, pose, preset, layer) ??
      planeFallback(texture, pose, preset, layer)
    );
  }
  return inflateMesh(texture, src, pose, preset, layer) ?? planeFallback(texture, pose, preset, layer);
}

export function disposePartMesh(mesh) {
  mesh.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material && !Array.isArray(node.material)) node.material.dispose();
  });
}

export const __test = {
  fillSmallHoles,
  averageOpaqueColor,
  bandAverage,
  detectWheelBands,
  buildInflateKit,
  buildWheelKit,
  buildCassetteKit,
  buildAxleGeometry,
  buildBrakeKit,
  fitRotorCircle,
  extractCaliperMask,
  presetOf,
};
