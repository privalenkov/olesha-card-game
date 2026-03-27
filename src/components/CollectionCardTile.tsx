import type { OwnedCard } from '../game/types';
import { useCardPreviewImage } from '../three/textures';

export function CollectionCardTile({
  card,
  onOpen,
}: {
  card: OwnedCard;
  onOpen: (card: OwnedCard) => void;
}) {
  const previewImage = useCardPreviewImage(card);

  return (
    <button
      className="collection-card collection-card--preview"
      onClick={() => onOpen(card)}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty('--mx', '50%');
        event.currentTarget.style.setProperty('--my', '50%');
        event.currentTarget.style.setProperty('--rx', '0deg');
        event.currentTarget.style.setProperty('--ry', '0deg');
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const rotateY = (x - 0.5) * 26;
        const rotateX = (0.5 - y) * 26;

        event.currentTarget.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`);
        event.currentTarget.style.setProperty('--my', `${(y * 100).toFixed(2)}%`);
        event.currentTarget.style.setProperty('--rx', `${rotateX}deg`);
        event.currentTarget.style.setProperty('--ry', `${rotateY}deg`);
      }}
      type="button"
    >
      <img
        alt={card.title}
        className="collection-card__image"
        draggable={false}
        loading="lazy"
        src={previewImage}
      />
    </button>
  );
}
