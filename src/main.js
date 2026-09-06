import * as THREE from "three";
import { applyStudioEnvironment } from "./studio.js";
import { CHAPTERS, applyBicycle, chapterForScroll, createBicycle } from "./bike.js";
import { syncBell, unlockAudio } from "./audio.js";

const canvas = document.querySelector("#stage");
const chaptersRoot = document.querySelector("[data-chapters]");
const stepEl = document.querySelector("[data-step]");
const railEl = document.querySelector("[data-rail]");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(0x08090d, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
const cameraFrom = new THREE.Vector3(0.55, 1.02, 5.2);
const cameraTo = new THREE.Vector3(1.85, 1.2, 3.45);
const lookFrom = new THREE.Vector3(0.5, 0.64, 0);
const lookTo = new THREE.Vector3(0.58, 0.72, 0);
const look = new THREE.Vector3();

applyStudioEnvironment(renderer, scene);

const bike = createBicycle();
scene.add(bike.root);

const fill = new THREE.DirectionalLight(0x9db6ff, 0.35);
fill.position.set(-2.2, 3.4, 2.8);
scene.add(fill);

CHAPTERS.forEach((chapter) => {
  const el = document.createElement("article");
  el.className = "chapter";
  el.dataset.id = chapter.id;
  el.innerHTML = `
    <p class="kicker">${chapter.kicker}</p>
    <h1>${chapter.title}</h1>
    <p class="lede">${chapter.lede}</p>
  `;
  chaptersRoot.appendChild(el);
});

for (let i = 0; i < 10; i += 1) {
  railEl.appendChild(document.createElement("i"));
}

const chapterEls = [...chaptersRoot.children];
const railMarks = [...railEl.children];
const partOrder = ["frame", "bars", "rear", "front", "crank", "pedals", "saddle", "light", "leds", "bell"];

let scroll = 0;
let scrollSmooth = 0;
let lastChapter = "";
let clock = new THREE.Clock();
let reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

const lockedProgress = Number.parseFloat(new URLSearchParams(location.search).get("p") ?? "");

function readScroll() {
  if (Number.isFinite(lockedProgress)) return Math.min(Math.max(lockedProgress, 0), 1);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max <= 0 ? 0 : window.scrollY / max;
}

function setChapter(chapter) {
  if (chapter.id === lastChapter) return;
  lastChapter = chapter.id;
  for (const el of chapterEls) {
    el.classList.toggle("is-active", el.dataset.id === chapter.id);
  }
  const index = partOrder.indexOf(chapter.id);
  if (chapter.id === "intro") stepEl.textContent = "00 / 10";
  else if (chapter.id === "finale") stepEl.textContent = "10 / 10";
  else stepEl.textContent = `${String(index + 1).padStart(2, "0")} / 10`;

  railMarks.forEach((mark, i) => {
    mark.classList.toggle("is-done", index > i || chapter.id === "finale");
    mark.classList.toggle("is-current", index === i);
  });
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  scroll = readScroll();
  if (Number.isFinite(lockedProgress) || reduced) scrollSmooth = scroll;
  else scrollSmooth += (scroll - scrollSmooth) * 0.08;

  const p = scrollSmooth;
  applyBicycle(bike, p, time);
  const rang = syncBell(p);
  if (rang) bike.bell.userData.punch = 1;
  if (bike.bell.userData.punch) {
    bike.bell.userData.punch = Math.max(0, bike.bell.userData.punch - dt * 2.4);
    const punch = Math.sin(bike.bell.userData.punch * Math.PI) * 0.18;
    bike.bell.scale.setScalar(1 + punch);
  }

  const camT = THREE.MathUtils.smoothstep(p, 0, 1);
  camera.position.lerpVectors(cameraFrom, cameraTo, camT);
  look.lerpVectors(lookFrom, lookTo, camT);
  if (window.innerWidth < 760) {
    camera.position.z += 1.15;
    camera.position.x *= 0.35;
  }
  camera.lookAt(look);

  setChapter(chapterForScroll(p));
  renderer.render(scene, camera);
}

window.addEventListener("resize", resize);
window.addEventListener("pointerdown", unlockAudio, { once: false });
window.addEventListener("wheel", unlockAudio, { passive: true });
window.addEventListener("touchstart", unlockAudio, { passive: true });
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
  reduced = event.matches;
});

resize();
setChapter(CHAPTERS[0]);
renderer.setAnimationLoop(frame);
