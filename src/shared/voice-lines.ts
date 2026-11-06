// Pre-recorded attacker lines. Each id names an MP3 in src/client/shared/voice/.
// Original robot clips are Sovereign takes; the snowman lines are processed user recordings.

// User recording labels below identify cues rather than transcribe their speech.
export const VOICE_LINES = {
  "lookwarm": "Snowman: before the attack",
  "frostyaim": "Snowman: attack missed",
  "coldispatient": "Snowman: player hit",
  "thawout": "Snowman: player eliminated",
  "targets-acquired": "Targets acquired.",
  "flesh-is-weak": "The flesh is weak.",
  "only-metal-endures": "Only metal endures.",
  "cannot-evade": "You can not evade me forever.",
} as const;

export type VoiceLineId = keyof typeof VOICE_LINES;
