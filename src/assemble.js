import * as THREE from "three";
import { createVolumeMesh, disposePartMesh, prepareSolid } from "./solid.js";

const FROM = {
  frame: [-3.4, 0.55, 0.8],
  interior: [-3.1, 0.25, 0.6],
  rear: [-2.6, -2.3, 0.45],
  front: [2.8, -2.3, 0.45],
  handlebar: [1.1, 2.5, 0.55],
  saddle: [-1.6, 2.4, 0.4],
  drivetrain: [0.15, -2.5, 0.55],
  shifter: [2.4, 2.15, 0.5],
  cassette: [-2.7, -1.15, 0.35],
  seat: [-0.4, 2.2, 0.35],
  down: [0.55, 2.15, 0.35],
  shadow: [0, -0.4, 0],
};

function v(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

export function easeAssemble(t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  const base =
    clamped < 0.5
      ? 4 * clamped * clamped * clamped
      : 1 - (-2 * clamped + 2) ** 3 / 2;
  if (clamped <= 0.82) return base * 0.97;
  const k = (clamped - 0.82) / 0.18;
  return 0.97 + Math.sin(k * Math.PI) * 0.08 + k * 0.03;
}

export function bboxToWorld(bbox, canvas, worldH) {
  const [cw, ch] = canvas;
  const worldW = worldH * (cw / ch);
  const [x, y, w, h] = bbox;
  return {
    x: ((x + w / 2) / cw - 0.5) * worldW,
    y: (0.5 - (y + h / 2) / ch) * worldH,
    z: 0,
    w: (w / cw) * worldW,
    h: (h / ch) * worldH,
  };
}

function loadTexture(loader, src) {
  return new Promise((resolve, reject) => {
    loader.load(
      src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

export function createAssembler(catalog) {
  const loader = new THREE.TextureLoader();
  const worldH = 2.52;
  const worldW = worldH * (catalog.canvas[0] / catalog.canvas[1]);
  const root = new THREE.Group();
  const textures = new Map();
  const loading = new Map();
  const flights = [];
  const leaving = [];
  const selected = new Map();
  const groups = new Map();
  const gens = new Map();

  function textureOf(src) {
    if (textures.has(src)) return Promise.resolve(textures.get(src));
    if (!loading.has(src)) {
      loading.set(
        src,
        loadTexture(loader, src).then((texture) => {
          textures.set(src, texture);
          return texture;
        }),
      );
    }
    return loading.get(src);
  }

  async function ensureTextures(option) {
    const srcs = option.layers.map((layer) => layer.src);
    if (option.type === "frame" && catalog.shadow) {
      srcs.push(catalog.shadow.layers[0].src);
    }
    await Promise.all(srcs.map((src) => textureOf(src)));
    for (const src of srcs) {
      const texture = textures.get(src);
      if (texture) prepareSolid(src, texture);
    }
  }

  function worldOf(layer) {
    const pose = bboxToWorld(layer.bbox, catalog.canvas, worldH);
    pose.z = layer.z * 0.0024;
    return pose;
  }

  function makeMesh(layer, type) {
    const pose = worldOf(layer);
    if (type === "shadow" || layer.role === "shadow") {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pose.w, pose.h),
        new THREE.MeshBasicMaterial({
          map: textures.get(layer.src),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          alphaTest: 0,
        }),
      );
      mesh.renderOrder = layer.z;
      mesh.position.set(pose.x, pose.y, pose.z);
      mesh.userData.pose = pose;
      mesh.userData.layer = layer;
      return mesh;
    }

    return createVolumeMesh({
      texture: textures.get(layer.src),
      src: layer.src,
      pose,
      type,
      role: layer.role,
      layer,
    });
  }

  function spawnFrom(role, hint) {
    if (hint) return hint.clone();
    const p = FROM[role] ?? [-2.8, 1.2, 0.5];
    return v(p[0], p[1], p[2]);
  }

  function startFlight(mesh, from, mode) {
    const pose = mesh.userData.pose;
    const origin = from.clone();
    const to =
      mode === "in"
        ? v(pose.x, pose.y, pose.z)
        : origin.clone().add(v(origin.x >= 0 ? 2.1 : -2.1, 1.15, 0.45));
    mesh.visible = true;
    mesh.position.copy(origin);
    flights.push({
      mesh,
      mode,
      from: origin,
      to,
      fromRot: mode === "in" ? v(0.22, 0.55, -0.18) : v(0, 0, 0),
      toRot: mode === "in" ? v(0, 0, 0) : v(0.18, 0.7, -0.12),
      fromScale: mode === "in" ? 0.28 : 1,
      toScale: mode === "in" ? 1 : 0.22,
      t: 0,
      duration: mode === "in" ? 0.86 : 0.48,
    });
    mesh.scale.setScalar(mode === "in" ? 0.28 : 1);
  }

  function sweepLeaving() {
    for (let i = leaving.length - 1; i >= 0; i -= 1) {
      if (leaving[i].children.length === 0) {
        leaving[i].removeFromParent();
        leaving.splice(i, 1);
      }
    }
  }

  function clearType(type) {
    const group = groups.get(type);
    selected.delete(type);
    if (!group) return;
    for (const mesh of [...group.children]) {
      startFlight(mesh, mesh.position, "out");
    }
    leaving.push(group);
    groups.delete(type);
  }

  function placeOption(option, hint, stagger = 0.09, instant = false) {
    clearType(option.type);
    const gen = (gens.get(option.type) ?? 0) + 1;
    gens.set(option.type, gen);
    const group = new THREE.Group();
    group.userData.type = option.type;
    root.add(group);
    groups.set(option.type, group);
    selected.set(option.type, option.id);

    option.layers.forEach((layer, index) => {
      const mesh = makeMesh(layer, option.type);
      const pose = mesh.userData.pose;
      if (instant) {
        mesh.visible = true;
        mesh.position.set(pose.x, pose.y, pose.z);
        group.add(mesh);
        return;
      }
      mesh.visible = false;
      group.add(mesh);
      const from = spawnFrom(layer.role, hint);
      from.x += (index - (option.layers.length - 1) / 2) * 0.18;
      window.setTimeout(() => {
        if (gens.get(option.type) !== gen) return;
        startFlight(mesh, from, "in");
      }, index * stagger * 1000);
    });
  }

  function placeShadow() {
    if (!catalog.shadow || groups.has("shadow")) return;
    const option = catalog.shadow;
    const group = new THREE.Group();
    group.userData.type = "shadow";
    root.add(group);
    groups.set("shadow", group);
    for (const layer of option.layers) {
      const mesh = makeMesh(layer, "shadow");
      mesh.material.opacity = 0;
      mesh.material.alphaTest = 0;
      mesh.userData.fade = 0;
      group.add(mesh);
    }
  }

  async function select(option, hint, instant = false) {
    if (!option) return;
    await ensureTextures(option);
    placeOption(option, hint, 0.09, instant);
    if (option.type === "frame") placeShadow();
  }

  function preload() {
    const srcs = catalog.options.flatMap((option) => option.layers.map((layer) => layer.src));
    if (catalog.shadow) srcs.push(catalog.shadow.layers[0].src);
    srcs.forEach((src) => {
      textureOf(src).then((texture) => {
        const run = () => prepareSolid(src, texture);
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(run, { timeout: 1800 });
        } else {
          window.setTimeout(run, 0);
        }
      });
    });
  }

  function reset() {
    for (const type of [...groups.keys()]) {
      gens.set(type, (gens.get(type) ?? 0) + 1);
      clearType(type);
    }
  }

  function tick(dt, time) {
    for (let i = flights.length - 1; i >= 0; i -= 1) {
      const flight = flights[i];
      flight.t += dt;
      const raw = Math.min(flight.t / flight.duration, 1);
      const e = easeAssemble(raw);
      flight.mesh.position.lerpVectors(flight.from, flight.to, e);
      flight.mesh.rotation.set(
        THREE.MathUtils.lerp(flight.fromRot.x, flight.toRot.x, e),
        THREE.MathUtils.lerp(flight.fromRot.y, flight.toRot.y, e),
        THREE.MathUtils.lerp(flight.fromRot.z, flight.toRot.z, e),
      );
      const scale = THREE.MathUtils.lerp(flight.fromScale, flight.toScale, e);
      flight.mesh.scale.setScalar(scale);
      if (raw >= 1) {
        if (flight.mode === "out") {
          flight.mesh.removeFromParent();
          disposePartMesh(flight.mesh);
          sweepLeaving();
        } else {
          flight.mesh.position.copy(flight.to);
          flight.mesh.rotation.set(0, 0, 0);
          flight.mesh.scale.setScalar(1);
        }
        flights.splice(i, 1);
      }
    }

    const shadowGroup = groups.get("shadow");
    if (shadowGroup) {
      for (const mesh of shadowGroup.children) {
        mesh.userData.fade = Math.min((mesh.userData.fade ?? 0) + dt * 1.4, 1);
        mesh.material.opacity = mesh.userData.fade * 0.55;
      }
    }

    const built = selected.size / catalog.types.length;
    const float = THREE.MathUtils.smoothstep(built, 0.45, 1);
    const mobile = typeof window !== "undefined" && window.innerWidth < 860;
    root.position.x = mobile ? 0.04 : 0.98;
    root.position.y = (mobile ? 0.34 : 0.16) + Math.sin(time * 1.05) * 0.03 * float;
    root.rotation.y = -0.18 + Math.sin(time * 0.4) * 0.045 * float;
    root.rotation.x = Math.cos(time * 0.32) * 0.016 * float;

    return {
      flights: flights.length,
      selected,
      complete: selected.size >= catalog.types.length,
    };
  }

  function projectHint(camera, canvasEl, clientX, clientY) {
    const rect = canvasEl.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    root.updateWorldMatrix(true, false);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(root.matrixWorld);
    const point = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return root.worldToLocal(hit);
  }

  return {
    root,
    worldW,
    worldH,
    selected,
    select,
    preload,
    reset,
    tick,
    projectHint,
    optionById(id) {
      return catalog.options.find((item) => item.id === id) ?? null;
    },
  };
}
