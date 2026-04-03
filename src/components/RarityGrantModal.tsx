import { type CSSProperties } from 'react';
import { rarityMeta } from '../game/config';
import { rarityRevealImpactProfiles } from '../game/rarityRevealEffects';
import type { Rarity } from '../game/types';
import { InfoModal } from './InfoModal';

interface RarityGrantModalProps {
  onClose: () => void;
  rarity: Rarity;
}

const rarityGrantParticleCount: Record<Rarity, number> = {
  common: 6,
  uncommon: 6,
  rare: 7,
  epic: 8,
  veryrare: 8,
};

const rarityGrantParticleDurationMs: Record<Rarity, number> = {
  common: 2800,
  uncommon: 2600,
  rare: 2300,
  epic: 2100,
  veryrare: 1900,
};

const rarityGrantParticleTemplates = [
  {
    fromX: -4,
    fromY: 0,
    toX: -56,
    toY: -30,
    size: 34,
    delayMs: 0,
    rotateFrom: -10,
    rotateTo: 24,
  },
  {
    fromX: 0,
    fromY: -2,
    toX: 0,
    toY: -44,
    size: 12,
    delayMs: 360,
    rotateFrom: 0,
    rotateTo: 14,
  },
  {
    fromX: 4,
    fromY: -1,
    toX: 58,
    toY: -28,
    size: 34,
    delayMs: 760,
    rotateFrom: 8,
    rotateTo: -18,
  },
  {
    fromX: -3,
    fromY: 2,
    toX: -74,
    toY: 16,
    size: 24,
    delayMs: 1120,
    rotateFrom: -12,
    rotateTo: 20,
  },
  {
    fromX: 2,
    fromY: 4,
    toX: 30,
    toY: 30,
    size: 32,
    delayMs: 1480,
    rotateFrom: 12,
    rotateTo: -26,
  },
  {
    fromX: 5,
    fromY: 2,
    toX: 76,
    toY: 4,
    size: 22,
    delayMs: 1840,
    rotateFrom: 0,
    rotateTo: 20,
  },
  {
    fromX: -1,
    fromY: -1,
    toX: -18,
    toY: -12,
    size: 20,
    delayMs: 420,
    rotateFrom: -16,
    rotateTo: 12,
  },
  {
    fromX: 0,
    fromY: 5,
    toX: -8,
    toY: 42,
    size: 24,
    delayMs: 1340,
    rotateFrom: 18,
    rotateTo: -12,
  },
] as const;

const rarityGrantContent: Record<
  Rarity,
  {
    label: string;
    message: string;
  }
> = {
  common: {
    label: 'окаковая',
    message:
      'Не отчаивайтесь, в ваших силах сделать самую лучшую карточку, которая будет попадаться игрокам чаще всего.',
  },
  uncommon: {
    label: 'необычная',
    message:
      'Уже не просто база. Добавь фишку, чтобы карточка цепляла с первого взгляда.',
  },
  rare: {
    label: 'редкая',
    message:
      'Редкость уже заметная. Здесь особенно важно собрать сильную идею, аккуратную подачу и убедительный визуальный акцент.',
  },
  epic: {
    label: 'эпическая',
    message:
      'Это сильная выдача. Можно смело делать выразительную карточку с мощным визуалом, эффектами и запоминающимся настроением.',
  },
  veryrare: {
    label: 'абсолютная свага',
    message:
      'Редкость максимального уровня. В ваших руках все доступные инструменты и шанс создать карточку, которую игроки будут открывать, обсуждать и помнить дольше остальных.',
  },
};

export function RarityGrantModal({ onClose, rarity }: RarityGrantModalProps) {
  const meta = rarityMeta[rarity];
  const content = rarityGrantContent[rarity];
  const particleIconUrl = rarityRevealImpactProfiles[rarity].iconUrl;
  const particles = rarityGrantParticleTemplates.slice(0, rarityGrantParticleCount[rarity]);
  const modalStyle = {
    ['--rarity-accent' as string]: meta.accent,
    ['--rarity-color' as string]: meta.hue,
    ['--rarity-glow' as string]: meta.glow,
    ['--rarity-shadow' as string]: meta.shadow,
    ['--rarity-surface-end' as string]: meta.gradient[0],
    ['--rarity-surface-start' as string]: meta.gradient[1],
  } as CSSProperties;

  return (
    <InfoModal
      actionLabel="Понятно"
      backgroundColor="#0C111B"
      maxWidth={396}
      onClose={onClose}
      title="Вам выдана карточка редкости:"
    >
      <div className="rarity-grant-modal" style={modalStyle}>
        <div className="rarity-grant-modal__pill-stage" aria-hidden="true">
          <div className="rarity-grant-modal__particles">
            {particles.map((particle, index) => (
              <img
                key={`rarity-grant-particle-${index}`}
                alt=""
                aria-hidden="true"
                className="rarity-grant-modal__particle"
                src={particleIconUrl}
                style={
                  {
                    ['--particle-duration' as string]: `${rarityGrantParticleDurationMs[rarity]}ms`,
                    ['--particle-delay' as string]: `${particle.delayMs}ms`,
                    ['--particle-from-x' as string]: `${particle.fromX}px`,
                    ['--particle-from-y' as string]: `${particle.fromY}px`,
                    ['--particle-to-x' as string]: `${particle.toX}px`,
                    ['--particle-to-y' as string]: `${particle.toY}px`,
                    ['--particle-size' as string]: `${particle.size}px`,
                    ['--particle-rotate-from' as string]: `${particle.rotateFrom}deg`,
                    ['--particle-rotate-to' as string]: `${particle.rotateTo}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className="rarity-grant-modal__pill">
            <span>{content.label}</span>
          </div>
        </div>

        <p className="rarity-grant-modal__message">{content.message}</p>
      </div>
    </InfoModal>
  );
}
