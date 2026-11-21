import type { ComponentType } from "preact";
import type { GameMode, HostView } from "../../shared/protocol.ts";
import { ClassicStage } from "./classic.tsx";
import type { Send } from "./common.tsx";
import { CupStage } from "./cup.tsx";
import { DuelStage } from "./duel.tsx";
import { FightStage } from "./fight.tsx";
import { GiftStage } from "./gift.tsx";
import { LandStage } from "./land.tsx";
import { LOBBY_MODES, type LobbyModeEntry } from "./lobby-modes.tsx";
import { RacerStage } from "./racer.tsx";
import { RobotStage } from "./robot.tsx";
import { SiegeStage } from "./siege.tsx";
import { SubStage } from "./submarine.tsx";
import { TowerStage } from "./tower.tsx";

/** The projector's view of a game of the mode; its kind is the mode. Classic's also carries the lobby. */
export type HostModeView<M extends GameMode> = Extract<HostView, { kind: M }>;

type StageProps<M extends GameMode> = { view: HostModeView<M>; send: Send };

/** Everything the projector knows about one game mode; main.tsx looks it up in HOST_MODES instead of branching on the mode. Its lobby part comes from LOBBY_MODES. */
export interface HostModeEntry<M extends GameMode> extends LobbyModeEntry<M> {
  /** The projector screen while the mode's view is shown. */
  Stage: ComponentType<StageProps<M>>;
}

/** Every game mode's projector entry, with its stage and lobby part in src/client/host/<mode>.tsx (Classic's lobby part in lobby-modes.tsx). */
export const HOST_MODES: { [M in GameMode]: HostModeEntry<M> } = {
  classic: { ...LOBBY_MODES.classic, Stage: ClassicStage },
  tower: { ...LOBBY_MODES.tower, Stage: TowerStage },
  submarine: { ...LOBBY_MODES.submarine, Stage: SubStage },
  fight: { ...LOBBY_MODES.fight, Stage: FightStage },
  robot: { ...LOBBY_MODES.robot, Stage: RobotStage },
  land: { ...LOBBY_MODES.land, Stage: LandStage },
  racer: { ...LOBBY_MODES.racer, Stage: RacerStage },
  gift: { ...LOBBY_MODES.gift, Stage: GiftStage },
  cup: { ...LOBBY_MODES.cup, Stage: CupStage },
  siege: { ...LOBBY_MODES.siege, Stage: SiegeStage },
  duel: { ...LOBBY_MODES.duel, Stage: DuelStage },
};

/** The stage of the mode a view belongs to, to render with that same view. */
export function stageOf(view: HostModeView<GameMode>): ComponentType<StageProps<GameMode>> {
  // The one place the per-mode types meet: the caller passes back the view it looked the stage up with.
  return HOST_MODES[view.kind].Stage as ComponentType<StageProps<GameMode>>;
}
