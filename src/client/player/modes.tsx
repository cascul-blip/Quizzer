import type { ComponentType } from "preact";
import type { GameMode, SharedOf } from "../../shared/mode-entries.ts";
import { entryOf } from "../shared/entry-of.ts";
import { ClassicPlayer } from "./classic.tsx";
import type { PhoneBanner, PhoneModeView, PhoneView, Send } from "./common.tsx";
import { CupPlayer } from "./cup.tsx";
import { DuelPlayer } from "./duel.tsx";
import { FightPlayer } from "./fight.tsx";
import { GiftPlayer } from "./gift.tsx";
import { LandPlayer } from "./land.tsx";
import { RacerPlayer } from "./racer.tsx";
import { RobotPlayer } from "./robot.tsx";
import { SiegePlayer, siegeBanner } from "./siege.tsx";
import { SubmarinePlayer } from "./submarine.tsx";
import { TowerPlayer } from "./tower.tsx";

type ScreenProps<M extends GameMode> = { view: PhoneModeView<M>; send: Send };

type BannerFlag<M extends GameMode> = SharedOf<M>["lobbyBanner"];

/** A PlayerModeEntry's banner: a PhoneBanner for a mode with a lobby banner, null for any other, and either when M is not one mode. */
type BannerOf<M extends GameMode> = [BannerFlag<M>] extends [true] ? PhoneBanner : [BannerFlag<M>] extends [false] ? null : PhoneBanner | null;

/** Everything the phone knows about one game mode; main.tsx looks it up in PLAYER_MODES instead of branching on the mode. */
export interface PlayerModeEntry<M extends GameMode> {
  /** The phone screen while the mode's game runs. */
  Screen: ComponentType<ScreenProps<M>>;
  /** What the mode adds to the lobby screen: required when its shared mode entry sets lobbyBanner, null otherwise. */
  banner: BannerOf<M>;
}

/** Every game mode's phone entry, with its screen in src/client/player/<mode>.tsx. */
export const PLAYER_MODES: { [M in GameMode]: PlayerModeEntry<M> } = {
  classic: { Screen: ClassicPlayer, banner: null },
  tower: { Screen: TowerPlayer, banner: null },
  submarine: { Screen: SubmarinePlayer, banner: null },
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
  return entryOf<PlayerModeEntry<GameMode>>(PLAYER_MODES, view.kind).Screen;
}
