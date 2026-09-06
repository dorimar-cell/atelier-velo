import * as THREE from "three";

// Studio environment adapted from Canvas UI ASCII Object (ascii: false).

const HIGHLIGHT = "#4d7cff";

const ROOM_BLOCKS = [
  { position: [-10.906, -1, 1.846], rotation: [0, -0.195, 0], scale: [2.328, 7.905, 4.651] },
  { position: [-5.607, -0.754, -0.758], rotation: [0, 0.994, 0], scale: [1.97, 1.534, 3.955] },
  { position: [6.167, -0.16, 7.803], rotation: [0, 0.561, 0], scale: [3.927, 6.285, 3.687] },
  { position: [-2.017, 0.018, 6.124], rotation: [0, 0.333, 0], scale: [2.002, 4.566, 2.064] },
  { position: [2.291, -0.756, -2.621], rotation: [0, -0.286, 0], scale: [1.546, 1.552, 1.496] },
  { position: [-2.193, -0.369, -5.547], rotation: [0, 0.516, 0], scale: [3.875, 3.487, 2.986] },
];

const ROOM_FORMERS = [
  { kind: "ring", intensity: 15, position: [2, 3, -2], scale: [10, 10, 10], lookAtCenter: true },
  { kind: "box", intensity: 80, position: [-14, 10, 8], scale: [0.1, 2.5, 2.5] },
  { kind: "box", intensity: 80, position: [-14, 14, -4], scale: [0.1, 2.5, 2.5], withLight: true },
  { kind: "box", intensity: 23, position: [14, 12, 0], scale: [0.1, 5, 5], withLight: true },
  { kind: "box", intensity: 16, position: [0, 9, 14], scale: [5, 5, 0.1], withLight: true },
  { kind: "box", intensity: 80, position: [7, 8, -14], scale: [2.5, 2.5, 0.1], withLight: true },
  { kind: "box", intensity: 80, position: [-7, 16, -14], scale: [2.5, 2.5, 0.1], withLight: true },
  { kind: "box", intensity: 1, position: [0, 20, 0], scale: [0.1, 0.1, 0.1], withLight: true },
  { kind: "box", intensity: 20, position: [0, 15, 0], scale: [10, 1, 10], withLight: true },
];

function buildRoom() {
  const roomScene = new THREE.Scene();
  const room = new THREE.Group();
  room.position.set(0, -0.5, 0);
  roomScene.add(room);

  for (const [x, z] of [
    [-15, 15],
    [15, 15],
    [15, -15],
    [-15, -15],
  ]) {
    const spot = new THREE.SpotLight(0xffffff, 2, 0, 0.2, 1, 0);
    spot.position.set(x, 20, z);
    room.add(spot, spot.target);
  }

  const center = new THREE.PointLight(0xffffff, 100, 28, 2);
  center.position.set(0.5, 14, 0.5);
  room.add(center);

  const box = new THREE.BoxGeometry();
  const shell = new THREE.Mesh(
    box,
    new THREE.MeshStandardMaterial({ color: "gray", side: THREE.BackSide }),
  );
  shell.position.set(0, 13.2, 0);
  shell.scale.set(31.5, 28.5, 31.5);
  room.add(shell);

  const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
  for (const def of ROOM_BLOCKS) {
    const mesh = new THREE.Mesh(box, white);
    mesh.position.set(...def.position);
    mesh.rotation.set(...def.rotation);
    mesh.scale.set(...def.scale);
    room.add(mesh);
  }

  for (const def of ROOM_FORMERS) {
    const geometry =
      def.kind === "ring" ? new THREE.RingGeometry(0.5, 1, 64) : new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    material.color
      .set(def.kind === "ring" ? HIGHLIGHT : "#ffffff")
      .multiplyScalar(def.intensity);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...def.position);
    mesh.scale.set(...def.scale);
    if (def.lookAtCenter) mesh.lookAt(0, 0, 0);
    room.add(mesh);
    if (def.withLight) {
      const light = new THREE.PointLight(0xffffff, 100, 28, 2);
      light.position.set(...def.position);
      room.add(light);
    }
  }

  return roomScene;
}

export function applyStudioEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomScene = buildRoom();
  const envTarget = pmrem.fromScene(roomScene, 0, 0.1, 1000);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1.05;
  scene.background = new THREE.Color("#08090d");

  return () => {
    envTarget.dispose();
    pmrem.dispose();
  };
}
