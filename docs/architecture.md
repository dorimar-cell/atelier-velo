# Архитектура

Atelier Vélo — одностраничное приложение без фреймворка. Vite грузит `index.html` → `src/main.js`. Каталог деталей приходит JSON-ом, геометрия строится в рантайме из PNG.

## Поток данных

```
aurumbikes_images/*.png
        │
        ▼  npm run parts  (Python)
public/parts/*.png + catalog.json
        │
        ▼  fetch("/parts/catalog.json")
src/main.js
   ├─ createAssembler(catalog)     assemble.js
   │     ├─ TextureLoader
   │     ├─ bbox → мировая поза
   │     └─ createVolumeMesh(...)  solid.js
   ├─ applyStudioEnvironment()     studio.js
   ├─ createObjectView()           view.js
   └─ playPlace / playComplete     audio.js
```

На каждом кадре `main.js` вызывает `bike.tick(dt, time)` и `view.apply(bike.root)`, затем `renderer.render(scene, camera)`.

## Модули

| Файл | Ответственность | Публичный API |
| --- | --- | --- |
| `src/main.js` | WebGL-сцена, DOM-док, прогресс, пресеты URL, цикл анимации | `window.__atelier` |
| `src/assemble.js` | группы по типу, полёты in/out, тень, мировая система | `createAssembler`, `bboxToWorld`, `easeAssemble` |
| `src/solid.js` | маска, SDF, inflate / wheel / cassette / brake | `createVolumeMesh`, `prepareSolid`, `warmupVolume` |
| `src/view.js` | yaw / pitch / zoom, pointer + wheel | `createObjectView` |
| `src/studio.js` | процедурная комната → PMREM, круглый пол | `applyStudioEnvironment` |
| `src/audio.js` | AudioContext, два синтетических сигнала | `unlockAudio`, `playPlace`, `playComplete` |
| `src/style.css` | оверлей: не перехватывает события, кроме дока и Reset | — |

`index.html` держит только разметку: `#stage`, блоки `[data-step]`, `[data-kicker]`, `[data-title]`, `[data-lede]`, `[data-types]`, `[data-options]`, `[data-rail]`, `[data-reset]`. Контент шагов живёт в `catalog.types`.

## Сцена Three.js

`main.js` создаёт:

- `WebGLRenderer` на `#stage`: antialias, `NeutralToneMapping`, exposure `1.02`, clear `#d5cfc2`.
- `PerspectiveCamera(48, aspect, 0.1, 80)`.
- `HemisphereLight(0xf4f4f3, 0xc5c3bf, 0.4)` и слабый `DirectionalLight` сверху-справа.
- Корень сборки `bike.root` — `THREE.Group`, который `tick` слегка покачивает, когда велосипед почти собран.

Студия добавляет environment-карту и пол на `y = -1.18`. Сами детали в комнату не ставятся: комната существует только как источник отражений.

## Граф объектов сборки

```
bike.root                          Group
  ├─ <type>                        Group  userData.type = "frame" | "wheels" | …
  │    └─ mesh / group             Mesh или Group слоёв опции
  │         userData.pose          { x, y, z, w, h }
  │         userData.layer         запись слоя из каталога
  │         userData.volume        true, если это объём, не плоскость
  └─ shadow                        Group  появляется вместе с рамой
```

Одновременно на сцене — не больше одной группы на тип. При замене `clearType` отправляет старую группу в `leaving` и запускает полёт «out». Поколение `gens[type]` отменяет отложенный stagger, если пользователь кликнул быстрее, чем долетели слои.

## Система координат

Исходные фото и каталог живут в пикселях холста **2048 × 1366**.

Мировая высота фиксирована: `worldH = 2.52`. Ширина пропорциональна холсту:

```
worldW = worldH * (catalog.canvas[0] / catalog.canvas[1])
```

`bboxToWorld([x, y, w, h], canvas, worldH)` переводит bbox слоя в центр и размер в мире:

| Поле | Формула |
| --- | --- |
| `x` | `((x + w/2) / canvasW − 0.5) * worldW` |
| `y` | `(0.5 − (y + h/2) / canvasH) * worldH` |
| `z` | 0 на этом шаге, затем плоскость роли |
| `w`, `h` | доля холста × `worldW` / `worldH` |

Ось X направлена вперёд по велосипеду (руль справа на исходном фото), Y — вверх, Z — из экрана к зрителю. Рама стоит на плоскости `FRAME_PLANE = 20 * 0.0024 = 0.048`.

На корне сборки `tick` задаёт смещение: на десктопе `x = 0.98`, чтобы силуэт стоял справа от текста; на мобиле (`innerWidth < 860`) `x = 0.04`. Когда собрано больше ~45 % типов, появляется лёгкое покачивание.

## Разблокировка шагов

`unlockedTypes()` в `main.js`:

1. Первый тип (`frame`) всегда открыт.
2. Тип `i+1` открывается, только если выбран тип `i` и все предыдущие тоже выбраны.
3. Уже выбранные типы остаются кликабельными — их можно заменить.

Счётчик в шапке — `selected.size / types.length`. Рельс в футере отмечает пройденные шаги и текущий тип.

После выбора опции активным становится **следующий ещё не выбранный** тип. Когда все восемь типов заняты, текст переключается на финал: «Целая конструкция».

## Рендер-цикл

```
clock.getDelta()  →  dt ≤ 0.05
bike.tick(dt, time)
  если complete впервые → playComplete()
view.update(dt)          // экспоненциальное сглаживание камеры
view.apply(bike.root)    // камера смотрит на цель, yaw/pitch добавляются к root
renderer.render
```

`setAnimationLoop` крутится постоянно. Resize ставит `pixelRatio = min(devicePixelRatio, 2)` и пересчитывает aspect.

## Состояние сборки

Единственный источник правды — `Map` `assembler.selected`: `typeId → optionId`. UI перерисовывается целиком после каждого `select` / `reset`. Отдельного store нет.

Текстуры кэшируются в `Map` по URL. Маски и геометрии — в модульных кэшах `solid.js` (`maskCache`, `geomCache`) на время жизни вкладки.

## Адаптив

Брейкпоинт **860 px** повторяется в CSS, `assemble.tick` и `view.framing`:

- текст и док на всю ширину;
- опции — горизонтальный ряд;
- камера ближе и выше, велосипед по центру.
