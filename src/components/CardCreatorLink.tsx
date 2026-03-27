import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CARD_WORLD_HEIGHT, CARD_WORLD_REST_CENTER_Y } from '../game/cardDimensions';
import type { CardDefinition } from '../game/types';
import { VIEWER_CANVAS_FOV } from './viewerSceneProfile';

const CARD_CREATOR_LINK_OFFSET = 28;

export function CardCreatorLink({
  card,
  cameraZ,
  scaleMultiplier = 1,
  visible = false,
  className = '',
}: {
  card: Pick<CardDefinition, 'creatorName' | 'creatorShareSlug'>;
  cameraZ: number;
  scaleMultiplier?: number;
  visible?: boolean;
  className?: string;
}) {
  const creatorShareSlug = card.creatorShareSlug?.trim();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!creatorShareSlug) {
      setTopOffset(null);
      return;
    }

    const element = anchorRef.current;

    if (!element) {
      return;
    }

    const updateTopOffset = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = rect.height;

      if (viewportHeight <= 0) {
        return;
      }

      const fovRadians = (VIEWER_CANVAS_FOV * Math.PI) / 180;
      const distanceFactor = 2 * cameraZ * Math.tan(fovRadians / 2);
      const projectedCardHeight =
        (viewportHeight * CARD_WORLD_HEIGHT * scaleMultiplier) / distanceFactor;
      const projectedCenterYOffset =
        (viewportHeight * CARD_WORLD_REST_CENTER_Y) / distanceFactor;
      const nextTopOffset =
        viewportHeight * 0.5 -
        projectedCenterYOffset +
        projectedCardHeight * 0.5 +
        CARD_CREATOR_LINK_OFFSET;

      setTopOffset(nextTopOffset);
    };

    updateTopOffset();

    const resizeObserver = new ResizeObserver(() => {
      updateTopOffset();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [cameraZ, creatorShareSlug, scaleMultiplier]);

  if (!creatorShareSlug) {
    return null;
  }

  return (
    <div
      ref={anchorRef}
      className={`card-creator-link-anchor ${className}`.trim()}
      data-card-creator-link
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <div
        className={`card-creator-link ${visible ? 'is-visible' : ''}`}
        style={topOffset !== null ? { top: `${Math.round(topOffset)}px` } : undefined}
      >
        <span className="card-creator-link__label">Автор</span>
        <Link
          className="card-creator-link__name"
          onClick={(event) => event.stopPropagation()}
          to={`/collection/${encodeURIComponent(creatorShareSlug)}`}
        >
          @{creatorShareSlug}
        </Link>
      </div>
    </div>
  );
}
