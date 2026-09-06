import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Link,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  TodoList,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";
import type { TodoItem, TodoStatus } from "cursor/canvas";

const REPO = "https://github.com/dorimar-cell/atelier-velo.git";
const BRANCH = "feat/orbit-zoom-volume";
const DEV_URL = "http://localhost:5173";

type Os = "windows" | "unix";
type Mode = "run" | "pipeline";

const STEPS_RUN: TodoItem[] = [
  { id: "tools", content: "Поставить Git и Node.js 18+", status: "pending" },
  { id: "get", content: "Склонировать репозиторий или скопировать папку проекта", status: "pending" },
  { id: "branch", content: "Переключиться на ветку feat/orbit-zoom-volume", status: "pending" },
  { id: "install", content: "Выполнить npm install в корне проекта", status: "pending" },
  { id: "dev", content: "Запустить npm run dev и открыть http://localhost:5173", status: "pending" },
  { id: "check", content: "Проверить сборку: рама → колёса → орбита камеры", status: "pending" },
];

const STEPS_PIPELINE: TodoItem[] = [
  { id: "py", content: "Поставить Python 3 и пакеты numpy, Pillow, scipy", status: "pending" },
  { id: "path", content: "Поправить ROOT в scripts/process_parts.py под новый путь", status: "pending" },
  { id: "parts", content: "Запустить npm run parts и убедиться, что catalog.json переписался", status: "pending" },
];

function StepMark({ n }: { n: number }) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        background: theme.accent.primary,
        color: theme.text.onAccent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 600,
        flexShrink: 0,
        marginTop: 1,
      }}
    >
      {n}
    </div>
  );
}

function CommandBlock({ title, lines }: { title: string; lines: string[] }) {
  const theme = useHostTheme();
  return (
    <Card>
      <CardHeader>{title}</CardHeader>
      <CardBody>
        <Stack gap={6}>
          {lines.map((line) => (
            <div
              key={line}
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                color: theme.text.primary,
                background: theme.fill.tertiary,
                padding: "6px 8px",
                borderRadius: 4,
              }}
            >
              {line}
            </div>
          ))}
        </Stack>
      </CardBody>
    </Card>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReturnType<typeof Text> | Array<ReturnType<typeof Text> | ReturnType<typeof CommandBlock> | ReturnType<typeof Callout>>;
}) {
  return (
    <Row gap={12} align="start">
      <StepMark n={n} />
      <Stack gap={8} style={{ minWidth: 0, flex: 1 }}>
        <H3>{title}</H3>
        {children}
      </Stack>
    </Row>
  );
}

export default function SetupOnAnotherPc() {
  const theme = useHostTheme();
  const [os, setOs] = useCanvasState<Os>("setup-os", "windows");
  const [mode, setMode] = useCanvasState<Mode>("setup-mode", "run");
  const [done, setDone] = useCanvasState<string[]>("setup-done", []);

  const py = os === "windows" ? "python" : "python3";
  const openHint =
    os === "windows"
      ? "В браузере откройте http://localhost:5173 — или просто кликните ссылку в терминале Vite."
      : "Vite напечатает Local: http://localhost:5173. Откройте её в браузере.";

  const todos: TodoItem[] = (mode === "run" ? STEPS_RUN : [...STEPS_RUN, ...STEPS_PIPELINE]).map(
    (item) => ({
      ...item,
      status: (done.includes(item.id) ? "completed" : "pending") as TodoStatus,
    }),
  );

  function toggleTodo(todo: TodoItem) {
    setDone((prev) =>
      prev.includes(todo.id) ? prev.filter((id) => id !== todo.id) : [...prev, todo.id],
    );
  }

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Запуск Atelier Vélo на другом ПК</H1>
        <Text tone="secondary">
          Шаг 1 — Git и Node.js — вручную. На Windows шаги 2–5 делает
          scripts/setup-windows.ps1: клон, ветка, npm install, Vite и пресет в
          браузере.
        </Text>
      </Stack>

      <Grid columns={4} gap={12}>
        <Stat value="18+" label="Node.js" />
        <Stat value="5173" label="Порт Vite" />
        <Stat value="2–5" label="Авто на Windows" />
        <Stat value="ps1" label="setup-windows" />
      </Grid>

      <Row gap={8} wrap>
        <Pill active={os === "windows"} onClick={() => setOs("windows")}>
          Windows
        </Pill>
        <Pill active={os === "unix"} onClick={() => setOs("unix")}>
          macOS / Linux
        </Pill>
        <Pill active={mode === "run"} onClick={() => setMode("run")}>
          Только запустить
        </Pill>
        <Pill active={mode === "pipeline"} onClick={() => setMode("pipeline")}>
          Ещё и пересобрать детали
        </Pill>
      </Row>

      <TodoListCardLike todos={todos} onTodoClick={toggleTodo} theme={theme} />

      {os === "windows" ? (
        <Stack gap={12}>
          <H2>Windows: одна команда после шага 1</H2>
          <Text>
            Скрипт сам проверяет Git и Node 18+, клонирует репозиторий если вы
            не внутри проекта, переключает ветку {BRANCH}, ставит зависимости,
            ждёт HTTP 200 на порту 5173 и открывает пресет. Запущенный Vite
            остаётся в этом окне — остановка Ctrl+C.
          </Text>
          <CommandBlock
            title="Новый ПК — клон, затем скрипт"
            lines={[
              `git clone ${REPO}`,
              "cd atelier-velo",
              `git checkout ${BRANCH}`,
              "powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\setup-windows.ps1",
            ]}
          />
          <CommandBlock
            title="Папка проекта уже есть"
            lines={[".\\scripts\\setup-windows.cmd", "npm run setup:win"]}
          />
          <Table
            headers={["Флаг", "Что делает"]}
            striped
            rows={[
              ["-NoDev", "Только клон / ветка / npm install, сервер не трогает"],
              ["-NoBrowser", "Поднимает Vite, браузер не открывает"],
              ["-RebuildParts", "Правит ROOT в process_parts.py, ставит pip-пакеты, npm run parts"],
              ["-TargetDir D:\\code\\velo", "Клон или готовая папка не в текущем каталоге"],
              ["-Port 5174", "Ждать другой порт, если 5173 занят вручную"],
            ]}
          />
          <Callout tone="info" title="Почему не шаг 1">
            Установщики Git и Node требуют согласия с лицензией и прав
            администратора. Скрипт только проверяет, что они уже в PATH, и
            выходит с понятной ошибкой, если нет.
          </Callout>
        </Stack>
      ) : (
        <Callout tone="neutral" title="Автоскрипт только для Windows">
          На macOS / Linux шаги 2–5 по-прежнему вручную: clone, checkout, npm
          install, npm run dev. Windows-скрипт: scripts/setup-windows.ps1.
        </Callout>
      )}

      <H2>Что поставить заранее</H2>
      <Table
        headers={["Инструмент", "Зачем", "Как проверить"]}
        striped
        rows={[
          ["Git", "Клонировать репозиторий", <Code>git --version</Code>],
          ["Node.js 18+", "Vite, Three.js, npm-скрипты", <Code>node -v</Code>],
          ["npm (идёт с Node)", "Установка зависимостей", <Code>npm -v</Code>],
          [
            mode === "pipeline" ? "Python 3" : "Python 3 — необязательно",
            "Только npm run parts",
            <Code>{py} --version</Code>,
          ],
          [
            "Доступ к GitHub",
            "Репозиторий dorimar-cell/atelier-velo",
            <Link href={REPO}>atelier-velo</Link>,
          ],
        ]}
      />

      <H2>Шаги</H2>

      <Stack gap={20}>
        <Step n={1} title="Поставьте Git и Node.js">
          <Text>
            Скачайте [Git](https://git-scm.com/downloads) и LTS Node.js с
            [nodejs.org](https://nodejs.org/) (18 или новее). После установки
            откройте новый терминал и проверьте версии.
          </Text>
          <CommandBlock
            title={os === "windows" ? "PowerShell" : "Терминал"}
            lines={["git --version", "node -v", "npm -v"]}
          />
        </Step>

        <Divider />

        <Step n={2} title="Получите код">
          <Text>
            Предпочтительный способ — клон с GitHub. Альтернатива: скопировать
            папку проекта целиком, но без <Code>node_modules</Code> и{" "}
            <Code>dist</Code>.
          </Text>
          <CommandBlock
            title="Клон и нужная ветка"
            lines={[
              `git clone ${REPO}`,
              "cd atelier-velo",
              `git checkout ${BRANCH}`,
            ]}
          />
          <Callout tone="info" title="Какую ветку брать">
            Объёмные детали, орбита и зум живут на {BRANCH}. Ветка main — более
            ранняя студийная страница без этой сборки.
          </Callout>
        </Step>

        <Divider />

        <Step n={3} title="Установите зависимости">
          <Text>
            В корне репозитория (рядом с <Code>package.json</Code>) выполните
            установку. Появятся <Code>node_modules</Code> и подтянутся{" "}
            <Code>three</Code> и <Code>vite</Code>.
          </Text>
          <CommandBlock title="Корень проекта" lines={["npm install"]} />
        </Step>

        <Divider />

        <Step n={4} title="Поднимите dev-сервер">
          <Text>{openHint}</Text>
          <CommandBlock title="Dev" lines={["npm run dev"]} />
          <Text tone="secondary" size="small">
            Сервер слушает все интерфейсы, порт 5173. Не останавливайте процесс,
            пока работаете с приложением. Сборка: <Code>npm run build</Code>,
            превью бандла: <Code>npm run preview</Code>.
          </Text>
          <Text>
            Открыть: <Link href={DEV_URL}>{DEV_URL}</Link>
          </Text>
        </Step>

        <Divider />

        <Step n={5} title="Проверьте, что сцена живая">
          <Text>
            Должны быть кремовый фон, док слева и пустой подиум. Выберите раму —
            она прилетает на место, появляется тень. Поставьте колёса. Тяните
            холст, чтобы повернуть; колесо мыши — масштаб.
          </Text>
          <Text>
            Быстрый пресет готового велосипеда:
          </Text>
          <CommandBlock
            title="URL пресета"
            lines={[
              `${DEV_URL}/?pick=artik-white,scope-artech,manto-bar,nack-seat,sram-red,cass-xplr,brake-force,bottles-two&snap`,
            ]}
          />
        </Step>
      </Stack>

      {mode === "pipeline" ? (
        <Stack gap={16}>
          <H2>Пересборка деталей из фото</H2>
          <Text tone="secondary">
            Нужно только если меняете исходники в <Code>aurumbikes_images/</Code>{" "}
            или таблицу <Code>SOURCES</Code>. Для простого запуска этот блок
            пропустите: <Code>public/parts/</Code> уже закоммичен.
          </Text>

          <Callout tone="warning" title="Жёсткий путь в скрипте">
            В <Code>scripts/process_parts.py</Code> прошито{" "}
            <Code>ROOT = Path(r"D:\\developmentProjects\\velo-assemble")</Code>.
            На другом ПК замените это на фактический путь клонированного
            репозитория, иначе скрипт не найдёт исходники.
          </Callout>

          <CommandBlock
            title="Python-зависимости"
            lines={
              os === "windows"
                ? ["python -m pip install numpy Pillow scipy"]
                : ["python3 -m pip install numpy Pillow scipy"]
            }
          />
          <CommandBlock
            title="Нарезка — удалит все PNG в public/parts и напишет заново"
            lines={["npm run parts"]}
          />
          <Text size="small" tone="secondary">
            Скрипт ждёт холст 2048×1366 и компоненты площадью не меньше 1500 px.
            Если компонент не находится, будет RuntimeError с именем файла.
          </Text>
        </Stack>
      ) : (
        <Callout tone="neutral" title="Нарезка деталей не нужна">
          Переключитесь на «Ещё и пересобрать детали», если будете менять
          исходные фото. Обычный запуск читает готовые PNG из{" "}
          <Code>public/parts/</Code>.
        </Callout>
      )}

      <H2>Если что-то не так</H2>
      <Table
        headers={["Симптом", "Что сделать"]}
        striped
        rows={[
          [
            "git clone: доступ запрещён",
            "Войдите в GitHub (SSH-ключ или gh auth login). Репозиторий должен быть вам доступен.",
          ],
          [
            "npm install падает",
            "Проверьте node -v ≥ 18. Удалите node_modules и package-lock не трогайте — повторите npm install.",
          ],
          [
            "Порт 5173 занят",
            "Закройте старый Vite или откройте URL, который напечатает Vite (5174 и дальше).",
          ],
          [
            "Белый экран / детали не грузятся",
            "Должны существовать public/parts/catalog.json и PNG. Не запускайте npm run parts, пока не поправите ROOT.",
          ],
          [
            "npm run parts не видит фото",
            "Поправьте ROOT в process_parts.py. Папка aurumbikes_images должна лежать в корне клона.",
          ],
          [
            "Нет звука при установке детали",
            "Это нормально до первого клика: браузер блокирует AudioContext. Кликните по холсту или карточке.",
          ],
          [
            "setup-windows: ExecutionPolicy",
            "Запускайте через setup-windows.cmd или powershell -ExecutionPolicy Bypass -File .\\scripts\\setup-windows.ps1",
          ],
          [
            "setup-windows: Git/Node не найден",
            "Шаг 1 не сделан или терминал открыт до установки. Поставьте Git и Node 18+, закройте и откройте PowerShell.",
          ],
        ]}
      />

      <H2>Что копировать, если без Git</H2>
      <Text>
        Перенесите весь репозиторий. Можно не копировать{" "}
        <Code>node_modules</Code>, <Code>dist</Code> и <Code>.shots</Code>. На
        новом ПК снова выполните <Code>npm install</Code> и{" "}
        <Code>npm run dev</Code>. Не переносите чужой{" "}
        <Code>node_modules</Code> между Windows и macOS — ставьте зависимости
        заново.
      </Text>
    </Stack>
  );
}

function TodoListCardLike({
  todos,
  onTodoClick,
  theme,
}: {
  todos: TodoItem[];
  onTodoClick: (todo: TodoItem) => void;
  theme: ReturnType<typeof useHostTheme>;
}) {
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <Card>
      <CardHeader trailing={`${done} / ${todos.length}`}>
        Чеклист на новом ПК
      </CardHeader>
      <CardBody style={{ paddingTop: 8, paddingBottom: 8 }}>
        <Text size="small" tone="secondary" style={{ marginBottom: 8 }}>
          Клик по строке отмечает шаг. Состояние сохраняется в канвасе.
        </Text>
        <div
          style={{
            borderTop: `1px solid ${theme.stroke.tertiary}`,
            marginTop: 4,
            paddingTop: 4,
          }}
        >
          <TodoList todos={todos} onTodoClick={onTodoClick} />
        </div>
      </CardBody>
    </Card>
  );
}
