import type {
  CardTreatmentEffect,
  ProposalEditorCapabilities,
  Rarity,
} from '../src/game/types.js';

export interface ProposalEditorRarityConfig {
  settings: ProposalEditorCapabilities;
  effectGrantCountWeights: Array<[number, number]>;
  effectPool: Array<[CardTreatmentEffect, number]>;
}

/**
 * Централизованная backend-настройка редактора карточек по редкостям.
 *
 * Какие rarity-зависимые настройки существуют сейчас:
 * - `settings.decorativePattern`
 *   Блок "Паттерн" в редакторе: свитч, загрузка SVG и все слайдеры паттерна.
 * - `effectGrantCountWeights`
 *   Сколько спецэффектов сервер может выдать предложению этой редкости.
 * - `effectPool`
 *   Какие спецэффекты вообще могут выпасть для этой редкости и с каким весом.
 *
 * Что сейчас НЕ настраивается по редкости в этом файле:
 * - заголовок и описание
 * - основное изображение
 * - цвета карточки
 *
 * `maxEffectLayers` отдельно не задается. Сервер считает его по фактически
 * выданному количеству `allowedEffects`.
 */
export const proposalEditorRarityConfig: Record<Rarity, ProposalEditorRarityConfig> = {
  common: {
    settings: {
      decorativePattern: false,
    },
    effectGrantCountWeights: [[0, 1]],
    effectPool: [],
  },
  uncommon: {
    settings: {
      decorativePattern: false,
    },
    effectGrantCountWeights: [[1, 1]],
    effectPool: [
      ['spot_gloss', 48],
      ['texture_sugar', 34],
      ['spot_holo', 18],
    ],
  },
  rare: {
    settings: {
      decorativePattern: true,
    },
    effectGrantCountWeights: [
      [1, 54],
      [2, 46],
    ],
    effectPool: [
      ['spot_gloss', 28],
      ['texture_sugar', 18],
      ['spot_holo', 30],
      ['sparkle_foil', 16],
      ['emboss', 8],
      ['dimensional_lamination', 6],
    ],
  },
  epic: {
    settings: {
      decorativePattern: true,
    },
    effectGrantCountWeights: [
      [2, 58],
      [3, 42],
    ],
    effectPool: [
      ['spot_gloss', 16],
      ['texture_sugar', 14],
      ['spot_holo', 24],
      ['sparkle_foil', 20],
      ['emboss', 16],
      ['prismatic_edge', 10],
      ['dimensional_lamination', 12],
    ],
  },
  veryrare: {
    settings: {
      decorativePattern: true,
    },
    effectGrantCountWeights: [
      [3, 62],
      [4, 38],
    ],
    effectPool: [
      ['spot_gloss', 10],
      ['texture_sugar', 10],
      ['spot_holo', 18],
      ['sparkle_foil', 18],
      ['emboss', 16],
      ['prismatic_edge', 28],
      ['dimensional_lamination', 18],
    ],
  },
};

export function getProposalEditorCapabilities(rarity: Rarity): ProposalEditorCapabilities {
  return proposalEditorRarityConfig[rarity].settings;
}

export function getProposalEffectGrantConfig(rarity: Rarity) {
  const config = proposalEditorRarityConfig[rarity];
  return {
    grantCountWeights: config.effectGrantCountWeights,
    pool: config.effectPool,
  };
}
