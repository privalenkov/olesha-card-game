import type { CardCreatorPreviewTool } from './CardCreatorPreviewMenu';

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
      <label className="creator-preview-tool-settings__field">
        <span>Размер кисти: {brushSize}px</span>
        <input
          disabled={disabled}
          max={64}
          min={6}
          onChange={(event) => onBrushSizeChange(Number(event.target.value))}
          step={1}
          type="range"
          value={brushSize}
        />
      </label>

      <label className="creator-preview-tool-settings__field">
        <span>Мягкость кисти: {Math.round(brushSoftness * 100)}%</span>
        <input
          disabled={disabled}
          max={1}
          min={0}
          onChange={(event) => onBrushSoftnessChange(Number(event.target.value))}
          step={0.02}
          type="range"
          value={brushSoftness}
        />
      </label>
    </div>
  );
}
