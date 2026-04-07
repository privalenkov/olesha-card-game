import { useEffect, useMemo, useState } from 'react';
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import cardBackTextureUrl from '../assets/cards/card-back.png';
import defaultPatternUrl from '../assets/cards/default-pattern.png';
import defaultReflectPatternUrl from '../assets/cards/default-reflect-pattern.png';
import cardLayerOneFrontUrl from '../assets/cards/card-layer-one-front.png';
import cardLayerTwoFrontUrl from '../assets/cards/card-layer-two-front.png';
import rarityStarUrl from '../assets/icons/rarity-star.svg';
import {
  CARD_PREVIEW_HEIGHT,
  CARD_PREVIEW_WIDTH,
  CARD_TEXTURE_HEIGHT,
  CARD_TEXTURE_LAYOUT_HEIGHT,
  CARD_TEXTURE_LAYOUT_WIDTH,
  CARD_TEXTURE_WIDTH,
} from '../game/cardDimensions';
import { finishMeta, rarityMeta } from '../game/config';
import {
  clampWaveHoloSubdivision,
  type CardEffectLayer,
  getDefaultCardVisuals,
  type CardLayoutType,
  normalizeCardLayerFill,
  normalizeCardTreatmentEffect,
  type CardTreatmentEffect,
  type CardVisuals,
  type OwnedCard,
  type Rarity,
} from '../game/types';

interface CardFrontTextureOptions {
  treatmentPaintStrength?: number;
  includeTreatmentLayers?: boolean;
}

type RemoteImageCacheEntry = {
  image: HTMLImageElement | null;
  promise?: Promise<void>;
  status: 'loading' | 'loaded' | 'error';
};

const remoteImageCache = new Map<string, RemoteImageCacheEntry>();
const opaqueImageBoundsCache = new WeakMap<
  HTMLImageElement | HTMLCanvasElement,
  { x: number; y: number; width: number; height: number } | null
>();
const tintedImageCache = new WeakMap<
  HTMLImageElement | HTMLCanvasElement,
  Map<string, HTMLCanvasElement>
>();

function getCardRemoteAssetUrls(card: OwnedCard | null) {
  if (!card) {
    return [];
  }

  return [
    cardBackTextureUrl,
    defaultPatternUrl,
    defaultReflectPatternUrl,
    cardLayerOneFrontUrl,
    cardLayerTwoFrontUrl,
    rarityStarUrl,
    card.urlImage,
    card.visuals?.decorativePattern.svgUrl ?? '',
    ...getCardEffectLayers(card).map((layer) => layer.maskUrl),
  ].filter(Boolean);
}

type CardCornerRadius = number | [number, number, number, number];

interface CardFrontBox {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: CardCornerRadius;
}

interface CardFrontLayout {
  cardType: CardLayoutType;
  titleBox: CardFrontBox & { paddingX: number };
  numberBox: CardFrontBox & { paddingX?: number };
  headerBox?: CardFrontBox;
  heroBox?: CardFrontBox;
  artBox: CardFrontBox;
  rarityBox: CardFrontBox & { paddingX: number };
  descriptionBox: CardFrontBox;
  stars: {
    size: number;
    gap: number;
    filledColor?: string;
    emptyColor?: string;
  };
}

const CARD_FRONT_SURFACE_COLOR = '#f5f0dc';
const CARD_FRONT_TEXT_COLOR = '#080910';
const CARD_FRONT_ART_PLACEHOLDER_COLOR = '#D2D0C6';
const CARD_FRONT_DEFAULT_PATTERN_COLOR = '#9B998F';
const CARD_FRONT_LAYOUTS: Record<CardLayoutType, CardFrontLayout> = {
  type1: {
    cardType: 'type1',
    titleBox: {
      x: 64,
      y: 50,
      width: 582,
      height: 76,
      paddingX: 30,
      radius: 38,
    },
    numberBox: {
      x: 718,
      y: 50,
      width: 264,
      height: 76,
      radius: 38,
    },
    artBox: {
      x: 62,
      y: 205,
      width: 908,
      height: 612,
      radius: [74, 74, 38, 38],
    },
    heroBox: {
      x: 62,
      y: 205,
      width: 908,
      height: 612,
      radius: [74, 74, 38, 38],
    },
    rarityBox: {
      x: 62,
      y: 863,
      width: 908,
      height: 106,
      paddingX: 40,
      radius: 38,
    },
    descriptionBox: {
      x: 96,
      y: 1035,
      width: 800,
      height: 262,
    },
    stars: {
      size: 44,
      gap: 22,
      filledColor: '#EC0B43',
      emptyColor: '#080910',
    },
  },
  type2: {
    cardType: 'type2',
    titleBox: {
      x: 64,
      y: 50,
      width: 582,
      height: 76,
      paddingX: 30,
      radius: 38,
    },
    numberBox: {
      x: 718,
      y: 50,
      width: 264,
      height: 76,
      radius: 38,
    },
    artBox: {
      x: 62,
      y: 205,
      width: 908,
      height: 720,
      radius: [74, 74, 0, 0],
    },
    heroBox: {
      x: 62,
      y: 205,
      width: 908,
      height: 828,
      radius: [74, 74, 38, 38],
    },
    rarityBox: {
      x: 62,
      y: 925,
      width: 908,
      height: 108,
      paddingX: 40,
      radius: [0, 0, 38, 38],
    },
    descriptionBox: {
      x: 104,
      y: 1124,
      width: 812,
      height: 264,
    },
    stars: {
      size: 44,
      gap: 22,
      filledColor: '#EC0B43',
      emptyColor: '#080910',
    },
  },
  type3: {
    cardType: 'type3',
    titleBox: {
      x: 64,
      y: 50,
      width: 582,
      height: 76,
      paddingX: 30,
      radius: 38,
    },
    numberBox: {
      x: 718,
      y: 50,
      width: 264,
      height: 76,
      radius: 38,
    },
    artBox: {
      x: 44,
      y: 183,
      width: 944,
      height: 1219,
      radius: 72,
    },
    heroBox: {
      x: 44,
      y: 183,
      width: 944,
      height: 1219,
      radius: 72,
    },
    rarityBox: {
      x: 104,
      y: 1064,
      width: 816,
      height: 62,
      paddingX: 0,
    },
    descriptionBox: {
      x: 104,
      y: 1182,
      width: 820,
      height: 238,
    },
    stars: {
      size: 44,
      gap: 22,
      filledColor: '#EC0B43',
      emptyColor: '#080910',
    },
  },
  type4: {
    cardType: 'type4',
    titleBox: {
      x: 64,
      y: 80,
      width: 120,
      height: 76,
      paddingX: 30,
      radius: 38,
    },
    numberBox: {
      x: 718,
      y: 50,
      width: 264,
      height: 76,
      radius: 38,
    },
    artBox: {
      x: 44,
      y: 38,
      width: 944,
      height: 1371,
      radius: 72,
    },
    heroBox: {
      x: 44,
      y: 38,
      width: 944,
      height: 1371,
      radius: 72,
    },
    rarityBox: {
      x: 104,
      y: 1062,
      width: 816,
      height: 62,
      paddingX: 0,
    },
    descriptionBox: {
      x: 104,
      y: 1180,
      width: 820,
      height: 246,
    },
    stars: {
      size: 44,
      gap: 22,
      filledColor: '#EC0B43',
      emptyColor: '#080910',
    },
  },
};

function setupTexture(canvas: HTMLCanvasElement, repeat = false): Texture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(1.6, 1.6);
  }

  return texture;
}

function setupDataTexture(canvas: HTMLCanvasElement, repeat = false): Texture {
  const texture = new CanvasTexture(canvas);

  if (repeat) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(1.6, 1.6);
  }

  return texture;
}

function drawRoundedPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: CardCornerRadius,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.closePath();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth =
    image instanceof HTMLImageElement || image instanceof HTMLCanvasElement ? image.width : width;
  const sourceHeight =
    image instanceof HTMLImageElement || image instanceof HTMLCanvasElement ? image.height : height;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = width / height;

  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (sourceAspect > targetAspect) {
    drawWidth = height * sourceAspect;
    drawX = x - (drawWidth - width) / 2;
  } else {
    drawHeight = width / sourceAspect;
    drawY = y - (drawHeight - height) / 2;
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function getOpaqueImageBounds(image: HTMLImageElement | HTMLCanvasElement) {
  if (opaqueImageBoundsCache.has(image)) {
    return opaqueImageBoundsCache.get(image) ?? null;
  }

  try {
    const probeCanvas = createCanvas(image.width, image.height);
    const probeContext = probeCanvas.getContext('2d');

    if (!probeContext) {
      opaqueImageBoundsCache.set(image, null);
      return null;
    }

    probeContext.clearRect(0, 0, probeCanvas.width, probeCanvas.height);
    probeContext.drawImage(image, 0, 0, probeCanvas.width, probeCanvas.height);

    const { data, width, height } = probeContext.getImageData(
      0,
      0,
      probeCanvas.width,
      probeCanvas.height,
    );
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = data[(y * width + x) * 4 + 3];

        if (alpha < 8) {
          continue;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      opaqueImageBoundsCache.set(image, null);
      return null;
    }

    const bounds = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
    opaqueImageBoundsCache.set(image, bounds);
    return bounds;
  } catch {
    opaqueImageBoundsCache.set(image, null);
    return null;
  }
}

function parseHexColor(color: string) {
  const normalized = color.trim();
  const shortMatch = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
    };
  }

  const longMatch = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!longMatch) {
    return { r: 255, g: 255, b: 255 };
  }

  const value = longMatch[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function mixHexColors(colorA: string, colorB: string, amount: number) {
  const t = Math.max(0, Math.min(amount, 1));
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bChannel = Math.round(a.b + (b.b - a.b) * t);

  return `rgb(${r}, ${g}, ${bChannel})`;
}

interface ParsedGradientStop {
  color: string;
  position: number | null;
}

function splitGradientArguments(value: string) {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const character of value) {
    if (character === ',' && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
      continue;
    }

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth = Math.max(0, depth - 1);
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function isSupportedCanvasColor(value: string) {
  return (
    /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value) ||
    /^rgba?\([^)]+\)$/iu.test(value) ||
    /^hsla?\([^)]+\)$/iu.test(value)
  );
}

function parseGradientStop(value: string): ParsedGradientStop | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const positionedMatch = normalized.match(/^(.*)\s(-?\d+(?:\.\d+)?)%\s*$/u);
  if (positionedMatch) {
    return {
      color: positionedMatch[1].trim(),
      position: Math.max(0, Math.min(Number(positionedMatch[2]) / 100, 1)),
    };
  }

  return {
    color: normalized,
    position: null,
  };
}

function resolveGradientStops(
  stops: ParsedGradientStop[],
): Array<{ color: string; position: number }> {
  if (stops.length === 0) {
    return [];
  }

  const total = Math.max(stops.length - 1, 1);
  const resolved = stops.map((stop, index) => ({
    color: stop.color,
    position: stop.position ?? index / total,
  }));

  if (resolved.length === 1) {
    resolved.push({
      color: resolved[0].color,
      position: 1,
    });
  }

  return resolved.sort((left, right) => left.position - right.position);
}

function createLinearGradientFillStyle(
  ctx: CanvasRenderingContext2D,
  fillValue: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const gradientMatch = fillValue.match(/^linear-gradient\((.*)\)$/iu);
  if (!gradientMatch) {
    return null;
  }

  const parts = splitGradientArguments(gradientMatch[1]);
  if (parts.length < 2) {
    return null;
  }

  let angle = 180;
  let stopParts = parts;
  const angleMatch = parts[0].match(/^(-?\d+(?:\.\d+)?)deg$/iu);

  if (angleMatch) {
    angle = Number(angleMatch[1]);
    stopParts = parts.slice(1);
  }

  const stops = resolveGradientStops(
    stopParts
      .map(parseGradientStop)
      .filter((stop): stop is ParsedGradientStop => Boolean(stop && stop.color.length > 0)),
  );

  if (stops.length < 2) {
    return null;
  }

  const radians = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const halfSpan = Math.abs(dx) * (width / 2) + Math.abs(dy) * (height / 2);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const gradient = ctx.createLinearGradient(
    centerX - dx * halfSpan,
    centerY - dy * halfSpan,
    centerX + dx * halfSpan,
    centerY + dy * halfSpan,
  );

  stops.forEach((stop) => {
    gradient.addColorStop(stop.position, stop.color);
  });

  return gradient;
}

function createCanvasFillStyle(
  ctx: CanvasRenderingContext2D,
  fillValue: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fallbackValue: string,
): string | CanvasGradient {
  const candidates = [
    normalizeCardLayerFill(fillValue, fallbackValue),
    normalizeCardLayerFill(fallbackValue, CARD_FRONT_SURFACE_COLOR),
    CARD_FRONT_SURFACE_COLOR,
  ];

  for (const candidate of candidates) {
    if (isSupportedCanvasColor(candidate)) {
      return candidate;
    }

    const gradient = createLinearGradientFillStyle(ctx, candidate, x, y, width, height);
    if (gradient) {
      return gradient;
    }
  }

  return CARD_FRONT_SURFACE_COLOR;
}

function fillRectWithVisualFill(
  ctx: CanvasRenderingContext2D,
  fillValue: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fallbackValue: string,
) {
  ctx.fillStyle = createCanvasFillStyle(ctx, fillValue, x, y, width, height, fallbackValue);
  ctx.fillRect(x, y, width, height);
}

function drawTintedPatternImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  options: {
    opacity?: number;
    highlightOpacity?: number;
    clipRadius?: CardCornerRadius;
    cropToOpaqueBounds?: boolean;
  } = {},
) {
  if (!image) {
    return;
  }

  const opacity = options.opacity ?? 1;
  const highlightOpacity = options.highlightOpacity ?? 0;
  const patternCanvas = createCanvas(width, height);
  const patternContext = patternCanvas.getContext('2d');

  if (!patternContext) {
    return;
  }

  const opaqueBounds = options.cropToOpaqueBounds ? getOpaqueImageBounds(image) : null;

  const drawPattern = (target: CanvasRenderingContext2D) => {
    if (opaqueBounds) {
      const sourceAspect = opaqueBounds.width / opaqueBounds.height;
      const targetAspect = width / height;
      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;

      if (sourceAspect > targetAspect) {
        drawWidth = height * sourceAspect;
        drawX = -(drawWidth - width) / 2;
      } else {
        drawHeight = width / sourceAspect;
        drawY = -(drawHeight - height) / 2;
      }

      target.drawImage(
        image,
        opaqueBounds.x,
        opaqueBounds.y,
        opaqueBounds.width,
        opaqueBounds.height,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
      return;
    }

    drawImageCover(target, image, 0, 0, width, height);
  };

  patternContext.fillStyle = color;
  patternContext.fillRect(0, 0, width, height);
  patternContext.globalCompositeOperation = 'destination-in';
  patternContext.imageSmoothingEnabled = true;
  patternContext.imageSmoothingQuality = 'high';
  drawPattern(patternContext);

  ctx.save();
  if (options.clipRadius) {
    drawRoundedPanel(ctx, x, y, width, height, options.clipRadius);
    ctx.clip();
  }
  ctx.globalAlpha = opacity;
  ctx.drawImage(patternCanvas, x, y, width, height);
  ctx.restore();

  if (highlightOpacity <= 0) {
    return;
  }

  const highlightCanvas = createCanvas(width, height);
  const highlightContext = highlightCanvas.getContext('2d');

  if (!highlightContext) {
    return;
  }

  const highlight = highlightContext.createLinearGradient(0, 0, width, height);
  highlight.addColorStop(0, 'rgba(255,255,255,0.84)');
  highlight.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  highlight.addColorStop(1, 'rgba(255,255,255,0)');
  highlightContext.fillStyle = highlight;
  highlightContext.fillRect(0, 0, width, height);
  highlightContext.globalCompositeOperation = 'destination-in';
  highlightContext.imageSmoothingEnabled = true;
  highlightContext.imageSmoothingQuality = 'high';
  drawPattern(highlightContext);

  ctx.save();
  if (options.clipRadius) {
    drawRoundedPanel(ctx, x, y, width, height, options.clipRadius);
    ctx.clip();
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = highlightOpacity;
  ctx.drawImage(highlightCanvas, x, y, width, height);
  ctx.restore();
}

function formatCardSerial(card: OwnedCard) {
  const source = card.instanceId || card.id || card.title;
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 90000;
  }

  return String(hash + 10000).padStart(5, '0');
}

function getRarityStarCount(rarity: OwnedCard['rarity']) {
  switch (rarity) {
    case 'common':
      return 1;
    case 'uncommon':
      return 2;
    case 'rare':
      return 3;
    case 'epic':
      return 4;
    case 'veryrare':
      return 5;
  }
}

function createWrappedTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      return;
    }

    lines.push(line);
    line = word;
  });

  if (line) {
    lines.push(line);
  }

  return lines;
}

function drawTintedTemplateLayer(
  ctx: CanvasRenderingContext2D,
  layerImage: HTMLImageElement | null,
  fillValue: string,
  options: {
    detailAlpha?: number;
    fallbackRadius?: number;
    fallbackValue?: string;
  } = {},
) {
  const detailAlpha = options.detailAlpha ?? 0.72;
  const fallbackRadius = options.fallbackRadius ?? 56;
  const fallbackValue = options.fallbackValue ?? CARD_FRONT_SURFACE_COLOR;

  if (layerImage) {
    const baseCanvas = createCanvas(ctx.canvas.width, ctx.canvas.height);
    const baseContext = baseCanvas.getContext('2d');

    if (baseContext) {
      fillRectWithVisualFill(
        baseContext,
        fillValue,
        0,
        0,
        baseCanvas.width,
        baseCanvas.height,
        fallbackValue,
      );
      baseContext.globalCompositeOperation = 'destination-in';
      baseContext.drawImage(layerImage, 0, 0, baseCanvas.width, baseCanvas.height);
      ctx.drawImage(baseCanvas, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = detailAlpha;
      ctx.drawImage(layerImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
      return;
    }
  }

  ctx.fillStyle = createCanvasFillStyle(
    ctx,
    fillValue,
    0,
    0,
    ctx.canvas.width,
    ctx.canvas.height,
    fallbackValue,
  );
  drawRoundedPanel(ctx, 0, 0, ctx.canvas.width, ctx.canvas.height, fallbackRadius);
  ctx.fill();
}

function drawDecorativePatternAcrossCanvas(
  ctx: CanvasRenderingContext2D,
  decorativePatternImage: HTMLImageElement | null,
  pattern: CardVisuals['decorativePattern'],
) {
  if (!decorativePatternImage || !pattern.svgUrl || pattern.opacity <= 0.001) {
    return;
  }

  const naturalWidth = Math.max(decorativePatternImage.width, 1);
  const naturalHeight = Math.max(decorativePatternImage.height, 1);
  const longestSide = Math.max(naturalWidth, naturalHeight, 1);
  const drawWidth = Math.max(10, (naturalWidth / longestSide) * pattern.size);
  const drawHeight = Math.max(10, (naturalHeight / longestSide) * pattern.size);
  const stepX = Math.max(drawWidth + pattern.gap, 1);
  const stepY = Math.max(drawHeight + pattern.gap, 1);
  const startX = -drawWidth + positiveModulo(pattern.offsetX, stepX);
  const startY = -drawHeight + positiveModulo(pattern.offsetY, stepY);

  ctx.save();
  ctx.globalAlpha = pattern.opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let y = startY; y < ctx.canvas.height + stepY; y += stepY) {
    for (let x = startX; x < ctx.canvas.width + stepX; x += stepX) {
      ctx.drawImage(decorativePatternImage, x, y, drawWidth, drawHeight);
    }
  }

  ctx.restore();
}

function drawSingleLineTextInBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: CardFrontBox,
  options: {
    maxFontSize: number;
    minFontSize: number;
    fontWeight?: string;
    fontFamily?: string;
    color?: string;
    align?: CanvasTextAlign;
    paddingX?: number;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetY?: number;
  },
) {
  const fontFamily = options.fontFamily ?? 'Space Grotesk, sans-serif';
  const fontWeight = options.fontWeight ?? '700';
  const paddingX = options.paddingX ?? 0;
  let fontSize = options.maxFontSize;

  while (fontSize > options.minFontSize) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    if (ctx.measureText(text).width <= box.width - paddingX * 2) {
      break;
    }

    fontSize -= 1;
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = options.color ?? CARD_FRONT_TEXT_COLOR;
  ctx.textBaseline = 'middle';
  ctx.textAlign = options.align ?? 'left';
  ctx.shadowColor = options.shadowColor ?? 'rgba(0,0,0,0)';
  ctx.shadowBlur = options.shadowBlur ?? 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = options.shadowOffsetY ?? 0;

  const centerY = box.y + box.height / 2;
  if ((options.align ?? 'left') === 'center') {
    ctx.fillText(text, box.x + box.width / 2, centerY);
    return;
  }

  if ((options.align ?? 'left') === 'right') {
    ctx.fillText(text, box.x + box.width - paddingX, centerY);
    return;
  }

  ctx.fillText(text, box.x + paddingX, centerY);
}

function drawWrappedTextInBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: CardFrontBox,
  options: {
    maxFontSize: number;
    minFontSize: number;
    lineHeightMultiplier?: number;
    fontWeight?: string;
    fontFamily?: string;
    color?: string;
    align?: CanvasTextAlign;
    paddingX?: number;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetY?: number;
  },
) {
  const fontFamily = options.fontFamily ?? 'Space Grotesk, sans-serif';
  const fontWeight = options.fontWeight ?? '700';
  const lineHeightMultiplier = options.lineHeightMultiplier ?? 0.94;
  const paddingX = options.paddingX ?? 0;
  const availableWidth = Math.max(box.width - paddingX * 2, 1);
  const minFontSize = Math.min(options.minFontSize, options.maxFontSize);
  let fontSize = options.maxFontSize;
  let lines = [text];
  let lineHeight = fontSize * lineHeightMultiplier;

  while (fontSize >= minFontSize) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    lines = createWrappedTextLines(ctx, text, availableWidth);
    lineHeight = fontSize * lineHeightMultiplier;
    const widestLine = lines.reduce(
      (maxWidth, line) => Math.max(maxWidth, ctx.measureText(line).width),
      0,
    );

    if (
      (widestLine <= availableWidth && lines.length * lineHeight <= box.height) ||
      fontSize === minFontSize
    ) {
      break;
    }

    fontSize -= 1;
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = options.color ?? CARD_FRONT_TEXT_COLOR;
  ctx.textBaseline = 'top';
  ctx.textAlign = options.align ?? 'left';
  ctx.shadowColor = options.shadowColor ?? 'rgba(0,0,0,0)';
  ctx.shadowBlur = options.shadowBlur ?? 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = options.shadowOffsetY ?? 0;

  const totalTextHeight = lines.length * lineHeight;
  const startY = box.y + Math.max((box.height - totalTextHeight) / 2, 0);

  lines.forEach((line, index) => {
    if ((options.align ?? 'left') === 'center') {
      ctx.fillText(line, box.x + box.width / 2, startY + index * lineHeight);
      return;
    }

    if ((options.align ?? 'left') === 'right') {
      ctx.fillText(line, box.x + box.width - paddingX, startY + index * lineHeight);
      return;
    }

    ctx.fillText(line, box.x + paddingX, startY + index * lineHeight);
  });
}

function drawParagraphTextInBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: CardFrontBox,
  options: {
    maxFontSize: number;
    minFontSize: number;
    lineHeightMultiplier?: number;
    fontWeight?: string;
    fontFamily?: string;
    color?: string;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetY?: number;
  },
) {
  const fontFamily = options.fontFamily ?? 'Sora, sans-serif';
  const fontWeight = options.fontWeight ?? '500';
  const lineHeightMultiplier = options.lineHeightMultiplier ?? 1.26;
  const minFontSize = Math.min(options.minFontSize, options.maxFontSize);
  let fontSize = options.maxFontSize;
  let lines = [text];
  let lineHeight = fontSize * lineHeightMultiplier;

  while (fontSize >= minFontSize) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    lines = createWrappedTextLines(ctx, text, box.width);
    lineHeight = fontSize * lineHeightMultiplier;

    if (lines.length * lineHeight <= box.height || fontSize === minFontSize) {
      break;
    }

    fontSize -= 1;
  }

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = options.color ?? CARD_FRONT_TEXT_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = options.shadowColor ?? 'rgba(0,0,0,0)';
  ctx.shadowBlur = options.shadowBlur ?? 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = options.shadowOffsetY ?? 0;

  lines.forEach((line, index) => {
    ctx.fillText(line, box.x, box.y + index * lineHeight);
  });
}

function drawStarShape(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
) {
  ctx.beginPath();

  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * (Math.PI / 5);
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
}

function drawRarityStars(
  ctx: CanvasRenderingContext2D,
  card: OwnedCard,
  box: CardFrontLayout['rarityBox'],
  starImage: HTMLImageElement | null,
  starConfig: CardFrontLayout['stars'],
) {
  const totalStars = 5;
  const filledStars = getRarityStarCount(card.rarity);
  const totalWidth = totalStars * starConfig.size + (totalStars - 1) * starConfig.gap;
  const startX = box.x + box.width - box.paddingX - totalWidth;
  const startY = box.y + (box.height - starConfig.size) / 2;
  const filledColor = starConfig.filledColor ?? '#EC0B43';
  const emptyColor = starConfig.emptyColor ?? '#080910';

  for (let index = 0; index < totalStars; index += 1) {
    const x = startX + index * (starConfig.size + starConfig.gap);
    const starColor = index < filledStars ? filledColor : emptyColor;
    const tintedStarImage = starImage
      ? getTintedImageVariant(starImage, starColor, starConfig.size, starConfig.size)
      : null;

    if (tintedStarImage) {
      ctx.drawImage(tintedStarImage, x, startY, starConfig.size, starConfig.size);
      continue;
    }

    ctx.fillStyle = starColor;
    drawStarShape(
      ctx,
      x + starConfig.size / 2,
      startY + starConfig.size / 2,
      starConfig.size / 2,
      starConfig.size * 0.22,
    );
    ctx.fill();
  }
}

function getRarityStarsBox(layout: CardFrontLayout) {
  return layout.cardType === 'type3' || layout.cardType === 'type4'
    ? { ...layout.rarityBox, paddingX: 0 }
    : layout.rarityBox;
}

function eraseRarityStarsFromMask(
  ctx: CanvasRenderingContext2D,
  layout: CardFrontLayout,
  bleed = 3,
) {
  const starBox = getRarityStarsBox(layout);
  const totalStars = 5;
  const { stars } = layout;
  const totalWidth = totalStars * stars.size + (totalStars - 1) * stars.gap;
  const startX = starBox.x + starBox.width - starBox.paddingX - totalWidth;
  const startY = starBox.y + (starBox.height - stars.size) / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000000';

  for (let index = 0; index < totalStars; index += 1) {
    const x = startX + index * (stars.size + stars.gap);
    drawStarShape(
      ctx,
      x + stars.size / 2,
      startY + stars.size / 2,
      stars.size / 2 + bleed,
      stars.size * 0.22 + bleed * 0.5,
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawRarityStarsOverlay(
  ctx: CanvasRenderingContext2D,
  card: OwnedCard,
  layout: CardFrontLayout,
  rarityStarImage: HTMLImageElement | null,
) {
  const rarityBox = getRarityStarsBox(layout);

  drawRarityStars(ctx, card, rarityBox, rarityStarImage, layout.stars);
}

function ensureRemoteImage(url: string) {
  const cached = remoteImageCache.get(url);
  if (cached) {
    return cached;
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.referrerPolicy = 'no-referrer';

  const entry: RemoteImageCacheEntry = {
    image: null,
    status: 'loading',
  };

  entry.promise = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      remoteImageCache.set(url, {
        image,
        status: 'loaded',
      });
      resolve();
    };

    image.onerror = () => {
      remoteImageCache.set(url, {
        image: null,
        status: 'error',
      });
      reject(new Error(`Failed to load remote image: ${url}`));
    };
  });

  remoteImageCache.set(url, entry);
  image.src = url;

  return entry;
}

function useRemoteImage(url: string | null) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!url) {
      return;
    }

    const entry = ensureRemoteImage(url);
    if (entry.status === 'loaded' || entry.status === 'error' || !entry.promise) {
      return;
    }

    let cancelled = false;

    entry.promise
      .then(() => {
        if (!cancelled) {
          setVersion((current) => current + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVersion((current) => current + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!url) {
    return null;
  }

  const entry = remoteImageCache.get(url);
  if (!entry || entry.status !== 'loaded') {
    return null;
  }

  return entry.image;
}

function useRemoteImages(urls: string[]) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const nonEmptyUrls = urls.filter(Boolean);

    if (nonEmptyUrls.length === 0) {
      return;
    }

    const pending = nonEmptyUrls
      .map((url) => ensureRemoteImage(url))
      .filter((entry) => entry.status === 'loading' && entry.promise)
      .map((entry) => entry.promise as Promise<void>);

    if (pending.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.allSettled(pending).then(() => {
      if (!cancelled) {
        setVersion((current) => current + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [urls]);

  return useMemo(
    () =>
      urls.map((url) => {
        if (!url) {
          return null;
        }

        const entry = remoteImageCache.get(url);
        return entry?.status === 'loaded' ? entry.image : null;
      }),
    [urls, version],
  );
}

export function preloadCardTextureAssets(cards: OwnedCard[] | OwnedCard | null) {
  const list = Array.isArray(cards) ? cards : cards ? [cards] : [];
  const urls = Array.from(new Set(list.flatMap((card) => getCardRemoteAssetUrls(card))));

  if (urls.length === 0) {
    return Promise.resolve();
  }

  const pending = urls.map((url) => {
    const entry = ensureRemoteImage(url);
    return entry.status === 'loading' && entry.promise ? entry.promise : Promise.resolve();
  });

  return Promise.allSettled(pending).then(() => undefined);
}

export function useCardTextureAssetsReady(card: OwnedCard | null) {
  const [version, setVersion] = useState(0);
  const assetUrls = useMemo(
    () => Array.from(new Set(getCardRemoteAssetUrls(card))),
    [card],
  );

  useEffect(() => {
    if (assetUrls.length === 0) {
      return;
    }

    const pending = assetUrls
      .map((url) => ensureRemoteImage(url))
      .filter((entry) => entry.status === 'loading' && entry.promise)
      .map((entry) => entry.promise as Promise<void>);

    if (pending.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.allSettled(pending).then(() => {
      if (!cancelled) {
        setVersion((current) => current + 1);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [assetUrls]);

  return useMemo(() => {
    if (assetUrls.length === 0) {
      return true;
    }

    return assetUrls.every((url) => {
      const entry = remoteImageCache.get(url);
      return entry?.status === 'loaded' || entry?.status === 'error';
    });
  }, [assetUrls, version]);
}

function addNoise(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
) {
  ctx.save();
  ctx.globalAlpha = 0.045;
  for (let index = 0; index < amount; index += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 2 + 0.3;
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function getCardVisuals(card: OwnedCard): CardVisuals {
  return card.visuals ?? getDefaultCardVisuals();
}

function getCardFrontLayout(card: OwnedCard): CardFrontLayout {
  return CARD_FRONT_LAYOUTS[getCardVisuals(card).cardType];
}

function getCardEffectLayers(card: OwnedCard): CardEffectLayer[] {
  const layers = card.effectLayers ?? [];
  const seenTypes = new Set<CardTreatmentEffect>();

  return layers.flatMap((layer) => {
    const type = normalizeCardTreatmentEffect(layer.type);
    if (!type || seenTypes.has(type)) {
      return [];
    }

    seenTypes.add(type);
    return [{ ...layer, type }];
  });
}

function clipDecorativePatternOutsideHero(
  ctx: CanvasRenderingContext2D,
  heroX: number,
  heroY: number,
  heroWidth: number,
  heroHeight: number,
) {
  const clipPath = new Path2D();
  clipPath.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
  clipPath.roundRect(heroX, heroY, heroWidth, heroHeight, 42);
  ctx.clip(clipPath, 'evenodd');
}

function positiveModulo(value: number, step: number) {
  return ((value % step) + step) % step;
}

function drawDecorativePattern(
  ctx: CanvasRenderingContext2D,
  decorativePatternImage: HTMLImageElement | null,
  pattern: CardVisuals['decorativePattern'],
  heroX: number,
  heroY: number,
  heroWidth: number,
  heroHeight: number,
) {
  if (!decorativePatternImage || !pattern.svgUrl || pattern.opacity <= 0.001) {
    return;
  }

  const naturalWidth = Math.max(decorativePatternImage.width, 1);
  const naturalHeight = Math.max(decorativePatternImage.height, 1);
  const longestSide = Math.max(naturalWidth, naturalHeight, 1);
  const drawWidth = Math.max(10, (naturalWidth / longestSide) * pattern.size);
  const drawHeight = Math.max(10, (naturalHeight / longestSide) * pattern.size);
  const stepX = Math.max(drawWidth + pattern.gap, 1);
  const stepY = Math.max(drawHeight + pattern.gap, 1);
  const startX = -drawWidth + positiveModulo(pattern.offsetX, stepX);
  const startY = -drawHeight + positiveModulo(pattern.offsetY, stepY);

  ctx.save();
  clipDecorativePatternOutsideHero(ctx, heroX, heroY, heroWidth, heroHeight);
  ctx.globalAlpha = pattern.opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (let y = startY; y < ctx.canvas.height + stepY; y += stepY) {
    for (let x = startX; x < ctx.canvas.width + stepX; x += stepX) {
      ctx.drawImage(decorativePatternImage, x, y, drawWidth, drawHeight);
    }
  }

  ctx.restore();
}

function fillRoundedPanelWithVisualFill(
  ctx: CanvasRenderingContext2D,
  fillValue: string,
  box: CardFrontBox,
  fallbackValue: string,
) {
  ctx.save();
  drawRoundedPanel(ctx, box.x, box.y, box.width, box.height, box.radius ?? 0);
  ctx.clip();
  ctx.fillStyle = createCanvasFillStyle(
    ctx,
    fillValue,
    box.x,
    box.y,
    box.width,
    box.height,
    fallbackValue,
  );
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();
}

function fillRoundedPanelWithTemplateLayer(
  ctx: CanvasRenderingContext2D,
  box: CardFrontBox,
  layerImage: HTMLImageElement | null,
  fillValue: string,
  fallbackValue: string,
  detailAlpha = 0.66,
) {
  if (!layerImage) {
    fillRoundedPanelWithVisualFill(ctx, fillValue, box, fallbackValue);
    return;
  }

  const baseCanvas = createCanvas(ctx.canvas.width, ctx.canvas.height);
  const baseContext = baseCanvas.getContext('2d');

  if (!baseContext) {
    fillRoundedPanelWithVisualFill(ctx, fillValue, box, fallbackValue);
    return;
  }

  baseContext.fillStyle = createCanvasFillStyle(
    baseContext,
    fillValue,
    0,
    0,
    baseCanvas.width,
    baseCanvas.height,
    fallbackValue,
  );
  baseContext.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
  baseContext.globalCompositeOperation = 'destination-in';
  baseContext.drawImage(layerImage, 0, 0, baseCanvas.width, baseCanvas.height);

  ctx.save();
  drawRoundedPanel(ctx, box.x, box.y, box.width, box.height, box.radius ?? 0);
  ctx.clip();
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = detailAlpha;
  ctx.drawImage(layerImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function fillRoundedPanelWithColor(
  ctx: CanvasRenderingContext2D,
  box: CardFrontBox,
  color: string | CanvasGradient,
) {
  drawRoundedPanel(ctx, box.x, box.y, box.width, box.height, box.radius ?? 0);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedPanel(
  ctx: CanvasRenderingContext2D,
  box: CardFrontBox,
  color: string,
  width: number,
) {
  drawRoundedPanel(ctx, box.x, box.y, box.width, box.height, box.radius ?? 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawArtImageInBox(
  ctx: CanvasRenderingContext2D,
  box: CardFrontBox,
  artImage: HTMLImageElement | null,
  defaultPatternImage: HTMLImageElement | null,
  options: {
    placeholderColor?: string;
    borderColor?: string;
    borderWidth?: number;
    imageFilter?: string;
  } = {},
) {
  const placeholderColor = options.placeholderColor ?? CARD_FRONT_ART_PLACEHOLDER_COLOR;

  ctx.save();
  drawRoundedPanel(ctx, box.x, box.y, box.width, box.height, box.radius ?? 0);
  ctx.clip();
  ctx.fillStyle = placeholderColor;
  ctx.fillRect(box.x, box.y, box.width, box.height);

  if (artImage) {
    ctx.save();
    ctx.filter = options.imageFilter ?? 'saturate(1.04) contrast(1.03)';
    drawImageCover(ctx, artImage, box.x, box.y, box.width, box.height);
    ctx.restore();
  } else {
    drawTintedPatternImage(
      ctx,
      defaultPatternImage,
      box.x,
      box.y,
      box.width,
      box.height,
      CARD_FRONT_DEFAULT_PATTERN_COLOR,
      {
        opacity: 0.92,
        clipRadius: box.radius ?? 0,
      },
    );
  }

  ctx.restore();

  if (options.borderColor && options.borderWidth) {
    strokeRoundedPanel(ctx, box, options.borderColor, options.borderWidth);
  }
}

function drawBottomReadabilityShade(
  ctx: CanvasRenderingContext2D,
  box: CardFrontBox,
  options: {
    startY: number;
    topAlpha: number;
    bottomAlpha: number;
  },
) {
  const gradient = ctx.createLinearGradient(0, options.startY, 0, box.y + box.height);
  gradient.addColorStop(0, `rgba(5, 7, 11, ${options.topAlpha})`);
  gradient.addColorStop(1, `rgba(5, 7, 11, ${options.bottomAlpha})`);
  ctx.save();
  drawRoundedPanel(ctx, box.x, box.y, box.width, box.height, box.radius ?? 0);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(box.x, options.startY, box.width, box.y + box.height - options.startY);
  ctx.restore();
}

function drawDecorativePatternMask(
  card: OwnedCard,
  decorativePatternImage: HTMLImageElement | null,
  layerOneImage: HTMLImageElement | null,
  layerTwoImage: HTMLImageElement | null,
) {
  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const visuals = getCardVisuals(card);
  const layout = getCardFrontLayout(card);
  drawDecorativePatternAcrossCanvas(ctx, decorativePatternImage, visuals.decorativePattern);

  if (layout.cardType === 'type1') {
    if (layerOneImage) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(layerOneImage, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (layerTwoImage) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(layerTwoImage, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  } else {
    ctx.globalCompositeOperation = 'destination-in';
    drawRoundedPanel(ctx, 0, 0, canvas.width, canvas.height, 56);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    drawRoundedPanel(
      ctx,
      (layout.heroBox ?? layout.artBox).x,
      (layout.heroBox ?? layout.artBox).y,
      (layout.heroBox ?? layout.artBox).width,
      (layout.heroBox ?? layout.artBox).height,
      (layout.heroBox ?? layout.artBox).radius ?? 0,
    );
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  return canvas;
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getTintedImageVariant(
  image: HTMLImageElement | HTMLCanvasElement,
  color: string,
  width: number,
  height: number,
) {
  const cachedVariants = tintedImageCache.get(image);
  const cacheKey = `${color}:${width}x${height}`;
  const cached = cachedVariants?.get(cacheKey);

  if (cached) {
    return cached;
  }

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';

  const nextVariants = cachedVariants ?? new Map<string, HTMLCanvasElement>();
  nextVariants.set(cacheKey, canvas);

  if (!cachedVariants) {
    tintedImageCache.set(image, nextVariants);
  }

  return canvas;
}

function createCardTextureLayoutCanvas() {
  return createCanvas(CARD_TEXTURE_LAYOUT_WIDTH, CARD_TEXTURE_LAYOUT_HEIGHT);
}

function finalizeCardTextureCanvas(sourceCanvas: HTMLCanvasElement) {
  if (
    sourceCanvas.width === CARD_TEXTURE_WIDTH &&
    sourceCanvas.height === CARD_TEXTURE_HEIGHT
  ) {
    return sourceCanvas;
  }

  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return sourceCanvas;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function withMaskedLayer(
  ctx: CanvasRenderingContext2D,
  maskImage: CanvasImageSource,
  opacity: number,
  drawEffect: (effectContext: CanvasRenderingContext2D) => void,
  blendMode: GlobalCompositeOperation = 'screen',
) {
  const effectCanvas = createCanvas(ctx.canvas.width, ctx.canvas.height);
  const effectContext = effectCanvas.getContext('2d');
  if (!effectContext) {
    return;
  }

  drawEffect(effectContext);
  effectContext.globalCompositeOperation = 'destination-in';
  effectContext.drawImage(maskImage, 0, 0, effectCanvas.width, effectCanvas.height);

  ctx.save();
  ctx.globalCompositeOperation = blendMode;
  ctx.globalAlpha = opacity;
  ctx.drawImage(effectCanvas, 0, 0);
  ctx.restore();
}

function drawSpotGlossEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const primaryBand = ctx.createLinearGradient(0, 0, width, height);
  primaryBand.addColorStop(0, 'rgba(255,255,255,0)');
  primaryBand.addColorStop(0.2, 'rgba(255,255,255,0.08)');
  primaryBand.addColorStop(0.4, 'rgba(255,255,255,0.96)');
  primaryBand.addColorStop(0.58, 'rgba(255,255,255,0.14)');
  primaryBand.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = primaryBand;
  ctx.fillRect(0, 0, width, height);

  const glossBloom = ctx.createRadialGradient(
    width * 0.3,
    height * 0.22,
    24,
    width * 0.34,
    height * 0.26,
    width * 0.44,
  );
  glossBloom.addColorStop(0, 'rgba(255,255,255,0.95)');
  glossBloom.addColorStop(0.28, 'rgba(255,255,255,0.18)');
  glossBloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glossBloom;
  ctx.fillRect(0, 0, width, height);
}

function drawSpotHoloEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  hue: string,
) {
  const rainbow = ctx.createLinearGradient(0, 0, width, height);
  rainbow.addColorStop(0, '#7fe8ff');
  rainbow.addColorStop(0.2, accent);
  rainbow.addColorStop(0.4, '#fff07f');
  rainbow.addColorStop(0.62, hue);
  rainbow.addColorStop(0.82, '#ff9fd8');
  rainbow.addColorStop(1, '#ffffff');
  ctx.fillStyle = rainbow;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'overlay';
  for (let index = 0; index < 16; index += 1) {
    const x = -width * 0.15 + index * (width * 0.1);
    ctx.save();
    ctx.translate(x, 0);
    ctx.rotate(-0.28);
    ctx.fillStyle = index % 2 === 0 ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, -height * 0.2, width * 0.05, height * 1.5);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawWaveHoloEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  hue: string,
  subdivision = 1,
) {
  const breakup = clampWaveHoloSubdivision(subdivision);
  const seeded = (value: number) => {
    const x = Math.sin(value * 127.13 + 41.37) * 43758.5453123;
    return x - Math.floor(x);
  };

  const baseGradient = ctx.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, '#7ee8ff54');
  baseGradient.addColorStop(0.25, `${accent}4a`);
  baseGradient.addColorStop(0.5, '#ffe56652');
  baseGradient.addColorStop(0.75, `${hue}4a`);
  baseGradient.addColorStop(1, '#b38fff54');
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'overlay';
  const blobColors = [
    'rgba(127,232,255,0.46)',
    'rgba(255,130,179,0.42)',
    'rgba(255,229,100,0.44)',
    'rgba(166,255,142,0.4)',
    'rgba(179,143,255,0.44)',
    'rgba(255,160,90,0.4)',
  ];
  const fragmentCount = 8 + (breakup - 1) * 9;
  const baseRadius = width * (0.25 / Math.pow(breakup, 0.72));

  for (let index = 0; index < fragmentCount; index += 1) {
    const seed = index + 1;
    const centerX = seeded(seed * 0.97) * width;
    const centerY = seeded(seed * 1.73) * height;
    const lobeCount = 2 + Math.floor(seeded(seed * 2.91) * 3);
    const baseAngle = seeded(seed * 3.19) * Math.PI * 2;

    for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
      const lobeSeed = seed * 17 + lobeIndex * 13;
      const radiusVariance = 0.62 + seeded(lobeSeed * 2.11) * 0.82;
      const radius = baseRadius * radiusVariance;
      const stretchX = 0.7 + seeded(lobeSeed * 2.47) * 1.35;
      const stretchY = 0.58 + seeded(lobeSeed * 2.93) * 1.18;
      const offsetAngle =
        baseAngle +
        (lobeIndex / Math.max(1, lobeCount)) * Math.PI * (1.2 + seeded(lobeSeed * 3.31) * 0.7);
      const offsetRadius = radius * (0.18 + seeded(lobeSeed * 1.37) * 0.45);
      const x = centerX + Math.cos(offsetAngle) * offsetRadius;
      const y = centerY + Math.sin(offsetAngle) * offsetRadius * 0.82;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(baseAngle + seeded(lobeSeed * 1.53) * 1.6 - 0.8);
      ctx.scale(stretchX, stretchY);

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      grad.addColorStop(0, blobColors[(index + lobeIndex) % blobColors.length]);
      grad.addColorStop(0.52, 'rgba(255,255,255,0.05)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(-radius * 1.8, -radius * 1.8, radius * 3.6, radius * 3.6);
      ctx.restore();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawCrackedHoloEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  hue: string,
) {
  const seeded = (value: number) => {
    const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453123;
    return x - Math.floor(x);
  };

  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, '#757b84');
  base.addColorStop(0.18, '#d7dde5');
  base.addColorStop(0.42, '#8c929a');
  base.addColorStop(0.68, '#e3e8ef');
  base.addColorStop(1, '#7e848c');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const veil = ctx.createLinearGradient(width * 0.08, 0, width * 0.92, height);
  veil.addColorStop(0, `${accent}18`);
  veil.addColorStop(0.2, '#9be7ff26');
  veil.addColorStop(0.46, `${hue}22`);
  veil.addColorStop(0.7, '#ffe57a20');
  veil.addColorStop(1, `${accent}1a`);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, width, height);

  const bloom = ctx.createRadialGradient(
    width * 0.52,
    height * 0.48,
    width * 0.04,
    width * 0.52,
    height * 0.48,
    width * 0.72,
  );
  bloom.addColorStop(0, 'rgba(255,255,255,0.18)');
  bloom.addColorStop(0.42, 'rgba(255,255,255,0.08)');
  bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, width, height);

  const shardPalette = [
    `${accent}a8`,
    `${hue}94`,
    '#7ee8ffd8',
    '#ffe76dcf',
    '#ffffffee',
    '#ff9bd0be',
  ];

  const drawShardLayer = (count: number, sizeMin: number, sizeMax: number, alphaScale: number) => {
    for (let index = 0; index < count; index += 1) {
      const seed = index + count * (sizeMin + 0.17);
      const x = seeded(seed * 1.13) * (width + 120) - 60;
      const y = seeded(seed * 1.91) * (height + 120) - 60;
      const rotation = seeded(seed * 2.37) * Math.PI * 2;
      const heightSize = sizeMin + seeded(seed * 2.77) * (sizeMax - sizeMin);
      const leftBase = 3 + seeded(seed * 3.11) * heightSize * 1.05;
      const rightBase = 4 + seeded(seed * 3.43) * heightSize * 1.75;
      const tail = 0.45 + seeded(seed * 3.89) * 2.8;
      const skew = (-0.5 + seeded(seed * 4.21)) * heightSize * 0.55;
      const alpha = (0.2 + seeded(seed * 4.61) * 0.75) * alphaScale;
      const primaryColor = shardPalette[Math.floor(seeded(seed * 4.93) * shardPalette.length)];
      const secondaryColor = shardPalette[Math.floor(seeded(seed * 5.29) * shardPalette.length)];

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.globalAlpha = alpha;

      const gradient = ctx.createLinearGradient(
        -leftBase * tail,
        -heightSize,
        rightBase * tail,
        heightSize,
      );
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.18, primaryColor);
      gradient.addColorStop(0.52, 'rgba(255,255,255,0.96)');
      gradient.addColorStop(0.78, secondaryColor);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;

      ctx.beginPath();
      ctx.moveTo(0, -heightSize);
      ctx.lineTo(-leftBase * (0.75 + tail), heightSize * (0.16 + seeded(seed * 5.61) * 0.54));
      ctx.lineTo(
        rightBase * (0.4 + tail * 0.8) + skew,
        heightSize * (0.08 + seeded(seed * 5.97) * 0.9),
      );
      ctx.closePath();
      ctx.fill();

      if (seeded(seed * 6.31) > 0.58) {
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 0.6 + seeded(seed * 6.67) * 0.9;
        ctx.stroke();
      }

      ctx.restore();
    }
  };

  ctx.globalCompositeOperation = 'lighter';
  drawShardLayer(120, 10, 32, 0.34);
  drawShardLayer(220, 6, 20, 0.28);
  drawShardLayer(320, 3, 12, 0.22);

  ctx.globalCompositeOperation = 'screen';
  for (let index = 0; index < 36; index += 1) {
    const seed = 700 + index;
    const x = seeded(seed * 1.7) * width;
    const y = seeded(seed * 2.1) * height;
    const radius = 22 + seeded(seed * 2.5) * 90;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, seeded(seed * 2.9) > 0.5 ? `${accent}36` : `${hue}2c`);
    glow.addColorStop(0.4, 'rgba(255,255,255,0.04)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = 'source-over';
}

function drawTextureSugarEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
) {
  for (let index = 0; index < 1800; index += 1) {
    const x = 24 + ((index * 37) % (width - 48));
    const y = 24 + ((index * 61) % (height - 48));
    const size = 0.6 + ((index * 17) % 12) * 0.12;
    ctx.fillStyle =
      index % 5 === 0 ? `${accent}b8` : index % 2 === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSparkleFoilEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
) {
  const foilVeil = ctx.createLinearGradient(width * 0.12, 0, width * 0.88, height);
  foilVeil.addColorStop(0, 'rgba(255,255,255,0)');
  foilVeil.addColorStop(0.22, 'rgba(255,255,255,0.08)');
  foilVeil.addColorStop(0.5, `${accent}42`);
  foilVeil.addColorStop(0.72, 'rgba(255,255,255,0.14)');
  foilVeil.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = foilVeil;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let index = 0; index < 28; index += 1) {
    const x = 56 + ((index * 149) % (width - 112));
    const y = 56 + ((index * 227) % (height - 112));
    const shardWidth = 16 + ((index * 23) % 26);
    const shardHeight = 10 + ((index * 17) % 16);
    const skew = -6 + ((index * 11) % 12);
    const rotation = -0.88 + (index % 7) * 0.26;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const shardGradient = ctx.createLinearGradient(-shardWidth, -shardHeight, shardWidth, shardHeight);
    shardGradient.addColorStop(0, 'rgba(255,255,255,0)');
    shardGradient.addColorStop(0.28, index % 3 === 0 ? `${accent}8c` : 'rgba(255,255,255,0.18)');
    shardGradient.addColorStop(0.52, 'rgba(255,255,255,0.96)');
    shardGradient.addColorStop(0.74, index % 2 === 0 ? `${accent}58` : 'rgba(255,255,255,0.22)');
    shardGradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = shardGradient;
    ctx.beginPath();
    ctx.moveTo(-shardWidth * 0.58, -shardHeight * 0.08);
    ctx.lineTo(-shardWidth * 0.14, -shardHeight * 0.56);
    ctx.lineTo(shardWidth * 0.62, -shardHeight * 0.18);
    ctx.lineTo(shardWidth * 0.22 + skew, shardHeight * 0.56);
    ctx.lineTo(-shardWidth * 0.5, shardHeight * 0.2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  for (let index = 0; index < 7; index += 1) {
    const x = width * 0.08 + index * (width * 0.13);
    const beamWidth = 12 + (index % 3) * 4;
    const beam = ctx.createLinearGradient(0, -height * 0.24, 0, height * 0.24);
    beam.addColorStop(0, 'rgba(255,255,255,0)');
    beam.addColorStop(0.42, 'rgba(255,255,255,0.08)');
    beam.addColorStop(0.5, index % 2 === 0 ? `${accent}88` : 'rgba(255,255,255,0.66)');
    beam.addColorStop(0.58, 'rgba(255,255,255,0.08)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.save();
    ctx.translate(x, height * (0.18 + (index % 4) * 0.16));
    ctx.rotate(-0.54 + (index % 3) * 0.16);
    ctx.fillStyle = beam;
    ctx.fillRect(-beamWidth / 2, -height * 0.28, beamWidth, height * 0.56);
    ctx.restore();
  }

  ctx.restore();
}

function drawPrismaticEdgeEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  accent: string,
  hue: string,
) {
  const band = ctx.createLinearGradient(0, 0, width, height);
  band.addColorStop(0, '#92efff');
  band.addColorStop(0.25, accent);
  band.addColorStop(0.5, '#fff5a3');
  band.addColorStop(0.75, hue);
  band.addColorStop(1, '#ffffff');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 12;
  ctx.strokeRect(18, 18, width - 36, height - 36);
}

function drawTreatmentLayer(
  ctx: CanvasRenderingContext2D,
  layer: CardEffectLayer,
  maskImage: CanvasImageSource,
  accent: string,
  hue: string,
  paintStrength = 1,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const shimmerFactor = layer.type === 'texture_sugar' ? layer.shimmer : 1;
  const effectiveOpacity = Math.min(1, layer.opacity * paintStrength * shimmerFactor);

  if (effectiveOpacity <= 0.01) {
    return;
  }

  if (layer.type === 'emboss' || layer.type === 'spot_gloss') {
    return;
  }

  const drawEffect = (effectContext: CanvasRenderingContext2D) => {
    switch (layer.type) {
      case 'spot_gloss':
        drawSpotGlossEffect(effectContext, width, height);
        break;
      case 'spot_holo':
        drawSpotHoloEffect(effectContext, width, height, accent, hue);
        break;
      case 'texture_sugar':
        drawTextureSugarEffect(effectContext, width, height, accent);
        break;
      case 'sparkle_foil':
        drawSparkleFoilEffect(effectContext, width, height, accent);
        break;
      case 'prismatic_edge':
        drawPrismaticEdgeEffect(effectContext, width, height, accent, hue);
        break;
      case 'holo_wave':
        drawWaveHoloEffect(effectContext, width, height, accent, hue, layer.subdivision);
        break;
      case 'holo_cracked':
        drawCrackedHoloEffect(effectContext, width, height, accent, hue);
        break;
    }
  };

  const blendMode: GlobalCompositeOperation =
    layer.type === 'texture_sugar' || layer.type === 'sparkle_foil' ? 'screen' : 'screen';

  withMaskedLayer(ctx, maskImage, effectiveOpacity, drawEffect, blendMode);
}

function drawTreatmentLayers(
  ctx: CanvasRenderingContext2D,
  card: OwnedCard,
  maskImages: Array<HTMLImageElement | null>,
  accent: string,
  hue: string,
  paintStrength = 1,
) {
  const effectLayers = getCardEffectLayers(card);

  effectLayers.forEach((layer, index) => {
    const maskImage = maskImages[index];
    if (!maskImage) {
      return;
    }

    drawTreatmentLayer(ctx, layer, maskImage, accent, hue, paintStrength);
  });
}

function createMaskCanvas(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return { canvas, ctx: null };
  }

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

function composeEffectMaskPass(
  ctx: CanvasRenderingContext2D,
  card: OwnedCard,
  maskImages: Array<HTMLImageElement | null>,
  effectTypes: ReadonlyArray<CardTreatmentEffect>,
  options: {
    blur?: number;
    alphaMultiplier?: number;
  } = {},
) {
  const typeSet = new Set(effectTypes);
  const effectLayers = getCardEffectLayers(card);
  const blur = options.blur ?? 0;
  const alphaMultiplier = options.alphaMultiplier ?? 1;

  effectLayers.forEach((layer, index) => {
    if (!typeSet.has(layer.type)) {
      return;
    }

    const maskImage = maskImages[index];
    if (!maskImage) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, layer.opacity * alphaMultiplier);
    ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
    ctx.drawImage(maskImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  });
}

function drawGlossMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['spot_gloss'], {
    blur: 3,
    alphaMultiplier: 0.72,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['spot_gloss'], {
    alphaMultiplier: 0.94,
  });
  return canvas;
}

const EMBOSS_HEIGHT_MARGIN = 18;
const EMBOSS_NORMAL_INTENSITY = 5.2;

function drawEmbossHeightMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  const effectLayers = getCardEffectLayers(card);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Build a softer height profile so strong deboss/emboss keeps readable highlights
  // instead of turning into a hard clipped step.
  composeEffectMaskPass(ctx, card, maskImages, ['emboss'], {
    blur: 5,
    alphaMultiplier: 1,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['emboss'], {
    blur: 1.5,
    alphaMultiplier: 1,
  });

  return canvas;
}

function drawBaseSurfaceHeightMap(card: OwnedCard) {
  const width = CARD_TEXTURE_LAYOUT_WIDTH;
  const height = CARD_TEXTURE_LAYOUT_HEIGHT;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  // Keep the base card surface neutral so the card stays smooth
  // unless an explicit emboss layer adds relief.
  ctx.fillStyle = 'rgb(128, 128, 128)';
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function getEmbossRelief(card: OwnedCard) {
  return (
    getCardEffectLayers(card).find((layer) => layer.type === 'emboss')?.relief ??
    0
  );
}

function drawSurfaceHeightMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const baseCanvas = drawBaseSurfaceHeightMap(card);
  const embossHeightMap = drawEmbossHeightMap(card, maskImages);
  const relief = getEmbossRelief(card);

  if (Math.abs(relief) < 0.001) {
    return baseCanvas;
  }

  const canvas = createCanvas(baseCanvas.width, baseCanvas.height);
  const ctx = canvas.getContext('2d');
  const baseContext = baseCanvas.getContext('2d');
  const embossContext = embossHeightMap.getContext('2d');

  if (!ctx || !baseContext || !embossContext) {
    return baseCanvas;
  }

  const baseImage = baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height);
  const embossImage = embossContext.getImageData(0, 0, embossHeightMap.width, embossHeightMap.height);
  const output = ctx.createImageData(baseCanvas.width, baseCanvas.height);
  const baseData = baseImage.data;
  const embossData = embossImage.data;
  const outputData = output.data;
  const reliefDirection = Math.sign(relief);
  const reliefAmount = Math.abs(relief);
  const minHeight = EMBOSS_HEIGHT_MARGIN;
  const maxHeight = 255 - EMBOSS_HEIGHT_MARGIN;

  for (let index = 0; index < baseData.length; index += 4) {
    const baseValue = baseData[index];
    const embossValue = embossData[index] / 255;
    const maxDelta =
      reliefDirection >= 0 ? maxHeight - baseValue : baseValue - minHeight;
    const value = baseValue + embossValue * maxDelta * reliefAmount * reliefDirection;

    outputData[index] = value;
    outputData[index + 1] = value;
    outputData[index + 2] = value;
    outputData[index + 3] = 255;
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
}

function drawNormalMapFromHeight(heightCanvas: HTMLCanvasElement, intensity = 1) {
  const canvas = createCanvas(heightCanvas.width, heightCanvas.height);
  const ctx = canvas.getContext('2d');
  const sourceContext = heightCanvas.getContext('2d');

  if (!ctx || !sourceContext) {
    return canvas;
  }

  const source = sourceContext.getImageData(0, 0, heightCanvas.width, heightCanvas.height);
  const output = ctx.createImageData(heightCanvas.width, heightCanvas.height);
  const width = heightCanvas.width;
  const height = heightCanvas.height;
  const sourceData = source.data;
  const outputData = output.data;

  const sample = (x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, y));
    const index = (clampedY * width + clampedX) * 4;
    return sourceData[index] / 255;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = sample(x - 1, y);
      const right = sample(x + 1, y);
      const up = sample(x, y - 1);
      const down = sample(x, y + 1);
      const dx = (right - left) * intensity;
      const dy = (down - up) * intensity;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz) || 1;
      const index = (y * width + x) * 4;

      outputData[index] = ((nx / length) * 0.5 + 0.5) * 255;
      outputData[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      outputData[index + 2] = ((nz / length) * 0.5 + 0.5) * 255;
      outputData[index + 3] = sourceData[index];
    }
  }

  ctx.putImageData(output, 0, 0);
  return canvas;
}

function drawSugarMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['texture_sugar'], {
    blur: 1.5,
    alphaMultiplier: 0.94,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['texture_sugar'], {
    alphaMultiplier: 0.9,
  });
  return canvas;
}

function drawSparkleMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['sparkle_foil'], {
    blur: 1.5,
    alphaMultiplier: 0.86,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['sparkle_foil'], {
    alphaMultiplier: 0.98,
  });
  return canvas;
}

function drawPrismaticMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['prismatic_edge'], {
    blur: 2.5,
    alphaMultiplier: 0.72,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['prismatic_edge'], {
    alphaMultiplier: 1,
  });
  return canvas;
}

function drawDimensionalMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['dimensional_lamination'], {
    blur: 1,
    alphaMultiplier: 0.94,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['dimensional_lamination'], {
    alphaMultiplier: 1,
  });
  return canvas;
}

function drawReactiveHoloTreatmentMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['spot_holo'], {
    blur: 2,
    alphaMultiplier: 1,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['prismatic_edge'], {
    blur: 1.5,
    alphaMultiplier: 0.92,
  });
  return canvas;
}

function drawWaveHoloMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['holo_wave'], {
    blur: 3,
    alphaMultiplier: 1,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['holo_wave'], {
    alphaMultiplier: 1,
  });
  return canvas;
}

function drawCrackedHoloMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(
    CARD_TEXTURE_LAYOUT_WIDTH,
    CARD_TEXTURE_LAYOUT_HEIGHT,
  );
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['holo_cracked'], {
    blur: 1.5,
    alphaMultiplier: 1,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['holo_cracked'], {
    alphaMultiplier: 1,
  });
  return canvas;
}

function drawPolygon(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  fill: string,
  alpha = 1,
) {
  if (points.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function drawRarityMotif(
  ctx: CanvasRenderingContext2D,
  rarity: OwnedCard['rarity'],
  width: number,
  height: number,
  hue: string,
  accent: string,
) {
  ctx.save();
  ctx.translate(width / 2, height / 2 + 26);

  if (rarity === 'common') {
    for (let index = 0; index < 12; index += 1) {
      ctx.rotate(Math.PI / 6);
      ctx.fillStyle = index % 2 === 0 ? `${hue}20` : 'rgba(255,255,255,0.05)';
      ctx.fillRect(-12, -188, 24, 376);
    }
  }

  if (rarity === 'uncommon') {
    for (let row = -3; row <= 3; row += 1) {
      for (let col = -2; col <= 2; col += 1) {
        const x = col * 98 + (row % 2 === 0 ? 0 : 48);
        const y = row * 58;
        ctx.beginPath();
        ctx.moveTo(x, y - 34);
        ctx.lineTo(x + 30, y - 16);
        ctx.lineTo(x + 30, y + 16);
        ctx.lineTo(x, y + 34);
        ctx.lineTo(x - 30, y + 16);
        ctx.lineTo(x - 30, y - 16);
        ctx.closePath();
        ctx.fillStyle = row % 2 === 0 ? `${accent}18` : `${hue}14`;
        ctx.fill();
      }
    }
  }

  if (rarity === 'rare') {
    for (let index = 0; index < 10; index += 1) {
      ctx.save();
      ctx.rotate((Math.PI / 10) * index + 0.18);
      const gradient = ctx.createLinearGradient(0, -240, 0, 240);
      gradient.addColorStop(0, `${accent}00`);
      gradient.addColorStop(0.5, `${accent}4a`);
      gradient.addColorStop(1, `${accent}00`);
      ctx.fillStyle = gradient;
      ctx.fillRect(-10, -240, 20, 480);
      ctx.restore();
    }

    for (let index = 0; index < 18; index += 1) {
      const angle = (Math.PI * 2 * index) / 18;
      const radius = 196 + (index % 3) * 18;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 8, 0, Math.PI * 2);
      ctx.fillStyle = index % 2 === 0 ? `${accent}55` : `${hue}2a`;
      ctx.fill();
    }
  }

  if (rarity === 'epic') {
    const shards = [
      [
        [-210, -170],
        [-28, -246],
        [70, -60],
        [-120, -18],
      ],
      [
        [26, -210],
        [228, -156],
        [110, 24],
        [-20, -40],
      ],
      [
        [-234, 36],
        [-88, -4],
        [-12, 168],
        [-170, 210],
      ],
      [
        [54, 44],
        [234, 24],
        [218, 210],
        [20, 194],
      ],
    ];

    shards.forEach((shape, index) => {
      drawPolygon(
        ctx,
        shape as Array<[number, number]>,
        index % 2 === 0 ? `${accent}30` : `${hue}25`,
      );
    });
  }

  if (rarity === 'veryrare') {
    for (let band = 0; band < 8; band += 1) {
      ctx.beginPath();
      for (let step = -280; step <= 280; step += 14) {
        const x = step;
        const y = Math.sin(step * 0.018 + band * 0.9) * 36 + (band - 4) * 52;
        if (step === -280) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = band % 2 === 0 ? `${accent}58` : `${hue}3e`;
      ctx.lineWidth = 10 + band * 1.3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    for (let index = 0; index < 28; index += 1) {
      const angle = (Math.PI * 2 * index) / 28;
      const radius = 210 + Math.sin(index) * 42;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 10, 0, Math.PI * 2);
      ctx.fillStyle = index % 3 === 0 ? `${accent}7a` : `${hue}44`;
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawPackFace(face: 'front' | 'back') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#08141e');
  gradient.addColorStop(0.34, '#0b415b');
  gradient.addColorStop(0.72, '#0c6d8f');
  gradient.addColorStop(1, '#072435');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gloss = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gloss.addColorStop(0, 'rgba(255,255,255,0.24)');
  gloss.addColorStop(0.16, 'rgba(255,255,255,0)');
  gloss.addColorStop(0.52, 'rgba(255,255,255,0.12)');
  gloss.addColorStop(0.68, 'rgba(255,255,255,0)');
  gloss.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 26; index += 1) {
    ctx.save();
    ctx.translate(canvas.width * 0.08 + index * 40, 0);
    ctx.rotate(-0.18);
    ctx.fillStyle =
      index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(163,236,255,0.045)';
    ctx.fillRect(0, 0, 8, canvas.height * 1.4);
    ctx.restore();
  }

  const shine = ctx.createRadialGradient(
    canvas.width * 0.22,
    canvas.height * 0.2,
    60,
    canvas.width * 0.38,
    canvas.height * 0.3,
    640,
  );
  shine.addColorStop(0, 'rgba(255,255,255,0.55)');
  shine.addColorStop(0.24, 'rgba(146,231,255,0.2)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (face === 'front') {
    const cardFan = [
      { x: 230, y: 760, rotation: -0.34, colorA: '#89ecff', colorB: '#0f4f75' },
      { x: 514, y: 706, rotation: 0.04, colorA: '#ffffff', colorB: '#1581a7' },
      { x: 800, y: 780, rotation: 0.3, colorA: '#9cf0ff', colorB: '#104b69' },
    ];

    cardFan.forEach((item, index) => {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.rotation);
      const fanGradient = ctx.createLinearGradient(-150, -240, 150, 240);
      fanGradient.addColorStop(0, `${item.colorA}${index === 1 ? 'ee' : 'b6'}`);
      fanGradient.addColorStop(1, `${item.colorB}22`);
      ctx.fillStyle = fanGradient;
      drawRoundedPanel(ctx, -160, -260, 320, 520, 28);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    });

    ctx.fillStyle = '#eafcff';
    ctx.font = '700 58px Space Grotesk, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OLESHA', canvas.width / 2, 218);
    ctx.font = '600 28px Sora, sans-serif';
    ctx.fillStyle = '#d2f6ff';
    ctx.fillText('official trading cards', canvas.width / 2, 262);

    const halo = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height * 0.58,
      60,
      canvas.width / 2,
      canvas.height * 0.58,
      340,
    );
    halo.addColorStop(0, 'rgba(255,255,255,0.55)');
    halo.addColorStop(0.3, 'rgba(160,239,255,0.18)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 128px Space Grotesk, sans-serif';
    ctx.fillText('PACK', canvas.width / 2, 1038);
    ctx.font = '700 86px Space Grotesk, sans-serif';
    ctx.fillStyle = '#e5fbff';
    ctx.fillText('COLLECTOR', canvas.width / 2, 944);
    ctx.font = '600 30px Sora, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('tear sideways • reveal five cards', canvas.width / 2, 1110);

    ctx.save();
    ctx.translate(canvas.width / 2, 1308);
    ctx.rotate(-0.035);
    ctx.fillStyle = '#ffffff';
    drawRoundedPanel(ctx, -360, -78, 720, 156, 18);
    ctx.fill();
    ctx.fillStyle = '#111316';
    ctx.font = '700 52px Space Grotesk, sans-serif';
    ctx.fillText('5 CARDS INSIDE', 0, 0);
    ctx.font = '600 24px Sora, sans-serif';
    ctx.fillText('open sideways • daily ritual pack', 0, 44);
    ctx.restore();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 72px Space Grotesk, sans-serif';
    ctx.fillText('RITUAL NOTES', canvas.width / 2, 258);
    ctx.textAlign = 'left';

    const copy = [
      'Slide the lower half sideways to flip the pack.',
      'Drag the upper seal sideways to rip it open.',
      'Two packs per local day. Five cards in each.',
      'Rare drops shimmer harder while you inspect them.',
    ];

    ctx.font = '600 36px Sora, sans-serif';
    copy.forEach((line, index) => {
      ctx.fillStyle = index % 2 === 0 ? '#dcfbff' : '#ffe7b4';
      ctx.fillText(line, 132, 472 + index * 122);
    });

    const rarityRows = (['common', 'uncommon', 'rare', 'epic', 'veryrare'] as Rarity[]).map(
      (rarity) => [rarityMeta[rarity].label.toLocaleUpperCase(), rarityMeta[rarity].hue] as const,
    );

    rarityRows.forEach(([label, color], index) => {
      const y = 1040 + index * 92;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(170, y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff5df';
      ctx.font = '700 34px Space Grotesk, sans-serif';
      ctx.fillText(label, 220, y + 12);
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '500 28px Sora, sans-serif';
    ctx.fillText('Slide sideways. Tear sideways. Reveal dramatically.', canvas.width / 2, 1440);
  }

  addNoise(ctx, canvas.width, canvas.height, 5200);
  return canvas;
}

function drawCardFront(
  card: OwnedCard,
  artImage: HTMLImageElement | null,
  effectMaskImages: Array<HTMLImageElement | null>,
  decorativePatternImage: HTMLImageElement | null,
  defaultPatternImage: HTMLImageElement | null,
  layerOneImage: HTMLImageElement | null,
  layerTwoImage: HTMLImageElement | null,
  rarityStarImage: HTMLImageElement | null,
  options: CardFrontTextureOptions = {},
) {
  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const layout = getCardFrontLayout(card);
  const meta = rarityMeta[card.rarity];
  const visuals = getCardVisuals(card);
  const accent = visuals.accentColor;
  const detailBorderColor = accent;
  const defaults = getDefaultCardVisuals();
  const includeLayerTwoTemplate = layout.cardType !== 'type4';

  drawTintedTemplateLayer(ctx, layerOneImage, visuals.layerOneFill, {
    detailAlpha: 0.72,
    fallbackRadius: 56,
    fallbackValue: defaults.layerOneFill,
  });

  if (layerTwoImage && includeLayerTwoTemplate) {
    drawTintedTemplateLayer(ctx, layerTwoImage, visuals.layerTwoFill, {
      detailAlpha: 0.66,
      fallbackRadius: 56,
      fallbackValue: CARD_FRONT_SURFACE_COLOR,
    });
  }

  if (layout.cardType === 'type1') {
    drawArtImageInBox(ctx, layout.artBox, artImage, defaultPatternImage, {
      borderColor: detailBorderColor,
      borderWidth: 5,
    });

    drawSingleLineTextInBox(
      ctx,
      card.title.toLocaleUpperCase(),
      layout.titleBox,
      {
        maxFontSize: 30,
        minFontSize: 24,
        paddingX: layout.titleBox.paddingX,
      },
    );

    drawSingleLineTextInBox(
      ctx,
      `NO. ${formatCardSerial(card)}`,
      layout.numberBox,
      {
        maxFontSize: 30,
        minFontSize: 22,
        align: 'center',
      },
    );

    strokeRoundedPanel(ctx, layout.rarityBox, detailBorderColor, 4);

    drawSingleLineTextInBox(
      ctx,
      'РЕДКОСТЬ',
      {
        x: layout.rarityBox.x + layout.rarityBox.paddingX,
        y: layout.rarityBox.y,
        width: 250,
        height: layout.rarityBox.height,
      },
      {
        maxFontSize: 30,
        minFontSize: 24,
        fontWeight: '700',
      },
    );

    drawParagraphTextInBox(
      ctx,
      card.description,
      layout.descriptionBox,
      {
        maxFontSize: 37,
        minFontSize: 24,
        lineHeightMultiplier: 1.24,
        color: CARD_FRONT_TEXT_COLOR,
      },
    );

    drawDecorativePattern(
      ctx,
      decorativePatternImage,
      visuals.decorativePattern,
      layout.artBox.x,
      layout.artBox.y,
      layout.artBox.width,
      layout.artBox.height,
    );
  } else {
    const cardBox: CardFrontBox = {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      radius: 56,
    };

    ctx.save();
    drawRoundedPanel(ctx, cardBox.x, cardBox.y, cardBox.width, cardBox.height, cardBox.radius ?? 0);
    ctx.clip();

    if (layout.cardType === 'type2') {
      const contentBox: CardFrontBox = {
        x: 42,
        y: 150,
        width: 940,
        height: 1310,
        radius: 50,
      };

      fillRoundedPanelWithTemplateLayer(
        ctx,
        contentBox,
        layerTwoImage,
        visuals.layerTwoFill,
        CARD_FRONT_SURFACE_COLOR,
      );

      drawArtImageInBox(ctx, layout.artBox, artImage, defaultPatternImage, {
        borderColor: 'transparent',
      });

      fillRoundedPanelWithTemplateLayer(
        ctx,
        layout.rarityBox,
        layerTwoImage,
        visuals.layerTwoFill,
        CARD_FRONT_SURFACE_COLOR,
      );
      drawDecorativePattern(
        ctx,
        decorativePatternImage,
        visuals.decorativePattern,
        layout.artBox.x,
        layout.artBox.y,
        layout.artBox.width,
        layout.artBox.height,
      );

      if (layout.heroBox) {
        strokeRoundedPanel(ctx, layout.heroBox, detailBorderColor, 4);
      }

      ctx.beginPath();
      ctx.moveTo(layout.rarityBox.x, layout.rarityBox.y);
      ctx.lineTo(layout.rarityBox.x + layout.rarityBox.width, layout.rarityBox.y);
      ctx.strokeStyle = detailBorderColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      drawSingleLineTextInBox(
        ctx,
        card.title.toLocaleUpperCase(),
        layout.titleBox,
        {
          maxFontSize: 30,
          minFontSize: 24,
          paddingX: layout.titleBox.paddingX,
        },
      );

      drawSingleLineTextInBox(
        ctx,
        `NO. ${formatCardSerial(card)}`,
        layout.numberBox,
        {
          maxFontSize: 30,
          minFontSize: 22,
          align: 'center',
        },
      );

      drawSingleLineTextInBox(
        ctx,
        'РЕДКОСТЬ',
        {
          x: layout.rarityBox.x + 40,
          y: layout.rarityBox.y,
          width: 250,
          height: layout.rarityBox.height,
        },
        {
          maxFontSize: 30,
          minFontSize: 24,
          fontWeight: '700',
        },
      );

      drawParagraphTextInBox(
        ctx,
        card.description,
        layout.descriptionBox,
        {
          maxFontSize: 36,
          minFontSize: 24,
          lineHeightMultiplier: 1.22,
          color: CARD_FRONT_TEXT_COLOR,
        },
      );
    } else if (layout.cardType === 'type3') {
      drawArtImageInBox(ctx, layout.artBox, artImage, defaultPatternImage, {
        borderColor: detailBorderColor,
        borderWidth: 3,
        imageFilter: 'saturate(1.06) contrast(1.04)',
      });
      drawDecorativePattern(
        ctx,
        decorativePatternImage,
        visuals.decorativePattern,
        layout.artBox.x,
        layout.artBox.y,
        layout.artBox.width,
        layout.artBox.height,
      );
      drawBottomReadabilityShade(ctx, layout.artBox, {
        startY: layout.descriptionBox.y - 180,
        topAlpha: 0,
        bottomAlpha: 0.68,
      });

      drawSingleLineTextInBox(
        ctx,
        card.title.toLocaleUpperCase(),
        layout.titleBox,
        {
          maxFontSize: 30,
          minFontSize: 24,
          paddingX: layout.titleBox.paddingX,
        },
      );
      drawSingleLineTextInBox(
        ctx,
        `NO. ${formatCardSerial(card)}`,
        layout.numberBox,
        {
          maxFontSize: 30,
          minFontSize: 22,
          align: 'center',
        },
      );
      drawSingleLineTextInBox(
        ctx,
        'РЕДКОСТЬ',
        {
          x: layout.rarityBox.x,
          y: layout.rarityBox.y,
          width: 250,
          height: layout.rarityBox.height,
        },
        {
          maxFontSize: 30,
          minFontSize: 24,
          fontWeight: '700',
          color: '#F5F0DC',
          shadowColor: 'rgba(0,0,0,0.32)',
          shadowBlur: 16,
          shadowOffsetY: 2,
        },
      );
      drawParagraphTextInBox(
        ctx,
        card.description,
        layout.descriptionBox,
        {
          maxFontSize: 34,
          minFontSize: 24,
          lineHeightMultiplier: 1.26,
          color: '#F5F0DC',
          shadowColor: 'rgba(0,0,0,0.4)',
          shadowBlur: 18,
          shadowOffsetY: 3,
        },
      );
    } else {
      drawArtImageInBox(ctx, layout.artBox, artImage, defaultPatternImage, {
        borderColor: 'transparent',
        imageFilter: 'saturate(1.06) contrast(1.04)',
      });

      drawDecorativePattern(
        ctx,
        decorativePatternImage,
        visuals.decorativePattern,
        (layout.heroBox ?? layout.artBox).x,
        (layout.heroBox ?? layout.artBox).y,
        (layout.heroBox ?? layout.artBox).width,
        (layout.heroBox ?? layout.artBox).height,
      );
      drawBottomReadabilityShade(ctx, layout.artBox, {
        startY: layout.descriptionBox.y - 190,
        topAlpha: 0,
        bottomAlpha: 0.68,
      });

      if (layout.heroBox) {
        strokeRoundedPanel(ctx, layout.heroBox, detailBorderColor, 3);
      }

      drawWrappedTextInBox(
        ctx,
        card.title.toLocaleUpperCase(),
        layout.titleBox,
        {
          maxFontSize: 64,
          minFontSize: 64,
          lineHeightMultiplier: 1.2,
          paddingX: layout.titleBox.paddingX,
        },
      );
      drawSingleLineTextInBox(
        ctx,
        `NO. ${formatCardSerial(card)}`,
        layout.numberBox,
        {
          maxFontSize: 30,
          minFontSize: 22,
          align: 'center',
          color: CARD_FRONT_TEXT_COLOR,
        },
      );
      drawSingleLineTextInBox(
        ctx,
        'РЕДКОСТЬ',
        {
          x: layout.rarityBox.x,
          y: layout.rarityBox.y,
          width: 250,
          height: layout.rarityBox.height,
        },
        {
          maxFontSize: 30,
          minFontSize: 24,
          fontWeight: '700',
          color: '#F5F0DC',
          shadowColor: 'rgba(0,0,0,0.32)',
          shadowBlur: 16,
          shadowOffsetY: 2,
        },
      );
      drawParagraphTextInBox(
        ctx,
        card.description,
        layout.descriptionBox,
        {
          maxFontSize: 34,
          minFontSize: 24,
          lineHeightMultiplier: 1.26,
          color: '#F5F0DC',
          shadowColor: 'rgba(0,0,0,0.42)',
          shadowBlur: 18,
          shadowOffsetY: 3,
        },
      );
    }

    ctx.restore();
  }

  if (options.includeTreatmentLayers ?? true) {
    drawTreatmentLayers(
      ctx,
      card,
      effectMaskImages,
      accent,
      meta.hue,
      options.treatmentPaintStrength ?? 1,
    );
  }

  addNoise(ctx, canvas.width, canvas.height, 7200);
  drawRarityStarsOverlay(ctx, card, layout, rarityStarImage);
  return canvas;
}

const CARD_BACK_FALLBACK_COLOR = '#7D818A';

function drawFallbackCardBack() {
  const canvas = createCardTextureLayoutCanvas();
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  ctx.fillStyle = CARD_BACK_FALLBACK_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawCardBackTexture(backImage: HTMLImageElement | null) {
  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  if (backImage) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(backImage, 0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

function drawFoilLayer(
  card: OwnedCard,
  hasArtImage: boolean,
) {
  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!hasArtImage) {
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  return canvas;
}

function drawHoloZoneMask(
  card: OwnedCard,
  effectMaskImages: Array<HTMLImageElement | null>,
  defaultPatternImage: HTMLImageElement | null,
  hasArtImage: boolean,
) {
  const canvas = createCanvas(CARD_TEXTURE_WIDTH, CARD_TEXTURE_HEIGHT);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const layout = getCardFrontLayout(card);
  const finish = finishMeta[card.finish];
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const zone = (alpha: number) => `rgba(255,255,255,${alpha})`;

  drawRoundedPanel(ctx, 18, 18, canvas.width - 36, canvas.height - 36, 52);
  ctx.strokeStyle = zone(0.18 + finish.opacity * 0.16);
  ctx.lineWidth = 16;
  ctx.stroke();

  if (!hasArtImage) {
    drawTintedPatternImage(
      ctx,
      defaultPatternImage,
      layout.artBox.x,
      layout.artBox.y,
      layout.artBox.width,
      layout.artBox.height,
      '#ffffff',
      {
        opacity: 0.94,
        clipRadius: layout.artBox.radius ?? 0,
        cropToOpaqueBounds: true,
      },
    );
  }

  if (layout.cardType === 'type1') {
    fillRoundedPanelWithColor(ctx, layout.titleBox, zone(0.22 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(ctx, layout.numberBox, zone(0.18 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(ctx, layout.rarityBox, zone(0.22 + finish.opacity * 0.1));

    const descriptionGradient = ctx.createLinearGradient(
      0,
      layout.descriptionBox.y,
      0,
      layout.descriptionBox.y + layout.descriptionBox.height,
    );
    descriptionGradient.addColorStop(0, zone(0.08 + finish.opacity * 0.05));
    descriptionGradient.addColorStop(1, zone(0.16 + finish.opacity * 0.07));
    fillRoundedPanelWithColor(
      ctx,
      {
        x: layout.descriptionBox.x - 14,
        y: layout.descriptionBox.y - 8,
        width: layout.descriptionBox.width + 28,
        height: layout.descriptionBox.height + 24,
        radius: 32,
      },
      descriptionGradient,
    );
  } else if (layout.cardType === 'type2') {
    fillRoundedPanelWithColor(ctx, layout.titleBox, zone(0.22 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(ctx, layout.numberBox, zone(0.18 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(
      ctx,
      layout.heroBox ?? layout.artBox,
      zone(0.18 + finish.opacity * 0.08),
    );

    const descriptionGradient = ctx.createLinearGradient(
      0,
      layout.descriptionBox.y,
      0,
      layout.descriptionBox.y + layout.descriptionBox.height,
    );
    descriptionGradient.addColorStop(0, zone(0.08 + finish.opacity * 0.05));
    descriptionGradient.addColorStop(1, zone(0.15 + finish.opacity * 0.06));
    fillRoundedPanelWithColor(
      ctx,
      {
        x: layout.descriptionBox.x - 12,
        y: layout.descriptionBox.y - 6,
        width: layout.descriptionBox.width + 24,
        height: layout.descriptionBox.height + 18,
        radius: 28,
      },
      descriptionGradient,
    );
  } else if (layout.cardType === 'type3') {
    fillRoundedPanelWithColor(ctx, layout.titleBox, zone(0.22 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(ctx, layout.numberBox, zone(0.18 + finish.opacity * 0.08));
    const overlayGradient = ctx.createLinearGradient(
      0,
      layout.descriptionBox.y - 190,
      0,
      layout.descriptionBox.y + layout.descriptionBox.height,
    );
    overlayGradient.addColorStop(0, zone(0.02 + finish.opacity * 0.02));
    overlayGradient.addColorStop(1, zone(0.28 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(
      ctx,
      {
        x: layout.descriptionBox.x - 30,
        y: layout.descriptionBox.y - 190,
        width: layout.descriptionBox.width + 60,
        height: layout.descriptionBox.height + 230,
        radius: 34,
      },
      overlayGradient,
    );
  } else {
    fillRoundedPanelWithColor(ctx, layout.titleBox, zone(0.22 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(ctx, layout.numberBox, zone(0.18 + finish.opacity * 0.08));

    const overlayGradient = ctx.createLinearGradient(
      0,
      layout.descriptionBox.y - 190,
      0,
      layout.descriptionBox.y + layout.descriptionBox.height,
    );
    overlayGradient.addColorStop(0, zone(0.02 + finish.opacity * 0.02));
    overlayGradient.addColorStop(1, zone(0.28 + finish.opacity * 0.08));
    fillRoundedPanelWithColor(
      ctx,
      {
        x: layout.descriptionBox.x - 30,
        y: layout.descriptionBox.y - 190,
        width: layout.descriptionBox.width + 60,
        height: layout.descriptionBox.height + 230,
        radius: 34,
      },
      overlayGradient,
    );
  }

  if (card.rarity === 'epic' || card.rarity === 'veryrare') {
    ctx.fillStyle = zone(card.rarity === 'veryrare' ? 0.44 : 0.28);
    drawRoundedPanel(ctx, 28, 28, canvas.width - 56, canvas.height - 56, 48);
    ctx.strokeStyle = zone(card.rarity === 'veryrare' ? 0.34 : 0.22);
    ctx.lineWidth = card.rarity === 'veryrare' ? 14 : 10;
    ctx.stroke();
  }

  const effectLayers = getCardEffectLayers(card);
  effectLayers.forEach((layer, index) => {
    const maskImage = effectMaskImages[index];
    if (!maskImage) {
      return;
    }

    let alpha = 0;

    if (layer.type === 'spot_holo') {
      alpha = 0.78 * layer.opacity;
    } else if (layer.type === 'prismatic_edge') {
      alpha = 0.84 * layer.opacity;
    }

    if (alpha <= 0) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  });

  eraseRarityStarsFromMask(ctx, layout, 4);

  return canvas;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(' ');
  let line = '';
  let offset = 0;

  words.forEach((word, index) => {
    const testLine = `${line}${word} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && index > 0) {
      ctx.fillText(line.trim(), x, y + offset);
      line = `${word} `;
      offset += lineHeight;
    } else {
      line = testLine;
    }
  });

  ctx.fillText(line.trim(), x, y + offset);
}

export function usePackTexture(face: 'front' | 'back') {
  return useMemo(() => setupTexture(drawPackFace(face)), [face]);
}

export function useStackCardBackTexture() {
  const backImage = useRemoteImage(cardBackTextureUrl);

  return useMemo(
    () =>
      setupTexture(
        finalizeCardTextureCanvas(backImage ? drawCardBackTexture(backImage) : drawFallbackCardBack()),
      ),
    [backImage],
  );
}

export function useCardTextures(card: OwnedCard | null) {
  const artImage = useRemoteImage(card?.urlImage ?? null);
  const backImage = useRemoteImage(cardBackTextureUrl);
  const defaultPatternImage = useRemoteImage(defaultPatternUrl);
  const defaultReflectPatternImage = useRemoteImage(defaultReflectPatternUrl);
  const layerOneImage = useRemoteImage(cardLayerOneFrontUrl);
  const layerTwoImage = useRemoteImage(cardLayerTwoFrontUrl);
  const rarityStarImage = useRemoteImage(rarityStarUrl);
  const decorativePatternImage = useRemoteImage(card?.visuals?.decorativePattern.svgUrl ?? null);
  const effectLayerUrls = useMemo(
    () => (card ? getCardEffectLayers(card).map((layer) => layer.maskUrl) : []),
    [card],
  );
  const effectMaskImages = useRemoteImages(effectLayerUrls);

  return useMemo(() => {
    if (!card) {
      return null;
    }

    const hasArtSource = Boolean(card.urlImage?.trim());

    const embossHeightMap = finalizeCardTextureCanvas(drawEmbossHeightMap(card, effectMaskImages));
    const surfaceHeightMap = finalizeCardTextureCanvas(
      drawSurfaceHeightMap(card, effectMaskImages),
    );

    return {
      front: setupTexture(
        finalizeCardTextureCanvas(
          drawCardFront(
            card,
            artImage,
            effectMaskImages,
            decorativePatternImage,
            defaultPatternImage,
            layerOneImage,
            layerTwoImage,
            rarityStarImage,
            {
              includeTreatmentLayers: false,
            },
          ),
        ),
      ),
      back: setupTexture(
        finalizeCardTextureCanvas(backImage ? drawCardBackTexture(backImage) : drawFallbackCardBack()),
      ),
      foil: setupTexture(
        finalizeCardTextureCanvas(
          drawFoilLayer(card, hasArtSource),
        ),
        true,
      ),
      foilZone: setupDataTexture(
        finalizeCardTextureCanvas(
          drawHoloZoneMask(
            card,
            effectMaskImages,
            defaultReflectPatternImage,
            hasArtSource,
          ),
        ),
      ),
      glossMask: setupDataTexture(
        finalizeCardTextureCanvas(drawGlossMaskMap(card, effectMaskImages)),
      ),
      embossMap: setupDataTexture(embossHeightMap),
      surfaceNormalMap: setupDataTexture(
        drawNormalMapFromHeight(surfaceHeightMap, EMBOSS_NORMAL_INTENSITY),
      ),
      sugarMask: setupDataTexture(
        finalizeCardTextureCanvas(drawSugarMaskMap(card, effectMaskImages)),
      ),
      sparkleMask: setupDataTexture(
        finalizeCardTextureCanvas(drawSparkleMaskMap(card, effectMaskImages)),
      ),
      dimensionalMask: setupDataTexture(
        finalizeCardTextureCanvas(drawDimensionalMaskMap(card, effectMaskImages)),
      ),
      prismMask: setupDataTexture(
        finalizeCardTextureCanvas(drawPrismaticMaskMap(card, effectMaskImages)),
      ),
      holoTreatmentMap: setupDataTexture(
        finalizeCardTextureCanvas(drawReactiveHoloTreatmentMap(card, effectMaskImages)),
      ),
      waveHoloMask: setupDataTexture(
        finalizeCardTextureCanvas(drawWaveHoloMaskMap(card, effectMaskImages)),
      ),
      crackedHoloMask: setupDataTexture(
        finalizeCardTextureCanvas(drawCrackedHoloMaskMap(card, effectMaskImages)),
      ),
    };
  }, [
    artImage,
    backImage,
    card,
    defaultPatternImage,
    defaultReflectPatternImage,
    decorativePatternImage,
    effectMaskImages,
    layerOneImage,
    layerTwoImage,
    rarityStarImage,
  ]);
}

export function useCardPreviewImage(card: OwnedCard | null) {
  const artImage = useRemoteImage(card?.urlImage ?? null);
  const defaultPatternImage = useRemoteImage(defaultPatternUrl);
  const layerOneImage = useRemoteImage(cardLayerOneFrontUrl);
  const layerTwoImage = useRemoteImage(cardLayerTwoFrontUrl);
  const rarityStarImage = useRemoteImage(rarityStarUrl);
  const decorativePatternImage = useRemoteImage(card?.visuals?.decorativePattern.svgUrl ?? null);
  const effectLayerUrls = useMemo(
    () => (card ? getCardEffectLayers(card).map((layer) => layer.maskUrl) : []),
    [card],
  );
  const effectMaskImages = useRemoteImages(effectLayerUrls);

  return useMemo(() => {
    if (!card) {
      return '';
    }

    const sourceCanvas = finalizeCardTextureCanvas(
      drawCardFront(
        card,
        artImage,
        effectMaskImages,
        decorativePatternImage,
        defaultPatternImage,
        layerOneImage,
        layerTwoImage,
        rarityStarImage,
        {
          treatmentPaintStrength: 0.8,
        },
      ),
    );
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = CARD_PREVIEW_WIDTH;
    previewCanvas.height = CARD_PREVIEW_HEIGHT;

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) {
      return sourceCanvas.toDataURL('image/png');
    }

    ctx.drawImage(sourceCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
    try {
      return previewCanvas.toDataURL('image/png');
    } catch {
      return card.urlImage;
    }
  }, [
    artImage,
    card,
    defaultPatternImage,
    decorativePatternImage,
    effectMaskImages,
    layerOneImage,
    layerTwoImage,
    rarityStarImage,
  ]);
}

export function useDecorativePatternMaskImage(card: OwnedCard | null) {
  const decorativePatternImage = useRemoteImage(card?.visuals?.decorativePattern.svgUrl ?? null);
  const layerOneImage = useRemoteImage(cardLayerOneFrontUrl);
  const layerTwoImage = useRemoteImage(cardLayerTwoFrontUrl);

  return useMemo(() => {
    if (!card) {
      return '';
    }

    const sourceCanvas = finalizeCardTextureCanvas(
      drawDecorativePatternMask(card, decorativePatternImage, layerOneImage, layerTwoImage),
    );

    try {
      return sourceCanvas.toDataURL('image/png');
    } catch {
      return '';
    }
  }, [card, decorativePatternImage, layerOneImage, layerTwoImage]);
}
