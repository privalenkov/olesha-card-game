import { useEffect, useMemo, useState } from 'react';
import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { finishMeta, rarityMeta } from '../game/config';
import {
  type CardEffectLayer,
  getDefaultCardVisuals,
  type CardFrameStyle,
  type CardTreatmentEffect,
  type CardVisuals,
  type OwnedCard,
} from '../game/types';

const CARD_PREVIEW_WIDTH = 344;
const CARD_PREVIEW_HEIGHT = 482;

interface CardFrontTextureOptions {
  treatmentPaintStrength?: number;
}

type RemoteImageCacheEntry = {
  image: HTMLImageElement | null;
  promise?: Promise<void>;
  status: 'loading' | 'loaded' | 'error';
};

const remoteImageCache = new Map<string, RemoteImageCacheEntry>();

const frameStylePalette: Record<
  CardFrameStyle,
  {
    start: string;
    end: string;
    shadow: string;
  }
> = {
  aurora: {
    start: '#10273d',
    end: '#1b4561',
    shadow: '#09121a',
  },
  ember: {
    start: '#31150d',
    end: '#6a2518',
    shadow: '#170907',
  },
  mint: {
    start: '#0f2922',
    end: '#1e5a4a',
    shadow: '#06110f',
  },
  onyx: {
    start: '#111216',
    end: '#31333d',
    shadow: '#050609',
  },
  plasma: {
    start: '#1c1536',
    end: '#274d6f',
    shadow: '#090711',
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
  radius: number,
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

function getCardEffectLayers(card: OwnedCard): CardEffectLayer[] {
  return card.effectLayers ?? [];
}

function applyEffectPlacementClip(
  ctx: CanvasRenderingContext2D,
  placement: CardVisuals['effectPlacement'],
  heroX: number,
  heroY: number,
  heroWidth: number,
  heroHeight: number,
) {
  if (placement === 'full') {
    return;
  }

  const clipPath = new Path2D();

  if (placement === 'hero') {
    clipPath.roundRect(heroX, heroY, heroWidth, heroHeight, 42);
    ctx.clip(clipPath);
    return;
  }

  clipPath.rect(0, 0, 1024, 1536);
  clipPath.roundRect(heroX, heroY, heroWidth, heroHeight, 42);
  ctx.clip(clipPath, 'evenodd');
}

function drawVisualEffectPattern(
  ctx: CanvasRenderingContext2D,
  pattern: CardVisuals['effectPattern'],
  accentColor: string,
) {
  if (pattern === 'none') {
    return;
  }

  ctx.save();

  if (pattern === 'sparkles') {
    for (let index = 0; index < 26; index += 1) {
      const x = 86 + ((index * 61) % 860);
      const y = 106 + ((index * 97) % 1260);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.PI / 4) * (index % 4));
      ctx.fillStyle = index % 2 === 0 ? `${accentColor}d8` : 'rgba(255,255,255,0.62)';
      ctx.fillRect(-1.3, -14, 2.6, 28);
      ctx.fillRect(-14, -1.3, 28, 2.6);
      ctx.restore();
    }
  }

  if (pattern === 'grid') {
    ctx.strokeStyle = `${accentColor}70`;
    ctx.lineWidth = 2;

    for (let x = 72; x <= 952; x += 72) {
      ctx.beginPath();
      ctx.moveTo(x, 72);
      ctx.lineTo(x, 1464);
      ctx.stroke();
    }

    for (let y = 72; y <= 1464; y += 72) {
      ctx.beginPath();
      ctx.moveTo(72, y);
      ctx.lineTo(952, y);
      ctx.stroke();
    }
  }

  if (pattern === 'waves') {
    for (let band = 0; band < 8; band += 1) {
      ctx.beginPath();
      for (let step = 0; step <= 1024; step += 12) {
        const x = step;
        const y = 140 + band * 156 + Math.sin(step * 0.02 + band * 0.8) * 24;
        if (step === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = band % 2 === 0 ? `${accentColor}96` : 'rgba(255,255,255,0.32)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  if (pattern === 'shards') {
    const shards = [
      [
        [86, 132],
        [292, 84],
        [248, 314],
      ],
      [
        [642, 126],
        [928, 194],
        [782, 394],
      ],
      [
        [104, 842],
        [318, 754],
        [344, 1084],
      ],
      [
        [616, 716],
        [910, 794],
        [748, 1136],
      ],
    ];

    shards.forEach((shape, index) =>
      drawPolygon(
        ctx,
        shape as Array<[number, number]>,
        index % 2 === 0 ? `${accentColor}b4` : 'rgba(255,255,255,0.38)',
        1,
      ),
    );
  }

  ctx.restore();
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
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
  for (let index = 0; index < 84; index += 1) {
    const x = 30 + ((index * 113) % (width - 60));
    const y = 30 + ((index * 173) % (height - 60));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.PI / 4) * (index % 4));
    ctx.fillStyle = index % 3 === 0 ? `${accent}d8` : 'rgba(255,255,255,0.88)';
    ctx.fillRect(-1.8, -20, 3.6, 40);
    ctx.fillRect(-20, -1.8, 40, 3.6);
    ctx.restore();
  }

  const rainbow = ctx.createLinearGradient(width * 0.15, 0, width * 0.85, height);
  rainbow.addColorStop(0, 'rgba(127,237,255,0.38)');
  rainbow.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  rainbow.addColorStop(1, `${accent}7a`);
  ctx.fillStyle = rainbow;
  ctx.fillRect(0, 0, width, height);
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

function applyEmbossLayer(
  ctx: CanvasRenderingContext2D,
  maskImage: CanvasImageSource,
  opacity: number,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const highlightCanvas = createCanvas(width, height);
  const shadowCanvas = createCanvas(width, height);
  const fillCanvas = createCanvas(width, height);
  const highlightContext = highlightCanvas.getContext('2d');
  const shadowContext = shadowCanvas.getContext('2d');
  const fillContext = fillCanvas.getContext('2d');

  if (!highlightContext || !shadowContext || !fillContext) {
    return;
  }

  highlightContext.filter = 'blur(3px)';
  highlightContext.drawImage(maskImage, -6, -6, width, height);
  highlightContext.globalCompositeOperation = 'source-in';
  highlightContext.fillStyle = 'rgba(255,255,255,0.9)';
  highlightContext.fillRect(0, 0, width, height);

  shadowContext.filter = 'blur(4px)';
  shadowContext.drawImage(maskImage, 7, 7, width, height);
  shadowContext.globalCompositeOperation = 'source-in';
  shadowContext.fillStyle = 'rgba(4,8,16,0.9)';
  shadowContext.fillRect(0, 0, width, height);

  fillContext.drawImage(maskImage, 0, 0, width, height);
  fillContext.globalCompositeOperation = 'source-in';
  const fillGradient = fillContext.createLinearGradient(0, 0, width, height);
  fillGradient.addColorStop(0, 'rgba(255,255,255,0.18)');
  fillGradient.addColorStop(1, 'rgba(0,0,0,0.16)');
  fillContext.fillStyle = fillGradient;
  fillContext.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = opacity * 0.42;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(highlightCanvas, 0, 0);
  ctx.globalAlpha = opacity * 0.35;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(fillCanvas, 0, 0);
  ctx.restore();
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

  if (layer.type === 'emboss') {
    applyEmbossLayer(ctx, maskImage, effectiveOpacity);
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
    }
  };

  const blendMode: GlobalCompositeOperation =
    layer.type === 'texture_sugar' || layer.type === 'sparkle_foil' ? 'lighter' : 'screen';

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
  const { canvas, ctx } = createMaskCanvas(1024, 1536);
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

function drawEmbossHeightMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(1024, 1536);
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['emboss'], {
    blur: 14,
    alphaMultiplier: 0.38,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['emboss'], {
    blur: 7,
    alphaMultiplier: 0.52,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['emboss'], {
    blur: 2,
    alphaMultiplier: 0.7,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['emboss'], {
    alphaMultiplier: 0.92,
  });
  return canvas;
}

function drawSugarMaskMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(1024, 1536);
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
  const { canvas, ctx } = createMaskCanvas(1024, 1536);
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
  const { canvas, ctx } = createMaskCanvas(1024, 1536);
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

function drawReactiveHoloTreatmentMap(card: OwnedCard, maskImages: Array<HTMLImageElement | null>) {
  const { canvas, ctx } = createMaskCanvas(1024, 1536);
  if (!ctx) {
    return canvas;
  }

  composeEffectMaskPass(ctx, card, maskImages, ['spot_holo'], {
    blur: 2,
    alphaMultiplier: 1,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['sparkle_foil'], {
    blur: 1.5,
    alphaMultiplier: 0.78,
  });
  composeEffectMaskPass(ctx, card, maskImages, ['prismatic_edge'], {
    blur: 1.5,
    alphaMultiplier: 0.92,
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

    const rarityRows = [
      ['COMMON', '#84c7ff'],
      ['UNCOMMON', '#66ffcb'],
      ['RARE', '#ffd46b'],
      ['EPIC', '#ff7e5f'],
      ['VERY RARE', '#fff9d8'],
    ];

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
  options: CardFrontTextureOptions = {},
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const meta = rarityMeta[card.rarity];
  const finish = finishMeta[card.finish];
  const visuals = getCardVisuals(card);
  const palette = frameStylePalette[visuals.frameStyle];
  const accent = visuals.accentColor;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, palette.start);
  gradient.addColorStop(0.45, palette.shadow);
  gradient.addColorStop(1, palette.end);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bloom = ctx.createRadialGradient(
    canvas.width * 0.28,
    canvas.height * 0.16,
    40,
    canvas.width * 0.34,
    canvas.height * 0.24,
    640,
  );
  bloom.addColorStop(0, `${accent}b8`);
  bloom.addColorStop(0.3, `${meta.hue}2f`);
  bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const outerGradient = ctx.createLinearGradient(48, 48, canvas.width - 48, canvas.height - 48);
  outerGradient.addColorStop(0, `${accent}88`);
  outerGradient.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  outerGradient.addColorStop(1, `${meta.hue}88`);
  drawRoundedPanel(ctx, 42, 42, canvas.width - 84, canvas.height - 84, 70);
  ctx.strokeStyle = outerGradient;
  ctx.lineWidth = 7;
  ctx.stroke();

  const heroX = 78;
  const heroY = 78;
  const heroWidth = canvas.width - 156;
  const heroHeight = 344;

  drawRoundedPanel(ctx, heroX, heroY, heroWidth, heroHeight, 42);
  const heroGradient = ctx.createLinearGradient(72, 72, canvas.width - 72, 440);
  heroGradient.addColorStop(0, `${meta.hue}5e`);
  heroGradient.addColorStop(0.4, 'rgba(255,255,255,0.07)');
  heroGradient.addColorStop(1, `${accent}88`);
  ctx.fillStyle = heroGradient;
  ctx.fill();

  const heroClip = new Path2D();
  heroClip.roundRect(heroX, heroY, heroWidth, heroHeight, 42);
  ctx.save();
  ctx.clip(heroClip);
  if (artImage) {
    ctx.save();
    ctx.filter = 'saturate(1.08) contrast(1.04)';
    drawImageCover(ctx, artImage, heroX, heroY, heroWidth, heroHeight);
    ctx.restore();

    const artShade = ctx.createLinearGradient(heroX, heroY, heroX, heroY + heroHeight);
    artShade.addColorStop(0, 'rgba(5, 7, 11, 0.12)');
    artShade.addColorStop(0.52, 'rgba(5, 7, 11, 0)');
    artShade.addColorStop(1, 'rgba(5, 7, 11, 0.2)');
    ctx.fillStyle = artShade;
    ctx.fillRect(heroX, heroY, heroWidth, heroHeight);
  } else {
    drawRarityMotif(ctx, card.rarity, canvas.width, 344, meta.hue, meta.accent);
  }

  const sheen = ctx.createLinearGradient(0, 0, canvas.width, 420);
  sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(0.18, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.75, `${accent}18`);
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, canvas.width, 460);
  ctx.restore();

  ctx.save();
  applyEffectPlacementClip(ctx, visuals.effectPlacement, heroX, heroY, heroWidth, heroHeight);
  drawVisualEffectPattern(ctx, visuals.effectPattern, accent);
  ctx.restore();

  ctx.fillStyle = accent;
  ctx.font = '700 32px Space Grotesk, sans-serif';
  ctx.fillText(meta.label.toUpperCase(), 112, 128);
  ctx.textAlign = 'right';
  ctx.fillText(finish.label.toUpperCase(), canvas.width - 112, 128);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '700 44px Space Grotesk, sans-serif';
  ctx.fillText('CREATOR EDITION', canvas.width / 2, 382);

  ctx.textAlign = 'left';
  ctx.font = '700 80px Space Grotesk, sans-serif';
  wrapText(ctx, card.title, 112, 542, 800, 84);
  ctx.font = '500 34px Sora, sans-serif';
  ctx.fillStyle = '#eff6ff';
  wrapText(ctx, card.description, 112, 746, 800, 52);

  ctx.font = '600 26px Sora, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(`PACK ${String(card.packNumber).padStart(2, '0')}`, 112, 1402);
  ctx.textAlign = 'right';
  ctx.fillText(`#${card.instanceId.slice(0, 8).toUpperCase()}`, canvas.width - 112, 1402);

  const entries = [
    ['Power', card.stats.power],
    ['Cringe', card.stats.cringe],
    ['Fame', card.stats.fame],
    ['Rarity', card.stats.rarityScore],
    ['Humor', card.stats.humor],
  ] as const;

  entries.forEach(([label, value], index) => {
    const y = 988 + index * 84;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 24px Sora, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 112, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(value), canvas.width - 112, y);

    const barGradient = ctx.createLinearGradient(112, y + 26, canvas.width - 112, y + 26);
    barGradient.addColorStop(0, meta.hue);
    barGradient.addColorStop(1, meta.accent);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    drawRoundedPanel(ctx, 112, y + 18, canvas.width - 224, 18, 999);
    ctx.fill();

    ctx.fillStyle = barGradient;
    drawRoundedPanel(ctx, 112, y + 18, ((canvas.width - 224) * value) / 100, 18, 999);
    ctx.fill();
  });

  const foilStampGradient = ctx.createLinearGradient(0, 0, 180, 180);
  foilStampGradient.addColorStop(0, `${accent}b0`);
  foilStampGradient.addColorStop(0.5, '#ffffff');
  foilStampGradient.addColorStop(1, `${meta.hue}aa`);
  ctx.fillStyle = foilStampGradient;
  drawRoundedPanel(ctx, 742, 1188, 168, 168, 28);
  ctx.fill();
  ctx.fillStyle = '#0d1116';
  ctx.textAlign = 'center';
  ctx.font = '700 28px Space Grotesk, sans-serif';
  ctx.fillText('OG', 826, 1264);
  ctx.font = '600 18px Sora, sans-serif';
  ctx.fillText('FOIL', 826, 1300);

  drawTreatmentLayers(
    ctx,
    card,
    effectMaskImages,
    accent,
    meta.hue,
    options.treatmentPaintStrength ?? 1,
  );

  addNoise(ctx, canvas.width, canvas.height, 7200);
  return canvas;
}

function drawCardBack(card: OwnedCard) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const meta = rarityMeta[card.rarity];
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#09111a');
  gradient.addColorStop(0.5, meta.gradient[0]);
  gradient.addColorStop(1, '#05080d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 40; index += 1) {
    ctx.strokeStyle = index % 2 === 0 ? `${meta.hue}18` : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 120 + index * 24, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawRoundedPanel(ctx, 68, 68, canvas.width - 136, canvas.height - 136, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 108px Space Grotesk, sans-serif';
  ctx.fillText('OG', canvas.width / 2, 640);
  ctx.font = '700 46px Sora, sans-serif';
  ctx.fillStyle = meta.accent;
  ctx.fillText('OLESHA COLLECTOR SERIES', canvas.width / 2, 726);
  ctx.font = '500 28px Sora, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText('spin lightly • shimmer harder', canvas.width / 2, 804);
  addNoise(ctx, canvas.width, canvas.height, 4200);
  return canvas;
}

function drawFoilLayer(card: OwnedCard) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const finish = finishMeta[card.finish];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (card.rarity === 'common') {
    for (let line = 0; line < 36; line += 1) {
      const x = 82 + line * 24;
      ctx.fillStyle = line % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.48)';
      ctx.fillRect(x, 76, 3, 1300);
    }
  }

  if (card.rarity === 'uncommon') {
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 3;
    for (let row = 0; row < 14; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const x = 146 + col * 98 + (row % 2 === 0 ? 0 : 48);
        const y = 188 + row * 80;
        ctx.beginPath();
        ctx.moveTo(x, y - 30);
        ctx.lineTo(x + 26, y - 15);
        ctx.lineTo(x + 26, y + 15);
        ctx.lineTo(x, y + 30);
        ctx.lineTo(x - 26, y + 15);
        ctx.lineTo(x - 26, y - 15);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  if (card.rarity === 'rare') {
    for (let index = 0; index < 14; index += 1) {
      ctx.save();
      ctx.translate(canvas.width / 2, 260);
      ctx.rotate((Math.PI / 14) * index + card.holographicSeed * 0.5);
      const beam = ctx.createLinearGradient(0, -560, 0, 560);
      beam.addColorStop(0, 'rgba(255,255,255,0.04)');
      beam.addColorStop(0.5, 'rgba(255,255,255,0.96)');
      beam.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx.fillStyle = beam;
      ctx.fillRect(-10, -560, 20, 1120);
      ctx.restore();
    }
  }

  if (card.rarity === 'epic') {
    const shards = [
      [
        [90, 146],
        [382, 84],
        [324, 392],
      ],
      [
        [534, 92],
        [892, 154],
        [716, 434],
      ],
      [
        [116, 728],
        [424, 582],
        [450, 1016],
      ],
      [
        [612, 624],
        [928, 736],
        [750, 1092],
      ],
    ];

    shards.forEach((shape, index) =>
      drawPolygon(
        ctx,
        shape as Array<[number, number]>,
        index % 2 === 0 ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.72)',
        1,
      ),
    );
  }

  if (card.rarity === 'veryrare') {
    for (let band = 0; band < 9; band += 1) {
      ctx.beginPath();
      for (let step = 0; step <= canvas.width; step += 10) {
        const x = step;
        const y = 164 + band * 128 + Math.sin(step * 0.018 + band * 0.8) * 44;
        if (step === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = band % 2 === 0 ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.72)';
      ctx.lineWidth = 11 + band;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  for (let star = 0; star < 24; star += 1) {
    const x = 90 + ((star * 37) % 840);
    const y = 110 + ((star * 79) % 1260);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.PI / 4) * (star % 4));
    ctx.fillStyle = star % 2 === 0 ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.48)';
    ctx.fillRect(-1.4, -18, 2.8, 36);
    ctx.fillRect(-18, -1.4, 36, 2.8);
    ctx.restore();
  }

  if (finish.label !== 'Standard') {
    ctx.fillStyle = card.finish === 'prismatic' ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.36)';
    drawRoundedPanel(ctx, 78, 78, canvas.width - 156, 344, 42);
    ctx.fill();
  }

  return canvas;
}

function drawHoloZoneMask(card: OwnedCard, effectMaskImages: Array<HTMLImageElement | null>) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas;
  }

  const finish = finishMeta[card.finish];
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const zone = (alpha: number) => `rgba(255,255,255,${alpha})`;

  drawRoundedPanel(ctx, 56, 56, canvas.width - 112, canvas.height - 112, 66);
  ctx.strokeStyle = zone(0.24 + finish.opacity * 0.18);
  ctx.lineWidth = 20;
  ctx.stroke();

  drawRoundedPanel(ctx, 78, 78, canvas.width - 156, 344, 42);
  const heroGradient = ctx.createLinearGradient(0, 78, 0, 422);
  heroGradient.addColorStop(0, zone(0.74 + finish.opacity * 0.12));
  heroGradient.addColorStop(1, zone(0.42 + finish.opacity * 0.14));
  ctx.fillStyle = heroGradient;
  ctx.fill();

  drawRoundedPanel(ctx, 88, 98, 236, 54, 999);
  ctx.fillStyle = zone(0.36);
  ctx.fill();

  drawRoundedPanel(ctx, canvas.width - 324, 98, 236, 54, 999);
  ctx.fillStyle = zone(0.3);
  ctx.fill();

  ctx.fillStyle = zone(0.18 + finish.opacity * 0.08);
  drawRoundedPanel(ctx, 106, 500, canvas.width - 212, 180, 28);
  ctx.fill();

  ctx.fillStyle = zone(0.12 + finish.opacity * 0.08);
  drawRoundedPanel(ctx, 106, 712, canvas.width - 212, 116, 26);
  ctx.fill();

  if (card.rarity === 'rare' || card.rarity === 'epic' || card.rarity === 'veryrare') {
    ctx.fillStyle = zone(card.rarity === 'rare' ? 0.18 : 0.24);
    for (let index = 0; index < 5; index += 1) {
      drawRoundedPanel(ctx, 112, 998 + index * 84, canvas.width - 224, 28, 999);
      ctx.fill();
    }
  }

  ctx.fillStyle = zone(card.finish === 'prismatic' ? 0.98 : 0.76);
  drawRoundedPanel(ctx, 742, 1188, 168, 168, 28);
  ctx.fill();

  if (card.rarity === 'epic' || card.rarity === 'veryrare') {
    ctx.fillStyle = zone(card.rarity === 'veryrare' ? 0.44 : 0.28);
    drawRoundedPanel(ctx, 72, 72, canvas.width - 144, canvas.height - 144, 60);
    ctx.strokeStyle = zone(card.rarity === 'veryrare' ? 0.34 : 0.22);
    ctx.lineWidth = card.rarity === 'veryrare' ? 18 : 12;
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
    } else if (layer.type === 'sparkle_foil') {
      alpha = 0.68 * layer.opacity;
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

export function useCardTextures(card: OwnedCard | null) {
  const artImage = useRemoteImage(card?.urlImage ?? null);
  const effectLayerUrls = useMemo(
    () => (card ? getCardEffectLayers(card).map((layer) => layer.maskUrl) : []),
    [card],
  );
  const effectMaskImages = useRemoteImages(effectLayerUrls);

  return useMemo(() => {
    if (!card) {
      return null;
    }

    return {
      front: setupTexture(
        drawCardFront(card, artImage, effectMaskImages, {
          treatmentPaintStrength: 0.12,
        }),
      ),
      back: setupTexture(drawCardBack(card)),
      foil: setupTexture(drawFoilLayer(card), true),
      foilZone: setupDataTexture(drawHoloZoneMask(card, effectMaskImages)),
      glossMask: setupDataTexture(drawGlossMaskMap(card, effectMaskImages)),
      embossMap: setupDataTexture(drawEmbossHeightMap(card, effectMaskImages)),
      sugarMask: setupDataTexture(drawSugarMaskMap(card, effectMaskImages)),
      sparkleMask: setupDataTexture(drawSparkleMaskMap(card, effectMaskImages)),
      prismMask: setupDataTexture(drawPrismaticMaskMap(card, effectMaskImages)),
      holoTreatmentMap: setupDataTexture(drawReactiveHoloTreatmentMap(card, effectMaskImages)),
    };
  }, [artImage, card, effectMaskImages]);
}

export function useCardPreviewImage(card: OwnedCard | null) {
  const artImage = useRemoteImage(card?.urlImage ?? null);
  const effectLayerUrls = useMemo(
    () => (card ? getCardEffectLayers(card).map((layer) => layer.maskUrl) : []),
    [card],
  );
  const effectMaskImages = useRemoteImages(effectLayerUrls);

  return useMemo(() => {
    if (!card) {
      return '';
    }

    const sourceCanvas = drawCardFront(card, artImage, effectMaskImages, {
      treatmentPaintStrength: 0.8,
    });
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
  }, [artImage, card, effectMaskImages]);
}
