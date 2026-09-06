import assert from "node:assert/strict";
import { test } from "node:test";
import { bboxToWorld } from "./assemble.js";
import { easeReveal, shadowFlameLayout, FLAME_DEFAULTS } from "./flame-wrap.js";

const CANVAS = [2048, 1366];
const WORLD_H = 2.52;
const SHADOW_BBOX = [195, 1194, 1668, 80];

test("easeReveal starts closed and ends open", () => {
  assert.equal(easeReveal(0), 0);
  assert.equal(easeReveal(1), 1);
  assert.ok(easeReveal(0.2) < easeReveal(0.5));
  assert.ok(easeReveal(0.5) < easeReveal(0.8));
});

test("shadow pose is a wide strip under the bike", () => {
  const pose = bboxToWorld(SHADOW_BBOX, CANVAS, WORLD_H);
  assert.ok(pose.w > 2.5);
  assert.ok(pose.h < 0.25);
  assert.ok(pose.y < -0.8);
});

test("flame plane is larger than the photo shadow and stays centered on it", () => {
  const pose = bboxToWorld(SHADOW_BBOX, CANVAS, WORLD_H);
  pose.z = 0.0018;
  const layout = shadowFlameLayout(pose);
  assert.ok(layout.planeW > pose.w);
  assert.ok(layout.planeH > pose.h);
  assert.ok(layout.planeH - pose.h > FLAME_DEFAULTS.height / 180 / 2);
  const innerCenterY = layout.meshY + (layout.center.y / layout.res.y - 0.5) * layout.planeH;
  assert.ok(Math.abs(innerCenterY - pose.y) < 1e-6);
  assert.equal(layout.meshX, pose.x);
  assert.equal(layout.meshZ, pose.z);
});

test("layout is deterministic so the mesh cannot jitter in local space", () => {
  const pose = bboxToWorld(SHADOW_BBOX, CANVAS, WORLD_H);
  pose.z = 0.0018;
  const a = shadowFlameLayout(pose);
  const b = shadowFlameLayout(pose);
  assert.deepEqual(a, b);
});
