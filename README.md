# Atelier Vélo — Aurum Manto

Интерактивный 3D-конфигуратор велосипеда Aurum Manto. Пользователь собирает велосипед по восьми шагам: рама, колёса, руль, седло, групсет, кассета, тормоза, флягодержатели. Каждая выбранная деталь вылетает в кадр и садится на своё место фиксации. Объём деталей строится из фотографий-силуэтов, а не из готовых CAD-моделей.

Репозиторий: [dorimar-cell/atelier-velo](https://github.com/dorimar-cell/atelier-velo).

npm-имя пакета: `atelier-velo` (v1.0.0). Текущая ветка разработки объёмной сборки: `feat/orbit-zoom-volume`.

## Возможности

- Пошаговая сборка: следующий тип детали открывается только после выбора предыдущего.
- Замена уже поставленной детали: старая улетает, новая прилетает на то же место.
- Орбита камеры: перетаскивание мышью или пальцем, колесо / щипок — масштаб.
- Объёмные меши из PNG-альфы: трубы «надуваются» по SDF, колёса и диски собираются как токарные тела.
- Студийный свет: PMREM-окружение из процедурной комнаты, нейтральный тон-маппинг.
- Звук клика при установке детали и аккорд по завершении сборки.
- Пресеты через URL (`?pick=...&snap`) для скриншотов и проверки.

## Стек

| Слой | Технология |
| --- | --- |
| Сборка и dev-сервер | Vite 6, ESM |
| Рендер | Three.js 0.170 |
| UI | ванильный HTML / CSS, шрифты Instrument Serif + Inter |
| Каталог деталей | `public/parts/catalog.json` |
| Нарезка исходных фото | Python (`scripts/process_parts.py`) |
| Визуальная проверка | Playwright-скрипты в `.shots/` (локальные, не в npm) |

Бэкенда нет: всё работает в браузере, детали отдаются как статика из `public/parts/`.

## Быстрый старт

Нужны Node.js 18+ и npm.

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173`. Сервер слушает все интерфейсы (`host: true`), порт задан в `vite.config.js`.

### Windows: шаги 2–5 одной командой

Сначала вручную поставьте [Git](https://git-scm.com/downloads) и [Node.js 18+](https://nodejs.org/). Остальное делает скрипт: клон (если нужно), ветка, `npm install`, Vite, браузер с пресетом.

На **новом ПК** в PowerShell:

```powershell
git clone https://github.com/dorimar-cell/atelier-velo.git
cd atelier-velo
git checkout feat/orbit-zoom-volume
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

Если папка проекта уже есть:

```powershell
.\scripts\setup-windows.cmd
```

или `npm run setup:win`. Флаги: `-NoDev` (только зависимости), `-NoBrowser`, `-RebuildParts` (нарезка фото, правит `ROOT` в `process_parts.py`).

Сборка и локальный просмотр продакшен-бандла:

```bash
npm run build
npm run preview
```

## Скрипты npm

| Команда | Действие |
| --- | --- |
| `npm run dev` | Vite dev-сервер на порту 5173 |
| `npm run build` | продакшен-сборка в `dist/` |
| `npm run preview` | превью собранного бандла |
| `npm run parts` | пересобрать PNG-слои и `catalog.json` из `aurumbikes_images/` |

`parts` требует Python 3 и пакеты `numpy`, `Pillow`, `scipy`. Скрипт **удаляет все существующие PNG** в `public/parts/` и пишет их заново.

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | модули, сцена, координаты, поток данных |
| [docs/catalog-and-pipeline.md](docs/catalog-and-pipeline.md) | схема каталога, роли слоёв, нарезка исходников |
| [docs/volume-and-assembly.md](docs/volume-and-assembly.md) | объёмные меши, анимация прилёта, камера, свет, звук |
| [docs/debug-and-verification.md](docs/debug-and-verification.md) | URL-пресеты, `window.__atelier`, скрипты проверки |

## Структура репозитория

```
index.html                 # оболочка UI, canvas #stage
vite.config.js             # порт 5173, host: true
package.json
src/
  main.js                  # сцена, UI, цикл рендера, пресеты
  assemble.js              # сборщик: позы, полёты, тень
  solid.js                 # объём из силуэта PNG
  view.js                  # орбита / зум
  studio.js                # комната, PMREM, пол
  audio.js                 # Web Audio клики
  style.css                # оверлей UI
public/parts/
  catalog.json             # типы, опции, bbox, пути к PNG
  *.png                    # слои и превью
scripts/process_parts.py   # нарезка исходных фото
aurumbikes_images/         # исходные PNG Aurum / Manto
.shots/                    # локальные скриншоты и verify-скрипты (gitignored)
```

## Как пользоваться

1. Слева сверху — бренд и счётчик шага `NN / 08`.
2. Заголовок и лид описывают текущий тип детали.
3. В доке — чипы типов и карточки вариантов с превью.
4. Клик по карточке запускает прилёт слоёв. Следующий тип становится активным автоматически.
5. Тяните холст, чтобы вращать велосипед. Колесо мыши или щипок меняют масштаб.
6. **Сбросить** убирает все детали и камеру в исходное положение.

На ширине меньше 860 px док и камера сдвигаются в центр: велосипед не уезжает под панель.

## Лицензия и ассеты

Код репозитория — частный проект (`"private": true`). Фотографии и названия деталей принадлежат Aurum / производителям комплектующих и используются как исходники конфигуратора.
