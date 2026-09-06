# Архитектура

Ветка `feat/flame-wrap-complete`. Atelier Vélo — одностраничное приложение без фреймворка. Vite грузит `index.html` → `src/main.js`. Каталог деталей приходит JSON-ом, геометрия — плоские PNG-слои. Объёмных мешей (`solid.js`) и орбиты камеры (`view.js`) на этой ветке нет.

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
   │     ├─ PlaneGeometry + MeshBasicMaterial
   │     └─ createShadowFlame(...) flame-wrap.js
   ├─ applyStudioEnvironment()     studio.js
   └─ playPlace / playComplete     audio.js
```

На каждом кадре `main.js` вызывает `bike.tick(dt, time)`, ставит фиксированную камеру и рендерит сцену.

## Модули

| Файл | Ответственность | Публичный API |
| --- | --- | --- |
| `src/main.js` | WebGL-сцена, DOM-док, прогресс, пресеты URL, цикл анимации | `window.__atelier` |
| `src/assemble.js` | группы по типу, полёты in/out, фото-тень, активация пламени | `createAssembler`, `bboxToWorld`, `easeAssemble` |
| `src/flame-wrap.js` | раскладка плоскости, GLSL3-шейдер, reveal in/out | `createShadowFlame`, `shadowFlameLayout`, `easeReveal`, `FLAME_DEFAULTS` |
| `src/studio.js` | процедурная комната → PMREM, круглый пол | `applyStudioEnvironment` |
| `src/audio.js` | AudioContext, два синтетических сигнала | `unlockAudio`, `playPlace`, `playComplete` |
| `src/style.css` | оверлей: не перехватывает события, кроме дока и Reset | — |

`index.html` держит только разметку: `#stage`, блоки `[data-step]`, `[data-kicker]`, `[data-title]`, `[data-lede]`, `[data-types]`, `[data-options]`, `[data-rail]`, `[data-reset]`. Контент шагов живёт в `catalog.types`. DOM-оверлея `.flame-layer` нет: пламя рисуется в WebGL.

## Сцена Three.js

`main.js` создаёт:

- `WebGLRenderer` на `#stage`: antialias, `ACESFilmicToneMapping`, exposure `1.18`, clear `#d5cfc2`.
- `PerspectiveCamera(48, aspect, 0.1, 80)`.
- Три направленных света: key `(2.4, 3.8, 4.2)`, fill слева, rim сзади-сверху.
- Корень сборки `bike.root` — `THREE.Group`. `tick` слегка покачивает его, когда велосипед почти собран.

Студия добавляет environment-карту (`environmentIntensity = 1.42`) и пол на `y = -1.18`. Сами детали в комнату не ставятся: комната существует только как источник отражений. Плоские `MeshBasicMaterial` environment почти не используют — он нужен полу.

## Граф объектов сборки

```
bike.root                          Group
  ├─ <type>                        Group  userData.type = "frame" | "wheels" | …
  │    └─ mesh                     PlaneGeometry + MeshBasicMaterial
  │         userData.pose          { x, y, z, w, h }
  │         userData.layer         запись слоя из каталога
  ├─ shadow                        Group  появляется вместе с рамой
  │    └─ mesh                     фото-овал, opacity 0.55 → 0.4 под пламенем
  └─ shadow-flame-wrap             Group  createShadowFlame
       └─ shadow-flame             ShaderMaterial, renderOrder 2
```

Одновременно на сцене — не больше одной группы на тип. При замене `clearType` отправляет старую группу в `leaving` и запускает полёт «out». Поколение `gens[type]` отменяет отложенный stagger, если пользователь кликнул быстрее, чем долетели слои.

Flame Wrap создаётся один раз в `placeShadow()` (первая рама) и живёт на корне до конца сессии. `reset` только гасит его через `setActive(false)`, меш не уничтожается.

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
| `z` | на этом шаге 0, затем `layer.z * 0.0018` |
| `w`, `h` | доля холста × `worldW` / `worldH` |

Ось X направлена вперёд по велосипеду (руль справа на исходном фото), Y — вверх, Z — из экрана к зрителю. Отдельных плоскостей `MIDPLANE` / `JOIN` нет: глубина берётся из `layer.z` каталога.

На корне сборки `tick` задаёт смещение: на десктопе `x = 0.98`, чтобы силуэт стоял справа от текста; на мобиле (`innerWidth < 860`) `x = 0.04`. Когда собрано больше ~45 % типов, появляется лёгкое покачивание по Y и малый yaw/pitch.

## Разблокировка шагов

`unlockedTypes()` в `main.js`:

1. Первый тип (`frame`) всегда открыт.
2. Тип `i+1` открывается, только если выбран тип `i` и все предыдущие тоже выбраны.
3. Уже выбранные типы остаются кликабельными — их можно заменить.

Счётчик в шапке — `selected.size / types.length`. Рельс в футере отмечает пройденные шаги и текущий тип.

После выбора опции активным становится **следующий ещё не выбранный** тип. Когда все восемь типов заняты, текст переключается на финал: «Целая конструкция».

## Когда включается пламя

`tick` считает финал так:

```
complete = selected.size >= catalog.types.length
finale   = complete && flights.length === 0
shadowFlame.setActive(finale)
```

Пламя не стартует в момент клика по последней карточке — только когда последний слой долетел. Пока идёт замена детали, `flights.length > 0`, финал снимается и пламя гаснет, затем снова нарастает.

## Рендер-цикл

```
clock.getDelta()  →  dt ≤ 0.05
bike.tick(dt, time)
  полёты слоёв
  setActive(finale) → flame.tick
  fade фото-тени
  idle-motion корня
  если complete впервые → playComplete()
камера: фиксированные position + lookAt
renderer.render
```

`setAnimationLoop` крутится постоянно. Resize ставит `pixelRatio = min(devicePixelRatio, 2)` и пересчитывает aspect. Камера не сглаживается и не слушает указатель.

## Состояние сборки

Единственный источник правды — `Map` `assembler.selected`: `typeId → optionId`. UI перерисовывается целиком после каждого `select` / `reset`. Отдельного store нет.

Текстуры кэшируются в `Map` по URL на время жизни вкладки. Шейдер пламени создаётся один раз и переиспользуется.

## Адаптив

Брейкпоинт **860 px** повторяется в CSS, `assemble.tick` и кадре `main.js`:

- текст и док на всю ширину;
- опции — горизонтальный ряд;
- камера ближе и выше, велосипед по центру.
