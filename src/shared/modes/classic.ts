import { sharedModeEntry } from "../mode-views.ts";

// Classic protocol types.

/** Classic's phone messages. Typed questions send `text` (the typed answer) and ignore `option`. */
export type ClassicMsg = { type: "setAvatar"; avatar: string; accessory: string } | { type: "answer"; qIndex: number; option: number; text?: string };

/** Classic's shared mode entry. */
export const classicShared = sharedModeEntry<ClassicMsg>()({
  name: "Classic",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["answer", "setAvatar"],
});
