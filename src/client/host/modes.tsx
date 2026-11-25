import type { ComponentType } from "preact";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { HostView } from "../../shared/protocol.ts";
import { entryOf } from "../shared/entry-of.ts";
import type { MusicCue } from "../shared/music/index.ts";
import { ClassicStage, classicCue } from "./classic.tsx";
import type { Send } from "./common.tsx";
import { CupStage, cupCue, cupLobby } from "./cup.tsx";
import { DuelStage, duelCue, duelLobby } from "./duel.tsx";
import { FightStage, fightCue, fightLobby } from "./fight.tsx";
import { GiftStage, giftCue, giftLobby } from "./gift.tsx";
import { LandStage, landCue, landLobby } from "./land.tsx";
import type { LobbyModeEntry } from "./lobby-modes.tsx";
import { MemoryStage, memoryCue, memoryLobby } from "./memory.tsx";
import { RacerStage, racerCue, racerLobby } from "./racer.tsx";
import { RobotStage, robotCue, robotLobby } from "./robot.tsx";
import { SiegeStage, siegeCue, siegeLobby } from "./siege.tsx";
import { SubmarineStage, submarineCue, submarineLobby } from "./submarine.tsx";
import { TowerStage, towerCue, towerLobby } from "./tower.tsx";

export type HostModeView<M extends GameMode> = Extract<HostView, { kind: M }>;

type StageProps<M extends GameMode> = { view: HostModeView<M>; send: Send; enteredFromLobby: boolean };

export interface HostModeEntry<M extends GameMode> extends LobbyModeEntry<M> {
  Stage: ComponentType<StageProps<M>>;
  cue(view: HostModeView<M>): MusicCue;
}

/** Every projector mode entry, in Game mode menu order. */
export const HOST_MODES: { [M in GameMode]: HostModeEntry<M> } = {
  classic: {
    label: () => "Classic",
    Settings: ({ children }) => <>{children}</>,
    lobbyTrack: () => "classic-lobby",
    Stage: ClassicStage,
    cue: classicCue,
  },
  tower: { ...towerLobby, Stage: TowerStage, cue: towerCue },
  submarine: { ...submarineLobby, Stage: SubmarineStage, cue: submarineCue },
  fight: { ...fightLobby, Stage: FightStage, cue: fightCue },
  robot: { ...robotLobby, Stage: RobotStage, cue: robotCue },
  land: { ...landLobby, Stage: LandStage, cue: landCue },
  racer: { ...racerLobby, Stage: RacerStage, cue: racerCue },
  gift: { ...giftLobby, Stage: GiftStage, cue: giftCue },
  cup: { ...cupLobby, Stage: CupStage, cue: cupCue },
  siege: { ...siegeLobby, Stage: SiegeStage, cue: siegeCue },
  duel: { ...duelLobby, Stage: DuelStage, cue: duelCue },
  memory: { ...memoryLobby, Stage: MemoryStage, cue: memoryCue },
};

export function cueOf(view: HostModeView<GameMode>): MusicCue {
  return entryOf<HostModeEntry<GameMode>>(HOST_MODES, view.kind).cue(view);
}

export function stageOf(view: HostModeView<GameMode>): ComponentType<StageProps<GameMode>> {
  return entryOf<HostModeEntry<GameMode>>(HOST_MODES, view.kind).Stage;
}

export function lobbyEntryOf(mode: GameMode): LobbyModeEntry<GameMode> {
  return entryOf<LobbyModeEntry<GameMode>>(HOST_MODES, mode);
}
