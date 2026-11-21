import type { ComponentType } from "preact";
import type { GameMode, HostView } from "../../shared/protocol.ts";
import type { MusicCue } from "../shared/music/index.ts";
import { ClassicStage, classicCue } from "./classic.tsx";
import type { Send } from "./common.tsx";
import { CupStage, cupCue } from "./cup.tsx";
import { DuelStage, duelCue } from "./duel.tsx";
import { FightStage, fightCue } from "./fight.tsx";
import { GiftStage, giftCue } from "./gift.tsx";
import { LandStage, landCue } from "./land.tsx";
import { LOBBY_MODES, type LobbyModeEntry } from "./lobby-modes.tsx";
import { RacerStage, racerCue } from "./racer.tsx";
import { RobotStage, robotCue } from "./robot.tsx";
import { SiegeStage, siegeCue } from "./siege.tsx";
import { SubStage, subCue } from "./submarine.tsx";
import { TowerStage, towerCue } from "./tower.tsx";

/** The projector's view of a game of the mode; its kind is the mode. Classic's also carries the lobby. */
export type HostModeView<M extends GameMode> = Extract<HostView, { kind: M }>;

type StageProps<M extends GameMode> = { view: HostModeView<M>; send: Send };

/** Everything the projector knows about one game mode; main.tsx looks it up in HOST_MODES instead of branching on the mode. Its lobby part comes from LOBBY_MODES. */
export interface HostModeEntry<M extends GameMode> extends LobbyModeEntry<M> {
  /** The projector screen while the mode's view is shown. */
  Stage: ComponentType<StageProps<M>>;
  /** The music for the mode's view: which track plays, and how intense. Classic's plays the selected mode's lobby track in the lobby. */
  cue(view: HostModeView<M>): MusicCue;
}

/** Every game mode's projector entry, with its stage, music cue and lobby part in src/client/host/<mode>.tsx (Classic's lobby part in lobby-modes.tsx). */
export const HOST_MODES: { [M in GameMode]: HostModeEntry<M> } = {
  classic: { ...LOBBY_MODES.classic, Stage: ClassicStage, cue: classicCue },
  tower: { ...LOBBY_MODES.tower, Stage: TowerStage, cue: towerCue },
  submarine: { ...LOBBY_MODES.submarine, Stage: SubStage, cue: subCue },
  fight: { ...LOBBY_MODES.fight, Stage: FightStage, cue: fightCue },
  robot: { ...LOBBY_MODES.robot, Stage: RobotStage, cue: robotCue },
  land: { ...LOBBY_MODES.land, Stage: LandStage, cue: landCue },
  racer: { ...LOBBY_MODES.racer, Stage: RacerStage, cue: racerCue },
  gift: { ...LOBBY_MODES.gift, Stage: GiftStage, cue: giftCue },
  cup: { ...LOBBY_MODES.cup, Stage: CupStage, cue: cupCue },
  siege: { ...LOBBY_MODES.siege, Stage: SiegeStage, cue: siegeCue },
  duel: { ...LOBBY_MODES.duel, Stage: DuelStage, cue: duelCue },
};

/** The music cue of the mode a view belongs to, for that same view. */
export function cueOf(view: HostModeView<GameMode>): MusicCue {
  // As in stageOf, the per-mode types meet here: the cue is called with the view it was looked up with.
  return (HOST_MODES[view.kind].cue as (view: HostModeView<GameMode>) => MusicCue)(view);
}

/** The stage of the mode a view belongs to, to render with that same view. */
export function stageOf(view: HostModeView<GameMode>): ComponentType<StageProps<GameMode>> {
  // The per-mode types meet here (and in cueOf): the caller passes back the view it looked the stage up with.
  return HOST_MODES[view.kind].Stage as ComponentType<StageProps<GameMode>>;
}
