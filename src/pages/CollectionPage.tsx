import { useEffect, useMemo, useState } from 'react';
import { CollectionCardTile } from '../components/CollectionCardTile';
import { CardViewerCanvas } from '../components/CardViewerCanvas';
import { useGame } from '../game/GameContext';
import type { OwnedCard } from '../game/types';

type CollectionTab = 'all' | 'duplicates';

export function CollectionPage() {
  const { state } = useGame();
  const [activeCard, setActiveCard] = useState<OwnedCard | null>(null);
  const [activeTab, setActiveTab] = useState<CollectionTab>('all');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveCard(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const duplicateCards = useMemo(() => {
    const seen = new Set<string>();

    return state.collection.filter((card) => {
      if (seen.has(card.id)) {
        return true;
      }

      seen.add(card.id);
      return false;
    });
  }, [state.collection]);

  const visibleCards = activeTab === 'duplicates' ? duplicateCards : state.collection;
  const duplicateCount = duplicateCards.length;

  return (
    <div className="page page--collection page--collection-minimal">
      {state.collection.length === 0 ? (
        <section className="collection-empty">
          <strong>Коллекция пока пустая</strong>
        </section>
      ) : (
        <>
          <section className="collection-toolbar">
            <div className="collection-breakdown collection-breakdown--minimal">
              <div>
                <strong>{state.collection.length}</strong>
                <span>Всего карточек</span>
              </div>
              <div>
                <strong>{duplicateCount}</strong>
                <span>Повторок</span>
              </div>
            </div>

            <div className="filter-pills" role="tablist" aria-label="Фильтр коллекции">
              <button
                className={`filter-pill ${activeTab === 'all' ? 'filter-pill--active' : ''}`}
                onClick={() => setActiveTab('all')}
                type="button"
              >
                Все
              </button>
              <button
                className={`filter-pill ${activeTab === 'duplicates' ? 'filter-pill--active' : ''}`}
                onClick={() => setActiveTab('duplicates')}
                type="button"
              >
                Повторки
              </button>
            </div>
          </section>

          {visibleCards.length > 0 ? (
            <section className="collection-grid collection-grid--minimal">
              {visibleCards.map((card) => (
                <CollectionCardTile key={card.instanceId} card={card} onOpen={setActiveCard} />
              ))}
            </section>
          ) : (
            <section className="collection-empty collection-empty--compact">
              <strong>Повторок пока нет</strong>
            </section>
          )}
        </>
      )}

      {activeCard ? (
        <div className="collection-overlay" onClick={() => setActiveCard(null)} role="presentation">
          <button
            className="collection-overlay__close"
            onClick={() => setActiveCard(null)}
            type="button"
          >
            Закрыть
          </button>
          <div
            className="collection-overlay__viewer"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <CardViewerCanvas
              card={activeCard}
              introKey={activeCard.instanceId}
              cameraZ={10.6}
              scaleMultiplier={0.7}
              effectsPreset="diagnostic"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
