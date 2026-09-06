# Каталог и пайплайн нарезки

Каталог — единственный контракт между исходными фото и рантаймом. Его пишет `scripts/process_parts.py`, читает `src/main.js` и `src/assemble.js`.

## Схема `public/parts/catalog.json`

```json
{
  "canvas": [2048, 1366],
  "types": [ { "id", "kicker", "title", "lede" } ],
  "options": [ { "id", "type", "name", "layers": [...], "thumb" } ],
  "shadow": { "id": "shadow", "type": "shadow", "layers": [...], "thumb": null }
}
```

### Тип шага (`types[]`)

| Поле | Назначение |
| --- | --- |
| `id` | ключ шага и `option.type` |
| `kicker` | мелкий заголовок и первые два символа на чипе (`01`, `02`, …) |
| `title` | крупный заголовок |
| `lede` | пояснение под заголовком |

Порядок массива — порядок сборки и разблокировки.

### Опция (`options[]`)

| Поле | Назначение |
| --- | --- |
| `id` | стабильный идентификатор (`artik-white`, `sram-red`, …) |
| `type` | один из `types[].id` |
| `name` | подпись карточки |
| `thumb` | превью `/parts/<id>-thumb.png` |
| `layers[]` | один или несколько PNG-слоёв |

### Слой (`layers[]`)

| Поле | Назначение |
| --- | --- |
| `id` | `<option>-<role>` |
| `src` | путь от корня сайта, например `/parts/artik-white-frame.png` |
| `role` | семантическая роль: от неё зависят глубина, точка вылета и билдер меша |
| `z` | порядок отрисовки и запасная глубина `z * 0.0024`, если роли нет в `MIDPLANE` |
| `bbox` | `[x, y, width, height]` в пикселях холста 2048×1366 |

Тень — отдельный объект `catalog.shadow`, не входит в `options` и не занимает шаг сборки. Появляется вместе с первой рамой.

## Шаги и ассортимент

| # | `type` | Заголовок | Опции |
| --- | --- | --- | --- |
| 01 | `frame` | Рама | Artik White, Gris Veleta, Astur |
| 02 | `wheels` | Колёса | Scope Artech 4G, Scope R-Series 4G, Zipp 303 XPLR SW |
| 03 | `handlebar` | Руль | Manto carbon |
| 04 | `saddle` | Седло | Nack |
| 05 | `groupset` | Групсет | SRAM RED XPLR, SRAM Force XPLR, SRAM Rival, Campagnolo 1×13, Shimano GRX |
| 06 | `cassette` | Кассета | SRAM XPLR, SRAM RED XPLR, Campagnolo 1×13, Shimano GRX |
| 07 | `brakes` | Тормоза | SRAM Force, SRAM XPLR, Campagnolo, Shimano, SRAM RED XPLR |
| 08 | `bottles` | Флягодержатели | Два держателя, Один держатель |

24 выбираемые опции. Теоретически около 1800 комбинаций (3×3×1×1×5×4×5×2). Совместимость группсета с кассетой и тормозами **не проверяется** — любой набор допустим.

## Роли слоёв

| `role` | Где встречается | Слои типичной опции |
| --- | --- | --- |
| `frame` | рама, экстерьер | 1 |
| `interior` | покраска / карман рамы | 1 |
| `rear` | заднее колесо или задний тормоз | 1 |
| `front` | переднее колесо или передний тормоз | 1 |
| `handlebar` | руль | 1 |
| `saddle` | седло + штырь | 1 |
| `drivetrain` | шатуны / цепь / задний переключатель | 1 |
| `shifter` | манетка на руле | 1 |
| `cassette` | кассета | 1 |
| `seat` | держатель на подседельной трубе | 0–1 |
| `down` | держатель на нижней трубе | 1 |
| `shadow` | контактная тень | 1 |

Групсет всегда режется на `drivetrain` + `shifter`. Колёса и дисковые тормоза — `rear` + `front` (слева / справа на исходном фото). Два держателя — `seat` + `down`.

## Порядок по Z и плоскости

`assemble.js` кладёт роли на фиксированные плоскости, а не на «сырой» `layer.z`, чтобы руль и седло совпали с рамой.

`FRAME_PLANE = 0.048`.

| Роль | Плоскость `z` | Доп. сдвиг `JOIN` |
| --- | --- | --- |
| `frame` | 0.048 | — |
| `interior` | −0.042 | — |
| `handlebar` | 0.048 | `(0, −0.006, 0)` |
| `saddle` | 0.048 | `(0, −0.016, 0)` |
| `shifter` | 0.054 | `(−0.002, 0.002, 0.006)` |
| `seat` | 0.054 | `(0.002, 0.002, −0.002)` |
| `down` | 0.053 | `(−0.002, 0.002, 0)` |
| `drivetrain` | `z * 0.0024` | `(0.004, 0.010, −0.006)` |
| `cassette` | `z * 0.0024` | `(0, 0, −0.012)` |
| тормоза `rear` / `front` | −0.042 / −0.040 | — |

`alignMesh` ещё раз прижимает `handlebar` / `saddle` к `FRAME_PLANE` и `shifter` к `FRAME_PLANE + 0.006`.

Типичные `z` в каталоге (порядок отрисовки):

| z | Слой |
| --- | --- |
| 1 | тень |
| 8–9 | колёса rear / front |
| 16–17 | тормоза rear / front |
| 20–21 | рама / interior |
| 22 | кассета |
| 25–26 | держатели |
| 30 | drivetrain |
| 35 | седло |
| 40–41 | руль / манетка |

## Пайплайн `scripts/process_parts.py`

Скрипт читает RGBA-фото из `aurumbikes_images/`, вырезает связные компоненты и пишет кропы плюс `catalog.json`.

Жёстко прошитый корень: `D:\developmentProjects\velo-assemble`. При переносе репозитория путь нужно поменять.

### Зависимости Python

```
numpy
Pillow
scipy
```

Отдельного `requirements.txt` в репозитории нет.

### Что делает `main()`

1. Удаляет все `public/parts/*.png`.
2. Для каждой записи `SOURCES` открывает файл, чистит RGB у нулевой альфы.
3. Если `split` задан — ищет компоненты с площадью ≥ 1500 px и сортирует их.
4. Иначе кропает по альфе (`alpha_min`, по умолчанию 16; у тени — 1).
5. Пишет `<option>-<role>.png` и bbox с паддингом 8 px.
6. Первая порция слоёв опции даёт `<option>-thumb.png` по общему bbox.
7. Собирает JSON: `types` + `options` (без shadow) + `shadow`.

### Режимы `split`

| Значение | Сортировка компонент | Пример |
| --- | --- | --- |
| `False` | один кроп по альфе | рама, руль, седло, кассета |
| `"left-right"` | по центру X, слева → справа | колёса, тормоза, два держателя |
| `"low-high"` | по центру Y, снизу → сверху | групсет: сначала привод, затем манетка |

Если компонент меньше, чем ролей в `roles`, скрипт бросает `RuntimeError`.

### Соответствие исходник → опция

| Исходный файл | option | type | split |
| --- | --- | --- | --- |
| `AURUM-ARTIK-WHITE-EXTERIOR.png` | `artik-white` | frame / frame | нет |
| `AURUM-ARTIK-WHITE-INTERIOR.png` | `artik-white` | frame / interior | нет |
| `AURUM-GRIS-VELETA-EXTERIOR.png` | `gris-veleta` | frame / frame | нет |
| `AURUM-GRIS-VELETA-INTERIOR.png` | `gris-veleta` | frame / interior | нет |
| `CUADRO-ASTRUR-CON-PATILLA-AURUM.png` | `astur` | frame / frame | нет |
| `MANTO_int_col_astur.png` | `astur` | frame / interior | нет |
| `Scope-Artech-4G-manto.png` | `scope-artech` | wheels | left-right |
| `Scope-R-Series-R-4G-manto.png` | `scope-r4g` | wheels | left-right |
| `MANTO-303-XPLR-SW.png` | `zipp-303` | wheels | left-right |
| `MANTO_handlebar.png` | `manto-bar` | handlebar | нет |
| `MANTO_nack_seat.png` | `nack-seat` | saddle | нет |
| `GRUPO-SRAM-RED-XPLR-MANTO.png` | `sram-red` | groupset | low-high |
| `force-XPLR-2025-gravel.png` | `sram-force` | groupset | low-high |
| `MANTO-25-SRAM-RIVAL.png` | `sram-rival` | groupset | low-high |
| `GRUPO-CAMPAGNOLO-1X13-MANTO.png` | `campagnolo` | groupset | low-high |
| `MANTO_group_shimano_grx.png` | `shimano-grx` | groupset | low-high |
| `CASSETE-XPLR2025.png` | `cass-xplr` | cassette | нет |
| `MANTO_cassette_sram_red_xpl.png` | `cass-red` | cassette | нет |
| `cassette-CAMPAGNOLO-1X13-MANTO.png` | `cass-campa` | cassette | нет |
| `MANTO_cassette_shimano_grx.png` | `cass-grx` | cassette | нет |
| `DISCOS-FORCE.png` | `brake-force` | brakes | left-right |
| `DISCOS-XPLR2025.png` | `brake-xplr` | brakes | left-right |
| `FRENOS-DISCO-CAMPAGNOLO-1X13-MANTO.png` | `brake-campa` | brakes | left-right |
| `MANTO_brake_disc_shimano.png` | `brake-shimano` | brakes | left-right |
| `MANTO_brakes_sram_red_xpl.png` | `brake-red` | brakes | left-right |
| `MANTO_both_bottle_holder.png` | `bottles-two` | bottles | left-right |
| `MANTO_right_bottle_holder.png` | `bottles-one` | bottles | нет |
| `MANTO_shadow.png` | `shadow` | shadow | нет |

Исходники и нарезанные PNG **закоммичены**. Перезапуск пайплайна нужен только при новых фото или правке `SOURCES`.

## Как добавить деталь

1. Положите PNG с прозрачным фоном в `aurumbikes_images/`. Размер холста должен совпадать с 2048×1366, деталь — на своём месте относительно рамы.
2. Добавьте запись в `SOURCES` (`option`, `type`, `name`, `split` / `role` / `z`).
3. Если это новый шаг — добавьте объект в `TYPES` и обработайте роль в `assemble.js` (`MIDPLANE`, `FROM`, `JOIN`) и в `solid.js` (`TYPE_PRESET` / билдер).
4. Запустите `npm run parts`.
5. Проверьте карточку в доке и прилёт на место. Для готовой сборки удобен `?pick=...&snap`.

Менять `catalog.json` руками можно, но следующий `npm run parts` перезапишет файл.
