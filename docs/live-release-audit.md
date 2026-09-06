# Live-аудит перед push — 6 сентября 2026

Статус: **согласованные исправления выполнены; код ожидает отдельной выкладки**.
Проверка выполнена через авторизованные панели Render и Supabase и сопоставлена
с локальным кодом, включая фактически выложенный commit `41f9c97`.
Первоначальный аудит был read-only. После разрешения владельца применена
`supabase/20260906_backend_only_permissions.sql`: семь RPC и три views теперь
недоступны anon/authenticated, service_role сохранён; views используют
security_invoker. Независимый SELECT подтвердил 10 строк false/false/true.
Запросы от service_role к трём views прошли с LIMIT 0, без чтения данных игроков.
Исходные ACL описаны в `permissions-change-record.md`.
Затем применена `20260906_trigger_permissions.sql`: закрыты клиентские права
четырёх внутренних trigger helpers, у `set_updated_at` зафиксирован search_path
после проверки тела функции. Независимый SELECT подтвердил false/false/true
для всех четырёх. Тела и подключения триггеров не заменялись.
Итоговая страница Supabase Security Advisor: **Errors 0, Warnings 0, Info 1**.
Это результат проверок Advisor, а не гарантия отсутствия любых уязвимостей.

Старый Blueprint YOapp отключён штатным Disconnect Blueprint. Диалог прямо
подтвердил сохранение ресурсов и файла. После отключения оба рабочих сервиса
остались Live на прежнем commit, URL и Starter; сервисы и данные не удалялись.
Повторная страница Resources перед отключением показывала «No resources managed
by this Blueprint», хотя ранее backend отображал ссылку на него. После отключения
эта связь исчезла. Другой Blueprint bands-production не затрагивался.

Фоновая перезапись исправлена локально и покрыта `test:persistence-budget`.
Commit/push/deploy не выполнялись, поэтому снижение live-трафика ещё не измерено.

## 1. Найден источник постоянного расхода трафика

### Резервная копия перед согласованной выкладкой

6 сентября, 12:12 UTC: после обновления владельцем пароля создана логическая
копия PostgreSQL 17.6 через session pooler с `sslmode=verify-full` и официальным
CA Supabase. Архив содержит данные всех 9 таблиц приложения и полностью
декодирован `pg_restore`; отдельно сохранены роли без паролей и SHA-256.
Архив 604425 bytes, SHA-256
`becb877f610f1551080e050ab55fb4c909979e1f339db7e1a0f36ecb77c9cbe4`.
Локальная папка: `output/backups/supabase-2026-09-06T12-12-21-444Z` (не в Git).
Git bundle исходного `41f9c97` также сохранён в `output/release` и проверен.
Пробное восстановление в отдельную БД не выполнялось. Копия не включает байты
объектов Storage или секреты/настройки платформы. `.env` не входит в релиз.
Владелец явно разрешил backup, commit/push и выкладку существующих сервисов.

В [метриках backend](https://dashboard.render.com/web/srv-d8uc5ejtqb8s73b35e70/metrics)
за текущий месяц:

| Категория | Показание панели |
| --- | ---: |
| Всего | 15,82 GB |
| Service-Initiated | 15,82 GB |
| HTTP Responses | 0 MB, округлённое значение |
| Websocket Responses | 0 MB, округлённое значение |
| Service-Initiated (Private Link) | 0 MB |

Для frontend панель показывает 74 MB за месяц. Следовательно, основной
обнаруженный расход относится не к загрузке баннеров и не к ответам игрокам,
а к соединениям, инициируемым backend. Render учитывает в этой категории
запросы сервиса к внешним ресурсам, включая БД.
[Правила учёта Render](https://render.com/docs/outbound-bandwidth).

### Причина в коде и подтверждение в БД

В live-commit и локальном коде до исправления была такая цепочка:

1. Таймер с интервалом 15 секунд вызывает `flushTelegramNotifications()`.
2. `performTelegramNotificationFlush()` в конце безусловно вызывает
   `schedulePersist()`, даже когда список готовых к отправке уведомлений пуст.
3. `persistStateNowInternal()` безусловно отправляет в Supabase `global-state`,
   содержащий всю историю `telegramNotifications`.

Диагностический SELECT показал:

- `global-state`: **584 192 байта** JSON-текста;
- уведомления занимают 584 141 байт, в массиве 857 элементов;
- готовых к отправке уведомлений: **0**;
- запись продолжает получать новый `updated_at`.

Два read-only замера подтвердили повторную запись одинакового содержимого:

| Замер, UTC | `updated_at`, UTC | Размер | К отправке |
| --- | --- | ---: | ---: |
| 06:05:35 | 06:05:32.989 | 584 192 байта | 0 |
| 06:08:25 | 06:08:17.994 | 584 192 байта | 0 |

В обоих случаях MD5 диагностируемого payload равен
`6cf55bc373eb7aa302f83d2cdda1fbdc`, элементов 857. MD5 здесь используется только
как контрольная сумма равенства, не как защита данных. Содержимое сообщений
не выгружалось. Разница времён последней записи около 165 секунд согласуется
с одиннадцатью 15-секундными циклами; по двум точкам нельзя отдельно доказать
каждый промежуточный запрос, но код таймера и результат совпадают.

При таком размере 240 сохранений в час дают около **140,2 MB/час**, или
**3,36 GB/сутки** JSON по оценке на основе `jsonb::text`. Это не точный размер
сетевого JSON: форматирование, HTTP и TLS отличаются. Но оценка согласуется
с почти постоянными примерно 130 MB/час на графике Render.

Эту проблему предыдущий локальный smoke-тест не выявлял: внешние сервисы и
Telegram-токен в тестах отключены. Локальные оптимизации картинок и compiled
runtime полезны, но сами по себе **не исправляют данный источник egress**.

### Исправление выполнено локально, ожидает deploy

- Пустой flush больше не вызывает persist.
- Добавлено безопасное отслеживание изменений `global-state`: пропускается только
  уже успешно сохранённое, идентичное состояние. Не пропускать изменения,
  появившиеся во время незавершённой записи; ошибки не должны подтверждать запись.
- Сохранить обязательную запись намерения перед отправкой Telegram-сообщения,
  финального статуса, retries и at-most-once semantics.
- Не удалять историю уведомлений и её dedupe-ключи ради экономии.
- Добавлен тест реальных функций из server.ts с фиктивным Telegram-токеном и
  mock HTTP: 240 пустых циклов не делают записи; смена статуса, ошибки БД,
  immutable snapshots, HTTP 429 и конкурентные запросы сохранения проверены.
- После выкладки сравнить hourly Service-Initiated. Не обещать нулевой трафик:
  реальные действия и фоновые проверки по-прежнему требуют обмена с сервисами.

Снижение JSON compression level до 1 в подготовленном пакете касается ответов
Express, а не исходящих записей в Supabase. Оно не решает найденную проблему;
его trade-off CPU/размер нужно оценивать отдельно, не считать экономией egress.

## 2. Расхождение Render с локальным Blueprint

| Параметр | Live | Подготовлено локально |
| --- | --- | --- |
| Backend name | `yoapp-backend-legacy` | Совпадает |
| Backend plan | Starter, 512 MB / 0,5 CPU | Starter, совпадает |
| Backend build | `npm ci` | `npm ci --include=dev && npm run build:server` |
| Backend start | `npm run start` | `npm run start:production` |
| Frontend build | `npm install; npm run build` | `npm ci --include=dev && npm run build` |
| Publish directory | `dist` | `dist`, совпадает |
| Build filters обоих сервисов | Не заданы | Заданы |
| Custom response headers frontend | Правил нет | Cache-Control и защитные заголовки |
| `/match-api/*` rewrite | На backend `/api/matchmaker/*` | Совпадает |
| Health path | `/api/health` | Совпадает |

Оба сервиса смотрят на `latinostrade-crypto/redoapp`, ветку `main`, имеют
Auto-Deploy **On Commit** и показывают последним успешным commit `41f9c97`.
Frontend — отдельный Static Site с `redoapp.org`, `www.redoapp.org` и
`redoapp.onrender.com`. Backend сохраняет URL `yoapp-backend.onrender.com`.

Ранее backend отображал связь с Blueprint YOapp (`exs-d8uc1vbtqb8s73b31360`),
который смотрит на **другой репозиторий `latinostrade-crypto/YOapp`**, `main`,
`render.yaml`, Auto Sync **Yes**. Ссылка проверена в GitHub: она не перенаправляет
на `redoapp`. Последние записи Syncs относятся к старому проекту.

Старый Blueprint теперь отключён. Push в `redoapp/main` обновит код сервисов,
но сам по себе не применит настройки локального render.yaml. Нельзя вслепую создавать второй Blueprint,
переименовывать рабочий сервис или переводить его на Free.
Render отдельно предупреждает не подключать ресурс, уже управляемый другим
Blueprint, к новому без разрешения конфликта владения.
[Документация Render](https://render.com/docs/infrastructure-as-code#adding-an-existing-resource).

Service IDs, Starter и URL сохранены. Пока источник live-настроек — Dashboard;
локальный render.yaml — проверяемая спецификация для следующей выкладки.
Команды, headers и build filters в Dashboard намеренно не переключались:
это требует согласованного rollout нового commit. Не устанавливать
`start:production` с рестартом старого commit, где ещё нет этой команды и
`build/server.mjs`. Не создавать новые сервисы вместо существующих.

## 3. Критические права в Supabase

Проект [rxhnhgtwfwisrnkhtzko](https://supabase.com/dashboard/project/rxhnhgtwfwisrnkhtzko)
совпадает с `SUPABASE_URL` рабочего backend. SELECT `has_function_privilege`
подтвердил доступ **и anon, и authenticated** к следующим SECURITY DEFINER RPC:

- `casino_take_table_seat`
- `casino_heartbeat`
- `casino_checkpoint_runtime`
- `ticket_post_transaction`
- `ticket_persist_user_snapshot`
- `ticket_apply_reconciliation_correction`

У `service_role` доступ к нужным семи RPC присутствует. Пятиаргументный
`casino_leave_table_seat` уже ограничен корректнее: в списке доступных
anon/authenticated его нет.

Также `has_table_privilege(..., 'SELECT')` подтвердил anon/authenticated-доступ
к трём служебным представлениям:

- `ticket_account_reconciliation`
- `ticket_transaction_reconciliation`
- `ticket_profile_reconciliation`

Supabase Advisor помечает эти три views как Security Definer View.
Это подтверждение лишних прав, **не утверждение о произошедшем взломе**.
Эксплуатация через запись или чтение реальных записей не проверялась.
RLS на базовых таблицах не заменяет корректные права на SECURITY DEFINER RPC.

Нужно точечно отозвать доступ у PUBLIC/anon/authenticated для служебных объектов,
сохранить service_role, проверить default privileges и повторить отрицательные
проверки доступа. Просто REVOKE у PUBLIC недостаточен, если права выданы роли
напрямую. Это согласуется с [рекомендациями Supabase](https://supabase.com/docs/guides/database/functions#function-privileges).
После согласования изменения применены транзакционно и независимо проверены.
Default ACL проверены, но оставлены без глобальных изменений: migration явно
отзывает прямые и PUBLIC grants для семи точных сигнатур. Нельзя повторно
применять старые SQL без завершающей hardening migration.

## 4. Что в Supabase проверено и совпадает

- Healthy; Free organization / NANO compute; регион Mumbai (`ap-south-1`).
- Снимок показателей: CPU 4%, RAM 57%, 9 из 60 соединений; database size 30/500 MB,
  egress организации 0,02/5 GB. Это моментальные значения, не нагрузочный тест.
- Все **9 нужных таблиц** присутствуют: `app_state`, четыре `casino_*` и четыре
  `ticket_*`. У них включён RLS. Профили живут в `app_state`; отдельная таблица
  `user_profiles` этой архитектуре не требуется.
- Все **7 нужных RPC** присутствуют. Cash-out имеет `p_referral_payouts jsonb`,
  snapshot — `p_expected_revision` и `p_next_revision`.
- Невалидных индексов в public не найдено.
- У мест стола присутствуют PK `(table_id,user_id)`, FK на каталог, проверки
  неотрицательных chips и допустимых состояний.
- В панели истории миграций записей нет. Это **не отсутствие схемы**: объекты
  фактически есть. Нужна фиксация baseline и дальнейших версий, а не слепой
  повтор всех SQL-файлов.
- Панель Backups подтверждает: Free Plan не включает scheduled project backups.
  Наличие внешних ручных копий и успешного restore не подтверждено.

Backend находится в Oregon, БД в Mumbai. География потенциально добавляет
задержку запросов; регион не менялся. Измерить DB round trip и планировать
перенос отдельно с проверкой данных, а не совмещать с UI-релизом.

## 5. Переменные, наблюдаемость и ограничения проверки

- Значения несекретных параметров совпали: `VITE_API_BASE_URL`, `SUPABASE_URL`,
  `TELEGRAM_BOT_USERNAME=redo_appbot`, short name `app`,
  `CASINO_TABLES_DB_MODE=true`, `ENABLE_CHAIN_VERIFICATION=true`.
- Наличие ADMIN_API_KEY, APP_SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY,
  TELEGRAM_BOT_TOKEN, TON_API_KEY и Redis-переменных проверено по именам;
  значения не раскрывались. Это не подтверждение их длины или прав внешнего API.
- Во frontend нет VITE_SUPABASE-параметров; текущий основной поток работает
  через backend. Не следует добавлять секретный service-role ключ во frontend.
- Backend за последние 12 часов: одна instance, память примерно 25% лимита,
  CPU почти у нуля. Признаков перегрузки CPU/RAM в этом окне не видно.
- Поиск `error` в application logs за 7 дней не дал совпадений. Это не поиск
  всех возможных формулировок сбоев и не доказательство отсутствия ошибок.
- Независимое открытие `/api/health` не удалось: браузер сообщил
  `ERR_BLOCKED_BY_CLIENT`, web-fetch также не вернул результат. Защита не
  обходилась. Статус Live и настроенный health path подтверждены панелью,
  отдельный успешный HTTP smoke с этого устройства — нет.
- Не выполнялись реальные депозиты, выводы, игровые RPC с изменением состояния,
  рестарты или изменение тарифов. Применены только две указанные ACL/view/helper migrations.
  Общий платный launch gate README
  по-прежнему действует.

## Очерёдность дальнейших действий

1. Выполнено: закрыты лишние права RPC/views, сохранён backend-доступ,
   миграция и исходные ACL включены в пакет.
2. Выполнено локально: пустые flush/persist, immutable dedupe, concurrent retry
   и регрессионные тесты; включено в release gates.
3. Выполнено: отключён старый Blueprint, имя/тариф локальной спецификации
   согласованы с действующими ресурсами. Организовать backup перед rollout.
4. После release gates и обновления manifest отдельно согласовать commit/push
   и переключение build/start/header/filter настроек существующих сервисов.
5. После выкладки сверить Service-Initiated и write cadence, затем real-device
   Telegram smoke и функциональные сценарии. Не сокращать функции ради метрик.
