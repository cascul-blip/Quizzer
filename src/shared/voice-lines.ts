// The robot's pre-recorded lines. Each id is the MP3 file name in src/client/shared/voice/.
// Those clips are the committed Sovereign takes.

export const VOICE_LINES = {
  "targets-acquired": "Targets acquired.",
  "flesh-is-weak": "The flesh is weak.",
  "only-metal-endures": "Only metal endures.",
  "cannot-evade": "You can not evade me forever.",
} as const;

export type VoiceLineId = keyof typeof VOICE_LINES;
