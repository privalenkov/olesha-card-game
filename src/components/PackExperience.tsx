import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGame } from '../game/GameContext';
import { rarityRevealImpactDurationsMs } from '../game/rarityRevealEffects';
import type { OwnedCard, Rarity } from '../game/types';
import { preloadCardTextureAssets } from '../three/textures';
import { OwnedCardViewerOverlay } from './OwnedCardViewerOverlay';
import { PackCarouselScene, PackScene } from './PackScene';

type ExperienceStage =
  | 'hero'
  | 'preparing'
  | 'carousel'
  | 'carousel_to_tear'
  | 'tear'
  | 'opening'
  | 'review';

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

interface FlipSwipeGesture {
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
  mode: 'carousel' | 'pack';
}

const VISUAL_PACK_COUNT = 8;
const PACK_FLIP_PREVIEW_LIMIT = 0.72;
const PACK_FLIP_TRIGGER_DISTANCE = 72;

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

const initialFlipSwipeGesture: FlipSwipeGesture = {
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
  mode: 'carousel',
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getShortestCarouselDelta(targetIndex: number, activeIndex: number, total: number) {
  const forward = (targetIndex - activeIndex + total) % total;
  const backward = forward - total;
  return Math.abs(backward) < Math.abs(forward) ? backward : forward;
}

function needsReviewReveal(rarity: Rarity) {
  return rarity === 'rare' || rarity === 'epic' || rarity === 'veryrare';
}

export function PackExperience() {
  const { authenticated, error, openPack, state, timeUntilReset, user } = useGame();
  const [stage, setStage] = useState<ExperienceStage>('hero');
  const [heroRotationOffset, setHeroRotationOffset] = useState(0);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselOrbitIndex, setCarouselOrbitIndex] = useState(0);
  const [visualPackRotationOffsets, setVisualPackRotationOffsets] = useState<number[]>(
    () => Array.from({ length: VISUAL_PACK_COUNT }, () => 0),
  );
  const [openedPack, setOpenedPack] = useState<OwnedCard[] | null>(null);
  const [reviewCardIndex, setReviewCardIndex] = useState(0);
  const [heroFlipPreview, setHeroFlipPreview] = useState(0);
  const [carouselFlipPreview, setCarouselFlipPreview] = useState(0);
  const [tearGesture, setTearGesture] = useState<TearGesture>(initialTearGesture);
  const [tearAnchor, setTearAnchor] = useState(0.5);
  const [tearDirection, setTearDirection] = useState<1 | -1>(1);
  const [tearDocked, setTearDocked] = useState(false);
  const [tearHintVisible, setTearHintVisible] = useState(false);
  const [packOpeningPending, setPackOpeningPending] = useState(false);
  const [carouselDragging, setCarouselDragging] = useState(false);
  const [carouselSliding, setCarouselSliding] = useState(false);
  const [carouselInteracting, setCarouselInteracting] = useState(false);
  const [heroButtonVisible, setHeroButtonVisible] = useState(false);
  const heroFlipSwipeRef = useRef<FlipSwipeGesture>(initialFlipSwipeGesture);
  const carouselSwipeRef = useRef<CarouselSwipeGesture>(initialCarouselSwipeGesture);
  const openingTimerRef = useRef<number | null>(null);
  const carouselSlideTimerRef = useRef<number | null>(null);
  const carouselSuppressClickUntilRef = useRef(0);

  const selectedPackRotationOffset = visualPackRotationOffsets[carouselIndex] ?? 0;
  const tearProgress =
    stage === 'opening' || stage === 'review'
      ? 1
      : tearGesture.active
        ? clamp(Math.abs(tearGesture.currentX - tearGesture.startX) / 260, 0, 1)
        : 0;
  const liveTearAnchor = tearGesture.active
    ? clamp(tearGesture.currentX / tearGesture.width, 0.14, 0.86)
    : tearAnchor;
  const availablePacks = authenticated ? state.remainingPacks : state.dailyPackLimit;
  const preloadTearStage = stage === 'carousel_to_tear';
  const dockStageMounted = preloadTearStage || stage === 'tear' || stage === 'opening';
  const dockStageVisible = stage === 'tear' || stage === 'opening';
  const dockPackSnapped = preloadTearStage || (stage === 'tear' && tearDocked);
  const dockPackOffsetY = stage === 'opening' ? -5.4 : dockPackSnapped ? -2.45 : 0.08;
  const currentReviewCard = openedPack?.[reviewCardIndex] ?? null;
  const reviewRevealRarity =
    currentReviewCard && needsReviewReveal(currentReviewCard.rarity) ? currentReviewCard.rarity : null;
  const reviewRevealDurationMs = reviewRevealRarity
    ? rarityRevealImpactDurationsMs[reviewRevealRarity]
    : 0;

  useEffect(() => {
    return () => {
      if (openingTimerRef.current) {
        window.clearTimeout(openingTimerRef.current);
      }
      if (carouselSlideTimerRef.current) {
        window.clearTimeout(carouselSlideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (authenticated) {
      return;
    }

    setHeroButtonVisible(false);
  }, [authenticated]);

  function showHeroButton() {
    setHeroButtonVisible(true);
  }

  function hideHeroButton() {
    setHeroButtonVisible(false);
  }

  function resetExperience() {
    if (openingTimerRef.current) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
    if (carouselSlideTimerRef.current) {
      window.clearTimeout(carouselSlideTimerRef.current);
      carouselSlideTimerRef.current = null;
    }

    setStage('hero');
    setHeroRotationOffset(0);
    setCarouselIndex(0);
    setCarouselOrbitIndex(0);
    setVisualPackRotationOffsets(Array.from({ length: VISUAL_PACK_COUNT }, () => 0));
    setOpenedPack(null);
    setReviewCardIndex(0);
    setHeroFlipPreview(0);
    setCarouselFlipPreview(0);
    setTearGesture(initialTearGesture);
    setTearAnchor(0.5);
    setTearDirection(1);
    setTearDocked(false);
    setTearHintVisible(false);
    setPackOpeningPending(false);
    setHeroButtonVisible(false);
    heroFlipSwipeRef.current = initialFlipSwipeGesture;
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
      setTearHintVisible(false);
      return;
    }

    setTearHintVisible(false);

    if (tearDocked) {
      return;
    }

    const dockTimer = window.setTimeout(() => {
      setTearDocked(true);
    }, 16);

    return () => {
      window.clearTimeout(dockTimer);
    };
  }, [stage, tearDocked]);

  function preparePackOpening() {
    if (stage === 'preparing') {
      return;
    }

    setStage('preparing');
    setOpenedPack(null);
    setReviewCardIndex(0);
    setHeroFlipPreview(0);
    setCarouselFlipPreview(0);
    setTearGesture(initialTearGesture);
    setTearAnchor(0.5);
    setTearDirection(1);
    setTearDocked(false);
    setTearHintVisible(false);
    setHeroButtonVisible(false);
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

  function isHeroPackZone(bounds: DOMRect, clientX: number, clientY: number) {
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const zoneWidth = clamp(bounds.width * 0.19, 240, 340);
    const zoneHeight = clamp(bounds.height * 0.62, 470, 680);
    const zoneLeft = bounds.width / 2 - zoneWidth / 2;
    const zoneTop = bounds.height / 2 - zoneHeight / 2;

    return (
      localX >= zoneLeft &&
      localX <= zoneLeft + zoneWidth &&
      localY >= zoneTop &&
      localY <= zoneTop + zoneHeight
    );
  }

  function isCarouselPackZone(bounds: DOMRect, clientX: number, clientY: number) {
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const zoneWidth = clamp(bounds.width * 0.28, 220, 400);
    const zoneHeight = clamp(bounds.height * 0.62, 360, 620);
    const zoneLeft = bounds.width / 2 - zoneWidth / 2;
    const zoneTop = bounds.height / 2 - zoneHeight / 2;

    return (
      localX >= zoneLeft &&
      localX <= zoneLeft + zoneWidth &&
      localY >= zoneTop &&
      localY <= zoneTop + zoneHeight
    );
  }

  function beginHeroFlipSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (stage !== 'hero' && stage !== 'preparing') {
      return;
    }

    const insidePackZone = isHeroPackZone(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );

    if (insidePackZone) {
      showHeroButton();
    } else {
      hideHeroButton();
    }

    if (!insidePackZone) {
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
    const insidePackZone = isHeroPackZone(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );

    if (insidePackZone) {
      showHeroButton();
    } else {
      hideHeroButton();
    }

    if (!swipe.active || swipe.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;

    if (Math.abs(deltaX) > PACK_FLIP_TRIGGER_DISTANCE && Math.abs(deltaY) < 96) {
      setHeroRotationOffset((current) => current + (deltaX > 0 ? Math.PI : -Math.PI));
    }

    setHeroFlipPreview(0);
    heroFlipSwipeRef.current = initialFlipSwipeGesture;
  }

  function moveHeroFlipSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    const swipe = heroFlipSwipeRef.current;
    const insidePackZone = isHeroPackZone(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );

    if (insidePackZone || swipe.active) {
      showHeroButton();
    } else {
      hideHeroButton();
    }

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

  function handleHeroOpenAction() {
    if (!authenticated || state.remainingPacks <= 0) {
      return;
    }

    preparePackOpening();
  }

  function beginTearTransition() {
    if (stage !== 'carousel') {
      return;
    }

    setCarouselFlipPreview(0);
    setCarouselDragging(false);
    setCarouselSliding(false);
    setCarouselInteracting(false);
    setTearDocked(false);
    setTearHintVisible(false);
    carouselSwipeRef.current = initialCarouselSwipeGesture;
    setStage('carousel_to_tear');
  }

  function finishTearTransition() {
    setTearDocked(true);
    setStage('tear');
  }

  function beginCarouselSwipe(event: ReactPointerEvent<HTMLDivElement>) {
    if (stage !== 'carousel') {
      return;
    }

    const insidePackZone = isCarouselPackZone(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    );

    event.currentTarget.setPointerCapture(event.pointerId);
    setCarouselInteracting(true);
    carouselSwipeRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastStepX: event.clientX,
      moved: false,
      mode: insidePackZone ? 'pack' : 'carousel',
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

    if (swipe.mode === 'pack') {
      event.stopPropagation();

      if (Math.abs(deltaX) > 14) {
        carouselSwipeRef.current = {
          ...swipe,
          moved: true,
        };
      }

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

    if (swipe.mode === 'pack') {
      event.stopPropagation();

      if (Math.abs(deltaX) > PACK_FLIP_TRIGGER_DISTANCE && Math.abs(deltaY) < 96) {
        rotateCarouselPack(carouselIndex, deltaX > 0 ? Math.PI : -Math.PI);
        carouselSuppressClickUntilRef.current = Date.now() + 220;
      } else if (!swipe.moved && Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18) {
        beginTearTransition();
        carouselSuppressClickUntilRef.current = Date.now() + 220;
      }

      setCarouselFlipPreview(0);
    } else if (!swipe.moved && Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(deltaY) + 10) {
      stepCarousel(deltaX < 0 ? 1 : -1);
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
    if (stage !== 'tear' || packOpeningPending) {
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

    setPackOpeningPending(true);
    setTearHintVisible(false);
    setOpenedPack(null);
    setReviewCardIndex(0);

    const pack = await openPack();

    if (!pack) {
      setPackOpeningPending(false);
      resetExperience();
      return;
    }

    void preloadCardTextureAssets(pack);
    setOpenedPack(pack);
    setReviewCardIndex(0);
    setStage('opening');
    setPackOpeningPending(false);
    openingTimerRef.current = window.setTimeout(() => {
      openingTimerRef.current = null;
      setStage('review');
    }, 980);
  }

  function advanceReviewCard() {
    if (!openedPack || openedPack.length === 0) {
      resetExperience();
      return;
    }

    if (reviewCardIndex >= openedPack.length - 1) {
      resetExperience();
      return;
    }

    setReviewCardIndex((current) => current + 1);
  }

  return (
    <section className={`home-stage pack-ritual pack-ritual--${stage}`}>
      <div className="home-stage__canvas">
        <div className="pack-ritual__backdrop" />

        {stage === 'hero' ? (
          <div className="pack-ritual__fullscreen-stage">
            <div
              className="pack-ritual__scene-shell pack-ritual__scene-shell--fullscreen pack-ritual__scene-shell--hero"
              onPointerCancel={endHeroFlipSwipe}
              onPointerDown={beginHeroFlipSwipe}
              onPointerLeave={() => {
                if (!heroFlipSwipeRef.current.active) {
                  hideHeroButton();
                }
              }}
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
              {authenticated ? (
                <button
                  className={`action-button action-button--solid pack-ritual__hero-open ${
                    heroButtonVisible ? 'is-visible' : ''
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleHeroOpenAction();
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onPointerEnter={() => {
                    showHeroButton();
                  }}
                  onPointerUp={(event) => {
                    event.stopPropagation();
                  }}
                  type="button"
                >
                  Открыть
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {stage === 'preparing' || stage === 'carousel' || stage === 'carousel_to_tear' ? (
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
                hoverEnabled={
                  stage === 'carousel' && !carouselInteracting && !carouselDragging && !carouselSliding
                }
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

                  beginTearTransition();
                }}
                onTransitionToTearComplete={finishTearTransition}
                rotationOffsets={visualPackRotationOffsets}
                transitionToTear={stage === 'carousel_to_tear'}
              />
            </div>
          </div>
        ) : null}

        {dockStageMounted ? (
          <div className="pack-ritual__fullscreen-stage pack-ritual__fullscreen-stage--overlay">
            <div
              className={`pack-ritual__dock-stage ${stage === 'opening' ? 'is-opening' : ''} ${
                dockStageVisible ? 'is-visible' : 'is-preloaded'
              }`}
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
              onPointerUp={() => {
                if (!tearGesture.active || stage !== 'tear') {
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
              {stage === 'tear' ? (
                <div className={`pack-ritual__tear-copy ${tearHintVisible ? 'is-visible' : ''}`}>
                  Проведите по линии, чтобы открыть
                </div>
              ) : null}

              <PackScene
                cards={null}
                cameraY={0.24}
                dragPreview={0}
                focusIndex={0}
                hoverEnabled={false}
                onOffsetSettled={
                  stage === 'tear' && tearDocked ? () => setTearHintVisible(true) : undefined
                }
                offsetY={dockPackOffsetY}
                packScale={0.86}
                phase={stage === 'opening' ? 'tearing' : 'sealed'}
                rotationOffset={selectedPackRotationOffset}
                snapOffsetOnMount={dockPackSnapped}
                tearAnchor={liveTearAnchor}
                tearDirection={tearDirection}
                tearProgress={tearProgress}
              />
            </div>
          </div>
        ) : null}

      </div>

      {stage === 'review' && currentReviewCard ? (
        <OwnedCardViewerOverlay
          card={currentReviewCard}
          hintLabel={
            openedPack && reviewCardIndex >= openedPack.length - 1
              ? 'Свайп вверх, чтобы завершить просмотр'
              : 'Свайп вверх, чтобы открыть следующую карточку'
          }
          onClose={resetExperience}
          onSwipeUp={advanceReviewCard}
          sharePlayerSlug={user?.shareSlug}
          statusLabel={openedPack ? `${reviewCardIndex + 1} из ${openedPack.length}` : null}
          viewerRevealImpactDurationMs={reviewRevealDurationMs}
          viewerRevealImpactRarity={reviewRevealRarity}
        />
      ) : null}

      {stage === 'hero' ? (
        <div className="home-stage__status-wrap">
          <div className="home-stage__status">
            <strong>{availablePacks}</strong>
            <span>Доступно</span>
            {authenticated ? <small>Следующий пак через {timeUntilReset}</small> : null}
          </div>
          {error ? <span className="home-stage__error">{error}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
