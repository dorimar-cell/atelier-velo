import * as THREE from "three";

const WHEEL_R = 0.56;
const REAR = new THREE.Vector3(-0.8, WHEEL_R, 0);
const FRONT = new THREE.Vector3(0.94, WHEEL_R, 0);
const BB = new THREE.Vector3(0.03, 0.4, 0);
const HEAD_LOW = new THREE.Vector3(0.72, 0.7, 0);
const HEAD_HIGH = new THREE.Vector3(0.64, 1.12, 0);
const SEAT_TOP = new THREE.Vector3(-0.18, 1.14, 0);
const SADDLE = new THREE.Vector3(-0.26, 1.32, 0);
const STEM_END = new THREE.Vector3(0.48, 1.2, 0);
const BAR = new THREE.Vector3(0.44, 1.2, 0);
const LIGHT_POS = new THREE.Vector3(0.78, 0.86, 0);
const BELL_POS = new THREE.Vector3(0.4, 1.28, 0.14);

const UP = new THREE.Vector3(0, 1, 0);

function v(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function addTube(parent, a, b, radius, material, segments = 14) {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, segments),
    material,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  parent.add(mesh);
  return mesh;
}

function makeMaterials() {
  return {
    frame: new THREE.MeshStandardMaterial({
      color: 0xcfc3ad,
      metalness: 0.72,
      roughness: 0.28,
    }),
    ink: new THREE.MeshStandardMaterial({
      color: 0x16181d,
      metalness: 0.55,
      roughness: 0.38,
    }),
    tire: new THREE.MeshStandardMaterial({
      color: 0x111214,
      metalness: 0.05,
      roughness: 0.78,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: 0xc9ced4,
      metalness: 0.88,
      roughness: 0.22,
    }),
    spoke: new THREE.MeshStandardMaterial({
      color: 0xd7dbe0,
      metalness: 0.9,
      roughness: 0.18,
    }),
    leather: new THREE.MeshStandardMaterial({
      color: 0x3b261c,
      metalness: 0.08,
      roughness: 0.62,
    }),
    grip: new THREE.MeshStandardMaterial({
      color: 0x2a241f,
      metalness: 0.12,
      roughness: 0.7,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xe4e7eb,
      metalness: 0.95,
      roughness: 0.12,
    }),
    lens: new THREE.MeshStandardMaterial({
      color: 0xffe4b0,
      emissive: 0xffc56a,
      emissiveIntensity: 0.2,
      metalness: 0.1,
      roughness: 0.2,
    }),
    led: new THREE.MeshStandardMaterial({
      color: 0x7ec2ff,
      emissive: 0x4da3ff,
      emissiveIntensity: 1.4,
      metalness: 0.15,
      roughness: 0.28,
    }),
    beam: new THREE.MeshBasicMaterial({
      color: 0xffe6b8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };
}

function createWheel(hub, materials) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  group.position.copy(hub);

  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R, 0.048, 14, 56),
    materials.tire,
  );
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R - 0.042, 0.016, 10, 56),
    materials.rim,
  );
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R - 0.078, 0.008, 8, 48),
    materials.chrome,
  );

  const hubMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 0.078, 18),
    materials.chrome,
  );
  hubMesh.rotation.x = Math.PI / 2;

  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.058, 0.058, 0.02, 18),
    materials.ink,
  );
  flange.rotation.x = Math.PI / 2;

  spin.add(tire, rim, inner, hubMesh, flange);

  const spokeGeo = new THREE.CylinderGeometry(0.004, 0.004, WHEEL_R - 0.1, 4);
  const spokeCount = 18;
  for (let i = 0; i < spokeCount; i += 1) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const spoke = new THREE.Mesh(spokeGeo, materials.spoke);
    const mid = (WHEEL_R - 0.1) * 0.5;
    spoke.position.set(
      Math.cos(angle) * mid,
      Math.sin(angle) * mid,
      i % 2 === 0 ? 0.01 : -0.01,
    );
    spoke.rotation.z = angle - Math.PI / 2;
    spin.add(spoke);
  }

  return { group, spin };
}

function createLedRing(hub, materials) {
  const group = new THREE.Group();
  group.position.copy(hub);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R + 0.012, 0.018, 10, 48),
    materials.led.clone(),
  );
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(WHEEL_R + 0.012, 0.034, 8, 40),
    new THREE.MeshBasicMaterial({
      color: 0x4da3ff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  group.add(ring, glow);
  return { group, material: ring.material, glow };
}

function createFrame(materials) {
  const group = new THREE.Group();
  const stayZ = 0.055;

  addTube(group, BB, HEAD_LOW, 0.034, materials.frame, 16);
  addTube(group, SEAT_TOP, HEAD_HIGH.clone().setY(1.1), 0.028, materials.frame, 16);
  addTube(group, BB, SEAT_TOP, 0.03, materials.frame, 16);
  addTube(group, HEAD_LOW, HEAD_HIGH, 0.034, materials.ink, 16);

  addTube(group, BB.clone().setZ(stayZ), REAR.clone().setZ(stayZ), 0.016, materials.ink);
  addTube(group, BB.clone().setZ(-stayZ), REAR.clone().setZ(-stayZ), 0.016, materials.ink);
  addTube(group, SEAT_TOP.clone().setZ(stayZ * 0.6), REAR.clone().setZ(stayZ), 0.015, materials.ink);
  addTube(group, SEAT_TOP.clone().setZ(-stayZ * 0.6), REAR.clone().setZ(-stayZ), 0.015, materials.ink);

  addTube(group, HEAD_LOW.clone().setZ(stayZ * 0.7), FRONT.clone().setZ(stayZ), 0.016, materials.ink);
  addTube(group, HEAD_LOW.clone().setZ(-stayZ * 0.7), FRONT.clone().setZ(-stayZ), 0.016, materials.ink);

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.07, 14), materials.ink);
  crown.position.copy(HEAD_LOW);
  crown.rotation.z = -0.28;
  group.add(crown);

  const bbShell = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.09, 16), materials.ink);
  bbShell.position.copy(BB);
  bbShell.rotation.x = Math.PI / 2;
  group.add(bbShell);

  return group;
}

function createHandlebars(materials) {
  const group = new THREE.Group();
  addTube(group, HEAD_HIGH, STEM_END, 0.018, materials.ink, 12);

  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.62, 14),
    materials.ink,
  );
  bar.position.copy(BAR);
  bar.rotation.x = Math.PI / 2;
  group.add(bar);

  for (const z of [0.26, -0.26]) {
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.019, 0.12, 12),
      materials.grip,
    );
    grip.position.set(BAR.x, BAR.y, z);
    grip.rotation.x = Math.PI / 2;
    group.add(grip);
  }

  const spacer = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.04, 14), materials.chrome);
  spacer.position.copy(HEAD_HIGH);
  group.add(spacer);
  return group;
}

function createCrank(materials) {
  const group = new THREE.Group();
  const axle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.16, 14),
    materials.chrome,
  );
  axle.position.copy(BB);
  axle.rotation.x = Math.PI / 2;
  group.add(axle);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.012, 8, 28),
    materials.chrome,
  );
  ring.position.copy(BB).setZ(0.055);
  group.add(ring);

  const spider = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.016, 8),
    materials.ink,
  );
  spider.position.copy(BB).setZ(0.055);
  spider.rotation.x = Math.PI / 2;
  group.add(spider);

  const armGeo = new THREE.BoxGeometry(0.028, 0.2, 0.014);
  const left = new THREE.Mesh(armGeo, materials.ink);
  left.position.set(BB.x + 0.01, BB.y - 0.08, 0.075);
  left.rotation.z = 0.28;
  const right = new THREE.Mesh(armGeo, materials.ink);
  right.position.set(BB.x - 0.01, BB.y + 0.08, -0.075);
  right.rotation.z = 0.28;
  group.add(left, right);

  group.userData.pedalAnchors = [
    v(BB.x + 0.07, BB.y - 0.175, 0.09),
    v(BB.x - 0.07, BB.y + 0.175, -0.09),
  ];
  return group;
}

function createPedals(materials) {
  const group = new THREE.Group();
  const anchors = [
    v(BB.x + 0.07, BB.y - 0.175, 0.09),
    v(BB.x - 0.07, BB.y + 0.175, -0.09),
  ];
  for (const pos of anchors) {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.055), materials.grip);
    pedal.position.copy(pos);
    group.add(pedal);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), materials.chrome);
    bolt.position.copy(pos);
    bolt.rotation.x = Math.PI / 2;
    group.add(bolt);
  }
  return group;
}

function createSaddle(materials) {
  const group = new THREE.Group();
  addTube(group, SEAT_TOP, SADDLE, 0.016, materials.ink, 10);

  const deck = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 12), materials.leather);
  deck.position.copy(SADDLE);
  deck.scale.set(1.85, 0.38, 1.05);
  group.add(deck);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), materials.leather);
  nose.position.copy(SADDLE).add(v(0.11, -0.012, 0));
  nose.scale.set(1.5, 0.34, 0.62);
  group.add(nose);

  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.006, 6, 16, Math.PI), materials.chrome);
  rail.position.copy(SADDLE).setY(SADDLE.y - 0.04);
  rail.rotation.x = Math.PI / 2;
  group.add(rail);
  return group;
}

function createHeadlight(materials) {
  const group = new THREE.Group();
  group.position.copy(LIGHT_POS);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 14), materials.ink);
  body.scale.set(1.15, 0.85, 0.85);
  group.add(body);

  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 22), materials.lens);
  lens.position.set(0.05, 0, 0);
  lens.rotation.y = Math.PI / 2;
  group.add(lens);

  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.35, 24, 1, true), materials.beam);
  beam.position.set(0.78, 0, 0);
  beam.rotation.z = -Math.PI / 2;
  group.add(beam);

  const light = new THREE.PointLight(0xffd7a0, 0, 3.4, 1.6);
  light.position.set(0.12, 0, 0);
  group.add(light);

  group.userData.lens = materials.lens;
  group.userData.beam = materials.beam;
  group.userData.light = light;
  return group;
}

function createBell(materials) {
  const group = new THREE.Group();
  group.position.copy(BELL_POS);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    materials.chrome,
  );
  group.add(dome);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 20), materials.chrome);
  group.add(lip);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.012, 10), materials.ink);
  cap.position.y = 0.03;
  group.add(cap);

  const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14), materials.ink);
  clamp.position.set(0, -0.02, 0);
  clamp.rotation.x = Math.PI / 2;
  group.add(clamp);
  return group;
}

function partDef({ id, title, kicker, lede, group, from, fromRot, start, end, onUpdate }) {
  return {
    id,
    title,
    kicker,
    lede,
    group,
    from: from.clone(),
    to: group.position.clone(),
    fromRot: fromRot.clone(),
    toRot: group.rotation.clone(),
    start,
    end,
    onUpdate,
  };
}

export const CHAPTERS = [
  {
    id: "intro",
    kicker: "Ателье",
    title: "Велосипед собирается на ваших глазах",
    lede: "Прокрутите страницу. Каждая деталь прилетает из-за края кадра и фиксируется на своём месте.",
  },
  {
    id: "frame",
    kicker: "01 — Основа",
    title: "Рама",
    lede: "Алмазная геометрия и вилка. С этого силуэта начинается вся машина.",
  },
  {
    id: "bars",
    kicker: "02 — Управление",
    title: "Руль",
    lede: "Вынос, перекладина и грипсы садятся на рулевую колонку.",
  },
  {
    id: "rear",
    kicker: "03 — Опора",
    title: "Заднее колесо",
    lede: "Втулка входит в дропауты. Колесо набирает ход ещё в полёте.",
  },
  {
    id: "front",
    kicker: "04 — Направление",
    title: "Переднее колесо",
    lede: "Вилка принимает обод. Конструкция уже стоит на двух точках.",
  },
  {
    id: "crank",
    kicker: "05 — Привод",
    title: "Ось педалей",
    lede: "Каретка, звезда и шатуны встают в сердце рамы.",
  },
  {
    id: "pedals",
    kicker: "06 — Шаг",
    title: "Педали",
    lede: "Платформы налетают на шатуны и запираются на оси.",
  },
  {
    id: "saddle",
    kicker: "07 — Посадка",
    title: "Седло",
    lede: "Подседельный штырь и кожаная подушка — точка контакта с гонщиком.",
  },
  {
    id: "light",
    kicker: "08 — Дорога",
    title: "Фара",
    lede: "Корпус садится на корону вилки. Тёплый луч открывает путь.",
  },
  {
    id: "leds",
    kicker: "09 — Заметность",
    title: "Подсветка колёс",
    lede: "Светодиодные кольца обнимают обода и начинают пульсировать.",
  },
  {
    id: "bell",
    kicker: "10 — Сигнал",
    title: "Звонок",
    lede: "Колпачок прилетает на руль. Динь. Динь.",
  },
  {
    id: "finale",
    kicker: "Готово",
    title: "Целая конструкция",
    lede: "Прокрутите назад — и велосипед снова разлетится на детали.",
  },
];

export function createBicycle() {
  const materials = makeMaterials();
  const root = new THREE.Group();
  const parts = [];

  const frame = createFrame(materials);
  const bars = createHandlebars(materials);
  const rear = createWheel(REAR, materials);
  const front = createWheel(FRONT, materials);
  const crank = createCrank(materials);
  const pedals = createPedals(materials);
  const saddle = createSaddle(materials);
  const light = createHeadlight(materials);
  const ledRear = createLedRing(REAR, materials);
  const ledFront = createLedRing(FRONT, materials);
  const leds = new THREE.Group();
  leds.add(ledRear.group, ledFront.group);
  const bell = createBell(materials);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 1.15),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.08, 0.01, 0);
  root.add(shadow);

  const beats = [
    partDef({
      id: "frame",
      group: frame,
      from: v(-7.4, 1.6, -1.2),
      fromRot: v(0.35, 0.8, -0.25),
      start: 0.05,
      end: 0.13,
    }),
    partDef({
      id: "bars",
      group: bars,
      from: v(0.8, 6.2, 1.4),
      fromRot: v(0.9, 0.2, 0.4),
      start: 0.14,
      end: 0.22,
    }),
    partDef({
      id: "rear",
      group: rear.group,
      from: v(-6.8, -4.2, 1.1),
      fromRot: v(0.6, 0, 0),
      start: 0.23,
      end: 0.31,
      onUpdate: (t, e, time) => {
        rear.spin.rotation.z = time * (2.8 * (1 - e) + 0.32 * e);
      },
    }),
    partDef({
      id: "front",
      group: front.group,
      from: v(7.2, -4.4, 0.8),
      fromRot: v(-0.5, 0, 0),
      start: 0.32,
      end: 0.4,
      onUpdate: (t, e, time) => {
        front.spin.rotation.z = time * (2.8 * (1 - e) + 0.32 * e);
      },
    }),
    partDef({
      id: "crank",
      group: crank,
      from: v(0.2, 0.4, 6.4),
      fromRot: v(1.2, 0.6, 0.3),
      start: 0.41,
      end: 0.49,
    }),
    partDef({
      id: "pedals",
      group: pedals,
      from: v(-1.2, -5.6, 2.2),
      fromRot: v(0.4, 1.1, 0.8),
      start: 0.5,
      end: 0.58,
    }),
    partDef({
      id: "saddle",
      group: saddle,
      from: v(-2.2, 6.4, -0.6),
      fromRot: v(0.2, 0.7, -0.5),
      start: 0.59,
      end: 0.67,
    }),
    partDef({
      id: "light",
      group: light,
      from: v(7.6, 1.4, 0.2),
      fromRot: v(0, 1.4, 0.2),
      start: 0.68,
      end: 0.76,
    }),
    partDef({
      id: "leds",
      group: leds,
      from: v(0, 0, 0),
      fromRot: v(0, 0, 0),
      start: 0.77,
      end: 0.85,
      onUpdate: (t, e) => {
        ledRear.group.position.lerpVectors(v(-7.2, WHEEL_R, 0), REAR, e);
        ledFront.group.position.lerpVectors(v(7.4, WHEEL_R, 0), FRONT, e);
        const pulse = 0.45 + e * 1.6;
        ledRear.material.emissiveIntensity = pulse;
        ledFront.material.emissiveIntensity = pulse;
        ledRear.glow.material.opacity = 0.08 + e * 0.28;
        ledFront.glow.material.opacity = 0.08 + e * 0.28;
      },
    }),
    partDef({
      id: "bell",
      group: bell,
      from: v(3.8, 6.6, 2.4),
      fromRot: v(1.1, 2.2, 0.6),
      start: 0.86,
      end: 0.94,
    }),
  ];

  for (const part of beats) {
    part.group.position.copy(part.from);
    part.group.rotation.set(part.fromRot.x, part.fromRot.y, part.fromRot.z);
    part.group.visible = false;
    root.add(part.group);
    parts.push(part);
  }

  root.position.x = 0.58;
  root.rotation.y = -0.42;

  return {
    root,
    parts,
    materials,
    shadow,
    light,
    leds: { rear: ledRear, front: ledFront },
    bell,
  };
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

export function partProgress(scroll, part) {
  return (scroll - part.start) / (part.end - part.start);
}

export function applyBicycle(bike, scroll, time) {
  let assembled = 0;

  for (const part of bike.parts) {
    const raw = partProgress(scroll, part);
    const t = Math.min(Math.max(raw, 0), 1);
    const e = easeAssemble(t);
    part.group.position.lerpVectors(part.from, part.to, e);
    part.group.rotation.set(
      THREE.MathUtils.lerp(part.fromRot.x, part.toRot.x, e),
      THREE.MathUtils.lerp(part.fromRot.y, part.toRot.y, e),
      THREE.MathUtils.lerp(part.fromRot.z, part.toRot.z, e),
    );
    part.group.visible = t > 0.002;
    part.onUpdate?.(t, e, time);
    assembled += t;
  }

  const amount = assembled / bike.parts.length;
  bike.shadow.material.opacity = amount * 0.32;

  const lightT = Math.min(Math.max(partProgress(scroll, bike.parts.find((p) => p.id === "light")), 0), 1);
  const lightE = easeAssemble(lightT);
  bike.light.userData.lens.emissiveIntensity = 0.2 + lightE * (1.8 + Math.sin(time * 2.2) * 0.25);
  bike.light.userData.beam.opacity = lightE * 0.085;
  bike.light.userData.light.intensity = lightE * 2.4;

  const ledT = Math.min(Math.max(partProgress(scroll, bike.parts.find((p) => p.id === "leds")), 0), 1);
  if (ledT > 0.98) {
    const pulse = 1.7 + Math.sin(time * 5.2) * 0.85;
    bike.leds.rear.material.emissiveIntensity = pulse;
    bike.leds.front.material.emissiveIntensity = pulse;
    bike.leds.rear.glow.material.opacity = 0.16 + Math.sin(time * 5.2) * 0.1;
    bike.leds.front.glow.material.opacity = 0.16 + Math.sin(time * 5.2) * 0.1;
  }

  const float = THREE.MathUtils.smoothstep(scroll, 0.72, 1);
  const mobile = typeof window !== "undefined" && window.innerWidth < 760;
  bike.root.position.x = mobile ? 0.08 : 0.58;
  bike.root.position.y = Math.sin(time * 1.15) * 0.045 * float;
  bike.root.rotation.y = -0.42 + Math.sin(time * 0.45) * 0.06 * float;
  bike.root.rotation.x = Math.cos(time * 0.35) * 0.02 * float;

  return {
    amount,
    bell: Math.min(Math.max(partProgress(scroll, bike.parts.find((p) => p.id === "bell")), 0), 1),
  };
}

export function chapterForScroll(scroll) {
  if (scroll < 0.045) return CHAPTERS[0];
  if (scroll >= 0.955) return CHAPTERS[CHAPTERS.length - 1];
  const built = CHAPTERS.slice(1, -1);
  let current = built[0];
  for (const chapter of built) {
    const part = { frame: 0.05, bars: 0.14, rear: 0.23, front: 0.32, crank: 0.41, pedals: 0.5, saddle: 0.59, light: 0.68, leds: 0.77, bell: 0.86 }[chapter.id];
    if (scroll >= part) current = chapter;
  }
  return current;
}
