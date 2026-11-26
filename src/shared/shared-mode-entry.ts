export interface SharedModeEntry<T extends string = string> {
  name: string;
  flags: {
    paced: boolean;
    protect: boolean;
  };
  lobbyBanner: boolean;
  msgTypes: readonly T[];
  awards?: Readonly<Record<string, string>>;
}

export const MOST_CORRECT_LABEL = "Most correct answers";

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

// why: phantom key, so the entry carries its protocol only in the type system.
declare const protocol: unique symbol;
export type WithModeProtocol<P extends GameplayProtocol = GameplayProtocol> = { readonly [protocol]?: P };
export type EntryProtocol<E extends WithModeProtocol> = NonNullable<E[typeof protocol]>;

/** why: curried so the entry keeps literal types while msgTypes must cover the whole protocol. */
export function sharedModeEntry<P extends GameplayProtocol>() {
  type MsgType = P["msg"]["type"];
  return <const E extends SharedModeEntry<MsgType>>(
    entry: E & ([MsgType] extends [E["msgTypes"][number]] ? unknown : { missingMsgTypes: Exclude<MsgType, E["msgTypes"][number]> }),
  ): E & WithModeProtocol<P> => entry;
}
