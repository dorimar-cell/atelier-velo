# Atelier Vélo — Aurum Manto

Интерактивный конфигуратор велосипеда Aurum Manto. Пользователь собирает велосипед по восьми шагам: рама, колёса, руль, седло, групсет, кассета, тормоза, флягодержатели. Каждая выбранная деталь вылетает в кадр и садится на своё место фиксации.

Детали — это нарезанные PNG-слои на плоскостях, а не CAD-модели и не объёмные меши. Когда все восемь типов на месте и полёты закончились, контактная тень остаётся овалом на полу, а над ней стабильно загорается **Flame Wrap** — шейдерное пламя в плоскости тени.

Репозиторий: [dorimar-cell/atelier-velo](https://github.com/dorimar-cell/atelier-velo).

npm-имя пакета: `atelier-velo` (v1.0.0). Эта документация описывает ветку **`feat/flame-wrap-complete`**.

## Возможности

- Пошаговая сборка: следующий тип детали открывается только после выбора предыдущего.
- Замена уже поставленной детали: старая улетает, новая прилетает на то же место.
- Студийный свет: PMREM-окружение из процедурной комнаты, ACES-тон-маппинг, три направленных лампы.
- Звук клика при установке детали и аккорд по завершении сборки.
- Финальный Flame Wrap: пламя нарастает ~2.2 с, после Reset гаснет ~0.75 с. Локальная поза меша не дрожит.
- Пресеты через URL (`?pick=...&snap`) для скриншотов и проверки.

Камера на этой ветке **фиксированная**: орбиты и зума нет. Велосипед слегка покачивается, когда собрано больше ~45 % типов.

## Стек

| Слой | Технология |
| --- | --- |
| Сборка и dev-сервер | Vite 6, ESM |
| Рендер | Three.js 0.170 |
| UI | ванильный HTML / CSS, шрифты Instrument Serif + Inter |
| Каталог деталей | `public/parts/catalog.json` |
| Нарезка исходных фото | Python (`scripts/process_parts.py`) |
| Юнит-тесты | Node.js `node:test` (`src/flame-wrap.test.mjs`) |
| Визуальная проверка пламени | Playwright (`scripts/verify-flame.mjs`) |

Бэкенда нет: всё работает в браузере, детали отдаются как статика из `public/parts/`.

## Быстрый старт

Нужны Node.js 18+ и npm.

```bash
npm install
npm run dev
```

Откройте `http://localhost:5173`. Сервер слушает все интерфейсы (`host: true`), порт задан в `vite.config.js`.

### Windows: шаги 2–5 одной командой

Сначала вручную поставьте [Git](https://git-scm.com/downloads) и [Node.js 18+](https://nodejs.org/). Остальное делает скрипт: клон (если нужно), ветка `feat/flame-wrap-complete`, `npm install`, Vite и браузер с snap-пресетом. Flame Wrap нарастает около 2.2 с после открытия.

На **новом ПК** в PowerShell:

```powershell
git clone https://github.com/dorimar-cell/atelier-velo.git
cd atelier-velo
git checkout feat/flame-wrap-complete
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
| `npm test` | юнит-тесты раскладки Flame Wrap |
| `npm run test:flame` | Playwright: пустая сцена → пресет → Reset |
| `npm run setup:win` | Windows: клон / ветка / `npm install` / Vite / пресет |

`parts` требует Python 3 и пакеты `numpy`, `Pillow`, `scipy`. Скрипт **удаляет все существующие PNG** в `public/parts/` и пишет их заново.

`test:flame` ждёт уже запущенный dev-сервер. По умолчанию URL — `http://127.0.0.1:5175`; переопределите переменной `VELO_URL`. Playwright в `package.json` не прописан — нужна локальная установка.

## Документация

| Документ | Содержание |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | модули, сцена, координаты, поток данных |
| [docs/catalog-and-pipeline.md](docs/catalog-and-pipeline.md) | схема каталога, роли слоёв, нарезка исходников |
| [docs/assembly-and-flame.md](docs/assembly-and-flame.md) | полёты деталей, тень, Flame Wrap, камера, свет, звук |
| [docs/debug-and-verification.md](docs/debug-and-verification.md) | URL-пресеты, `window.__atelier`, тесты |
| [canvases/setup-flame-wrap-complete.canvas.tsx](canvases/setup-flame-wrap-complete.canvas.tsx) | чеклист запуска на другом ПК |

## Структура репозитория

```
index.html                 # оболочка UI, canvas #stage
vite.config.js             # порт 5173, host: true
package.json
src/
  main.js                  # сцена, UI, цикл рендера, пресеты
  assemble.js              # сборщик: позы, полёты, тень, Flame Wrap
  flame-wrap.js            # шейдер пламени и раскладка плоскости
  flame-wrap.test.mjs      # юнит-тесты ease / layout
  studio.js                # комната, PMREM, пол
  audio.js                 # Web Audio клики
  style.css                # оверлей UI
public/parts/
  catalog.json             # типы, опции, bbox, пути к PNG
  *.png                    # слои и превью
scripts/
  process_parts.py         # нарезка исходных фото
  verify-flame.mjs         # Playwright-проверка финала
  setup-windows.ps1        # автоустановка Windows, шаги 2–5
  setup-windows.cmd        # обёртка с Bypass ExecutionPolicy
canvases/
  setup-flame-wrap-complete.canvas.tsx  # чеклист запуска на другом ПК
aurumbikes_images/         # исходные PNG Aurum / Manto
.shots/                    # скриншоты verify-скрипта (gitignored)
```

## Как пользоваться

1. Слева сверху — бренд и счётчик шага `NN / 08`.
2. Заголовок и лид описывают текущий тип детали.
3. В доке — чипы типов и карточки вариантов с превью.
4. Клик по карточке запускает прилёт слоёв. Следующий тип становится активным автоматически.
5. Когда все восемь типов стоят и анимация закончилась, под велосипедом загорается пламя.
6. **Сбросить** убирает детали и гасит Flame Wrap.

На ширине меньше 860 px док и текст на всю ширину, опции — горизонтальный ряд, велосипед ближе к центру.

## Лицензия и ассеты

Код репозитория — частный проект (`"private": true`). Фотографии и названия деталей принадлежат Aurum / производителям комплектующих и используются как исходники конфигуратора.
