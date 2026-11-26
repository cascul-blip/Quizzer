// why: Snowman labels describe when user recordings play because their spoken words can vary.
export const VOICE_LINES = {
  lookwarm: "Snowman: before the attack",
  frostyaim: "Snowman: attack missed",
  coldispatient: "Snowman: player hit",
  thawout: "Snowman: player eliminated",
  "targets-acquired": "Targets acquired.",
  "flesh-is-weak": "The flesh is weak.",
  "only-metal-endures": "Only metal endures.",
  "cannot-evade": "You can not evade me forever.",
} as const;

export type VoiceLineId = keyof typeof VOICE_LINES;
