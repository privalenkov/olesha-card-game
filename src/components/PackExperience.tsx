import { useEffect, useState } from 'react';
import { useGame } from '../game/GameContext';
import type { OwnedCard } from '../game/types';
import { PackScene } from './PackScene';
import { CardViewerCanvas } from './CardViewerCanvas';

type PackPhase = 'sealed' | 'tearing' | 'burst' | 'revealing' | 'finished';
type DragZone = 'top' | 'bottom' | null;

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  zone: DragZone;
  deltaX: number;
  deltaY: number;
  anchorX: number;
}

const initialDrag: DragState = {
  active: false,
  startX: 0,
  startY: 0,
  zone: null,
  deltaX: 0,
  deltaY: 0,
  anchorX: 0.5,
};

export function PackExperience() {
  const {
    error,
    openPack,
    state,
    timeUntilReset,
  } = useGame();
  const [face, setFace] = useState<'front' | 'back'>('front');
  const [phase, setPhase] = useState<PackPhase>('sealed');
  const [drag, setDrag] = useState<DragState>(initialDrag);
  const [activePack, setActivePack] = useState<OwnedCard[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tearAnchor, setTearAnchor] = useState(0.5);
  const [tearDirection, setTearDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (phase !== 'tearing') {
      return;
    }

    const burstTimer = window.setTimeout(() => setPhase('burst'), 700);
    const revealTimer = window.setTimeout(() => setPhase('revealing'), 1500);

    return () => {
      window.clearTimeout(burstTimer);
      window.clearTimeout(revealTimer);
    };
  }, [phase]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowRight' && event.key !== ' ') {
        return;
      }

      if (phase === 'revealing' || phase === 'finished') {
        event.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, currentIndex, activePack]);

  const tearProgress =
    drag.zone === 'top' ? Math.max(Math.min(Math.abs(drag.deltaX) / 132, 1), 0) : 0;
  const flipProgress =
    drag.zone === 'bottom' ? Math.max(Math.min(drag.deltaX / 150, 1), -1) : 0;
  const liveTearAnchor = drag.zone === 'top' ? drag.anchorX : tearAnchor;

  const currentCard = activePack?.[currentIndex] ?? null;
  const isRevealVisible =
    activePack !== null && currentCard !== null && (phase === 'revealing' || phase === 'finished');

  const beginOpen = async (anchor: number, direction: number) => {
    if (phase !== 'sealed') {
      return;
    }

    const pack = await openPack();
    if (!pack) {
      return;
    }

    setActivePack(pack);
    setCurrentIndex(0);
    setTearAnchor(anchor);
    setTearDirection(direction >= 0 ? 1 : -1);
    setPhase('tearing');
  };

  const handleNext = () => {
    if (!activePack) {
      return;
    }

    if (currentIndex >= activePack.length - 1) {
      if (phase === 'finished') {
        resetScene();
        return;
      }

      setPhase('finished');
      return;
    }

    setCurrentIndex((index) => index + 1);
  };

  const resetScene = () => {
    setFace('front');
    setPhase('sealed');
    setDrag(initialDrag);
    setActivePack(null);
    setCurrentIndex(0);
    setTearAnchor(0.5);
    setTearDirection(1);
  };

  return (
    <section className="home-stage">
      <div className="home-stage__canvas">
        <div
          className="gesture-stage gesture-stage--fullscreen"
          onPointerDown={(event) => {
            if (phase !== 'sealed') {
              return;
            }

            const bounds = event.currentTarget.getBoundingClientRect();
            const localX = event.clientX - bounds.left;
            const localY = event.clientY - bounds.top;
            const zone = localY < bounds.height * 0.42 ? 'top' : 'bottom';
            setDrag({
              active: true,
              startX: event.clientX,
              startY: event.clientY,
              zone,
              deltaX: 0,
              deltaY: 0,
              anchorX: Math.max(0.08, Math.min(localX / bounds.width, 0.92)),
            });
          }}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const localX = event.clientX - bounds.left;
            const clientX = event.clientX;
            const clientY = event.clientY;

            setDrag((current) => {
              if (!current.active) {
                return current;
              }

              return {
                ...current,
                deltaX: clientX - current.startX,
                deltaY: clientY - current.startY,
                anchorX: Math.max(0.08, Math.min(localX / bounds.width, 0.92)),
              };
            });
          }}
          onPointerUp={() => {
            if (!drag.active || !drag.zone) {
              setDrag(initialDrag);
              return;
            }

            if (drag.zone === 'top' && Math.abs(drag.deltaX) > 72) {
              void beginOpen(drag.anchorX, drag.deltaX);
            }

            if (drag.zone === 'bottom' && Math.abs(drag.deltaX) > 72) {
              setFace((current) => (current === 'front' ? 'back' : 'front'));
            }

            setDrag(initialDrag);
          }}
          onPointerLeave={() => setDrag(initialDrag)}
          onClick={() => {
            if (isRevealVisible) {
              handleNext();
            }
          }}
        >
          {isRevealVisible && currentCard ? (
            <CardViewerCanvas card={currentCard} introKey={currentCard.instanceId} />
          ) : (
            <PackScene
              cards={activePack}
              face={face}
              phase={phase}
              tearProgress={tearProgress}
              flipProgress={flipProgress}
              tearAnchor={liveTearAnchor}
              tearDirection={tearDirection}
              focusIndex={currentIndex}
            />
          )}
        </div>
      </div>

      <div className="home-stage__status">
        <strong>
          {state.remainingPacks} из {state.dailyPackLimit}
        </strong>
        <span>Обновление паков через: {timeUntilReset}</span>
        {error ? <span className="home-stage__error">{error}</span> : null}
      </div>
    </section>
  );
}
