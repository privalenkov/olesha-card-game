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

    const sourceContext = source.getContext('2d');
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
    const radius = brushSize;
    const softness = Math.max(0, Math.min(1, brushSoftness));
    const softnessCurve = Math.pow(softness, 0.58);
    const innerRadius = radius * Math.max(0, 1 - softnessCurve * 1.55);
    const outerRadius = radius * (1 + softnessCurve * 0.9);
    const color = eraseMode ? '0,0,0' : '255,255,255';

    sourceContext.save();
    sourceContext.globalCompositeOperation = eraseMode ? 'destination-out' : 'source-over';

    if (softness <= 0.04) {
      sourceContext.fillStyle = `rgba(${color},1)`;
      sourceContext.beginPath();
      sourceContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
      sourceContext.fill();
      sourceContext.restore();
      return;
    }

    const gradient = sourceContext.createRadialGradient(
      point.x,
      point.y,
      innerRadius,
      point.x,
      point.y,
      outerRadius,
    );
    gradient.addColorStop(0, `rgba(${color},1)`);
    gradient.addColorStop(0.16, `rgba(${color},0.96)`);
    gradient.addColorStop(0.42, `rgba(${color},0.68)`);
    gradient.addColorStop(0.72, `rgba(${color},0.24)`);
    gradient.addColorStop(1, `rgba(${color},0)`);
    sourceContext.fillStyle = gradient;
    sourceContext.beginPath();
    sourceContext.arc(point.x, point.y, outerRadius, 0, Math.PI * 2);
    sourceContext.fill();
    sourceContext.restore();
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

    const sourceContext = source.getContext('2d');
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
