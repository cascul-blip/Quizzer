export const GIFT_MINUTES = [3, 5, 7, 10] as const;
export const GIFT_DEFAULT_MINUTES = 5;
export const GIFT_CORRECT_TO_PLAY = 5;
export const GIFT_READY_MS = 1_000;
export const GIFT_ROUND_MS = 15_000;
export const GIFT_TAP_GRACE_MS = 150;
export const GIFT_POINTS = 10;

export const GIFT_GOODS = ["present", "headphones", "controller", "sneaker", "card"] as const;
export const GIFT_DUDS = ["socks", "coal", "sweater", "toothbrush"] as const;
export const GIFT_POWERS = ["shield", "star"] as const;
export type GiftPower = (typeof GIFT_POWERS)[number];
export type GiftItemKind = (typeof GIFT_GOODS)[number] | (typeof GIFT_DUDS)[number] | GiftPower;

export interface GiftItem {
  id: number;
  kind: GiftItemKind;
  /** Position in the three lanes, left to right. */
  lane: number;
  /** Window in milliseconds from the start of the bonus. */
  from: number;
  until: number;
}

export function giftMultiplier(elapsedMs: number, durationMs: number): number {
  return Math.max(1, Math.min(3, 1 + Math.floor((elapsedMs * 3) / durationMs)));
}
