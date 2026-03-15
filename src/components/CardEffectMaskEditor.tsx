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

    sourceContext.save();
    sourceContext.lineCap = 'round';
    sourceContext.lineJoin = 'round';
    sourceContext.lineWidth = brushSize * 2;

    if (eraseMode) {
      sourceContext.globalCompositeOperation = 'destination-out';
      sourceContext.strokeStyle = 'rgba(0,0,0,1)';
      sourceContext.fillStyle = 'rgba(0,0,0,1)';
    } else {
      sourceContext.globalCompositeOperation = 'source-over';
      sourceContext.strokeStyle = 'rgba(255,255,255,1)';
      sourceContext.fillStyle = 'rgba(255,255,255,1)';
    }

    if (previousPoint) {
      sourceContext.beginPath();
      sourceContext.moveTo(previousPoint.x, previousPoint.y);
      sourceContext.lineTo(point.x, point.y);
      sourceContext.stroke();
    }

    sourceContext.beginPath();
    sourceContext.arc(point.x, point.y, brushSize, 0, Math.PI * 2);
    sourceContext.fill();
    sourceContext.restore();

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
