import type { ComponentType } from "preact";
import type { GameMode, PlayerView } from "../../shared/protocol.ts";
import { ClassicPlayer } from "./classic.tsx";
import type { PhoneBanner, Send } from "./common.tsx";
import { CupPlayer } from "./cup.tsx";
import { DuelPlayer } from "./duel.tsx";
import { FightPlayer } from "./fight.tsx";
import { GiftPlayer } from "./gift.tsx";
import { LandPlayer } from "./land.tsx";
import { RacerPlayer } from "./racer.tsx";
import { RobotPlayer } from "./robot.tsx";
import { siegeBanner, SiegePlayer } from "./siege.tsx";
import { SubPlayer } from "./submarine.tsx";
import { TowerPlayer } from "./tower.tsx";

/** A joined phone's view. */
export type PhoneView = Exclude<PlayerView, { kind: "none" }>;

/** The kind of a mode's phone view: the mode, except Classic's, which is "player". */
type PhoneKind<M extends GameMode> = M extends "classic" ? "player" : M;

/** A phone's view of a game of the mode. Classic's also carries the lobby, which main.tsx shows itself. */
export type PhoneModeView<M extends GameMode> = Extract<PhoneView, { kind: PhoneKind<M> }>;

type ScreenProps<M extends GameMode> = { view: PhoneModeView<M>; send: Send };

/** Everything the phone knows about one game mode; main.tsx looks it up in PLAYER_MODES instead of branching on the mode. */
export interface PlayerModeEntry<M extends GameMode> {
  /** The phone screen while the mode's game runs. */
  Screen: ComponentType<ScreenProps<M>>;
  /** What the mode adds to the lobby screen, for a mode whose server entry sets lobbyBanner; null otherwise. */
  banner: PhoneBanner | null;
}

/** Every game mode's phone entry, with its screen in src/client/player/<mode>.tsx. */
export const PLAYER_MODES: { [M in GameMode]: PlayerModeEntry<M> } = {
  classic: { Screen: ClassicPlayer, banner: null },
  tower: { Screen: TowerPlayer, banner: null },
  submarine: { Screen: SubPlayer, banner: null },
  fight: { Screen: FightPlayer, banner: null },
  robot: { Screen: RobotPlayer, banner: null },
  land: { Screen: LandPlayer, banner: null },
  racer: { Screen: RacerPlayer, banner: null },
  cup: { Screen: CupPlayer, banner: null },
  siege: { Screen: SiegePlayer, banner: siegeBanner },
  duel: { Screen: DuelPlayer, banner: null },
  gift: { Screen: GiftPlayer, banner: null },
};

/** The screen of the mode a joined phone's view belongs to, to render with that same view. */
export function screenOf(view: PhoneView): ComponentType<ScreenProps<GameMode>> {
  const mode: GameMode = view.kind === "player" ? "classic" : view.kind;
  // The one place the per-mode types meet: the caller passes back the view it looked the screen up with.
  return PLAYER_MODES[mode].Screen as ComponentType<ScreenProps<GameMode>>;
}
