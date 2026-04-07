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
      'Не отчаивайтесь, в ваших силах сделать самую лучшую карточку, которая будет попадаться игрокам чаще всего.',
  },
  uncommon: {
    message:
      'Уже не просто база. Добавь фишку, чтобы карточка цепляла с первого взгляда.',
  },
  rare: {
    message:
      'Редкость уже заметная. Здесь особенно важно собрать сильную идею, аккуратную подачу и убедительный визуальный акцент.',
  },
  epic: {
    message:
      'Это сильная выдача. Можно смело делать выразительную карточку с мощным визуалом, эффектами и запоминающимся настроением.',
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
