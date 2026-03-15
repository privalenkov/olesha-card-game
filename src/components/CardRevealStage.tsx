import type { CSSProperties } from 'react';
import { rarityMeta } from '../game/config';
import type { OwnedCard } from '../game/types';
import { CardViewerCanvas } from './CardViewerCanvas';

export function CardRevealStage({
  pack,
  currentIndex,
  finished,
  onNext,
  onSelect,
  onReset,
}: {
  pack: OwnedCard[];
  currentIndex: number;
  finished: boolean;
  onNext: () => void;
  onSelect: (index: number) => void;
  onReset: () => void;
}) {
  const card = pack[currentIndex];
  const meta = rarityMeta[card.rarity];

  return (
    <section className="reveal-stage">
      <div className="reveal-stage__viewer">
        <CardViewerCanvas card={card} introKey={card.instanceId} />
      </div>

      <div className="reveal-stage__details">
        <span
          className="rarity-pill"
          style={
            {
                  '--rarity-color': meta.hue,
                  '--rarity-glow': meta.glow,
                } as CSSProperties
              }
            >
              {meta.label}
        </span>

        <h2>{card.title}</h2>
        <p>{card.description}</p>

        <div className="stats-grid">
          {Object.entries(card.stats).map(([label, value]) => (
            <div className="stat-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <div className="stat-row__bar">
                <i style={{ width: `${value}%`, background: meta.hue }} />
              </div>
            </div>
          ))}
        </div>

        <div className="reveal-stage__actions">
          <button className="action-button action-button--solid" onClick={onNext}>
            {finished ? 'Завершить раскрытие' : 'Следующая карточка'}
          </button>
          <button className="action-button" onClick={onReset}>
            Вернуться к запечатанному паку
          </button>
        </div>

        <div className="reveal-queue">
          {pack.map((item, index) => (
            <button
              key={item.instanceId}
              className={
                index === currentIndex
                  ? 'queue-card queue-card--active'
                  : index < currentIndex
                    ? 'queue-card queue-card--seen'
                    : 'queue-card'
              }
              disabled={index > currentIndex}
              onClick={() => onSelect(index)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <small>{index <= currentIndex ? item.title : '???'}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
