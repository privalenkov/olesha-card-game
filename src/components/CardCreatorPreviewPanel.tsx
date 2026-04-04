import { CardEffectMaskEditor } from './CardEffectMaskEditor';
import type { CardEffectLayer, OwnedCard } from '../game/types';
import { CardViewerCanvas } from './CardViewerCanvas';
import {
  CardCreatorPreviewMenu,
  type CardCreatorPreviewTool,
} from './CardCreatorPreviewMenu';
import { CardCreatorPreviewToolSettings } from './CardCreatorPreviewToolSettings';

interface CardCreatorPreviewPanelProps {
  card: OwnedCard;
  viewerRenderKey: string;
  activeTool: CardCreatorPreviewTool;
  brushSize: number;
  brushSoftness: number;
  disabled?: boolean;
  previewImage: string;
  selectedLayer: CardEffectLayer | null;
  onBrushSizeChange: (value: number) => void;
  onBrushSoftnessChange: (value: number) => void;
  onMaskChange: (maskUrl: string) => void;
  onToolChange: (tool: CardCreatorPreviewTool) => void;
}

export function CardCreatorPreviewPanel({
  card,
  viewerRenderKey,
  activeTool,
  brushSize,
  brushSoftness,
  disabled = false,
  previewImage,
  selectedLayer,
  onBrushSizeChange,
  onBrushSoftnessChange,
  onMaskChange,
  onToolChange,
}: CardCreatorPreviewPanelProps) {
  const isMaskMode = activeTool !== 'hand';
  const canEditMask = Boolean(selectedLayer && previewImage);

  return (
    <div className="creator-preview">
      <div className="creator-preview__toolbar">
        <CardCreatorPreviewMenu
          activeTool={activeTool}
          canEditMask={canEditMask}
          disabled={disabled}
          onToolChange={onToolChange}
          rarity={card.rarity}
        />
        <CardCreatorPreviewToolSettings
          activeTool={activeTool}
          brushSize={brushSize}
          brushSoftness={brushSoftness}
          disabled={disabled || !canEditMask}
          onBrushSizeChange={onBrushSizeChange}
          onBrushSoftnessChange={onBrushSoftnessChange}
        />
      </div>
      <div className="creator-preview__stage">
        {isMaskMode ? (
          <CardEffectMaskEditor
            brushSize={brushSize}
            brushSoftness={brushSoftness}
            disabled={disabled}
            embedded
            eraseMode={activeTool === 'erase'}
            layer={selectedLayer}
            onMaskChange={onMaskChange}
            previewImage={previewImage}
            showHint={false}
          />
        ) : (
          <CardViewerCanvas
            key={viewerRenderKey}
            card={card}
            introKey={card.instanceId}
            cameraZ={10.6}
            effectsPreset="full"
            scaleMultiplier={0.7}
          />
        )}
      </div>
    </div>
  );
}
