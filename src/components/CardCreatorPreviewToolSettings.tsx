import type { CardCreatorPreviewTool } from './CardCreatorPreviewMenu';
import { RangeInput } from './ui/RangeInput';

interface CardCreatorPreviewToolSettingsProps {
  activeTool: CardCreatorPreviewTool;
  brushSize: number;
  brushSoftness: number;
  disabled?: boolean;
  onBrushSizeChange: (value: number) => void;
  onBrushSoftnessChange: (value: number) => void;
}

export function CardCreatorPreviewToolSettings({
  activeTool,
  brushSize,
  brushSoftness,
  disabled = false,
  onBrushSizeChange,
  onBrushSoftnessChange,
}: CardCreatorPreviewToolSettingsProps) {
  if (activeTool === 'hand') {
    return null;
  }

  return (
    <div className="creator-preview-tool-settings">
      <RangeInput
        disabled={disabled}
        label="Размер кисти"
        max={64}
        min={6}
        onValueChange={onBrushSizeChange}
        step={1}
        value={brushSize}
        valueLabel={`${brushSize}px`}
      />

      <RangeInput
        disabled={disabled}
        label="Мягкость кисти"
        max={1}
        min={0}
        onValueChange={onBrushSoftnessChange}
        step={0.02}
        value={brushSoftness}
        valueLabel={`${Math.round(brushSoftness * 100)}%`}
      />
    </div>
  );
}
