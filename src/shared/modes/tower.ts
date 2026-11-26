import type { AvatarChoice } from "../avatars.ts";
import type { AfterAnswerWaitView, QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward, TeamInfo } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme, themedIcon, themedName } from "../themed-modes.ts";

export type TowerPhase = "countdown" | "playing" | "podium";

export const TOWER_MINUTES = [2, 3, 5, 7, 10] as const;
export const BLOCKS_PER_BUILD = 4;
/** why: zones across the build screen are miss · left · center · right · miss. */
export const DROP_ZONES = 5;

export interface TowerSettings {
  /** why: optional for older callers; defaults to the seasonal look. */
  theme?: SeasonTheme;
  teams: number;
  minutes: number;
  monster: boolean;
}

export const MONSTER_DAMAGE = 2;

/** why: counted from the tower's highest complete floor. */
export const EGG_LEVELS_ABOVE = 4;

export interface MonsterEgg {
  seq: number;
  col: number;
  row: number;
}

export interface MonsterEggs {
  seq: number;
  cells: { col: number; row: number }[];
}

export interface MonsterAttack {
  seq: number;
  byTeam: number;
  byNickname: string;
  target: number;
  /** why: target's columns before and after, for the smash animation. */
  before: number[];
  after: number[];
}

const TOWER_AWARDS = { mostCorrect: MOST_CORRECT_LABEL, masterBuilder: "Master builder" } as const;

export type TowerAwardKey = keyof typeof TOWER_AWARDS;
export type TowerAwards = Record<TowerAwardKey, SubAward | null>;

export interface PlayerTowerView {
  kind: "tower";
  theme?: SeasonTheme;
  phase: TowerPhase;
  title: string;
  /** why: to play in the countdown phase, to the game's end while playing. */
  remainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; placed: number };
  team: TeamInfo;
  state: "question" | "build";
  blocksHeld: number;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  egg: MonsterEgg | null;
  /** why: shown once per seq. */
  monsterEvent: { seq: number; kind: "egg" | "hatched" | "smashed"; byTeam: string | null; target: string | null } | null;
  build: {
    columns: number[];
    floors: number;
    sweepDurationMs: number;
    wait: AfterAnswerWaitView;
  } | null;
  result: {
    teamRank: number;
    teamCount: number;
    floors: number;
    placed: number;
    awards: string[];
  } | null;
}

export interface HostTowerTeam extends TeamInfo {
  columns: number[];
  floors: number;
  placed: number;
  rank: number;
  members: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; building: boolean }[];
}

export interface HostTowerState {
  kind: "tower";
  theme?: SeasonTheme;
  phase: TowerPhase;
  quiz: { id: string; title: string; questionCount: number };
  remainingMs: number;
  teams: HostTowerTeam[];
  playerCount: number;
  /** why: increments per drop so screens can animate and sound new blocks. */
  dropCount: number;
  monster: boolean;
  egg: MonsterEggs | null;
  lastAttack: MonsterAttack | null;
  nextMonsterRemainingMs: number | null;
  awards: TowerAwards | null;
  errors: QuestionError[] | null;
}

export type TowerMsg = StreamAnswerMsg<"tower"> | { type: "tower.drop"; zone: number };

export const towerShared = sharedModeEntry<
  ModeProtocol<TowerMsg, TowerSettings, HostTowerState, PlayerTowerView, Omit<TowerSettings, "monster"> & { monster?: boolean }>
>()({
  name: "Tallest Tower",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["tower.answer", "tower.drop"],
  awards: TOWER_AWARDS,
});

export function towerWords(theme?: SeasonTheme) {
  const shown = { icon: themedIcon("tower", theme), name: themedName("tower", theme) };
  return modeTheme("tower", theme) === "christmas"
    ? { ...shown, creature: "yeti", creatureIcon: "❄️", item: "bell", itemIcon: "🔔", action: "rang the bell and summoned the yeti" }
    : { ...shown, creature: "monster", creatureIcon: "👾", item: "egg", itemIcon: "🥚", action: "hatched the monster" };
}
