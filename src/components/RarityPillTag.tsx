import { type CSSProperties } from 'react';
import { rarityMeta } from '../game/config';
import { rarityRevealImpactProfiles } from '../game/rarityRevealEffects';
import type { Rarity } from '../game/types';

interface RarityPillTagProps {
  rarity: Rarity;
  label?: string;
  compact?: boolean;
  className?: string;
}

function parseHexColor(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu);

  if (!match) {
    return null;
  }

  const hex = match[1].length === 3
    ? match[1]
        .split('')
        .map((char) => char + char)
        .join('')
    : match[1];

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function getRarityPillTextColor(backgroundColor: string) {
  const rgb = parseHexColor(backgroundColor);

  if (!rgb) {
    return '#F4F1DE';
  }

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 160 ? '#080910' : '#F4F1DE';
}

const rarityPillParticleCount: Record<Rarity, number> = {
  common: 6,
  uncommon: 6,
  rare: 7,
  epic: 8,
  veryrare: 8,
};

const rarityPillParticleDurationMs: Record<Rarity, number> = {
  common: 2800,
  uncommon: 2600,
  rare: 2300,
  epic: 2100,
  veryrare: 1900,
};

const rarityPillParticleTemplates = [
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

export const rarityPillLabels: Record<Rarity, string> = {
  common: 'окаковая',
  uncommon: 'необычная',
  rare: 'редкая',
  epic: 'эпическая',
  veryrare: 'абсолютная свага',
};

export function RarityPillTag({
  rarity,
  label = rarityPillLabels[rarity],
  compact = false,
  className,
}: RarityPillTagProps) {
  const meta = rarityMeta[rarity];
  const particleIconUrl = rarityRevealImpactProfiles[rarity].iconUrl;
  const particles = rarityPillParticleTemplates.slice(0, rarityPillParticleCount[rarity]);
  const pillStyle = {
    ['--rarity-accent' as string]: meta.accent,
    ['--rarity-color' as string]: meta.hue,
    ['--rarity-glow' as string]: meta.glow,
    ['--rarity-shadow' as string]: meta.shadow,
    ['--rarity-surface-end' as string]: meta.gradient[0],
    ['--rarity-surface-start' as string]: meta.gradient[1],
    ['--rarity-text-color' as string]: getRarityPillTextColor(meta.hue),
  } as CSSProperties;
  const classes = ['rarity-pill-tag', compact ? 'rarity-pill-tag--compact' : null, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={pillStyle}>
      <div className="rarity-pill-tag__particles" aria-hidden="true">
        {particles.map((particle, index) => (
          <img
            key={`rarity-pill-particle-${rarity}-${index}`}
            alt=""
            aria-hidden="true"
            className="rarity-pill-tag__particle"
            src={particleIconUrl}
            style={
              {
                ['--particle-duration' as string]: `${rarityPillParticleDurationMs[rarity]}ms`,
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

      <div className="rarity-pill-tag__pill">
        <span>{label}</span>
      </div>
    </div>
  );
}
