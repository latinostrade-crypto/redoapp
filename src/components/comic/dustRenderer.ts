export interface DustTransitionWindow {
  start: number;
  duration: number;
  outgoing: number;
  incoming: number;
  outgoingVisualTime?: number;
  incomingVisualTime?: number;
  outgoingSource?: 'current' | 'next';
  incomingSource?: 'current' | 'next';
  outgoingVisualKind?: 'all' | 'primary';
  incomingVisualKind?: 'all' | 'primary';
  bridge?: boolean;
}

interface DustParticle {
  x: number;
  y: number;
  size: number;
  dustSize: number;
  color: string;
  red: number;
  green: number;
  blue: number;
  group: 'image' | 'interface';
  driftX: number;
  driftY: number;
  delay: number;
  phase: number;
}

interface DustField {
  particles: DustParticle[];
  width: number;
  height: number;
}

interface ParticleDustOptions {
  canvas: HTMLCanvasElement;
  images: HTMLImageElement[];
  visualElements: HTMLElement[];
  nextImages?: HTMLImageElement[];
  nextVisualElements?: HTMLElement[];
  nextReferenceElement?: HTMLElement | null;
  isMobile: boolean;
  seed: number;
}

interface SampleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PixelSample {
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function positionRatio(token: string | undefined) {
  if (!token || token === 'center') return 0.5;
  if (token === 'left' || token === 'top') return 0;
  if (token === 'right' || token === 'bottom') return 1;
  const numeric = Number.parseFloat(token);
  return Number.isFinite(numeric) ? clamp01(numeric / 100) : 0.5;
}

function readObjectPosition(value: string) {
  const tokens = value.trim().split(/\s+/);
  return {
    x: positionRatio(tokens[0]),
    y: positionRatio(tokens[1] ?? tokens[0]),
  };
}

function isTransparent(color: string) {
  return color === 'transparent' || /rgba?\([^)]*[ /,]0(?:\.0+)?\)/.test(color);
}

function relativeBounds(element: Element, canvasRect: DOMRect): SampleBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - canvasRect.left,
    y: rect.top - canvasRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function drawImageForSampling(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasRect: DOMRect,
  canvasWidth: number,
  canvasHeight: number,
) {
  const style = window.getComputedStyle(image);
  const elementBounds = relativeBounds(image, canvasRect);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const paddingTop = Number.parseFloat(style.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
  const areaWidth = Math.max(1, elementBounds.width - paddingLeft - paddingRight);
  const areaHeight = Math.max(1, elementBounds.height - paddingTop - paddingBottom);
  const contain = style.objectFit === 'contain';
  const scale = contain
    ? Math.min(areaWidth / image.naturalWidth, areaHeight / image.naturalHeight)
    : Math.max(areaWidth / image.naturalWidth, areaHeight / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const objectPosition = readObjectPosition(style.objectPosition);
  const x =
    elementBounds.x +
    paddingLeft +
    (areaWidth - drawnWidth) * objectPosition.x;
  const y =
    elementBounds.y +
    paddingTop +
    (areaHeight - drawnHeight) * objectPosition.y;

  context.drawImage(image, x, y, drawnWidth, drawnHeight);

  const visibleX = Math.max(0, x);
  const visibleY = Math.max(0, y);
  const visibleRight = Math.min(canvasWidth, x + drawnWidth);
  const visibleBottom = Math.min(canvasHeight, y + drawnHeight);
  return {
    x: visibleX,
    y: visibleY,
    width: Math.max(1, visibleRight - visibleX),
    height: Math.max(1, visibleBottom - visibleY),
  };
}

function createParticle(
  sample: PixelSample,
  index: number,
  seed: number,
  width: number,
  isMobile: boolean,
  group: 'image' | 'interface' = 'image',
  homeSize?: number,
): DustParticle {
  const noiseA = seededUnit(seed + index * 11.41);
  const noiseB = seededUnit(seed + index * 13.97);
  const noiseC = seededUnit(seed + index * 17.23);
  const direction = seed % 2 === 0 ? 1 : -1;
  const sweepPosition = sample.x / Math.max(1, width);
  const sweep = direction > 0 ? sweepPosition : 1 - sweepPosition;
  const maxSize = isMobile ? 1.45 : 1.75;
  const minSize = group === 'interface' ? 0.58 : 0.52;
  const dustSize = minSize + noiseA * (maxSize - minSize);

  return {
    x: sample.x,
    y: sample.y,
    size: homeSize ?? dustSize,
    dustSize,
    color: `rgb(${sample.red} ${sample.green} ${sample.blue})`,
    red: sample.red,
    green: sample.green,
    blue: sample.blue,
    group,
    driftX:
      direction *
      ((isMobile ? 34 : 52) + noiseB * (isMobile ? 82 : 138)),
    driftY: (noiseC - 0.58) * (isMobile ? 112 : 164),
    delay: Math.min(0.46, sweep * 0.27 + noiseA * 0.19),
    phase: noiseB * Math.PI * 2,
  };
}

function createImageField(
  image: HTMLImageElement,
  referenceElement: HTMLElement,
  width: number,
  height: number,
  targetCount: number,
  seed: number,
  isMobile: boolean,
): DustField | null {
  if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
    return null;
  }

  const samplingCanvas = document.createElement('canvas');
  samplingCanvas.width = Math.max(1, Math.round(width));
  samplingCanvas.height = Math.max(1, Math.round(height));
  const context = samplingCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  let sampleBounds: SampleBounds;
  try {
    sampleBounds = drawImageForSampling(
      context,
      image,
      referenceElement.getBoundingClientRect(),
      samplingCanvas.width,
      samplingCanvas.height,
    );
  } catch {
    return null;
  }

  const pixels = context.getImageData(
    0,
    0,
    samplingCanvas.width,
    samplingCanvas.height,
  ).data;
  const aspect = sampleBounds.width / Math.max(1, sampleBounds.height);
  const columns = Math.max(18, Math.round(Math.sqrt(targetCount * aspect)));
  const rows = Math.max(18, Math.round(targetCount / columns));
  const cellWidth = sampleBounds.width / columns;
  const cellHeight = sampleBounds.height / rows;
  const particles: DustParticle[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const x = Math.min(
        width - 1,
        Math.max(0, sampleBounds.x + column * cellWidth),
      );
      const y = Math.min(
        height - 1,
        Math.max(0, sampleBounds.y + row * cellHeight),
      );
      const sampleX = Math.min(
        samplingCanvas.width - 1,
        Math.max(0, Math.round(x + cellWidth * 0.5)),
      );
      const sampleY = Math.min(
        samplingCanvas.height - 1,
        Math.max(0, Math.round(y + cellHeight * 0.5)),
      );
      const pixelIndex = (sampleY * samplingCanvas.width + sampleX) * 4;
      if (pixels[pixelIndex + 3] < 20) continue;

      particles.push(
        createParticle(
          {
            x,
            y,
            red: Math.min(255, Math.round(pixels[pixelIndex] * 1.08 + 5)),
            green: Math.min(255, Math.round(pixels[pixelIndex + 1] * 1.08 + 5)),
            blue: Math.min(255, Math.round(pixels[pixelIndex + 2] * 1.08 + 5)),
          },
          index,
          seed,
          width,
          isMobile,
          'image',
          Math.max(cellWidth, cellHeight) + 0.7,
        ),
      );
    }
  }

  return { particles, width, height };
}

function drawElementBox(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  canvasRect: DOMRect,
) {
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return;
  const bounds = relativeBounds(element, canvasRect);
  if (bounds.width <= 0 || bounds.height <= 0) return;

  if (!isTransparent(style.backgroundColor)) {
    context.fillStyle = style.backgroundColor;
    context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }

  const borders = [
    ['top', Number.parseFloat(style.borderTopWidth) || 0, style.borderTopColor],
    ['right', Number.parseFloat(style.borderRightWidth) || 0, style.borderRightColor],
    ['bottom', Number.parseFloat(style.borderBottomWidth) || 0, style.borderBottomColor],
    ['left', Number.parseFloat(style.borderLeftWidth) || 0, style.borderLeftColor],
  ] as const;

  for (const [side, borderWidth, color] of borders) {
    if (borderWidth <= 0 || isTransparent(color)) continue;
    context.fillStyle = color;
    if (side === 'top') context.fillRect(bounds.x, bounds.y, bounds.width, borderWidth);
    if (side === 'right') {
      context.fillRect(bounds.x + bounds.width - borderWidth, bounds.y, borderWidth, bounds.height);
    }
    if (side === 'bottom') {
      context.fillRect(bounds.x, bounds.y + bounds.height - borderWidth, bounds.width, borderWidth);
    }
    if (side === 'left') context.fillRect(bounds.x, bounds.y, borderWidth, bounds.height);
  }
}

function drawElementText(
  context: CanvasRenderingContext2D,
  element: HTMLElement,
  canvasRect: DOMRect,
) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    const text = node.textContent ?? '';
    if (parent && text.trim()) {
      const style = window.getComputedStyle(parent);
      if (style.display !== 'none') {
        const fontSize = Number.parseFloat(style.fontSize) || 12;
        context.font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
        context.textBaseline = 'alphabetic';
        context.fillStyle = style.color;
        const strokeWidth =
          Number.parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) || 0;
        const strokeColor = style.getPropertyValue('-webkit-text-stroke-color');

        for (const match of text.matchAll(/\S+/g)) {
          const start = match.index ?? 0;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + match[0].length);
          const rects = Array.from(range.getClientRects());
          for (const rect of rects) {
            const x = rect.left - canvasRect.left;
            const y = rect.bottom - canvasRect.top - Math.max(0, (rect.height - fontSize) * 0.3);
            if (strokeWidth > 0 && !isTransparent(strokeColor)) {
              context.lineWidth = strokeWidth;
              context.strokeStyle = strokeColor;
              context.strokeText(match[0], x, y);
            }
            context.fillText(match[0], x, y);
          }
        }
      }
    }
    node = walker.nextNode();
  }
}

function createInterfaceField(
  referenceElement: HTMLElement,
  visualElements: HTMLElement[],
  visualTime: number,
  width: number,
  height: number,
  targetCount: number,
  seed: number,
  isMobile: boolean,
  visualKind: 'all' | 'primary',
): DustField | null {
  const samplingCanvas = document.createElement('canvas');
  samplingCanvas.width = Math.max(1, Math.round(width));
  samplingCanvas.height = Math.max(1, Math.round(height));
  const context = samplingCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  const canvasRect = referenceElement.getBoundingClientRect();
  const included = visualElements.filter((element) => {
    const revealAt = Number.parseFloat(element.dataset.dustRevealAt ?? '0');
    const matchesKind =
      visualKind === 'all' || element.dataset.dustRole === 'primary';
    return matchesKind && revealAt <= visualTime;
  });
  if (included.length === 0) return null;

  for (const element of included) drawElementBox(context, element, canvasRect);
  for (const element of included) drawElementText(context, element, canvasRect);

  const pixels = context.getImageData(0, 0, samplingCanvas.width, samplingCanvas.height).data;
  const samples: PixelSample[] = [];
  const stride = isMobile ? 2 : 3;
  let opaqueCount = 0;

  for (let y = 0; y < samplingCanvas.height; y += stride) {
    for (let x = 0; x < samplingCanvas.width; x += stride) {
      const pixelIndex = (y * samplingCanvas.width + x) * 4;
      if (pixels[pixelIndex + 3] < 24) continue;
      opaqueCount += 1;
      const sample = {
        x,
        y,
        red: pixels[pixelIndex],
        green: pixels[pixelIndex + 1],
        blue: pixels[pixelIndex + 2],
      };
      if (samples.length < targetCount) {
        samples.push(sample);
        continue;
      }
      const replacement = Math.floor(seededUnit(seed + opaqueCount * 19.37) * opaqueCount);
      if (replacement < targetCount) samples[replacement] = sample;
    }
  }

  const particles = samples.map((sample, index) =>
    createParticle(
      sample,
      index,
      seed,
      width,
      isMobile,
      visualKind === 'primary' ? 'image' : 'interface',
      stride + 0.45,
    ),
  );
  return particles.length > 0 ? { particles, width, height } : null;
}

function drawField(
  context: CanvasRenderingContext2D,
  field: DustField,
  rawProgress: number,
  mode: 'scatter' | 'gather',
  showTrails: boolean,
) {
  let drawn = 0;

  for (const particle of field.particles) {
    const delayed = clamp01(
      (rawProgress - particle.delay) / Math.max(0.01, 1 - particle.delay),
    );
    const progress = smoothstep(delayed);
    const travel = mode === 'scatter' ? progress : 1 - progress;
    const alpha = mode === 'scatter' ? 1 - progress : progress;
    if (alpha <= 0.012) continue;

    const turbulence = Math.sin(progress * Math.PI * 3.4 + particle.phase);
    const x = particle.x + particle.driftX * travel + turbulence * 8 * travel;
    const y = particle.y + particle.driftY * travel - Math.sin(progress * Math.PI) * 16;
    const size = Math.max(
      0.45,
      particle.size + (particle.dustSize - particle.size) * travel,
    );

    context.globalAlpha = alpha * 0.96;
    context.fillStyle = particle.color;
    context.fillRect(Math.round(x), Math.round(y), size, size);

    if (showTrails && particle.size > 1.2 && progress > 0.25 && progress < 0.9) {
      context.globalAlpha = alpha * 0.3;
      context.fillRect(
        Math.round(x - particle.driftX * 0.04),
        Math.round(y - particle.driftY * 0.04),
        Math.max(0.4, size * 0.44),
        Math.max(0.4, size * 0.44),
      );
    }
    drawn += 1;
  }

  return drawn;
}

function drawMorphField(
  context: CanvasRenderingContext2D,
  outgoing: DustField,
  incoming: DustField,
  rawProgress: number,
  showTrails: boolean,
  seed: number,
  bridge: boolean,
) {
  const outgoingCount = outgoing.particles.length;
  const incomingCount = incoming.particles.length;
  const count = Math.max(outgoingCount, incomingCount);
  if (outgoingCount === 0 || incomingCount === 0) return 0;

  const fractureEnd = 0.08;
  const fallEnd = 0.42;
  const imageRiseStart = fallEnd;
  const imageRiseEnd = 0.72;
  const interfaceRiseStart = 0.66;
  const interfaceRiseEnd = 0.94;

  for (let index = 0; index < count; index += 1) {
    const sourceIndex = Math.min(
      outgoingCount - 1,
      Math.floor((index / count) * outgoingCount),
    );
    const targetIndex = Math.min(
      incomingCount - 1,
      Math.floor((index / count) * incomingCount),
    );
    const source = outgoing.particles[sourceIndex];
    const target = incoming.particles[targetIndex];
    const noiseA = seededUnit(seed + index * 23.71);
    const noiseB = seededUnit(seed + index * 31.17);
    const pileX = Math.min(
      outgoing.width + 40,
      Math.max(-40, target.x + (noiseA - 0.5) * outgoing.width * 0.28),
    );
    const pileY = outgoing.height + 18 + noiseB * Math.min(180, outgoing.height * 0.22);
    let x = source.x;
    let y = source.y;
    let size = source.size;
    let colorProgress = 0;
    let motion = 0;

    if (rawProgress <= fractureEnd) {
      const fracture = smoothstep(clamp01(rawProgress / fractureEnd));
      x = source.x + (noiseA - 0.5) * 8 * fracture;
      y = source.y + (noiseB - 0.35) * 6 * fracture;
      size = source.size + (source.dustSize - source.size) * fracture;
      context.globalAlpha = 1;
      motion = fracture;
    } else if (rawProgress <= fallEnd) {
      const fall = smoothstep(
        clamp01((rawProgress - fractureEnd) / (fallEnd - fractureEnd)),
      );
      x = source.x + (pileX - source.x) * fall + Math.sin(fall * Math.PI) * (noiseA - 0.5) * 24;
      y = source.y + (pileY - source.y) * fall;
      size = source.dustSize;
      context.globalAlpha = 1;
      motion = fall;
    } else {
      const isInterface = target.group === 'interface';
      const riseStart = isInterface ? interfaceRiseStart : imageRiseStart;
      const riseEnd = isInterface ? interfaceRiseEnd : imageRiseEnd;
      const rise = smoothstep(
        clamp01((rawProgress - riseStart) / Math.max(0.01, riseEnd - riseStart)),
      );
      x = pileX + (target.x - pileX) * rise + Math.sin(rise * Math.PI) * (noiseB - 0.5) * 18;
      y = pileY + (target.y - pileY) * rise;
      size = Math.max(
        0.45,
        source.dustSize + (target.size - source.dustSize) * rise,
      );
      colorProgress = rise;
      if (bridge) {
        context.globalAlpha = 1;
      } else {
        const fadeStart = isInterface ? 0.96 : 0.78;
        const fadeEnd = isInterface ? 1 : 0.84;
        context.globalAlpha =
          rawProgress > fadeStart
            ? 1 - clamp01(
                (rawProgress - fadeStart) / Math.max(0.01, fadeEnd - fadeStart),
              )
            : 1;
      }
      motion = rise;
    }

    if (context.globalAlpha <= 0.01) continue;

    const red = Math.round(source.red + (target.red - source.red) * colorProgress);
    const green = Math.round(source.green + (target.green - source.green) * colorProgress);
    const blue = Math.round(source.blue + (target.blue - source.blue) * colorProgress);
    context.fillStyle = `rgb(${red} ${green} ${blue})`;
    context.fillRect(Math.round(x), Math.round(y), size, size);

    if (showTrails && motion > 0.2 && motion < 0.9 && size > 1.05) {
      context.globalAlpha = 0.2;
      context.fillRect(
        Math.round(x - (target.x - source.x) * 0.012),
        Math.round(y - Math.max(2, Math.abs(target.y - source.y) * 0.012)),
        Math.max(0.4, size * 0.42),
        Math.max(0.4, size * 0.42),
      );
    }
  }

  return count;
}

export function createParticleDustRenderer({
  canvas,
  images,
  visualElements,
  nextImages = [],
  nextVisualElements = [],
  nextReferenceElement = null,
  isMobile,
  seed,
}: ParticleDustOptions) {
  const context = canvas.getContext('2d', { alpha: true });
  const imageFields = new Map<string, DustField>();
  const interfaceFields = new Map<string, DustField>();
  const compositeFields = new Map<string, DustField>();
  const sources = {
    current: {
      images,
      visualElements,
      referenceElement: canvas as HTMLElement,
    },
    next: nextReferenceElement
      ? {
          images: nextImages,
          visualElements: nextVisualElements,
          referenceElement: nextReferenceElement,
        }
      : null,
  };
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean };
  }).connection;
  const lowPower = Boolean(
    connection?.saveData ||
      (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4),
  );
  const density = lowPower ? 0.62 : 1;
  const imageTargetCount = Math.round((isMobile ? 14000 : 22000) * density);
  const interfaceTargetCount = Math.round((isMobile ? 4500 : 6500) * density);
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let lastTime = 0;
  let lastWindows: DustTransitionWindow[] = [];

  const clear = () => {
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    canvas.dataset.activeParticles = '0';
  };

  const clearFields = () => {
    imageFields.clear();
    interfaceFields.clear();
    compositeFields.clear();
  };

  const resize = () => {
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight));
    const nextRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.2 : 1.5);
    if (nextWidth === width && nextHeight === height && nextRatio === pixelRatio) return;
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextRatio;
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    clearFields();
    clear();
  };

  const getImageField = (sourceName: 'current' | 'next', imageIndex: number) => {
    if (imageIndex < 0) return null;
    const source = sources[sourceName];
    if (!source) return null;
    const key = `${sourceName}:${imageIndex}`;
    const cached = imageFields.get(key);
    if (cached && cached.width === width && cached.height === height) return cached;
    const image = source.images[imageIndex];
    if (!image) return null;
    const field = createImageField(
      image,
      source.referenceElement,
      width,
      height,
      imageTargetCount,
      seed + imageIndex * 1013 + (sourceName === 'next' ? 4099 : 0),
      isMobile,
    );
    if (field) imageFields.set(key, field);
    return field;
  };

  const getInterfaceField = (
    sourceName: 'current' | 'next',
    visualTime: number | undefined,
    visualKind: 'all' | 'primary',
  ) => {
    if (visualTime === undefined || visualTime < 0) return null;
    const source = sources[sourceName];
    if (!source) return null;
    const timeKey = Math.round(visualTime * 1000);
    const key = `${sourceName}:${visualKind}:${timeKey}`;
    const cached = interfaceFields.get(key);
    if (cached && cached.width === width && cached.height === height) return cached;
    const field = createInterfaceField(
      source.referenceElement,
      source.visualElements,
      visualTime,
      width,
      height,
      interfaceTargetCount,
      seed + timeKey * 17 + (sourceName === 'next' ? 4099 : 0),
      isMobile,
      visualKind,
    );
    if (field) interfaceFields.set(key, field);
    return field;
  };

  const getCompositeField = (
    sourceName: 'current' | 'next',
    imageIndex: number,
    visualTime: number | undefined,
    visualKind: 'all' | 'primary',
  ) => {
    const key = `${sourceName}:${imageIndex}:${visualKind}:${visualTime === undefined ? 'none' : Math.round(visualTime * 1000)}`;
    const cached = compositeFields.get(key);
    if (cached && cached.width === width && cached.height === height) return cached;
    const imageField = getImageField(sourceName, imageIndex);
    const interfaceField = getInterfaceField(sourceName, visualTime, visualKind);
    if (!imageField && !interfaceField) return null;
    const field = {
      width,
      height,
      particles: [
        ...(imageField?.particles ?? []),
        ...(interfaceField?.particles ?? []),
      ],
    };
    compositeFields.set(key, field);
    return field;
  };

  const render = (time: number, windows: DustTransitionWindow[]) => {
    lastTime = time;
    lastWindows = windows;
    if (!context) return;
    clear();
    const active = windows.find(
      (window) => time >= window.start && time <= window.start + window.duration,
    );
    if (!active) return;

    const progress = clamp01((time - active.start) / active.duration);
    let drawn = 0;
    const outgoing = getCompositeField(
      active.outgoingSource ?? 'current',
      active.outgoing,
      active.outgoingVisualTime,
      active.outgoingVisualKind ?? 'all',
    );
    const incoming = getCompositeField(
      active.incomingSource ?? 'current',
      active.incoming,
      active.incomingVisualTime,
      active.incomingVisualKind ?? 'all',
    );
    if (outgoing && incoming) {
      drawn = drawMorphField(
        context,
        outgoing,
        incoming,
        progress,
        !lowPower,
        seed + Math.round(active.start * 10000),
        active.bridge ?? false,
      );
    } else {
      if (outgoing && progress <= 0.72) {
        drawn += drawField(
          context,
          outgoing,
          clamp01(progress / 0.72),
          'scatter',
          !lowPower,
        );
      }
      if (incoming && progress >= 0.28) {
        drawn += drawField(
          context,
          incoming,
          clamp01((progress - 0.28) / 0.72),
          'gather',
          !lowPower,
        );
      }
    }
    context.globalAlpha = 1;
    canvas.dataset.activeParticles = String(drawn);
    canvas.dataset.particleBudget = String(imageTargetCount + interfaceTargetCount);
  };

  const handleImageLoad = () => {
    clearFields();
    render(lastTime, lastWindows);
  };
  const allImages = [...images, ...nextImages];
  allImages.forEach((image) => image.addEventListener('load', handleImageLoad));

  const resizeObserver = new ResizeObserver(() => {
    resize();
    render(lastTime, lastWindows);
  });
  resizeObserver.observe(canvas);
  resize();

  return {
    render,
    destroy() {
      resizeObserver.disconnect();
      allImages.forEach((image) => image.removeEventListener('load', handleImageLoad));
      clearFields();
      clear();
    },
  };
}
