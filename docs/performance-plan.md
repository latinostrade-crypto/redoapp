# План производительности, mobile и accessibility

## 1. Базовая оценка

### Репозиторий

- React 19 + Vite 6 + TypeScript + Tailwind CSS 4.
- Существующая игра использует `motion`, TonConnect, Supabase-клиент,
  realtime/SSE и множество карточных изображений.
- README уже отмечает предупреждение Vite о main chunk больше 500 kB.
- `src/main.tsx` сейчас на любом входе будит backend и запускает
  `initializeRequiredGameImages()`.
- `src/App.tsx` использует `h-screen`, `max-h-screen`, `min-h-screen` и
  полноэкранные overlays без системной поддержки `dvh/svh/safe-area`.
- Google Fonts подключены одновременно через `index.html` и `@import` в CSS,
  что создаёт дублирующий путь загрузки.

### Новые сценовые изображения

- 12 JPEG;
- каждый `768 × 1376`, 24-bit RGB, без прозрачности;
- общий исходный transfer size: `7 306 483` байта, около `6.97 MiB`;
- один декодированный RGBA-кадр занимает примерно
  `768 × 1376 × 4 = 4.03 MiB`;
- все 12 одновременно — около `48.4 MiB` только пикселей, без DOM, GPU-копий,
  масок и дублированных панелей.

Следовательно, нельзя eagerly загружать и постоянно держать все изображения в
нескольких слоях. Особенно опасно одновременно держать комикс, игровую колоду,
wallet SDK и realtime-экран в одном DOM.

## 2. Целевые бюджеты

Проверять минимум на mid-range Android и iPhone, а не только desktop:

| Метрика | Цель |
| --- | --- |
| LCP | `< 2.5 s` на мобильном профиле |
| CLS | `< 0.1` |
| INP | `< 200 ms` |
| long task | ни одной регулярной задачи `> 50 ms` во время scroll |
| scripting на scroll-frame | обычно `< 4 ms` |
| story initial JS, gzip | ориентир `≤ 180 kB` после route splitting |
| initial scene images | `≤ 600 kB`, только LCP-кадр и малый UI |
| все 12 modern image variants | ориентир `≤ 3.5 MiB` без заметной порчи pixel-art |
| активные полноразмерные растры | mobile: 2, desktop: 3–4 |
| активные анимируемые DOM-узлы | mobile: `≤ 6`, desktop: `≤ 10` |
| speed lines | `8–12` DOM-узлов |
| particle dust | один canvas, до `18500` mobile / `28500` desktop точек (`62%` на low-power), `0` particle DOM-узлов |

60 fps — цель на обычных сценах. Для слабого устройства предпочтительнее
стабильные 30 fps в упрощённом preset, чем пропуски кадров из-за тяжёлой mask.

## 3. Разделение игры и комикса

Это главный performance-gate.

- Сделать `ComicExperience` и текущий `GameApp` двумя lazy chunks.
- Не монтировать GameApp скрытым под комиксом: его effects запускают таймеры,
  auth, загрузчик, realtime и работу с wallet.
- Перенести `wakeBackend()` и `initializeRequiredGameImages()` в точку входа
  игрового chunk. Комикс не должен загружать колоду и будить API до намерения
  открыть игру.
- GSAP/ScrollTrigger загружать только в comic chunk.
- TonConnect и тяжёлый dashboard не должны входить в начальный story chunk,
  если это позволяет структура provider.
- Существующий `motion` оставить в game/UI chunk и не дублировать им
  scroll-анимации.
- Вход с `startapp=room_*` или `startapp=ref_*`, восстановление активного матча
  и прямой игровой URL обязаны обходить комикс.

После разделения проверить bundle analyzer или `vite --debug`: общая сборка
может остаться крупной, но initial route должен загружать только свой граф.

## 4. Image pipeline

Оригиналы хранятся как source assets. Для production создать варианты:

- ширины `384`, `576`, `768`;
- modern WebP и AVIF только после визуального сравнения;
- исходный JPEG — fallback;
- одинаковое соотношение `768 / 1376` во всех вариантах;
- не увеличивать выше оригинальных 768 px;
- для pixel-art не применять aggressive smoothing, noise reduction или
  слишком низкое chroma quality.

AVIF не принимать автоматически только из-за меньшего файла: мелкие пиксельные
контуры, дождь и dithering нужно сравнить при 100%, 200% и на телефоне. Если
WebP визуально чище при сопоставимом весе, он становится primary format.

Пример стратегии разметки:

```html
<picture>
  <source type="image/avif" srcset="...-384.avif 384w, ...-768.avif 768w">
  <source type="image/webp" srcset="...-384.webp 384w, ...-768.webp 768w">
  <img
    src="...-768.jpeg"
    width="768"
    height="1376"
    sizes="(max-width: 600px) 100vw, 768px"
    decoding="async"
    alt="..."
  >
</picture>
```

`width`, `height` и/или `aspect-ratio: 768 / 1376` обязательны до загрузки.
Размер рамки сцены не зависит от decode — это устраняет CLS.

Нельзя генерировать отдельный bitmap для каждого промежуточного состояния.
Один и тот же декодированный ресурс можно показывать в кадрированных
контейнерах, но не следует держать много полноэкранных CSS filter/mask-копий.

## 5. Загрузка и декодирование

### При старте

- LCP-изображение первой сцены: `loading="eager"`, `fetchpriority="high"`;
- только один preload для реально видимого кадра;
- логотип/малый progress UI — обычный priority;
- остальные изображения — без `<link rel="preload">`.

### Во время истории

- текущая сцена и следующая сцена загружаются заранее;
- следующую сцену начинать загружать через IntersectionObserver за
  `100–150vh` до её начала;
- `img.decode()` вызывается вне scroll callback, затем один раз планируется
  ScrollTrigger refresh, если геометрия действительно изменилась;
- сцены дальше `±1` на mobile и `±2` на desktop сохраняют placeholder с
  фиксированным aspect ratio, но не обязаны иметь активный `src`;
- при удалении `src` нужно гарантировать быстрый обратный скролл: соседняя
  предыдущая сцена остаётся декодированной, дальняя восстанавливается до входа
  пользователя в pin.

Не считать, что удаление DOM немедленно освобождает GPU memory: это проверяется
в Safari/WebView Memory tools. При pressure предпочтительнее убрать
дублированные панели и mask-слои, а не основной кадр текущей сцены.

## 6. Viewport и safe area

### CSS-стратегия

Для страницы задать fallback каскадом:

```css
.comic-stage {
  min-height: 100vh;
  min-height: 100svh;
  height: var(--story-stable-height, 100svh);
}

.comic-interactive-safe-zone {
  padding-top: max(16px, var(--tg-content-safe-top, env(safe-area-inset-top)));
  padding-right: max(12px, var(--tg-content-safe-right, env(safe-area-inset-right)));
  padding-bottom: max(16px, var(--tg-content-safe-bottom, env(safe-area-inset-bottom)));
  padding-left: max(12px, var(--tg-content-safe-left, env(safe-area-inset-left)));
}
```

На desktop `100dvh` можно использовать как визуальную высоту. На mobile длина
pin и scroll-distance должна опираться на стабильную высоту (`100svh` или
Telegram `viewportStableHeight`), иначе адресная строка Safari будет
пересчитывать timeline во время жеста.

### Telegram Mini App

Приоритет данных:

1. `WebApp.viewportStableHeight` для stage;
2. `WebApp.contentSafeAreaInset` для кнопок и читаемого текста;
3. `WebApp.safeAreaInset` для полноэкранного декоративного фона;
4. `env(safe-area-inset-*)` как browser fallback.

Обрабатывать события `viewportChanged`, `safeAreaChanged`,
`contentSafeAreaChanged`, `themeChanged` и `activated`, если они доступны в
целевой версии клиента. API подключается как progressive enhancement:
локальный браузер остаётся рабочим.

Комикс не должен автоматически вызывать `requestFullscreen()`. Он уже может
работать после существующего `expand()`. Fullscreen повышает стоимость
тестирования Back Button и safe area и не нужен для вертикального чтения.

### Browser fallback

Использовать `visualViewport.height` только после стабилизации. На iOS
`resize`/`visualViewport.resize` во время движения browser chrome нужно
объединять и не превращать в непрерывный `ScrollTrigger.refresh()`.

## 7. Scroll и animation performance

- Нативный вертикальный scroll; без Lenis/custom smooth-scroller.
- `touch-action: pan-y` на сценах; декоративные overlays —
  `pointer-events: none`.
- На scrub анимировать в первую очередь `transform` и `opacity`.
- `clip-path`/mask использовать кратко и только для одного крупного слоя.
- Mobile fallback для сложной mask — translate/scale внутри
  `overflow: hidden`.
- Не анимировать полноэкранный `filter: blur()`, большие box-shadow,
  `background-position` или CSS gradients каждый frame.
- Не читать `getBoundingClientRect()` в `onUpdate`.
- Не обновлять React state при каждом scroll tick.
- Ограничить масштаб полноэкранного JPEG примерно `1.12`; большой scale
  увеличивает растровую работу и подчёркивает отсутствие исходника 2x.
- `will-change` добавлять только current scene при `onEnter` и снимать при
  `onLeave`; не ставить на все изображения сразу.
- Не применять `translateZ(0)` всему дереву: это создаёт лишние GPU layers.
- Не использовать случайные keyframes и не создавать DOM-частицы по ходу
  scroll.
- Image и interface particle fields семплировать один раз для нужного состояния,
  рисовать только в окне перехода и очищать вместе с lifecycle своей сцены.
- Скрытые декоративные циклы должны быть остановлены через IntersectionObserver
  или scene lifecycle.

На iOS Safari и WKWebView отдельно проверить `clip-path`, `-webkit-mask`,
`position: fixed` pin и сочетание pin с transform-предками. Не форсировать
`pinType`; сначала оставить auto-detection ScrollTrigger. Если конкретный
клиент даёт дрожание fixed pin, использовать документированный mobile preset
со sticky-stage/transform reveal, а не глобальный workaround для всех.

## 8. Resize, orientation и lifecycle

Все источники resize проходят через один scheduler:

- `ResizeObserver` корневого контейнера;
- `window.orientationchange`;
- `visualViewport.resize`;
- Telegram `viewportChanged`.

Scheduler:

1. отбрасывает изменения только browser chrome, если stable-height не
   изменился;
2. ждёт устойчивого значения `120–200 ms`;
3. в одном frame читает размеры;
4. в следующем применяет CSS variables;
5. вызывает максимум один `ScrollTrigger.refresh()`.

На `visibilitychange: hidden` и Telegram deactivation:

- остановить только ambient/non-scroll timeline комикса;
- не удалять пользовательский прогресс;
- не поддерживать декоративные interval/rAF;
- после `visible`/`activated` перепроверить viewport и выполнить один
  `ScrollTrigger.update()`; refresh — только если геометрия изменилась.

При уходе в игру:

- уничтожить принадлежащие комиксу timelines/trigger;
- снять observers и Telegram listeners;
- восстановить временные inline styles;
- освободить дальние raster layers;
- только после этого монтировать GameApp.

Глобальный `killAll()` запрещён.

## 9. Mobile-specific presets

### iPhone Safari

- stage geometry на `svh`, не на живом `dvh`;
- CTA всегда выше `safe-area-inset-bottom`;
- минимум сложных mask и composited layers;
- проверить возврат после открытия внешнего TON/wallet URL;
- проверить portrait ↔ landscape и восстановление правильного progress;
- не допускать font-size `< 16px` в текстовых input, если они появятся, чтобы
  Safari не делал неожиданный zoom.

### Android Chrome

- учитывать `navigator.connection?.saveData`;
- на mid/low tier снижать плотность particle dust и отключать дополнительные
  хвосты частиц и третий parallax-слой, не возвращаясь к крупным блокам;
- проверять tile memory на DPR 2–3;
- не предполагать наличие `navigator.deviceMemory`; это только дополнительный
  сигнал, а не условие работоспособности.

### Telegram iOS/Android WebView

- story работает без обязательных новых Telegram API;
- `expand()` остаётся, fullscreen не обязателен;
- safe area обновляется на событиях Telegram;
- wallet return/`activated` не создаёт вторую копию timeline;
- deep links `room_*`/`ref_*` не задерживаются intro;
- CTA не перекрывается Telegram bottom controls;
- никакого autoplay audio; звук только после явного действия и с mute.

Low-power preset включается при сочетании coarse pointer с `saveData`, низким
`deviceMemory`/`hardwareConcurrency` либо после явной пользовательской
настройки. Он сохраняет весь контент, но снижает плотность particle dust,
убирает хвосты частиц, flash, третий слой параллакса и многопанельные дубли.

## 10. Fonts и CSS

- Удалить двойную загрузку Google Fonts: оставить один способ.
- Предпочтительно self-host WOFF2 для Press Start 2P и Silkscreen, если
  лицензия и файлы подтверждены.
- Добавить `font-display: swap`.
- Критический заголовок должен иметь fallback с близкими метриками, чтобы
  загрузка шрифта не сдвигала панели.
- Refresh после `document.fonts.ready` выполняется один раз.
- Все стили комикса scope-ятся корневым классом; нельзя менять глобальные
  `body`/`html` так, чтобы сломались `h-screen`, overlays и scroll игры.
- На странице комикса явно поставить `overflow-x: clip` с fallback
  `overflow-x: hidden`, но сначала устранить элементы, реально выходящие за
  ширину.

## 11. Accessibility

- Semantic `<main>`, `<section aria-labelledby>`, последовательные headings.
- Важные сюжетные подписи существуют как HTML, а не только пиксели JPEG.
- Один информативный `alt` на основной кадр; все дубли для reveal —
  `alt=""`, `aria-hidden="true"`.
- Speech bubble читается в DOM-порядке; визуальная позиция не меняет порядок.
- Sound effect и speed lines декоративны, если не несут отдельного смысла.
- Контраст текста проверять на самом тёмном и самом светлом участке кадра;
  использовать непрозрачную comic-подложку, а не text-shadow как единственную
  защиту.
- Touch-target минимум `44 × 44 CSS px`.
- Видимый `:focus-visible`, доступная skip-link к CTA/основному контенту.
- Progress indicator не использует частый `aria-live`.
- Поддержать 200% zoom без горизонтального scroll и обрезки bubble.
- `prefers-reduced-motion: reduce` полностью убирает pin, parallax, shake,
  flash и particle dissolve, но не скрывает изображения, текст или CTA.

## 12. Проверка и профилирование

### Обязательная матрица

| Среда | Размеры/режим |
| --- | --- |
| Chrome desktop | `1440×900`, 100% и 200% zoom |
| Safari iPhone | малый экран и современный Pro, address bar expanded/collapsed |
| Chrome Android | `360×800`, DPR ≥ 2, CPU throttle ×4 |
| Telegram iOS | обычный и expanded viewport, wallet return |
| Telegram Android | expanded viewport, Back, resume после background |
| Reduced motion | desktop и mobile |
| Save-Data / slow 4G | холодный cache |

### Инструменты и сценарии

- Lighthouse mobile: LCP, CLS, INP и transfer;
- Chrome Performance: медленный и быстрый scroll через каждую сцену;
- Layers/Rendering: число composited layers, paint flashing;
- Memory: пройти историю вниз, обратно вверх, открыть игру, затем проверить,
  что scene DOM/listeners не остались;
- Network: ни одного 404, отсутствие eager-загрузки всех 12 файлов;
- PerformanceObserver в dev-сборке: long tasks и LCP;
- реальное устройство: начало, середина и конец каждого timeline.

### Acceptance criteria

- Скролл вверх не вызывает повторных network storms и не ломает кадры.
- Browser chrome не запускает непрерывные refresh.
- После пяти переходов story ↔ game не растёт число listeners/ScrollTrigger.
- При background/foreground нет второй master timeline.
- На mobile нет одновременно более двух полноэкранных masked растров.
- CTA доступен без hover, не закрыт safe area и открывает реальную игру.
- Direct-link Telegram flows работают так же, как до добавления сайта.
- При reduced motion весь сюжет читается как нормальная страница.
- `npm run lint`, `npm run build` и `npm run test:traffic` проходят; comic
  изменения не затрагивают realtime traffic budget.

## 13. Порядок оптимизации

1. Разделить story/game chunks и не монтировать их одновременно.
2. Создать responsive image variants и фиксированную геометрию.
3. Реализовать current/next preload без eager-загрузки остальных сцен.
4. Ввести stable viewport/safe-area слой.
5. Собрать базовые transform/opacity timeline.
6. Добавлять mask/impact по одному, профилируя реальный телефон после каждого.
7. Проверить cleanup, reverse scroll и wallet return.
8. Только после соблюдения бюджетов добавлять второстепенные декоративные
   эффекты.
