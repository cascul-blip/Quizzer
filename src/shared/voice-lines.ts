// The robot's pre-recorded lines. Each id is the MP3 file name in src/client/shared/voice/;
// regenerate them with `bun scripts/voice.ts` after changing this list.

export const VOICE_LINES = {
  "targets-acquired": "Targets acquired.",
  "flesh-is-weak": "The flesh is weak.",
  "only-metal-endures": "Only metal endures.",
  "binary-chant": "zero one one zero one zero zero one",
} as const;

export type VoiceLineId = keyof typeof VOICE_LINES;
