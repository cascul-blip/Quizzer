import type { ComponentType } from "preact";
import type { GameMode, SharedOf } from "../../shared/mode-entries.ts";
import { entryOf } from "../shared/entry-of.ts";
import { PhoneResumeVersion } from "./after-answer-wait.ts";
import { ClassicPlayer } from "./classic.tsx";
import type { PhoneBanner, PhoneModeView, PhoneView, Send } from "./common.tsx";
import { CupPlayer } from "./cup.tsx";
import { DuelPlayer } from "./duel.tsx";
import { FightPlayer } from "./fight.tsx";
import { GiftPlayer } from "./gift.tsx";
import { LandPlayer } from "./land.tsx";
import { MemoryPlayer } from "./memory.tsx";
import { RacerPlayer } from "./racer.tsx";
import { RobotPlayer } from "./robot.tsx";
import { SiegePlayer, siegeBanner } from "./siege.tsx";
import { SubmarinePlayer } from "./submarine.tsx";
import { TowerPlayer } from "./tower.tsx";

type ScreenProps<M extends GameMode> = { view: PhoneModeView<M>; send: Send };

type BannerFlag<M extends GameMode> = SharedOf<M>["lobbyBanner"];

/** why: when M is a union of modes its lobby-banner flag is unknown, so the banner is PhoneBanner | null. */
type BannerOf<M extends GameMode> = [BannerFlag<M>] extends [true] ? PhoneBanner : [BannerFlag<M>] extends [false] ? null : PhoneBanner | null;

export interface PlayerModeEntry<M extends GameMode> {
  Screen: ComponentType<ScreenProps<M>>;
  banner: BannerOf<M>;
}

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
  memory: { Screen: MemoryPlayer, banner: null },
};

/** why: resume must not remount the joined phone's screen. */
export function PhoneModeScreen({ view, send, resumeVersion }: { view: PhoneView; send: Send; resumeVersion: number }) {
  const { Screen } = entryOf<PlayerModeEntry<GameMode>>(PLAYER_MODES, view.kind);
  return (
    <PhoneResumeVersion.Provider value={resumeVersion}>
      <Screen view={view} send={send} />
    </PhoneResumeVersion.Provider>
  );
}
