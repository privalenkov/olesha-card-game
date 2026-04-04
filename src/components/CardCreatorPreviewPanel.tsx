import { CardEffectMaskEditor } from './CardEffectMaskEditor';
import type { CardEffectLayer, OwnedCard } from '../game/types';
import { CardViewerCanvas } from './CardViewerCanvas';
import {
  CardCreatorPreviewMenu,
  type CardCreatorPreviewTool,
} from './CardCreatorPreviewMenu';

interface CardCreatorPreviewPanelProps {
  card: OwnedCard;
  viewerRenderKey: string;
  activeTool: CardCreatorPreviewTool;
  brushSize: number;
  brushSoftness: number;
  disabled?: boolean;
  previewImage: string;
  selectedLayer: CardEffectLayer | null;
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
  onMaskChange,
  onToolChange,
}: CardCreatorPreviewPanelProps) {
  const isMaskMode = activeTool !== 'hand';

  return (
    <div className="creator-preview">
      <CardCreatorPreviewMenu
        activeTool={activeTool}
        canEditMask={Boolean(selectedLayer && previewImage)}
        disabled={disabled}
        onToolChange={onToolChange}
        rarity={card.rarity}
      />
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
