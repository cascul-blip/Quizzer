// The shape of a shared mode entry (GLOSSARY.md). The mode files in modes/ import this, so it must not import them or protocol.ts.

/** What one game mode's server, projector and phone share (GLOSSARY.md: shared mode entry). Each mode file in modes/ declares its own; src/shared/mode-entries.ts collects them. */
export interface SharedModeEntry<T extends string = string> {
  /** The mode's one plain name (GLOSSARY.md). A seasonal theme may decorate how the client shows it. */
  name: string;
  flags: {
    /** Played question by question: the host sets its pacing (in the lobby and during the game) and moves it on, and the pacing carries over to the next lobby. The lobby also offers to shuffle the question order. */
    paced: boolean;
    /** "Protect from abuse" applies: wrong answers in a row make a player wait longer before the next question. The lobby offers it. */
    protect: boolean;
  };
  /** Phones in the lobby show the mode's banner instead of the plain waiting screen (Kingdom Siege's castle). */
  lobbyBanner: boolean;
  /** The type of every phone message the mode handles; the hub routes each one to the mode. */
  msgTypes: readonly T[];
}

/** A mode's shared mode entry, kept as literal types; the compiler holds msgTypes to exactly the types of the mode's phone messages Msg. */
export function sharedModeEntry<Msg extends { type: string }>() {
  return <const E extends SharedModeEntry<Msg["type"]>>(
    entry: E & ([Msg["type"]] extends [E["msgTypes"][number]] ? unknown : { missingMsgTypes: Exclude<Msg["type"], E["msgTypes"][number]> }),
  ): E => entry;
}
