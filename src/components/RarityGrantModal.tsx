import type { Rarity } from '../game/types';
import { InfoModal } from './InfoModal';
import { RarityPillTag } from './RarityPillTag';

interface RarityGrantModalProps {
  onClose: () => void;
  rarity: Rarity;
}

const rarityGrantContent: Record<
  Rarity,
  {
    message: string;
  }
> = {
  common: {
    message:
      'Не отчаивайтесь, в ваших силах сделать так, чтобы она запоминалась не хуже редких.',
  },
  uncommon: {
    message:
      'Уже не просто обычная. Добавьте деталь, которая заставит задержать взгляд.',
  },
  rare: {
    message:
      'На этом уровне карточку замечают сразу. Сильная идея, подача и визуал — здесь всё должно работать вместе.',
  },
  epic: {
    message:
      'Это уже настоящая свага! Не сдерживайтесь: эффекты, настроение, визуал — пусть карточка выглядит так, будто она сама выбрала своего владельца.',
  },
  veryrare: {
    message:
      'Редкость максимального уровня. В ваших руках все доступные инструменты и шанс создать карточку, которую игроки будут открывать, обсуждать и помнить дольше остальных.',
  },
};

export function RarityGrantModal({ onClose, rarity }: RarityGrantModalProps) {
  const content = rarityGrantContent[rarity];

  return (
    <InfoModal
      actionLabel="Понятно"
      backgroundColor="#0C111B"
      maxHeight={485}
      maxWidth={396}
      onClose={onClose}
      title="Случайным образом вам была выдана карточка:"
    >
      <div className="rarity-grant-modal">
        <div className="rarity-grant-modal__pill-stage">
          <RarityPillTag rarity={rarity} />
        </div>

        <p className="rarity-grant-modal__message">{content.message}</p>


        <div className="rarity-grant-modal__intro">
          <p className="rarity-grant-modal__eyebrow">
            информация
          </p>
          <p className="rarity-grant-modal__details">
            Расширенные настройки и эффекты выдаются сервером по редкости и помечаются контуром <span className="rarity-grant-modal__details--contour"></span>.
             Шаблоны карточки и маски можно скачать, доработать во внешнем
            редакторе и загрузить обратно. Создайте свою карточку мечты!
          </p>
        </div>
      </div>
    </InfoModal>
  );
}
