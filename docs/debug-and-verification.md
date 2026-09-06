# Отладка и проверка

Документ для ветки `feat/flame-wrap-complete`. Главный объект проверки — финальный Flame Wrap: нет DOM-оверлея, пламя нарастает, локальная поза не дрожит, после Reset гаснет.

## URL-параметры

Разбор в конце `src/main.js`.

| Параметр | Пример | Поведение |
| --- | --- | --- |
| `pick` | `?pick=artik-white,scope-artech,manto-bar` | последовательно вызывает `bike.select(option)` для каждого id |
| `snap` | `&snap` | ставит детали мгновенно, без полёта |

Неизвестный id молча пропускается. После пресета UI и активный тип синхронизируются: активным становится тип **следующий после последней успешно выбранной** опции.

Полная белая сборка (тот же пресет, что в `scripts/verify-flame.mjs`):

```
http://127.0.0.1:5173/?pick=artik-white,scope-artech,manto-bar,nack-seat,sram-red,cass-xplr,brake-force,bottles-two&snap
```

Тёмная:

```
http://127.0.0.1:5173/?pick=gris-veleta,zipp-303,manto-bar,nack-seat,sram-red,cass-red,brake-xplr,bottles-two&snap
```

Astur / RED:

```
http://127.0.0.1:5173/?pick=astur,scope-r4g,manto-bar,nack-seat,sram-red,cass-red,brake-red,bottles-one&snap
```

С `snap` слои стоят сразу, но Flame Wrap всё равно нарастает 2.2 с: `instant` не пропускает `tick` пламени.

## `window.__atelier`

Доступно в консоли после загрузки модуля.

### `debugState()`

Делегирует в `bike.debugState()`:

```ts
{
  complete: boolean,       // selected.size >= 8
  flights: number,         // активные полёты in/out
  flameReveal: number,     // easeReveal(reveal), 0…1
  flameLocal: {            // локальная поза меша shadow-flame
    x: number, y: number, z: number
  } | null,
  flameVisible: boolean,   // group.visible
  shadowOpacity: number,   // opacity фото-овала, 0 если тени нет
  hasDomOverlay: boolean   // !!document.querySelector(".flame-layer")
}
```

`flameLocal` появляется после первой рамы (создание Flame Wrap). До этого — `null`. На пустой странице `flameReveal` должен быть 0, `hasDomOverlay` — false.

Отдельного `setView` нет: камера фиксированная.

## Юнит-тесты

```bash
npm test
```

`src/flame-wrap.test.mjs` импортирует `bboxToWorld` и раскладку пламени. Three.js для этих тестов не нужен.

| Тест | Что фиксирует |
| --- | --- |
| `easeReveal starts closed and ends open` | 0 → 1, монотонный smoothstep |
| `shadow pose is a wide strip under the bike` | bbox `[195, 1194, 1668, 80]` даёт `w > 2.5`, `h < 0.25`, `y < -0.8` |
| `flame plane is larger than the photo shadow…` | плоскость шире и выше овала, внутренний центр совпадает с `pose` |
| `layout is deterministic…` | два вызова `shadowFlameLayout` дают одинаковый объект |

Константа холста в тесте: `2048×1366`, `worldH = 2.52` — как в сборщике.

## Playwright: `npm run test:flame`

Скрипт `scripts/verify-flame.mjs`. Ждёт уже запущенный сервер.

```bash
npm run dev
# в другом терминале:
set VELO_URL=http://127.0.0.1:5173
npm run test:flame
```

По умолчанию скрипт ходит на `http://127.0.0.1:5175`. Playwright **не** прописан в `package.json`; нужна локальная установка `playwright` / `chromium`. Скриншоты пишутся в `.shots/` (в git не входят).

Сценарий:

1. Пустая главная: есть `debugState`, нет `.flame-layer`, `flameReveal ≤ 0.01`. Снимок `flame-empty.png`.
2. Snap-пресет полной белой сборки. Снимки early / mid / full / clip колёс.
3. К концу: `complete`, нет DOM-оверлея, `flameReveal ≥ 0.95`, `flameVisible`, `0.2 < shadowOpacity ≤ 0.5`.
4. `flameReveal` растёт от early к mid.
5. Восемь выборок `flameLocal` с шагом 50 мс — координаты совпадают с точностью `1e-5`.
6. Клик Reset: через 1.4 с `flameReveal ≤ 0.08`, `complete === false`. Снимок `flame-reset.png`.

Падение — ненулевой exit code и JSON-отчёт в stdout (`errors`, `failed`, срезы state).

## Ручная проверка после изменений

1. Пустая сцена: только пол и студийный фон, док с одним активным типом «Рама». Пламени нет.
2. Выбор рамы: два слоя + появление овальной тени. Flame Wrap ещё скрыт.
3. Остальные семь типов. Пока летит последняя деталь — пламени нет.
4. После посадки последней детали пламя нарастает снизу, овал тени чуть бледнеет, но не пропадает.
5. Замена любой детали — пламя гаснет на время полёта, затем снова нарастает.
6. Reset гасит пламя быстрее, чем оно появляется; шаг `00 / 08`.
7. В DevTools нет узла `.flame-layer`.
8. Мобильная ширина < 860: велосипед по центру, опции скроллятся горизонтально. Пламя остаётся под силуэтом.

## Известные ограничения

- Нет серверной валидации совместимости группсета / кассеты / роторов.
- `process_parts.py` с абсолютным Windows-путём.
- Детали — плоскости: сбоку силуэт тонкий. Орбиты на этой ветке нет.
- `uHasContent` в шейдере выключен: пламя не выжигает фото-тень, а рисуется отдельным слоем над овалом.
- `verify-flame.mjs` захардкодил порт 5175 и путь `D:/developmentProjects/velo-assemble/.shots`.
- Геометрия Flame Wrap создаётся один раз по позе первой тени и не пересчитывается, если каталог тени сменить на лету.
