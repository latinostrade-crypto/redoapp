# QA-отчёт: интерактивная история и игровая поверхность

Дата проверки: 19 июля 2026 года.

## Итог

Функциональные release-gate проверки проходят. Story и game разделены на
независимые lazy-loaded поверхности, локальные маршруты отвечают, все 12
исходных JPEG доступны и попадают в production build. Traffic budget игры не
изменён.

В ходе QA исправлены два небольших дефекта доступности:

- минимальная высота интерактивных элементов верхней панели увеличена с 42 до
  44 CSS px;
- в reduced-motion варианте добавлена реальная цель `#story-finale` для
  skip-link.

Блокирующих функциональных дефектов в проверенном объёме не обнаружено.
Остаются перечисленные ниже риски производительности и проверки на реальных
устройствах.

## Автоматические проверки

| Проверка | Результат |
| --- | --- |
| `npm.cmd run lint` (`tsc --noEmit`) | PASS |
| `npm.cmd run build` | PASS |
| `npm.cmd run test:traffic` | PASS — `Traffic budget checks passed.` |

Повторный прогон после исправлений также прошёл полностью.

Production build создал отдельные chunks:

- `ComicExperience`: около 135.38 kB, gzip 51.89 kB;
- `GameSurface`: около 769.78 kB, gzip 223.21 kB.

Vite выводит известное предупреждение о game chunk больше 500 kB. Это не
ошибка сборки, но остаётся задачей дальнейшего code splitting.

## Маршруты и интеграция

HTTP smoke-проверка локального сервера:

| URL | HTTP |
| --- | --- |
| `http://localhost:3000/` | 200, `text/html` |
| `http://localhost:3000/?story=1` | 200, `text/html` |
| `http://localhost:3000/?play=1` | 200, `text/html` |
| `http://localhost:10000/api/health` | 200, backend healthy |

Проверка кода `src/RootApp.tsx`:

- обычный browser root выбирает story;
- `?story=1` явно выбирает story, в том числе при наличии Telegram API;
- `?play=1` выбирает game;
- реальный Telegram launch с `initData`, пользователем или `start_param`
  выбирает game;
- CTA истории обновляет URL до `?play=1`, сбрасывает scroll и монтирует
  `GameSurface`;
- story и game объявлены двумя отдельными `React.lazy` imports и не монтируются
  одновременно.

В `Web3Dashboard` сохранён разбор `startapp`, `tgWebAppStartParam`,
`initDataUnsafe.start_param`, `room_*` и `ref_*`. Вход в game через story не
изменяет существующую обработку Telegram deep links.

## Изображения

- В `FOR AI/WEBSITE` найдено 12 JPEG.
- В `src/data/comicScenes.ts` найдено 12 уникальных импортов этих JPEG.
- Список файлов и список импортов совпадают без пропусков.
- Каждый из 12 URL на локальном Vite server проверен отдельным HEAD-запросом:
  12/12 ответили `200 image/jpeg`.
- Production build выпустил 12 хешированных JPEG assets.
- Растры имеют явные `width` и `height`; первый сюжетный кадр загружается
  eagerly, последующие — lazily.
- Дополнительный брендовый `banner.png` также имеет явную геометрию.

## Reduced motion и доступность

При `prefers-reduced-motion: reduce` компонент `ComicExperience` рендерит
отдельный `ReducedMotionExperience`:

- нет pinned-сцен, scrub timeline, parallax, shake, flash или dissolve;
- главы идут обычными семантическими `<section>` в потоке документа;
- заголовки, описания, реплики, факты, изображения и CTA остаются в HTML;
- CSS отключает оставшиеся декоративные animation/transition;
- skip-link теперь имеет существующую цель в normal и reduced-motion ветках;
- focus-visible задан явно;
- основные CTA имеют высоту больше 44 px, верхние действия исправлены до
  минимальных 44 px;
- autoplay audio и автоматический `requestFullscreen()` в story отсутствуют.

## ScrollTrigger и lifecycle

- Каждая normal-motion сцена создаёт одну master timeline со своим
  `scrollTrigger`.
- Desktop и mobile варианты создаются через `gsap.matchMedia`.
- Cleanup сцены вызывает `timeline.scrollTrigger.kill()`, `timeline.kill()`,
  `media.revert()` и `context.revert()`.
- Отдельный progress trigger удаляется через `trigger.kill()`.
- Глобальный `ScrollTrigger.killAll()` отсутствует.
- На каждом scroll frame React state не обновляется: общий progress записывается
  в CSS custom property. React state главы меняется только при входе в сцену.
- `touch-action: pan-y` сохраняет нативную вертикальную прокрутку.

## Mobile и overflow

По коду не найдено очевидного источника горизонтальной прокрутки:

- корень story использует `overflow-x: hidden` с `overflow-x: clip`;
- mobile frame центрирован при ширине `100vw`;
- speech bubbles ограничены через `clamp`, sound-effect надписи — через
  `max-width: 86vw` и перенос строк;
- stage использует `100vh` fallback и стабильный `100svh`;
- отступы учитывают `env(safe-area-inset-*)`;
- pin distance не привязан к непрерывно меняющемуся `100dvh`.

По переданным результатам отдельной browser-QA сессии основной story и game
были открыты на desktop и mobile ширинах без console warning/error.

## Известные ограничения и риски

1. Game chunk остаётся большим: около 770 kB minified. Story от него отделена,
   поэтому обычный web-вход не платит эту стоимость сразу, но первый вход в
   игру на слабом мобильном устройстве следует оптимизировать.
2. Mobile `ComicScene` создаёт все кадры сцены в одной полноэкранной рамке.
   Сцены с тремя-четырьмя изображениями могут одновременно держать больше двух
   декодированных raster layers после reveal. Это расходится с целевым
   performance-планом «один основной плюс максимум один вторичный кадр» и
   требует профилирования/виртуализации на реальных устройствах. В рамках QA
   дизайн и хореография не переписывались.
3. Story использует CSS `env(safe-area-inset-*)`, но отдельно не прокидывает
   Telegram `safeAreaInset`/`contentSafeAreaInset` в CSS variables. Обычно
   Telegram launch сразу открывает game; риск относится прежде всего к
   принудительному `?story=1` внутри Telegram.
4. В этом проходе не выполнялась новая аппаратная проверка на Safari iPhone и
   Telegram iOS/Android WebView. Перед публичным релизом нужны реальные
   устройства: reverse scroll всех сцен, смена ориентации, 200% zoom,
   reduced-motion, возврат из wallet и Telegram safe areas.
5. Проверка доступности выполнена по коду и базовому browser smoke; отдельный
   аудит screen reader/контраста не проводился.

## Изменённые QA файлы

- `src/components/comic/comic.css`
- `src/components/comic/ReducedMotionExperience.tsx`
- `docs/qa-report.md`

## Follow-up: финальная галерея и CTA

После замечаний по трём последним кадрам выполнен дополнительный проход:

- desktop `1241 × 993`: лес, общий зал и широкий баннер проверены в отдельных
  стабильных точках timeline; все изображения используют `object-fit: contain`
  и показываются целиком;
- mobile `390 × 844`: те же три состояния проверены без перекрытия copy/frame/
  CTA и без горизонтального overflow (`scrollWidth - clientWidth = 0`);
- свободное место вокруг полного изображения заполняется затемнённым
  декоративным дублем, который не заменяет и не обрезает основной кадр;
- “Skip to game”, “Play Redoapp”, “Open in Telegram”, Telegram в header и footer
  используют точный URL
  `https://t.me/redo_appbot/app?startapp=ref_KNVPOU`;
- финальный mobile CTA имеет размер `321 × 52 px`, находится выше safe-area и
  остаётся полностью видимым;
- чистая загрузка story в новой browser-сессии: `0` console warnings и
  `0` console errors;
- повторно пройдены `npm.cmd run lint`, `npm.cmd run build`,
  `npm.cmd run test:traffic` и `git diff --check`.

Production build остаётся успешным. Сохраняется прежнее предупреждение Vite о
lazy game chunk около `770 kB`; story chunk остаётся отдельным.

## Follow-up: fine particle dust

Крупная 60-блочная сетка полностью удалена из JSX, CSS и GSAP timeline. Все
normal-motion смены кадров теперь используют один прозрачный canvas на сцену:

- до `18500` частиц на mobile и `28500` на desktop, размер движущихся песчинок около
  `0.45–1.75 px`;
- image-частицы семплируются из соответствующей точки реального кадра;
- interface-частицы строятся из растеризованных HTML-блоков, текста, bubbles,
  facts, SFX и CTA, поэтому весь блок исчезает и собирается вместе с кадром;
- плотность рассчитывается по реально видимой области `cover`/`contain`, поэтому
  вертикальные финальные кадры не становятся разреженными в широкой рамке;
- outgoing и incoming fields связаны единым material cycle: полный резкий
  раскол занимает первые `8%`, падение ниже stage — до `42%`, изображение
  поднимается и собирается до `72%`, HTML-текст и блоки — до `94%`;
- в нулевой момент DOM-изображение скрывается и заменяется плотно замощённой
  particle-копией; incoming DOM не появляется до завершения particle-сборки;
- межсценный bridge семплирует первый кадр, рамку и copy следующей сцены, поэтому
  новая пыль не появляется как независимое облако;
- renderer получает `timeline.time()` напрямую, не обновляет React state и
  одинаково вычисляет изображение при прямой и обратной прокрутке;
- на `saveData`/low-power устройствах плотность снижается до `62%` и хвосты
  отключаются, но крупные блоки не возвращаются;
- renderer удаляет `ResizeObserver`, load listeners, поля частиц и canvas при
  cleanup сцены; `prefers-reduced-motion` рендерит отдельную статичную ветку без
  canvas и dissolve.

После изменения повторно пройдены `npm.cmd run lint` и `npm.cmd run build`.
Локальный сервер вернул `200` для `/`, `?story=1`, `?play=1`, `banner.png` и
всех 12 JPEG (`image/jpeg`). Desktop story открыта в отдельной Playwright-сессии:
подтверждены загрузка первой сцены, корректный фон и точный Telegram CTA. После
этого схема заменена на последовательный распад/падение/сборку: internal окна
занимают `0.16–0.26`, межсценный bridge — `0.12`, scrub замедлен до `0.62/0.9`, а
origin-less entrance dust удалён. Дальнейшую проверку на реальном телефоне
пользователь выполняет самостоятельно.

Главный copy собирается particle-полем одновременно с первым изображением новой
главы только на межсценном bridge и не повторяет dissolve при внутренних сменах. Bubbles,
facts, SFX и CTA исключены из входящей пыли и раскрываются после финальной
сборки по одному через отдельные comic tweens. Scroll-длины настроены в диапазоне
`275–320vh` desktop / `280–315svh` mobile, а pin использует `end: "bottom top"`:
лишний экран с наложением двух соседних chapters удалён.
