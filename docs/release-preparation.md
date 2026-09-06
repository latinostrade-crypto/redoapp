# Пакет перед push: Resistance UI и оптимизация Render

> Live-права Supabase исправлены, старый Blueprint отключён без удаления
> сервисов. Фоновая перезапись исправлена локально. Push/deploy и переключение
> команд Render остаются отдельным этапом: [аудит](live-release-audit.md).

Подготовлено 6 сентября 2026. Ветка `main`, репозиторий
`https://github.com/latinostrade-crypto/redoapp.git`, исходный HEAD
`41f9c97f9d4cf4b7aac9e03487ec1b389377081b`.

Изменения подготовлены локально. Индекс Git не изменён; commit, push, деплой,
изменение тарифа не выполнялись. По разрешению владельца применена точечная
миграция прав production-базы, без изменения данных. В пакет входят
накопленные изменения интерфейса и игровые исправления, а не только оптимизации
этого прохода. Это подготовка закрытой беты, не снятие ограничений Before paid launch из README.

## Что облегчено без изменения рисунков и правил игры

| Участок | Реализация и границы эффекта |
| --- | --- |
| Четыре баннера | Lossless WebP вместо PNG в интерфейсе, без изменения разрешения. Проверено побайтовое равенство декодированных RGBA-пикселей; профиль сохранён. Исходные PNG оставлены. |
| UNO | Вход в меню больше не запускает предзагрузку колоды. Она начинается при входе в UNO, с существующим ограничением параллелизма. Уже используемые миниатюры карт сохранены. |
| JavaScript | TonConnect выделен в отдельный кешируемый чанк. Story и game остались независимыми lazy-entry. Разделение улучшает кеширование, но само по себе не уменьшает сумму всего JS. |
| Стикеры | Lottie приостанавливается вне экрана и в скрытой вкладке; reduced motion показывает статичный кадр. Видимая анимация и исходные файлы не заменены. |
| Сервер | TypeScript компилируется при сборке; production запускает готовый JavaScript без TS-loader. Runtime-зависимости оставлены внешними. |
| Health check | Публичная проверка больше не собирает подробную операционную статистику. Метрики процесса доступны только в защищённой административной проверке. |
| SSE | Общий payload комнаты сериализуется один раз; состояние матча — один раз на конкретного пользователя за рассылку. Разные игроки не разделяют приватное представление. |
| Медленный клиент | Перед очередной отправкой проверяется буфер соединения: при превышении 256 KiB закрывается только этот транспорт. Клиент получает актуальное состояние после reconnect. Это порог очереди, не абсолютный предел размера одиночного сообщения. |
| Переподключения | Убрана зависимость Blackjack SSE от нового объекта callbacks на каждом рендере; callbacks читаются через ref. Аналогично стабилизирован оставшийся poker settlement callback. |
| CPU и сохранения | JSON compression level 1, SSE не сжимается. Периодический checkpoint не ставится повторно, пока предыдущий для стола ещё выполняется; сохранения игровых действий не удалены. Меньшая степень сжатия может немного увеличить передаваемый JSON. |
| Render | `npm ci`, отдельная сборка backend, актуальная схема Static Site, build filters и immutable-кеш только для хешированных `/assets/*`. HTML не получает годовой кеш. |

Пиксельные переходы меню из предыдущих изменений сохранены: один временный canvas,
ограниченное количество элементов, короткий цикл, cleanup и reduced motion.
Не добавлены непрерывные тяжёлые эффекты. Правила ставок, выплат, авторизации,
рефералов и условия входа не упрощались ради производительности.

### Измеренное уменьшение баннеров

| Баннер | PNG, байт | Lossless WebP, байт | Экономия |
| --- | ---: | ---: | ---: |
| Верхний, четыре героя | 2 390 424 | 1 611 550 | 32,6% |
| Poker | 1 514 150 | 1 166 972 | 22,9% |
| UNO | 1 578 867 | 1 233 292 | 21,9% |
| Blackjack | 1 559 760 | 1 216 618 | 22,0% |
| Всего | 7 043 201 | 5 228 432 | 25,8% |

Это 1 814 769 байт экономии для полного набора, а не для каждого открытия страницы:
баннеры разных вкладок не обязательно загружаются одновременно. Для обновления
после изменения рисунков: `npm run optimize:assets`. Render не перекодирует их
при каждом билде — готовые lossless-файлы входят в Git-пакет.

### Локальный smoke-замер сервера

Последний запуск `node scripts/benchmark-server.mjs`: отдельные процессы с
изолированными данными, без production-ключей и внешних интеграций, 60 health-запросов,
параллелизм 10, один образец на runtime. TS-база: `node --import tsx server.ts`.

| Показатель | TS runtime | Compiled runtime |
| --- | ---: | ---: |
| Готовность после запуска | 2 061 мс | 919 мс |
| RSS процесса после запросов | 120,54 MiB | 71,30 MiB |
| p95 запроса | 20,21 мс | 17,18 мс |
| CPU на серию | 62 мс | 48 мс |

Это синтетический локальный smoke, не нагрузочный тест партий, не статистически
устойчивый benchmark и не прогноз процентов экономии на Render. Он подтверждает
работоспособность compiled-runtime. Для выводов о ёмкости нужны длительные
сессии с реальными SSE, БД и распределением игровых действий.

## Проверки

`npm run prepare:release` повторно прошёл все 22 этапа (добавлен persistence budget).
`npm run check:release -- --schema`, `git diff --check` и production `npm audit`
также прошли; известных production-уязвимостей 0. Первый запуск сборки был
остановлен Windows sandbox (EACCES); повторный разрешённый прогон успешен.

- TypeScript, frontend build, backend build;
- traffic budget, SSE budget, persistence budget, game routing, private-room client contract;
- poker chips, motion, pre-actions, side pots, resilience;
- Blackjack rules, Daily Vault, cash-out referrals, ticket accounting;
- PVP handoff, multiplayer rooms, casino restart, production auth;
- release manifest/configuration checks.

Multiplayer rooms и production-auth в этом прогоне запускали именно compiled
backend; остальные серверные проверки используют свои существующие harness.
Это не интеграция с реальными платёжными сервисами. Все ключи внешних интеграций
в release-test runner отключены.

Production frontend проверен через Playwright при ширинах 320, 390, 430 и 768 px:
ME / Events / Shop / PVP, три игровых баннера, отсутствие горизонтального overflow,
успешная загрузка изображений, запуск UNO practice, отсутствие предзагрузки колоды
в меню. Проверены переходы при CPU throttling 4x и отсутствие оставшегося canvas.
У story проверены отдельная загрузка, отсутствие game/wallet/deck-запросов,
canonical Telegram CTA и reduced motion. Ошибок консоли не обнаружено.
Скриншот: `output/playwright/release-menu-390.png`.

Ни один JS-файл текущей сборки не превышает 500 КБ до сжатия. Это не лимит
суммарной загрузки приложения. Предупреждение сборщика об `eval` внутри lottie-web
остаётся: библиотека не вырезалась вслепую ради уменьшения размера.

Lockfile обновлён совместимыми исправлениями; `npm audit` после установки сообщил
0 известных уязвимостей. Это результат базы advisory на дату проверки, не гарантия
отсутствия любых ошибок. Базовый поиск секретов в release-manifest также не
заменяет полноценный security audit.

## Как получить один проверяемый Git-пакет

```bash
npm run prepare:release
npm run check:release -- --schema
git diff --check
```

`output/release/manifest.json` содержит SHA-256, размеры, исходный commit,
ветку и список исключённых незакоммиченных справочных файлов. `paths.txt` —
читаемый список; `paths.nul` — точный список для атомарного добавления в индекс.
Результаты и временные данные игнорируются Git. Новые справочные файлы `FOR AI`
не включены автоматически: они не являются runtime-ресурсами и остаются на диске.
Используемые приложением новые ассеты и исходники включены.

После проверки списка и разрешения на commit/push:

```bash
git add --pathspec-from-file=output/release/paths.nul --pathspec-file-nul
git diff --cached --stat
git diff --cached --check
git diff --cached
git commit -m "feat: ship Resistance UI and optimize Render runtime"
git push origin main
```

Эти команды здесь приведены как инструкция, не выполненные действия. Перед
добавлением следует пересоздать manifest, если исходники успели измениться, и
проверить весь staged diff, включая возможные ранее staged изменения.

## Что проверить на Render до push и после выкладки

1. Убедиться, что оба сервиса смотрят на нужные `origin/main`, а их auto-deploy
   включён при необходимости. Push создаёт commit на GitHub; Render затем
   собирает его, а не «коммитит на Render».
2. Проверить Blueprint sync / Review & Apply. Для вручную созданных сервисов
   отдельно задать настройки ниже: наличие `render.yaml` не подтверждает,
   что live-сервис уже использует эти команды.
3. Frontend: Static Site, build `npm ci --include=dev && npm run build`, publish
   `dist`. Backend: Node 22, build `npm ci --include=dev && npm run build:server`,
   start `npm run start:production`, health `/api/health`.
4. Сохранить production env vars в Render, не в Git. Проверить существующие
   Supabase migrations и read-only preflight из README, сделать резервную копию
   перед выкладкой. SQL 20260906_backend_only_permissions и
   20260906_trigger_permissions уже применены вручную;
   не повторять вслепую старые SQL и не очищать состояние.
5. После выкладки: health, свежая и повторная загрузка с cache headers, вход из
   Telegram, wallet modal, practice всех трёх игр, private-room deep link,
   public/free table, reconnect, завершение партии и корректность балансов.
6. Сравнить CPU, RSS, outbound bandwidth, количество reconnect, DB latency и
   длительность сборки до/после при похожем числе игроков. Отдельно проверить
   реальные слабые Android и iPhone внутри Telegram, включая смену сети и
   возврат из фона. Эмуляция размеров и CPU не равна испытанию каждого устройства.
7. При регрессии откатить deploy на предыдущий проверенный commit с соответствующей
   ему командой запуска. Не откатывать и не удалять данные игроков автоматически.

Панели Render/Supabase и live-метрики проверены авторизованным браузером.
В render.yaml исправлены имя backend и `plan: starter`, сохранён Oregon;
ненужные VITE_SUPABASE-параметры убраны. Существующий live-тариф не менялся.
Команды сборки/запуска, фильтры и headers активируются вместе с будущим rollout,
не новым Blueprint с дублирующими сервисами. Кодовые оптимизации
не дают гарантии отсутствия платформенных задержек или одинакового FPS на
любом устройстве; актуальные ограничения тарифа нужно учитывать отдельно.

## Основания для решений

- [Render Blueprint specification](https://render.com/docs/blueprint-spec) и
  [официальная JSON Schema](https://render.com/schema/render.yaml.json): структура
  Static Site, команды, build filters, headers.
- [Render Static Sites](https://render.com/docs/static-sites): CDN-доставка и
  сжатие статического frontend; ему не нужен дополнительный Express-сервер.
- [Sharp WebP output](https://sharp.pixelplumbing.com/api-output/#webp): lossless
  кодирование. Равенство конкретных изображений дополнительно проверено локально.
- [esbuild packages](https://esbuild.github.io/api/#packages): external packages
  при сборке Node-приложения.
- [Node stream buffering](https://nodejs.org/api/stream.html#buffering): учёт
  очереди медленных соединений.
- [Express production performance](https://expressjs.com/en/advanced/best-practice-performance/):
  production runtime и осознанное использование сжатия.
