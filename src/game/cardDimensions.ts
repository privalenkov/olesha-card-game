export const CARD_ASPECT_WIDTH = 344;
export const CARD_ASPECT_HEIGHT = 482;

export const CARD_PREVIEW_WIDTH = CARD_ASPECT_WIDTH;
export const CARD_PREVIEW_HEIGHT = CARD_ASPECT_HEIGHT;

export const CARD_MASK_EDITOR_WIDTH = CARD_PREVIEW_WIDTH * 2;
export const CARD_MASK_EDITOR_HEIGHT = CARD_PREVIEW_HEIGHT * 2;

export const CARD_TEXTURE_WIDTH = CARD_PREVIEW_WIDTH * 3;
export const CARD_TEXTURE_HEIGHT = CARD_PREVIEW_HEIGHT * 3;

export const CARD_WORLD_HEIGHT = 4.08;
export const CARD_WORLD_REST_CENTER_Y = 0.1;

// Keep the existing paint-space size so the current card layout can be resampled
// into the corrected trading-card aspect without rewriting every draw coordinate.
export const CARD_TEXTURE_LAYOUT_WIDTH = 1024;
export const CARD_TEXTURE_LAYOUT_HEIGHT = 1536;
