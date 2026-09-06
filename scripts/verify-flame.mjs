import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const shots = resolve("D:/developmentProjects/velo-assemble/.shots");
await mkdir(shots, { recursive: true });
const base = process.env.VELO_URL || "http://127.0.0.1:5175";
const full =
  `${base}/?pick=artik-white,scope-artech,manto-bar,nack-seat,sram-red,cass-xplr,brake-force,bottles-two&snap`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`page: ${err}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

async function state() {
  return page.evaluate(() => window.__atelier?.debugState?.() ?? null);
}

function nearly(a, b, eps = 1e-5) {
  return Math.abs(a - b) <= eps;
}

const failed = [];

await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(700);
const empty = await state();
if (!empty) failed.push("debugState missing on empty page");
if (empty?.hasDomOverlay) failed.push("DOM flame overlay should be gone");
if ((empty?.flameReveal ?? 1) > 0.01) failed.push("empty page should not show flame");
await page.screenshot({ path: `${shots}/flame-empty.png` });

await page.goto(full, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(400);
const early = await state();
await page.screenshot({ path: `${shots}/flame-early.png` });
await page.waitForTimeout(1000);
const mid = await state();
await page.screenshot({ path: `${shots}/flame-mid.png` });
await page.waitForTimeout(1600);
const done = await state();
await page.screenshot({ path: `${shots}/flame-full.png` });
await page.screenshot({
  path: `${shots}/flame-wheels.png`,
  clip: { x: 360, y: 420, width: 920, height: 320 },
});

if (!done?.complete) failed.push("preset should complete the bike");
if (done?.hasDomOverlay) failed.push("completed bike still has DOM overlay");
if ((done?.flameReveal ?? 0) < 0.95) failed.push(`flame reveal too low: ${done?.flameReveal}`);
if ((done?.shadowOpacity ?? 1) > 0.5) failed.push(`photo shadow should soften under flame: ${done?.shadowOpacity}`);
if ((done?.shadowOpacity ?? 0) < 0.2) failed.push(`photo oval should stay as the ground contact: ${done?.shadowOpacity}`);
if (!done?.flameVisible) failed.push("flame group should be visible when complete");
if ((early?.flameReveal ?? 1) >= (mid?.flameReveal ?? 0)) {
  failed.push("flame should grow from early to mid");
}

const samples = [];
for (let i = 0; i < 8; i += 1) {
  samples.push(await state());
  await page.waitForTimeout(50);
}
const locals = samples.map((item) => item?.flameLocal).filter(Boolean);
if (locals.length < 8) {
  failed.push("missing local flame poses for jitter check");
} else {
  const first = locals[0];
  const jittered = locals.some(
    (item) =>
      !nearly(item.x, first.x) || !nearly(item.y, first.y) || !nearly(item.z, first.z),
  );
  if (jittered) failed.push(`flame local pose jittered: ${JSON.stringify(locals)}`);
}

await page.locator("[data-reset]").click();
await page.waitForTimeout(1400);
const reset = await state();
await page.screenshot({ path: `${shots}/flame-reset.png` });
if ((reset?.flameReveal ?? 1) > 0.08) failed.push(`flame did not fade after reset: ${reset?.flameReveal}`);
if (reset?.complete) failed.push("reset should clear completion");

await browser.close();

const report = { errors, failed, empty, early, mid, done, reset };
console.log(JSON.stringify(report, null, 2));
if (errors.length || failed.length) {
  process.exitCode = 1;
}
