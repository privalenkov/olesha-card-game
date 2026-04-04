import brushIconUrl from '../assets/icons/brush.svg';
import eraseIconUrl from '../assets/icons/erace.svg';
import handIconUrl from '../assets/icons/hand.svg';
import type { Rarity } from '../game/types';
import { RarityPillTag } from './RarityPillTag';

export type CardCreatorPreviewTool = 'hand' | 'brush' | 'erase';

interface CardCreatorPreviewMenuProps {
  rarity: Rarity;
  activeTool: CardCreatorPreviewTool;
  canEditMask: boolean;
  disabled?: boolean;
  onToolChange: (tool: CardCreatorPreviewTool) => void;
}

const previewToolButtons: Array<{
  tool: CardCreatorPreviewTool;
  icon: string;
  label: string;
}> = [
  {
    tool: 'hand',
    icon: handIconUrl,
    label: 'Обычный просмотр',
  },
  {
    tool: 'brush',
    icon: brushIconUrl,
    label: 'Рисовать маску',
  },
  {
    tool: 'erase',
    icon: eraseIconUrl,
    label: 'Стирать маску',
  },
];

export function CardCreatorPreviewMenu({
  rarity,
  activeTool,
  canEditMask,
  disabled = false,
  onToolChange,
}: CardCreatorPreviewMenuProps) {
  return (
    <div className="creator-preview-menu">
      <div className="creator-preview-menu__actions">
        {previewToolButtons.map(({ tool, icon, label }) => {
          const isActive = activeTool === tool;
          const isDisabled = tool !== 'hand' && (!canEditMask || disabled);

          return (
            <button
              key={tool}
              aria-label={label}
              className={`creator-preview-menu__tool ${
                isActive ? 'creator-preview-menu__tool--active' : ''
              }`}
              disabled={isDisabled}
              onClick={() => onToolChange(tool)}
              type="button"
            >
              <img alt="" aria-hidden="true" className="creator-preview-menu__tool-icon" src={icon} />
            </button>
          );
        })}
      </div>
      <div className="creator-preview-menu__meta">
        <RarityPillTag compact rarity={rarity} />
      </div>
    </div>
  );
}
