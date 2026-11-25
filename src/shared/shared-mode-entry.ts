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
  /** Each Podium award's label by key (GLOSSARY.md: Podium), read by the server and the projector alike. */
  awards?: Readonly<Record<string, string>>;
}

export type NoSettings = Record<string, never>;

interface GameplayView {
  kind: string;
  phase: string;
}

export interface ModeProtocol<
  Msg extends { type: string },
  Settings extends object,
  HostView extends GameplayView,
  PlayerView extends GameplayView,
  SettingsInput extends object = Settings,
> {
  msg: Msg;
  settings: Settings;
  hostView: HostView;
  playerView: PlayerView;
  settingsInput: SettingsInput;
}

type GameplayProtocol = ModeProtocol<{ type: string }, object, GameplayView, GameplayView, object>;

// The entry carries its protocol only in the type system.
declare const protocol: unique symbol;
export type WithModeProtocol<P extends GameplayProtocol = GameplayProtocol> = { readonly [protocol]?: P };
export type EntryProtocol<E extends WithModeProtocol> = NonNullable<E[typeof protocol]>;

/** Keep the entry's literal types and require msgTypes to list every phone message in its protocol. */
export function sharedModeEntry<P extends GameplayProtocol>() {
  type MsgType = P["msg"]["type"];
  return <const E extends SharedModeEntry<MsgType>>(
    entry: E & ([MsgType] extends [E["msgTypes"][number]] ? unknown : { missingMsgTypes: Exclude<MsgType, E["msgTypes"][number]> }),
  ): E & WithModeProtocol<P> => entry;
}
