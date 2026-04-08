import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import closeIcon from '../assets/icons/close.svg';
import { copyTextToClipboard } from '../game/clipboard';
import { buildCollectionCardShareUrl } from '../game/collectionPaths';
import { useGame } from '../game/GameContext';
import {
  CARD_ASPECT_HEIGHT,
  CARD_ASPECT_WIDTH,
  CARD_WORLD_HEIGHT,
  CARD_WORLD_REST_CENTER_Y,
} from '../game/cardDimensions';
import {
  rarityRevealImpactDurationsMs,
  rarityRevealImpactProfiles,
} from '../game/rarityRevealEffects';
import type { OwnedCard, Rarity } from '../game/types';
import { CardCreatorLink } from './CardCreatorLink';
import { CardViewerCanvas } from './CardViewerCanvas';
import { createImpactParticleConfigs } from './RarityImpactParticles';
import { VIEWER_CANVAS_FOV } from './viewerSceneProfile';

interface RevealEffectStyle {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface RevealBurstParticle {
  delayMs: number;
  durationMs: number;
  iconUrl: string;
  startXpx: number;
  startYpx: number;
  offsetXpx: number;
  offsetYpx: number;
  rotationDeg: number;
  sizePx: number;
}

interface RevealEffectPresentation {
  burstDelayMs: number;
  burstDurationMs: number;
  coverDurationMs: number;
  flashOpacity: number;
  particles: RevealBurstParticle[];
}

interface SwipeGesture {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
}

const initialSwipeGesture: SwipeGesture = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
};

export function OwnedCardViewerOverlay({
  card,
  onClose,
  onSwipeUp,
  sharePlayerSlug,
  statusLabel,
  hintLabel,
  viewerRevealImpactDurationMs = 0,
  viewerRevealImpactRarity = null,
  revealEffectKey,
  revealEffectRarity = null,
  revealEffectTone,
}: {
  card: OwnedCard;
  onClose: () => void;
  onSwipeUp?: (() => void) | null;
  sharePlayerSlug?: string | null;
  statusLabel?: string | null;
  hintLabel?: string | null;
  viewerRevealImpactDurationMs?: number;
  viewerRevealImpactRarity?: Rarity | null;
  revealEffectKey?: string | null;
  revealEffectRarity?: Rarity | null;
  revealEffectTone?: {
    accent: string;
    glow: string;
    gradientFrom: string;
    gradientTo: string;
    shadow: string;
  } | null;
}) {
  const { notify } = useGame();
  const [creatorVisible, setCreatorVisible] = useState(false);
  const [revealEffectStyle, setRevealEffectStyle] = useState<RevealEffectStyle | null>(null);
  const [swipeOffsetY, setSwipeOffsetY] = useState(0);
  const [swipeAnimatingOut, setSwipeAnimatingOut] = useState(false);
  const normalizedSharePlayerSlug = sharePlayerSlug?.trim() ?? '';
  const normalizedStatusLabel = statusLabel?.trim() ?? '';
  const normalizedHintLabel = hintLabel?.trim() ?? '';
  const swipeEnabled = Boolean(onSwipeUp);
  const viewerFrameRef = useRef<HTMLDivElement>(null);
  const swipeGestureRef = useRef<SwipeGesture>(initialSwipeGesture);
  const swipeAdvanceTimerRef = useRef<number | null>(null);
  const creatorLinkVisible = creatorVisible && !swipeAnimatingOut && swipeOffsetY > -12;

  useEffect(() => {
    setCreatorVisible(false);
    setSwipeOffsetY(0);
    setSwipeAnimatingOut(false);
    swipeGestureRef.current = initialSwipeGesture;
  }, [card.instanceId]);

  useLayoutEffect(() => {
    if (!revealEffectKey) {
      setRevealEffectStyle(null);
      return;
    }

    const element = viewerFrameRef.current;
    if (!element) {
      return;
    }

    const updateRevealEffectStyle = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = rect.height;

      if (viewportHeight <= 0) {
        return;
      }

      const cameraZ = 10.6;
      const scaleMultiplier = 0.7;
      const fovRadians = (VIEWER_CANVAS_FOV * Math.PI) / 180;
      const distanceFactor = 2 * cameraZ * Math.tan(fovRadians / 2);
      const projectedCardHeight =
        (viewportHeight * CARD_WORLD_HEIGHT * scaleMultiplier) / distanceFactor;
      const projectedCardWidth =
        (projectedCardHeight * CARD_ASPECT_WIDTH) / CARD_ASPECT_HEIGHT;
      const projectedCenterYOffset =
        (viewportHeight * CARD_WORLD_REST_CENTER_Y) / distanceFactor;

      setRevealEffectStyle({
        height: projectedCardHeight,
        left: rect.width * 0.5 - projectedCardWidth * 0.5,
        top: rect.height * 0.5 - projectedCenterYOffset - projectedCardHeight * 0.5,
        width: projectedCardWidth,
      });
    };

    updateRevealEffectStyle();

    const resizeObserver = new ResizeObserver(() => {
      updateRevealEffectStyle();
    });

    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, [revealEffectKey]);

  const revealEffectPresentation = useMemo<RevealEffectPresentation | null>(() => {
    if (
      !revealEffectKey ||
      !revealEffectRarity ||
      !revealEffectStyle ||
      (revealEffectRarity !== 'rare' &&
        revealEffectRarity !== 'epic' &&
        revealEffectRarity !== 'veryrare')
    ) {
      return null;
    }

    const profile = rarityRevealImpactProfiles[revealEffectRarity];
    const durationMs = rarityRevealImpactDurationsMs[revealEffectRarity];
    const pixelsPerWorldUnit = revealEffectStyle.height / CARD_WORLD_HEIGHT;
    const travelScale = pixelsPerWorldUnit * 0.66;
    const sizeScale = pixelsPerWorldUnit * 0.54;
    const fillFadeStart =
      Math.min(profile.delaySpread + profile.burstWindow, 0.82) * durationMs;
    const fillFadeEnd = Math.min(
      Math.min(profile.delaySpread + profile.burstWindow, 0.82) + 0.18,
      0.96,
    ) * durationMs;
    const burstDelayMs = Math.max(180, fillFadeStart * 0.38);
    const burstDurationMs = Math.max(profile.burstWindow * durationMs * 1.16, 520);
    const particles = createImpactParticleConfigs(revealEffectRarity).map((config) => {
      const startXpx = Math.cos(config.angle) * config.radiusStart * travelScale;
      const startYpx = Math.sin(config.angle) * config.radiusStart * 0.58 * travelScale;
      const endAngle = config.angle + config.orbit;
      const offsetXpx = Math.cos(endAngle) * config.radiusEnd * travelScale;
      const offsetYpx =
        (Math.sin(endAngle) * config.radiusEnd * 0.58 + config.yLift) * travelScale;

      return {
        delayMs: config.delay * durationMs,
        durationMs: burstDurationMs,
        iconUrl: profile.iconUrl,
        startXpx,
        startYpx,
        offsetXpx,
        offsetYpx,
        rotationDeg: (config.spin * 180) / Math.PI,
        sizePx: Math.max(config.size * sizeScale, 10),
      };
    });

    return {
      burstDelayMs,
      burstDurationMs,
      coverDurationMs: fillFadeEnd,
      flashOpacity: profile.flashOpacity,
      particles,
    };
  }, [revealEffectKey, revealEffectRarity, revealEffectStyle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (swipeAdvanceTimerRef.current) {
        window.clearTimeout(swipeAdvanceTimerRef.current);
      }
    };
  }, []);

  const handleIntroComplete = useCallback(() => {
    setCreatorVisible(true);
  }, []);

  const handleShare = useCallback(async () => {
    if (!normalizedSharePlayerSlug) {
      return;
    }

    const shareUrl = buildCollectionCardShareUrl(
      window.location.origin,
      normalizedSharePlayerSlug,
      card.instanceId,
    );

    try {
      await copyTextToClipboard(shareUrl);
      notify({
        kind: 'success',
        title: 'Ссылка скопирована',
        message: 'Отправь её другому пользователю, чтобы показать эту карточку.',
      });
    } catch {
      notify({
        kind: 'error',
        title: 'Не удалось скопировать ссылку',
        message: 'Браузер не дал доступ к буферу обмена.',
      });
    }
  }, [card.instanceId, normalizedSharePlayerSlug, notify]);

  const resetSwipeState = useCallback(() => {
    swipeGestureRef.current = initialSwipeGesture;
    setSwipeOffsetY(0);
    setSwipeAnimatingOut(false);
  }, []);

  const completeSwipeUp = useCallback(() => {
    if (!onSwipeUp) {
      return;
    }

    if (swipeAdvanceTimerRef.current) {
      window.clearTimeout(swipeAdvanceTimerRef.current);
    }

    swipeGestureRef.current = initialSwipeGesture;
    setSwipeAnimatingOut(true);
    setSwipeOffsetY(-Math.max(window.innerHeight, 900));
    swipeAdvanceTimerRef.current = window.setTimeout(() => {
      swipeAdvanceTimerRef.current = null;
      onSwipeUp();
    }, 220);
  }, [onSwipeUp]);

  const handleSwipePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!swipeEnabled || swipeAnimatingOut) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest('button, a, [data-card-creator-link]')
      ) {
        return;
      }

      swipeGestureRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [swipeAnimatingOut, swipeEnabled],
  );

  const handleSwipePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const swipe = swipeGestureRef.current;

      if (!swipeEnabled || !swipe.active || swipe.pointerId !== event.pointerId || swipeAnimatingOut) {
        return;
      }

      const deltaX = event.clientX - swipe.startX;
      const deltaY = event.clientY - swipe.startY;

      if (deltaY >= 0 || Math.abs(deltaY) <= Math.abs(deltaX) + 18) {
        setSwipeOffsetY(0);
        return;
      }

      setSwipeOffsetY(Math.max(deltaY, -window.innerHeight * 0.9));
    },
    [swipeAnimatingOut, swipeEnabled],
  );

  const handleSwipePointerEndCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const swipe = swipeGestureRef.current;

      if (!swipeEnabled || !swipe.active || swipe.pointerId !== event.pointerId || swipeAnimatingOut) {
        return;
      }

      const deltaX = event.clientX - swipe.startX;
      const deltaY = event.clientY - swipe.startY;
      const shouldAdvance = deltaY < -160 && Math.abs(deltaY) > Math.abs(deltaX) + 28;

      if (shouldAdvance) {
        completeSwipeUp();
        return;
      }

      resetSwipeState();
    },
    [completeSwipeUp, resetSwipeState, swipeAnimatingOut, swipeEnabled],
  );

  const handleSwipePointerCancelCapture = useCallback(() => {
    if (!swipeEnabled || swipeAnimatingOut) {
      return;
    }

    resetSwipeState();
  }, [resetSwipeState, swipeAnimatingOut, swipeEnabled]);

  return (
    <div
      className="collection-overlay collection-overlay--collection"
      onClick={onClose}
      role="presentation"
    >
      <button
        aria-label="Закрыть просмотр карточки"
        className="collection-overlay__close collection-overlay__close--icon"
        onClick={onClose}
        type="button"
      >
        <img alt="" aria-hidden="true" className="collection-overlay__close-icon" src={closeIcon} />
      </button>
      <div
        ref={viewerFrameRef}
        className="collection-overlay__viewer"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <div
          className={`collection-overlay__viewer-stage ${
            swipeEnabled ? 'collection-overlay__viewer-stage--swipeable' : ''
          }`.trim()}
          onPointerCancelCapture={handleSwipePointerCancelCapture}
          onPointerDownCapture={handleSwipePointerDownCapture}
          onPointerMoveCapture={handleSwipePointerMoveCapture}
          onPointerUpCapture={handleSwipePointerEndCapture}
          style={{
            opacity: 1 - Math.min(Math.abs(swipeOffsetY) / 720, 0.22),
            transform: `translate3d(0, ${swipeOffsetY}px, 0)`,
            transition:
              swipeGestureRef.current.active && !swipeAnimatingOut
                ? 'none'
                : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
          }}
        >
          <div className="collection-overlay__viewer-canvas">
            <CardViewerCanvas
              key={card.instanceId}
              card={card}
              introKey={card.instanceId}
              cameraZ={10.6}
              scaleMultiplier={0.7}
              effectsPreset="full"
              revealImpactDurationMs={viewerRevealImpactDurationMs}
              revealImpactRarity={viewerRevealImpactRarity}
              transparentBackground
              onIntroComplete={handleIntroComplete}
            />
          </div>
          {revealEffectKey && revealEffectStyle && revealEffectTone && revealEffectPresentation ? (
            <>
              <div
                key={`${revealEffectKey}:cover`}
                aria-hidden="true"
                className="collection-overlay__reveal-cover"
                style={
                  {
                    '--collection-reveal-accent': revealEffectTone.accent,
                    '--collection-reveal-glow': revealEffectTone.glow,
                    '--collection-reveal-gradient-from': revealEffectTone.gradientFrom,
                    '--collection-reveal-gradient-to': revealEffectTone.gradientTo,
                    '--collection-reveal-shadow': revealEffectTone.shadow,
                    '--collection-reveal-cover-duration': `${revealEffectPresentation.coverDurationMs}ms`,
                    height: `${revealEffectStyle.height}px`,
                    left: `${revealEffectStyle.left}px`,
                    top: `${revealEffectStyle.top}px`,
                    width: `${revealEffectStyle.width}px`,
                  } as CSSProperties
                }
              />
              <div
                key={`${revealEffectKey}:burst`}
                aria-hidden="true"
                className="collection-overlay__reveal-burst"
                style={
                  {
                    '--collection-reveal-accent': revealEffectTone.accent,
                    '--collection-reveal-glow': revealEffectTone.glow,
                    '--collection-reveal-burst-delay': `${revealEffectPresentation.burstDelayMs}ms`,
                    '--collection-reveal-burst-duration': `${revealEffectPresentation.burstDurationMs}ms`,
                    '--collection-reveal-flash-opacity': `${revealEffectPresentation.flashOpacity}`,
                    height: `${revealEffectStyle.height}px`,
                    left: `${revealEffectStyle.left}px`,
                    top: `${revealEffectStyle.top}px`,
                    width: `${revealEffectStyle.width}px`,
                  } as CSSProperties
                }
              >
                <div className="collection-overlay__reveal-burst-core" />
                {revealEffectPresentation.particles.map((particle, index) => (
                  <span
                    key={`${revealEffectKey}:${index}`}
                    className="collection-overlay__reveal-particle"
                    style={
                      {
                        '--collection-reveal-particle-icon': `url("${particle.iconUrl}")`,
                        '--collection-reveal-particle-delay': `${particle.delayMs}ms`,
                        '--collection-reveal-particle-duration': `${particle.durationMs}ms`,
                        '--collection-reveal-particle-start-x': `${particle.startXpx}px`,
                        '--collection-reveal-particle-start-y': `${particle.startYpx}px`,
                        '--collection-reveal-particle-offset-x': `${particle.offsetXpx}px`,
                        '--collection-reveal-particle-offset-y': `${particle.offsetYpx}px`,
                        '--collection-reveal-particle-rotation': `${particle.rotationDeg}deg`,
                        '--collection-reveal-particle-size': `${particle.sizePx}px`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
        <CardCreatorLink
          card={card}
          cameraZ={10.6}
          scaleMultiplier={0.7}
          visible={creatorLinkVisible}
          className="card-creator-link-anchor--overlay"
          action={
            normalizedSharePlayerSlug && creatorLinkVisible
              ? {
                  label: 'Поделиться',
                  onClick: () => {
                    void handleShare();
                  },
                }
              : undefined
          }
        />
        {normalizedStatusLabel || normalizedHintLabel ? (
          <div className="collection-overlay__hud">
            {normalizedStatusLabel ? <strong>{normalizedStatusLabel}</strong> : null}
            {normalizedHintLabel ? <span>{normalizedHintLabel}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
