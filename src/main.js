import * as THREE from "three";
import { applyStudioEnvironment } from "./studio.js";
import { createAssembler } from "./assemble.js";
import { playComplete, playPlace, unlockAudio } from "./audio.js";

const canvas = document.querySelector("#stage");
const typesEl = document.querySelector("[data-types]");
const optionsEl = document.querySelector("[data-options]");
const stepEl = document.querySelector("[data-step]");
const railEl = document.querySelector("[data-rail]");
const resetEl = document.querySelector("[data-reset]");
const kickerEl = document.querySelector("[data-kicker]");
const titleEl = document.querySelector("[data-title]");
const ledeEl = document.querySelector("[data-lede]");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.setClearColor(0xd5cfc2, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 80);
const look = new THREE.Vector3();

applyStudioEnvironment(renderer, scene);

const key = new THREE.DirectionalLight(0xfff4e2, 1.15);
key.position.set(2.4, 3.8, 4.2);
scene.add(key);

const fill = new THREE.DirectionalLight(0xf3efe6, 0.55);
fill.position.set(-2.6, 2.2, 2.4);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffffff, 0.35);
rim.position.set(-1.2, 4.2, -3.2);
scene.add(rim);

const FINALE = {
  kicker: "Готово",
  title: "Целая конструкция",
  lede: "Любую деталь можно заменить — новая прилетит на то же место фиксации.",
};

const catalog = await fetch("/parts/catalog.json").then((res) => res.json());
const bike = createAssembler(catalog);
bike.preload();
scene.add(bike.root);

let activeType = catalog.types[0].id;
let lastComplete = false;
const clock = new THREE.Clock();

for (let i = 0; i < catalog.types.length; i += 1) {
  railEl.appendChild(document.createElement("i"));
}

const railMarks = [...railEl.children];

function unlockedTypes() {
  const open = new Set([catalog.types[0].id]);
  for (let i = 0; i < catalog.types.length - 1; i += 1) {
    if (bike.selected.has(catalog.types[i].id)) open.add(catalog.types[i + 1].id);
    else break;
  }
  for (const id of bike.selected.keys()) open.add(id);
  return open;
}

function setStory(typeId) {
  if (bike.selected.size >= catalog.types.length) {
    kickerEl.textContent = FINALE.kicker;
    titleEl.textContent = FINALE.title;
    ledeEl.textContent = FINALE.lede;
    return;
  }
  const type = catalog.types.find((item) => item.id === typeId) ?? catalog.types[0];
  kickerEl.textContent = type.kicker;
  titleEl.textContent = type.title;
  ledeEl.textContent = type.lede;
}

function renderTypes() {
  const open = unlockedTypes();
  typesEl.innerHTML = "";
  for (const type of catalog.types) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "type";
    btn.dataset.id = type.id;
    btn.disabled = !open.has(type.id);
    btn.classList.toggle("is-active", type.id === activeType);
    btn.classList.toggle("is-done", bike.selected.has(type.id));
    btn.innerHTML = `<span>${type.kicker.slice(0, 2)}</span>${type.title}`;
    btn.addEventListener("click", () => {
      activeType = type.id;
      setStory(type.id);
      renderTypes();
      renderOptions();
    });
    typesEl.appendChild(btn);
  }
}

function renderOptions() {
  const items = catalog.options.filter((item) => item.type === activeType);
  optionsEl.innerHTML = "";
  for (const option of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.classList.toggle("is-selected", bike.selected.get(activeType) === option.id);
    btn.innerHTML = `
      <img src="${option.thumb}" alt="" />
      <span>${option.name}</span>
    `;
    btn.addEventListener("click", async (event) => {
      if (bike.selected.get(option.type) === option.id) return;
      unlockAudio();
      btn.disabled = true;
      const hint = bike.projectHint(camera, canvas, event.clientX, event.clientY);
      await bike.select(option, hint);
      playPlace();
      const index = catalog.types.findIndex((item) => item.id === option.type);
      const next = catalog.types[index + 1];
      if (next && !bike.selected.has(next.id)) activeType = next.id;
      setStory(activeType);
      renderTypes();
      renderOptions();
      syncChrome();
    });
    optionsEl.appendChild(btn);
  }
}

function syncChrome() {
  const count = bike.selected.size;
  stepEl.textContent = `${String(count).padStart(2, "0")} / ${String(catalog.types.length).padStart(2, "0")}`;
  const currentIndex = catalog.types.findIndex((item) => item.id === activeType);
  railMarks.forEach((mark, i) => {
    mark.classList.toggle("is-done", i < count);
    mark.classList.toggle("is-current", i === currentIndex);
  });
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  const state = bike.tick(dt, time);

  if (state.complete && !lastComplete) {
    playComplete();
    setStory(activeType);
  }
  lastComplete = state.complete;

  const mobile = window.innerWidth < 860;
  camera.position.set(mobile ? 0.06 : 0.92, mobile ? 0.52 : 0.4, mobile ? 4.45 : 3.7);
  look.set(mobile ? 0.04 : 0.96, mobile ? 0.28 : 0.14, 0);
  camera.lookAt(look);
  renderer.render(scene, camera);
}

resetEl.addEventListener("click", () => {
  unlockAudio();
  bike.reset();
  activeType = catalog.types[0].id;
  lastComplete = false;
  setStory(activeType);
  renderTypes();
  renderOptions();
  syncChrome();
});

window.addEventListener("resize", resize);
window.addEventListener("pointerdown", unlockAudio, { once: false });

renderTypes();
renderOptions();
setStory(activeType);
syncChrome();
resize();
renderer.setAnimationLoop(frame);

const params = new URLSearchParams(location.search);
const preset = params.get("pick");
const instant = params.has("snap");
if (preset) {
  for (const id of preset.split(",").map((item) => item.trim()).filter(Boolean)) {
    const option = catalog.options.find((item) => item.id === id);
    if (option) {
      await bike.select(option, null, instant);
      const index = catalog.types.findIndex((item) => item.id === option.type);
      const next = catalog.types[index + 1];
      if (next) activeType = next.id;
    }
  }
  setStory(activeType);
  renderTypes();
  renderOptions();
  syncChrome();
}
