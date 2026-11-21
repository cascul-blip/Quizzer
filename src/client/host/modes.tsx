import type { ComponentType } from "preact";
import type { GameMode, HostView } from "../../shared/protocol.ts";
import { ClassicStage } from "./classic.tsx";
import type { Send } from "./common.tsx";
import { CupStage } from "./cup.tsx";
import { DuelStage } from "./duel.tsx";
import { FightStage } from "./fight.tsx";
import { GiftStage } from "./gift.tsx";
import { LandStage } from "./land.tsx";
import { RacerStage } from "./racer.tsx";
import { RobotStage } from "./robot.tsx";
import { SiegeStage } from "./siege.tsx";
import { SubStage } from "./submarine.tsx";
import { TowerStage } from "./tower.tsx";

/** The projector's view of a game of the mode; its kind is the mode. Classic's also carries the lobby. */
export type HostModeView<M extends GameMode> = Extract<HostView, { kind: M }>;

type StageProps<M extends GameMode> = { view: HostModeView<M>; send: Send };

/** Everything the projector knows about one game mode; main.tsx looks it up in HOST_MODES instead of branching on the mode. */
export interface HostModeEntry<M extends GameMode> {
  /** The projector screen while the mode's view is shown. */
  Stage: ComponentType<StageProps<M>>;
}

/** Every game mode's projector entry, with its stage in src/client/host/<mode>.tsx. */
export const HOST_MODES: { [M in GameMode]: HostModeEntry<M> } = {
  classic: { Stage: ClassicStage },
  tower: { Stage: TowerStage },
  submarine: { Stage: SubStage },
  fight: { Stage: FightStage },
  robot: { Stage: RobotStage },
  land: { Stage: LandStage },
  racer: { Stage: RacerStage },
  cup: { Stage: CupStage },
  siege: { Stage: SiegeStage },
  duel: { Stage: DuelStage },
  gift: { Stage: GiftStage },
};

/** The stage of the mode a view belongs to, to render with that same view. */
export function stageOf(view: HostModeView<GameMode>): ComponentType<StageProps<GameMode>> {
  // The one place the per-mode types meet: the caller passes back the view it looked the stage up with.
  return HOST_MODES[view.kind].Stage as ComponentType<StageProps<GameMode>>;
}
