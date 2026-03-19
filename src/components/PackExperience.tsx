import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGame } from '../game/GameContext';
import type { OwnedCard, Rarity } from '../game/types';
import { CardViewerCanvas } from './CardViewerCanvas';
import { PackCarouselScene, PackScene } from './PackScene';

type ExperienceStage = 'hero' | 'preparing' | 'carousel' | 'tear' | 'opening' | 'revealing' | 'complete';
type RevealState = 'charging' | 'impact' | 'awaiting_flip' | 'revealed' | 'launching' | 'complete';

interface TearGesture {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  width: number;
  height: number;
}

interface CardSwipeGesture {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
}

interface CarouselSwipeGesture {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastStepX: number;
  moved: boolean;
  mode: 'rotate' | 'flip';
}

interface RevealProfile {
  chargeMs: number;
  effectMs: number;
  cardDelayLabel: string;
}

const VISUAL_PACK_COUNT = 5;
const PACK_FLIP_PREVIEW_LIMIT = 0.72;
const PACK_FLIP_TRIGGER_DISTANCE = 72;
const CARD_LAUNCH_EXIT_DISTANCE = 860;
const initialTearGesture: TearGesture = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  width: 1,
  height: 1,
};
const initialCardSwipeGesture: CardSwipeGesture = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
};
const initialCarouselSwipeGesture: CarouselSwipeGesture = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  lastStepX: 0,
  moved: false,
  mode: 'rotate',
};
const revealProfiles: Record<Rarity, RevealProfile> = {
  common: {
    chargeMs: 120,
    effectMs: 240,
    cardDelayLabel: 'Обычная карта раскрывается сразу.',
  },
  uncommon: {
    chargeMs: 220,
    effectMs: 460,
    cardDelayLabel: 'Необычная карта пробивается мягким светом.',
  },
  rare: {
    chargeMs: 760,
    effectMs: 2400,
    cardDelayLabel: 'Редкая карта заливается цветом и выбрасывает крупный сплеш частиц.',
  },
  epic: {
    chargeMs: 980,
    effectMs: 2600,
    cardDelayLabel: 'Epic карта держит сплошную заливку дольше и раскрывается через более насыщенный сплеш.',
  },
  veryrare: {
    chargeMs: 1320,
    effectMs: 2800,
    cardDelayLabel: 'Very Rare карта получает самый крупный и сложный партикл-сплеш перед раскрытием.',
  },
};

const MANUAL_FLIP_REVEAL_RARITIES: Rarity[] = ['rare', 'epic', 'veryrare'];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getShortestCarouselDelta(targetIndex: number, activeIndex: number, total: number) {
  const forward = (targetIndex - activeIndex + total) % total;
  const backward = forward - total;
  return Math.abs(backward) < Math.abs(forward) ? backward : forward;
}

export function PackExperience() {
  const { authenticated, error, openPack, state, timeUntilReset } = useGame();
  const [stage, setStage] = useState<ExperienceStage>('hero');
  const [heroRotationOffset, setHeroRotationOffset] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselOrbitIndex, setCarouselOrbitIndex] = useState(0);
  const [visualPackRotationOffsets, setVisualPackRotationOffsets] = useState<number[]>(
    () => Array.from({ length: VISUAL_PACK_COUNT }, () => 0),
  );
  const [openedPack, setOpenedPack] = useState<OwnedCard[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealState, setRevealState] = useState<RevealState>('charging');
  const [heroFlipPreview, setHeroFlipPreview] = useState(0);
  const [carouselFlipPreview, setCarouselFlipPreview] = useState(0);
  const [tearGesture, setTearGesture] = useState<TearGesture>(initialTearGesture);
  const [tearAnchor, setTearAnchor] = useState(0.5);
  const [tearDirection, setTearDirection] = useState<1 | -1>(1);
  const [tearDocked, setTearDocked] = useState(false);
  const [cardLaunchOffset, setCardLaunchOffset] = useState(0);
  const cardSwipeRef = useRef<CardSwipeGesture>(initialCardSwipeGesture);
  const carouselSwipeRef = useRef<CarouselSwipeGesture>(initialCarouselSwipeGesture);
  const heroFlipSwipeRef = useRef<CardSwipeGesture>(initialCardSwipeGesture);
  const openingTimerRef = useRef<number | null>(null);
  const carouselSlideTimerRef = useRef<number | null>(null);
  const cardLaunchTimerRef = useRef<number | null>(null);
  const cardEntryTimerRef = useRef<number | null>(null);
  const carouselSuppressClickUntilRef = useRef(0);
  const [carouselDragging, setCarouselDragging] = useState(false);
  const [carouselSliding, setCarouselSliding] = useState(false);
  const [carouselInteracting, setCarouselInteracting] = useState(false);
  const [stackEntryCardId, setStackEntryCardId] = useState<string | null>(null);

  const currentCard = openedPack?.[currentIndex] ?? null;
  const revealProfile = currentCard ? revealProfiles[currentCard.rarity] : null;
  const selectedPackRotationOffset = visualPackRotationOffsets[carouselIndex] ?? 0;
  const tearProgress =
    stage === 'opening' || stage === 'revealing' || stage === 'complete'
      ? 1
      : tearGesture.active
        ? clamp(Math.abs(tearGesture.currentX - tearGesture.startX) / 260, 0, 1)
        : 0;
  const liveTearAnchor = tearGesture.active
    ? clamp(tearGesture.currentX / tearGesture.width, 0.14, 0.86)
    : tearAnchor;
  const stackedCards = openedPack?.slice(currentIndex + 1) ?? [];
  const lastCard = openedPack ? currentIndex >= openedPack.length - 1 : false;

  useEffect(() => {
    return () => {
      if (openingTimerRef.current) {
        window.clearTimeout(openingTimerRef.current);
      }
      if (carouselSlideTimerRef.current) {
        window.clearTimeout(carouselSlideTimerRef.current);
      }
      if (cardLaunchTimerRef.current) {
        window.clearTimeout(cardLaunchTimerRef.current);
      }
      if (cardEntryTimerRef.current) {
        window.clearTimeout(cardEntryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (stage !== 'revealing' || !currentCard) {
      return;
    }

    const requiresManualFlip = MANUAL_FLIP_REVEAL_RARITIES.includes(currentCard.rarity);

    if (currentCard.rarity === 'common' || currentCard.rarity === 'uncommon') {
      setRevealState('revealed');
      setCardLaunchOffset(0);
      return;
    }

    if (requiresManualFlip) {
      setRevealState('awaiting_flip');
      setCardLaunchOffset(0);
      return;
    }

    const chargeDuration = Math.max(revealProfile?.chargeMs ?? 0, 0);
    const impactDuration = Math.max(revealProfile?.effectMs ?? 0, 0);

    setRevealState(chargeDuration > 0 ? 'charging' : 'impact');
    setCardLaunchOffset(0);

    const impactTimer = window.setTimeout(() => {
      setRevealState('impact');
    }, chargeDuration);

    const revealTimer = window.setTimeout(() => {
      setRevealState(requiresManualFlip ? 'awaiting_flip' : 'revealed');
    }, chargeDuration + impactDuration);

    return () => {
      window.clearTimeout(impactTimer);
      window.clearTimeout(revealTimer);
    };
  }, [currentCard?.instanceId, currentCard?.rarity, revealProfile?.chargeMs, revealProfile?.effectMs, stage]);

  useEffect(() => {
    if (stage !== 'revealing' || !currentCard || revealState !== 'impact') {
      return;
    }

    const impactDuration = Math.max(revealProfile?.effectMs ?? 0, 0);

    if (impactDuration <= 0) {
      setRevealState('revealed');
      return;
    }

    const revealTimer = window.setTimeout(() => {
      setRevealState('revealed');
    }, impactDuration);

    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [currentCard?.instanceId, revealProfile?.effectMs, revealState, stage]);

  useEffect(() => {
    const handleCardSwipeMove = (event: PointerEvent) => {
      if (!cardSwipeRef.current.active || cardSwipeRef.current.pointerId !== event.pointerId) {
        return;
      }

      const deltaY = event.clientY - cardSwipeRef.current.startY;
      const deltaX = event.clientX - cardSwipeRef.current.startX;

      if (deltaY < 0 && Math.abs(deltaY) > Math.abs(deltaX) * 0.75) {
        setCardLaunchOffset(clamp(deltaY, -220, 0));
      }
    };

    const handleCardSwipeEnd = (event: PointerEvent) => {
      if (!cardSwipeRef.current.active || cardSwipeRef.current.pointerId !== event.pointerId) {
        return;
      }

      const deltaY = event.clientY - cardSwipeRef.current.startY;
      const deltaX = event.clientX - cardSwipeRef.current.startX;

      cardSwipeRef.current = initialCardSwipeGesture;

      if (
        (stage === 'revealing' || stage === 'complete') &&
        revealState === 'revealed' &&
        deltaY < -120 &&
        Math.abs(deltaY) > Math.abs(deltaX) * 0.9
      ) {
        if (cardLaunchTimerRef.current) {
          window.clearTimeout(cardLaunchTimerRef.current);
          cardLaunchTimerRef.current = null;
        }

        setRevealState('launching');
        setCardLaunchOffset(-CARD_LAUNCH_EXIT_DISTANCE);

        cardLaunchTimerRef.current = window.setTimeout(() => {
          cardLaunchTimerRef.current = null;

          if (!openedPack) {
            return;
          }

          if (lastCard) {
            resetExperience();
            return;
          }

          const nextCard = openedPack[currentIndex + 1] ?? null;
          if (cardEntryTimerRef.current) {
            window.clearTimeout(cardEntryTimerRef.current);
            cardEntryTimerRef.current = null;
          }

          setStackEntryCardId(nextCard?.instanceId ?? null);
          setCurrentIndex((index) => index + 1);
          setRevealState('charging');
          setCardLaunchOffset(0);

          cardEntryTimerRef.current = window.setTimeout(() => {
            cardEntryTimerRef.current = null;
            setStackEntryCardId(null);
          }, 420);
        }, 380);

        return;
      }

      setCardLaunchOffset(0);
    };

    window.addEventListener('pointermove', handleCardSwipeMove);
    window.addEventListener('pointerup', handleCardSwipeEnd);
    window.addEventListener('pointercancel', handleCardSwipeEnd);

    return () => {
      window.removeEventListener('pointermove', handleCardSwipeMove);
      window.removeEventListener('pointerup', handleCardSwipeEnd);
      window.removeEventListener('pointercancel', handleCardSwipeEnd);
    };
  }, [lastCard, openedPack, revealState, stage]);

  function resetExperience() {
    if (openingTimerRef.current) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
    if (carouselSlideTimerRef.current) {
      window.clearTimeout(carouselSlideTimerRef.current);
      carouselSlideTimerRef.current = null;
    }
    if (cardLaunchTimerRef.current) {
      window.clearTimeout(cardLaunchTimerRef.current);
      cardLaunchTimerRef.current = null;
    }
    if (cardEntryTimerRef.current) {
      window.clearTimeout(cardEntryTimerRef.current);
      cardEntryTimerRef.current = null;
    }

    setStage('hero');
    setHeroRotationOffset(0);
    setCarouselIndex(0);
    setCarouselOrbitIndex(0);
    setVisualPackRotationOffsets(Array.from({ length: VISUAL_PACK_COUNT }, () => 0));
    setOpenedPack(null);
    setCurrentIndex(0);
    setRevealState('charging');
    setHeroFlipPreview(0);
    setCarouselFlipPreview(0);
    setTearGesture(initialTearGesture);
    setTearAnchor(0.5);
    setTearDirection(1);
    setTearDocked(false);
    setCardLaunchOffset(0);
    setStackEntryCardId(null);
    cardSwipeRef.current = initialCardSwipeGesture;
    heroFlipSwipeRef.current = initialCardSwipeGesture;
    carouselSwipeRef.current = initialCarouselSwipeGesture;
    carouselSuppressClickUntilRef.current = 0;
    setCarouselDragging(false);
    setCarouselSliding(false);
    setCarouselInteracting(false);
  }

  useEffect(() => {
    if (stage !== 'preparing') {
      return;
    }

    const timer = window.setTimeout(() => {
      setStage('carousel');
    }, 620);

    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'tear') {
      return;
    }

    setTearDocked(false);
    const dockTimer = window.setTimeout(() => {
      setTearDocked(true);
    }, 16);

    return () => window.clearTimeout(dockTimer);
  }, [stage]);

  function preparePackOpening() {
    if (stage === 'preparing') {
      return;
    }

    setStage('preparing');
    setOpenedPack(null);
    setCurrentIndex(0);
    setRevealState('charging');
    setHeroFlipPreview(0);
    setCarouselFlipPreview(0);
    setTearGesture(initialTearGesture);
    setTearAnchor(0.5);
    setTearDirection(1);
    setTearDocked(false);
    setCardLaunchOffset(0);
    setStackEntryCardId(null);
    setVisualPackRotationOffsets(Array.from({ length: VISUAL_PACK_COUNT }, () => heroRotationOffset));
    setCarouselIndex(0);
    setCarouselOrbitIndex(0);
    carouselSwipeRef.current = initialCarouselSwipeGesture;
    carouselSuppressClickUntilRef.current = 0;
    setCarouselDragging(false);
    setCarouselSliding(false);
    setCarouselInteracting(false);
  }

  function stepCarousel(direction: number) {
    if (carouselSlideTimerRef.current) {
      window.clearTimeout(carouselSlideTimerRef.current);
    }
    setCarouselSliding(true);
    carouselSlideTimerRef.current = window.setTimeout(() => {
      carouselSlideTimerRef.current = null;
      setCarouselSliding(false);

      if (!carouselSwipeRef.current.active) {
        setCarouselInteracting(false);
      }
    }, 220);
    setCarouselIndex((current) => (current + direction + VISUAL_PACK_COUNT) % VISUAL_PACK_COUNT);
    setCarouselOrbitIndex((current) => current + direction);
  }

  function rotateCarouselPack(index: number, rotationStep: number) {
    setVisualPackRotationOffsets((current) =>
      current.map((rotationOffset, faceIndex) =>
        faceIndex === index ? rotationOffset + rotationStep : rotationOffset,
      ),
    );
  }

  function isCenteredPackFlipZone(bounds: DOMRect, clientX: number, clientY: number) {
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const withinCenterX = localX >= bounds.width * 0.32 && localX <= bounds.width * 0.68;
    const withinLowerHalf = localY >= bounds.height * 0.48 && localY <= bounds.height * 0.82;

    return withinCenterX && withinLowerHalf;
  }

  function isCenteredPackTapZone(bounds: DOMRect, clientX: number, clientY: number) {
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const withinCenterX = localX >= bounds.width * 0.28 && localX <= bounds.width * 0.72;
    const withinCenterY = localY >= bounds.height * 0.16 && localY <= bounds.height * 0.82;

    return withinCenterX && withinCenterY;
  }

  function beginHeroFlipSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (stage !== 'hero' && stage !== 'preparing') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    if (!isCenteredPackFlipZone(bounds, event.clientX, event.clientY)) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    heroFlipSwipeRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function endHeroFlipSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = heroFlipSwipeRef.current;

    if (!swipe.active || swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;

    if (Math.abs(deltaX) > PACK_FLIP_TRIGGER_DISTANCE && Math.abs(deltaY) < 96) {
      setHeroRotationOffset((current) => current + (deltaX > 0 ? Math.PI : -Math.PI));
    }

    setHeroFlipPreview(0);
    heroFlipSwipeRef.current = initialCardSwipeGesture;
  }

  function moveHeroFlipSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = heroFlipSwipeRef.current;

    if (!swipe.active || swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;

    if (Math.abs(deltaY) > 96) {
      return;
    }

    setHeroFlipPreview(clamp(deltaX / 180, -1, 1) * PACK_FLIP_PREVIEW_LIMIT);
  }

  function beginCarouselSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (stage !== 'carousel') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const mode = isCenteredPackFlipZone(bounds, event.clientX, event.clientY) ? 'flip' : 'rotate';
    event.currentTarget.setPointerCapture(event.pointerId);
    setCarouselInteracting(true);
    carouselSwipeRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastStepX: event.clientX,
      moved: false,
      mode,
    };
    setCarouselDragging(false);
  }

  function moveCarouselSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = carouselSwipeRef.current;

    if (!swipe.active || swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;

    if (swipe.mode === 'flip') {
      setCarouselFlipPreview(clamp(deltaX / 180, -1, 1) * PACK_FLIP_PREVIEW_LIMIT);
      return;
    }

    if (Math.abs(deltaX) < Math.abs(deltaY) + 12) {
      return;
    }

    if (Math.abs(deltaX) > 18) {
      setCarouselDragging(true);
      setCarouselSliding(true);
    }

    const stepDelta = event.clientX - swipe.lastStepX;

    if (Math.abs(stepDelta) >= 88) {
      stepCarousel(stepDelta < 0 ? 1 : -1);
      carouselSwipeRef.current = {
        ...swipe,
        lastStepX: event.clientX,
        moved: true,
      };
      carouselSuppressClickUntilRef.current = Date.now() + 220;
    }
  }

  function endCarouselSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = carouselSwipeRef.current;

    if (!swipe.active || swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    const bounds = event.currentTarget.getBoundingClientRect();

    if (swipe.mode === 'flip') {
      if (Math.abs(deltaX) > PACK_FLIP_TRIGGER_DISTANCE && Math.abs(deltaY) < 96) {
        rotateCarouselPack(carouselIndex, deltaX > 0 ? Math.PI : -Math.PI);
        carouselSuppressClickUntilRef.current = Date.now() + 220;
      }
      setCarouselFlipPreview(0);
    } else if (!swipe.moved && Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) + 10) {
      stepCarousel(deltaX < 0 ? 1 : -1);
      carouselSuppressClickUntilRef.current = Date.now() + 220;
    } else if (
      !swipe.moved &&
      Math.abs(deltaX) < 18 &&
      Math.abs(deltaY) < 18 &&
      isCenteredPackTapZone(bounds, event.clientX, event.clientY)
    ) {
      setStage('tear');
      carouselSuppressClickUntilRef.current = Date.now() + 220;
    }

    carouselSwipeRef.current = initialCarouselSwipeGesture;
    window.setTimeout(() => {
      setCarouselDragging(false);
      if (!carouselSlideTimerRef.current) {
        setCarouselSliding(false);
        setCarouselInteracting(false);
      }
    }, 0);
  }

  function startTearGesture(event: ReactPointerEvent<HTMLDivElement>) {
    if (stage !== 'tear') {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const topBandStart = bounds.height * 0.5;
    const topBandEnd = bounds.height * 0.84;

    if (localY < topBandStart || localY > topBandEnd) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setTearGesture({
      active: true,
      pointerId: event.pointerId,
      startX: localX,
      startY: localY,
      currentX: localX,
      currentY: localY,
      width: bounds.width,
      height: bounds.height,
    });
  }

  async function finalizePackOpening() {
    if (openingTimerRef.current) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
    if (cardLaunchTimerRef.current) {
      window.clearTimeout(cardLaunchTimerRef.current);
      cardLaunchTimerRef.current = null;
    }
    if (cardEntryTimerRef.current) {
      window.clearTimeout(cardEntryTimerRef.current);
      cardEntryTimerRef.current = null;
    }

    setStage('opening');
    setOpenedPack(null);
    setCurrentIndex(0);
    setRevealState('charging');
    setCardLaunchOffset(0);
    setStackEntryCardId(null);

    const pack = await openPack();

    if (!pack) {
      resetExperience();
      return;
    }

    setOpenedPack(pack);
    openingTimerRef.current = window.setTimeout(() => {
      openingTimerRef.current = null;
      setStage('revealing');
    }, 980);
  }

  function renderRevealStack(mode: 'opening' | 'revealing') {
    if (!openedPack || !currentCard) {
      return null;
    }

    const activeCardInstanceId = currentCard.instanceId;
    const isOpening = mode === 'opening';
    const launching = !isOpening && revealState === 'launching';
    const launchExitProgress = Math.min(Math.abs(cardLaunchOffset) / CARD_LAUNCH_EXIT_DISTANCE, 1);
    const stackCardInteractive =
      !isOpening && !launching && (revealState === 'revealed' || revealState === 'awaiting_flip');
    const shakeMode =
      !isOpening && revealState === 'awaiting_flip'
        ? currentCard.rarity === 'veryrare'
          ? 'veryrare'
          : currentCard.rarity === 'epic'
            ? 'epic'
            : currentCard.rarity === 'rare'
            ? 'rare'
              : 'none'
        : 'none';
    const revealImpactRarity =
      !isOpening &&
      revealState === 'impact' &&
      currentCard.rarity !== 'common' &&
      currentCard.rarity !== 'uncommon'
        ? currentCard.rarity
        : null;
    function renderRevealCardLayer({
      card,
      layerKey,
      className,
      forcedSide,
      interactive,
      stackBackCount,
      renderStackOnly = false,
      enterFromStackAnimation = false,
      launchExitProgress = 0,
      introKeyOverride,
      revealImpactRarity,
      revealImpactDurationMs,
      shakeMode,
      onUserFlip,
      skipIntroAnimation = false,
    }: {
      card: OwnedCard;
      layerKey: string;
      className: string;
      forcedSide: 'front' | 'back' | null;
      interactive: boolean;
      stackBackCount: number;
      renderStackOnly?: boolean;
      enterFromStackAnimation?: boolean;
      launchExitProgress?: number;
      introKeyOverride?: string;
      revealImpactRarity: Extract<Rarity, 'rare' | 'epic' | 'veryrare'> | null;
      revealImpactDurationMs: number;
      shakeMode: 'none' | 'rare' | 'epic' | 'veryrare';
      onUserFlip?: (side: 'front' | 'back') => void;
      skipIntroAnimation?: boolean;
    }) {
      return (
        <div
          key={layerKey}
          className={className}
          onPointerDownCapture={(event) => {
            if (card.instanceId !== activeCardInstanceId) {
              return;
            }

            if (isOpening || stage !== 'revealing' || revealState !== 'revealed') {
              return;
            }

            cardSwipeRef.current = {
              active: true,
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
            };
          }}
        >
          <div className="pack-reveal__card-shell pack-reveal__card-shell--active">
            <div className="pack-reveal__viewer">
              <CardViewerCanvas
                cameraZ={10.6}
                card={card}
                effectsPreset="full"
                forcedSide={forcedSide}
                initialSide="back"
                interactive={interactive}
                introKey={introKeyOverride ?? card.instanceId}
                skipIntroAnimation={skipIntroAnimation}
                renderStackOnly={renderStackOnly}
                enterFromStackAnimation={enterFromStackAnimation}
                launchExitProgress={launchExitProgress}
                stackBackCount={stackBackCount}
                activeLiftProgress={0}
                shakeMode={shakeMode}
                revealImpactRarity={revealImpactRarity}
                revealImpactDurationMs={revealImpactDurationMs}
                onUserFlip={onUserFlip}
                scaleMultiplier={0.7}
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`pack-reveal ${isOpening ? 'pack-reveal--opening' : ''}`}>
        <div className="pack-reveal__stack">
          {stackedCards.length > 0
            ? renderRevealCardLayer({
                card: currentCard,
                layerKey: 'stack-anchor',
                className: 'pack-reveal__active pack-reveal__active--stack-anchor',
                forcedSide: 'back',
                interactive: false,
                stackBackCount: stackedCards.length,
                renderStackOnly: true,
                introKeyOverride: 'stack-anchor',
                revealImpactRarity: null,
                revealImpactDurationMs: 0,
                shakeMode: 'none',
                skipIntroAnimation: true,
              })
            : null}

          {renderRevealCardLayer({
            card: currentCard,
            layerKey: currentCard.instanceId,
            className: `pack-reveal__active pack-reveal__active--${currentCard.rarity} ${
              !isOpening && revealState === 'charging' ? 'pack-reveal__active--charging' : ''
            } ${
              !isOpening && revealState === 'impact' ? 'pack-reveal__active--impact' : ''
            } ${
              !isOpening && revealState === 'awaiting_flip'
                ? 'pack-reveal__active--awaiting-flip'
                : ''
            } ${launching ? 'pack-reveal__active--launching pack-reveal__active--launching-out' : ''}`,
            forcedSide: isOpening
              ? 'back'
              : revealState === 'charging' || revealState === 'awaiting_flip'
                ? 'back'
                : 'front',
            interactive: stackCardInteractive,
            stackBackCount: 0,
            enterFromStackAnimation: stackEntryCardId === currentCard.instanceId,
            launchExitProgress: !isOpening ? launchExitProgress : 0,
            revealImpactRarity,
            revealImpactDurationMs: revealImpactRarity ? revealProfile?.effectMs ?? 0 : 0,
            shakeMode,
            skipIntroAnimation: stackEntryCardId === currentCard.instanceId,
            onUserFlip: (side) => {
              if (revealState === 'awaiting_flip' && side === 'front') {
                setRevealState('impact');
              }
            },
          })}
        </div>

      </div>
    );
  }

  return (
    <section className={`home-stage pack-ritual pack-ritual--${stage}`}>
      <div className="home-stage__canvas">
        <div className="pack-ritual__backdrop" />

        {stage === 'hero' ? (
          <div className="pack-ritual__fullscreen-stage">
            <div
              className="pack-ritual__scene-shell pack-ritual__scene-shell--fullscreen"
              onPointerCancel={endHeroFlipSwipe}
              onPointerDown={beginHeroFlipSwipe}
              onPointerMove={moveHeroFlipSwipe}
              onPointerUp={endHeroFlipSwipe}
            >
              <PackScene
                cards={null}
                dragPreview={heroFlipPreview}
                focusIndex={0}
                hoverEnabled
                phase="sealed"
                rotationOffset={heroRotationOffset}
                tearAnchor={0.5}
                tearDirection={1}
                tearProgress={0}
              />
            </div>

            <div className="pack-ritual__cta">
              <button
                className="action-button action-button--solid pack-ritual__open"
                disabled={authenticated && state.remainingPacks <= 0}
                onClick={preparePackOpening}
                type="button"
              >
                Выбрать пак
              </button>
            </div>
          </div>
        ) : null}

        {stage === 'preparing' || stage === 'carousel' ? (
          <div className="pack-ritual__fullscreen-stage">
            <div
              className={`pack-carousel pack-carousel--3d ${carouselDragging ? 'is-dragging' : ''}`}
              onWheel={(event) => {
                if (stage !== 'carousel') {
                  return;
                }

                event.preventDefault();
                setCarouselInteracting(true);

                if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                  stepCarousel(event.deltaY > 0 ? 1 : -1);
                } else if (Math.abs(event.deltaX) > 8) {
                  stepCarousel(event.deltaX > 0 ? 1 : -1);
                }
              }}
              onPointerCancel={endCarouselSwipe}
              onPointerDown={beginCarouselSwipe}
              onPointerMove={moveCarouselSwipe}
              onPointerUp={endCarouselSwipe}
            >
              <PackCarouselScene
                activeIndex={carouselIndex}
                dragPreview={carouselFlipPreview}
                hoverEnabled={!carouselInteracting && !carouselDragging && !carouselSliding}
                orbitIndex={carouselOrbitIndex}
                onPackClick={(index) => {
                  if (stage !== 'carousel') {
                    return;
                  }

                  if (Date.now() < carouselSuppressClickUntilRef.current) {
                    return;
                  }

                  if (index !== carouselIndex) {
                    const delta = getShortestCarouselDelta(index, carouselIndex, VISUAL_PACK_COUNT);
                    setCarouselIndex(index);
                    setCarouselOrbitIndex((current) => current + delta);
                    return;
                  }

                  setStage('tear');
                }}
                rotationOffsets={visualPackRotationOffsets}
              />
            </div>
          </div>
        ) : null}

        {stage === 'tear' || stage === 'opening' || stage === 'revealing' || stage === 'complete' ? (
          <div className="pack-ritual__reveal-shell">
            {stage === 'tear' ? (
              <div className="pack-ritual__tear-copy">
                <span className="eyebrow">Open The Pack</span>
                <h1>Проведите линию чтобы открыть пак.</h1>
                <p>
                  Пак уходит вниз за экран, оставляя сверху только кромку. Веди горизонтально по
                  верхней части и разрывай обертку вручную.
                </p>
              </div>
            ) : null}

            {stage === 'tear' || stage === 'opening' ? (
              <div
                className={`pack-ritual__dock-stage ${stage === 'opening' ? 'is-opening' : ''}`}
                onPointerDown={startTearGesture}
                onPointerMove={(event) => {
                  if (
                    stage !== 'tear' ||
                    !tearGesture.active ||
                    tearGesture.pointerId !== event.pointerId
                  ) {
                    return;
                  }

                  const bounds = event.currentTarget.getBoundingClientRect();
                  setTearGesture((current) => {
                    if (!current.active) {
                      return current;
                    }

                    return {
                      ...current,
                      currentX: event.clientX - bounds.left,
                      currentY: event.clientY - bounds.top,
                    };
                  });
                }}
                onPointerUp={(event) => {
                  if (
                    stage !== 'tear' ||
                    !tearGesture.active ||
                    tearGesture.pointerId !== event.pointerId
                  ) {
                    setTearGesture(initialTearGesture);
                    return;
                  }

                  const deltaX = tearGesture.currentX - tearGesture.startX;
                  const deltaY = tearGesture.currentY - tearGesture.startY;
                  const readyToOpen = Math.abs(deltaX) > 220 && Math.abs(deltaY) < 120;

                  if (!readyToOpen) {
                    setTearGesture(initialTearGesture);
                    return;
                  }

                  setTearAnchor(clamp(tearGesture.startX / tearGesture.width, 0.14, 0.86));
                  setTearDirection(deltaX >= 0 ? 1 : -1);
                  setTearGesture(initialTearGesture);
                  void finalizePackOpening();
                }}
              >
                <PackScene
                  cards={null}
                  dragPreview={0}
                  focusIndex={currentIndex}
                  hoverEnabled={false}
                  offsetY={stage === 'opening' ? -5.4 : tearDocked ? -2.45 : 0.08}
                  packScale={0.86}
                  phase={stage === 'opening' ? 'tearing' : 'sealed'}
                  rotationOffset={selectedPackRotationOffset}
                  tearAnchor={liveTearAnchor}
                  tearDirection={tearDirection}
                  tearProgress={tearProgress}
                />

                {stage === 'tear' && tearGesture.active ? (
                  <svg className="pack-ritual__tear-trace" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line
                      x1={(tearGesture.startX / tearGesture.width) * 100}
                      x2={(tearGesture.currentX / tearGesture.width) * 100}
                      y1={(tearGesture.startY / tearGesture.height) * 100}
                      y2={(tearGesture.currentY / tearGesture.height) * 100}
                    />
                  </svg>
                ) : null}
              </div>
            ) : null}

            {stage === 'opening' || stage === 'revealing' || stage === 'complete' ? (
              <div className={`pack-ritual__stack-layer ${stage === 'opening' ? 'pack-ritual__stack-layer--opening' : ''}`}>
                {renderRevealStack(stage === 'opening' ? 'opening' : 'revealing')}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {stage === 'hero' ? (
        <div className="home-stage__status">
          <strong>
            {state.remainingPacks} из {state.dailyPackLimit}
          </strong>
          <span>Обновление паков через: {timeUntilReset}</span>
          {error ? <span className="home-stage__error">{error}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
