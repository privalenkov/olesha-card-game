import type {
  CardLayoutType,
  CardTreatmentEffect,
  Rarity,
} from '../src/game/types.js';

export interface ProposalEditorRarityConfig {
  decorativePatternGrantWeights: Array<[boolean, number]>;
  gradientFillGrantWeights: Array<[boolean, number]>;
  // Пары вида [количество эффектов, вес]. Вес не обязан быть равен 100:
  // сервер выбирает вариант пропорционально весу.
  // Пример: [[1, 54], [2, 46]] ~= 54% на 1 эффект и 46% на 2 эффекта.
  effectGrantCountWeights: Array<[number, number]>;
  // Пары вида [effectId, вес]. Чем больше вес, тем чаще конкретный эффект
  // выпадает относительно остальных эффектов в пуле этой редкости.
  effectPool: Array<[CardTreatmentEffect, number]>;
  // Сколько разных типов карточки может выпасть этому драфту.
  cardTypeGrantCountWeights: Array<[number, number]>;
  // Какие типы карточек вообще могут выпасть и с каким относительным весом.
  cardTypePool: Array<[CardLayoutType, number]>;
}

/**
 * Централизованная backend-настройка редактора карточек по редкостям.
 *
 * Какие rarity-зависимые настройки существуют сейчас:
 * - `decorativePatternGrantWeights`
 *   Шанс получить блок "Паттерн" в редакторе: свитч, загрузка SVG и все слайдеры паттерна.
 * - `gradientFillGrantWeights`
 *   Шанс получить возможность использовать градиенты в цветовых настройках карточки.
 *   Этот grant общий сразу для всех color-fill полей предложения, а не по одному на каждое поле.
 * - `effectGrantCountWeights`
 *   Сколько спецэффектов сервер может выдать предложению этой редкости.
 * - `effectPool`
 *   Какие спецэффекты вообще могут выпасть для этой редкости и с каким весом.
 * - `cardTypeGrantCountWeights` и `cardTypePool`
 *   Какие `Типы карточки` сервер выдает новому драфту и сколько их может выпасть сразу.
 *
 * Что сейчас НЕ настраивается по редкости в этом файле:
 * - заголовок и описание
 * - основное изображение
 * - конкретный выбранный solid-цвет карточки
 *
 * Как читать числа в весах:
 * - это НЕ "жесткие проценты", а относительные веса
 * - чем больше число, тем выше шанс относительно соседних значений
 * - если веса одинаковые, шанс одинаковый
 * - для примерной вероятности дели вес на сумму весов в конкретном списке
 *
 * `maxEffectLayers` отдельно не задается. Сервер считает его по фактически
 * выданному количеству `allowedEffects`.
 */
export const proposalEditorRarityConfig: Record<Rarity, ProposalEditorRarityConfig> = {
  common: {
    decorativePatternGrantWeights: [[false, 1]],
    gradientFillGrantWeights: [[false, 1]],
    effectGrantCountWeights: [[0, 1]],
    effectPool: [],
    cardTypeGrantCountWeights: [[1, 1]],
    cardTypePool: [['type1', 1]],
  },
  uncommon: {
    decorativePatternGrantWeights: [
      [false, 95],
      [true, 5],
    ],
    gradientFillGrantWeights: [
      [false, 94],
      [true, 6],
    ],
    // Всегда выдается ровно 1 эффект.
    effectGrantCountWeights: [[1, 1]],
    // Сумма весов тут 100, поэтому можно читать почти как проценты.
    effectPool: [
      ['spot_gloss', 48],
      ['texture_sugar', 34],
      ['spot_holo', 18],
    ],
    cardTypeGrantCountWeights: [
      [1, 82],
      [2, 18],
    ],
    cardTypePool: [
      ['type1', 84],
      ['type2', 16],
    ],
  },
  rare: {
    decorativePatternGrantWeights: [
      [false, 78],
      [true, 22],
    ],
    gradientFillGrantWeights: [
      [false, 68],
      [true, 32],
    ],
    // 1 эффект ~= 54%, 2 эффекта ~= 46%.
    effectGrantCountWeights: [
      [1, 54],
      [2, 46],
    ],
    // Относительные шансы выбора эффекта внутри редкости rare.
    effectPool: [
      ['spot_gloss', 28],
      ['texture_sugar', 18],
      ['spot_holo', 30],
      ['sparkle_foil', 16],
      ['emboss', 8],
      ['dimensional_lamination', 6],
    ],
    cardTypeGrantCountWeights: [
      [1, 16],
      [2, 56],
      [3, 28],
    ],
    cardTypePool: [
      ['type1', 12],
      ['type2', 58],
      ['type3', 30],
    ],
  },
  epic: {
    decorativePatternGrantWeights: [
      [false, 52],
      [true, 48],
    ],
    gradientFillGrantWeights: [
      [false, 34],
      [true, 66],
    ],
    // 2 эффекта ~= 58%, 3 эффекта ~= 42%.
    effectGrantCountWeights: [
      [2, 58],
      [3, 42],
    ],
    // Относительные шансы выбора эффекта внутри редкости epic.
    effectPool: [
      ['spot_gloss', 16],
      ['texture_sugar', 14],
      ['spot_holo', 24],
      ['sparkle_foil', 20],
      ['emboss', 16],
      ['prismatic_edge', 10],
      ['dimensional_lamination', 12],
    ],
    cardTypeGrantCountWeights: [
      [1, 34],
      [2, 66],
    ],
    cardTypePool: [
      ['type1', 4],
      ['type2', 6],
      ['type3', 78],
      ['type4', 12],
    ],
  },
  veryrare: {
    decorativePatternGrantWeights: [
      [false, 28],
      [true, 72],
    ],
    gradientFillGrantWeights: [
      [false, 16],
      [true, 84],
    ],
    // 3 эффекта ~= 62%, 4 эффекта ~= 38%.
    effectGrantCountWeights: [
      [3, 62],
      [4, 38],
    ],
    // Относительные шансы выбора эффекта внутри редкости veryrare.
    effectPool: [
      ['spot_gloss', 10],
      ['texture_sugar', 10],
      ['spot_holo', 18],
      ['sparkle_foil', 18],
      ['emboss', 16],
      ['prismatic_edge', 28],
      ['dimensional_lamination', 18],
    ],
    cardTypeGrantCountWeights: [
      [1, 22],
      [2, 78],
    ],
    cardTypePool: [
      ['type1', 4],
      ['type2', 6],
      ['type3', 48],
      ['type4', 42],
    ],
  },
};

export function getProposalEditorCapabilityGrantConfig(rarity: Rarity) {
  return {
    decorativePatternGrantWeights: proposalEditorRarityConfig[rarity].decorativePatternGrantWeights,
    gradientFillGrantWeights: proposalEditorRarityConfig[rarity].gradientFillGrantWeights,
  };
}

export function getProposalEffectGrantConfig(rarity: Rarity) {
  const config = proposalEditorRarityConfig[rarity];
  return {
    grantCountWeights: config.effectGrantCountWeights,
    pool: config.effectPool,
  };
}

export function getProposalCardTypeGrantConfig(rarity: Rarity) {
  const config = proposalEditorRarityConfig[rarity];
  return {
    grantCountWeights: config.cardTypeGrantCountWeights,
    pool: config.cardTypePool,
  };
}
