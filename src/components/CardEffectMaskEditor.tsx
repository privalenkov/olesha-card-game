import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CardEffectLayer } from '../game/types';

const MASK_EDITOR_WIDTH = 688;
const MASK_EDITOR_HEIGHT = 964;

interface CardEffectMaskEditorProps {
  disabled?: boolean;
  eraseMode: boolean;
  brushSize: number;
  brushSoftness: number;
  layer: CardEffectLayer | null;
  previewImage: string;
  onMaskChange: (maskUrl: string) => void;
}

function createMaskCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_EDITOR_WIDTH;
  canvas.height = MASK_EDITOR_HEIGHT;
  return canvas;
}

function getMaskContext(canvas: HTMLCanvasElement) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

function drawOverlay(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement,
  tint = 'rgba(127, 241, 255, 0.94)',
) {
  const ctx = target.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, target.width, target.height);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.globalCompositeOperation = 'source-over';
}

export function CardEffectMaskEditor({
  disabled = false,
  eraseMode,
  brushSize,
  brushSoftness,
  layer,
  previewImage,
  onMaskChange,
}: CardEffectMaskEditorProps) {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const dirtyRef = useRef(false);

  if (!sourceCanvasRef.current) {
    sourceCanvasRef.current = createMaskCanvas();
  }

  useEffect(() => {
    const source = sourceCanvasRef.current;
    const overlay = overlayRef.current;
    if (!source || !overlay) {
      return;
    }

    source.width = MASK_EDITOR_WIDTH;
    source.height = MASK_EDITOR_HEIGHT;
    overlay.width = MASK_EDITOR_WIDTH;
    overlay.height = MASK_EDITOR_HEIGHT;

    const sourceContext = getMaskContext(source);
    if (!sourceContext) {
      return;
    }

    sourceContext.clearRect(0, 0, source.width, source.height);

    if (!layer?.maskUrl) {
      drawOverlay(overlay, source);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }

      sourceContext.clearRect(0, 0, source.width, source.height);
      sourceContext.drawImage(image, 0, 0, source.width, source.height);
      drawOverlay(overlay, source);
    };
    image.src = layer.maskUrl;

    return () => {
      cancelled = true;
    };
  }, [layer?.id, layer?.maskUrl]);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * MASK_EDITOR_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * MASK_EDITOR_HEIGHT;
    return {
      x: Math.max(0, Math.min(MASK_EDITOR_WIDTH, x)),
      y: Math.max(0, Math.min(MASK_EDITOR_HEIGHT, y)),
    };
  };

  const stampBrush = (
    sourceContext: CanvasRenderingContext2D,
    point: { x: number; y: number },
  ) => {
    const radius = Math.max(1, brushSize);
    const softness = Math.max(0, Math.min(1, brushSoftness));
    const softnessCurve = Math.pow(softness, 0.72);
    const outerRadius = radius;
    const innerRadius =
      softness <= 0.04 ? radius : radius * Math.max(0, 1 - softnessCurve);
    const minX = Math.max(0, Math.floor(point.x - outerRadius - 1));
    const minY = Math.max(0, Math.floor(point.y - outerRadius - 1));
    const maxX = Math.min(MASK_EDITOR_WIDTH, Math.ceil(point.x + outerRadius + 1));
    const maxY = Math.min(MASK_EDITOR_HEIGHT, Math.ceil(point.y + outerRadius + 1));
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);

    if (width === 0 || height === 0) {
      return;
    }

    const imageData = sourceContext.getImageData(minX, minY, width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelX = minX + x + 0.5;
        const pixelY = minY + y + 0.5;
        const distance = Math.hypot(pixelX - point.x, pixelY - point.y);

        if (distance > outerRadius) {
          continue;
        }

        let alpha = 1;

        if (softness > 0.04 && distance > innerRadius) {
          const t = (distance - innerRadius) / Math.max(outerRadius - innerRadius, 0.0001);
          const smoothstep = t * t * (3 - 2 * t);
          alpha = 1 - smoothstep;
        }

        const index = (y * width + x) * 4;
        const targetAlpha = Math.round(alpha * 255);

        if (eraseMode) {
          data[index + 3] = Math.max(
            0,
            Math.round(data[index + 3] * (1 - alpha)),
          );
          continue;
        }

        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = Math.max(data[index + 3], targetAlpha);
      }
    }

    sourceContext.putImageData(imageData, minX, minY);
  };

  const paintAt = (
    point: { x: number; y: number },
    previousPoint: { x: number; y: number } | null,
  ) => {
    const source = sourceCanvasRef.current;
    const overlay = overlayRef.current;
    if (!source || !overlay || !layer) {
      return;
    }

    const sourceContext = getMaskContext(source);
    if (!sourceContext) {
      return;
    }

    if (previousPoint) {
      const dx = point.x - previousPoint.x;
      const dy = point.y - previousPoint.y;
      const distance = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, brushSize * 0.18)));

      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        stampBrush(sourceContext, {
          x: previousPoint.x + dx * t,
          y: previousPoint.y + dy * t,
        });
      }
    } else {
      stampBrush(sourceContext, point);
    }

    drawOverlay(overlay, source);
    dirtyRef.current = true;
  };

  const commitMask = () => {
    if (!dirtyRef.current || !sourceCanvasRef.current || !layer) {
      return;
    }

    dirtyRef.current = false;
    onMaskChange(sourceCanvasRef.current.toDataURL('image/png'));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !layer) {
      return;
    }

    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
    paintAt(lastPointRef.current, null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled || !layer) {
      return;
    }

    const point = getPoint(event);
    paintAt(point, lastPointRef.current);
    lastPointRef.current = point;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current) {
      drawingRef.current = false;
      lastPointRef.current = null;
      commitMask();
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className={`mask-editor ${disabled ? 'mask-editor--disabled' : ''}`}>
      <div className="mask-editor__stage">
        {previewImage ? (
          <img alt="" className="mask-editor__preview" draggable={false} src={previewImage} />
        ) : (
          <div className="mask-editor__placeholder">Сначала заполни карточку и добавь изображение.</div>
        )}
        <canvas
          ref={overlayRef}
          className="mask-editor__canvas"
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <div className="mask-editor__hint">
        {layer
          ? 'Рисуй по карточке белой маской: белое включает treatment, стирание убирает его.'
          : 'Выбери или добавь effect layer, чтобы начать рисовать маску.'}
      </div>
    </div>
  );
}
