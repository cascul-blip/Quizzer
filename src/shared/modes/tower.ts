import type { AvatarChoice } from "../avatars.ts";
import type { AfterAnswerWaitView, QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, TeamInfo } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme, themedIcon, themedName } from "../themed-modes.ts";

// Tallest Tower protocol types.

export type TowerPhase = "countdown" | "playing" | "podium";

export const TOWER_MINUTES = [2, 3, 5, 7, 10] as const;
/** Correct answers (blocks) needed before a player switches to build mode. */
export const BLOCKS_PER_BUILD = 4;
/** Drop zones across the build screen: miss · left · center · right · miss. */
export const DROP_ZONES = 5;

export interface TowerSettings {
  /** Optional for older callers; defaults to the seasonal look. */
  theme?: SeasonTheme;
  teams: number;
  minutes: number;
  /** Monster eggs 4 times per game, evenly spaced (needs 2+ teams). */
  monster: boolean;
}

/** Floors the monster knocks off the tower it attacks. */
export const MONSTER_DAMAGE = 2;

/** How many levels above a tower's highest complete floor its egg is placed. */
export const EGG_LEVELS_ABOVE = 4;

/** One team's monster egg: the first block landing on it hatches the monster. */
export interface MonsterEgg {
  seq: number;
  col: number;
  /** 0-based row: level (row + 1). */
  row: number;
}

/** Every team's egg from one announcement; cells[i] belongs to team i. */
export interface MonsterEggs {
  seq: number;
  cells: { col: number; row: number }[];
}

export interface MonsterAttack {
  seq: number;
  byTeam: number;
  byNickname: string;
  target: number;
  /** Target's columns before and after the attack (for the smash animation). */
  before: number[];
  after: number[];
}

export interface TowerAwards {
  mostCorrect: { value: number; nicknames: string[] } | null;
  masterBuilder: { value: number; nicknames: string[] } | null;
}

export interface PlayerTowerView {
  kind: "tower";
  theme?: SeasonTheme;
  phase: TowerPhase;
  title: string;
  /** Countdown to play (countdown phase) or to the end of the game (playing). */
  remainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; placed: number };
  team: TeamInfo;
  state: "question" | "build";
  blocksHeld: number;
  question: StreamQuestionView | null;
  /** Result of the last answer while its 1 s flash is still showing. */
  feedback: StreamFeedbackView | null;
  egg: MonsterEgg | null;
  /** Latest monster news for this player (shown once per seq). */
  monsterEvent: { seq: number; kind: "egg" | "hatched" | "smashed"; byTeam: string | null; target: string | null } | null;
  /** The team tower, while this player is building. */
  build: {
    columns: number[];
    floors: number;
    sweepMs: number;
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
  /** Increments with every drop so screens can animate/sound new blocks. */
  dropCount: number;
  monster: boolean;
  egg: MonsterEggs | null;
  lastAttack: MonsterAttack | null;
  /** Time until the next egg announcement, or null if none is coming. */
  nextMonsterMs: number | null;
  awards: TowerAwards | null;
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

/** What a phone sends during Tallest Tower games. */
export type TowerMsg = StreamAnswerMsg<"tower"> | { type: "tower.drop"; zone: number };

/** Tallest Tower's shared mode entry. */
export const towerShared = sharedModeEntry<
  ModeProtocol<TowerMsg, TowerSettings, HostTowerState, PlayerTowerView, Omit<TowerSettings, "monster"> & { monster?: boolean }>
>()({
  name: "Tallest Tower",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["tower.answer", "tower.drop"],
});

/** Tallest Tower's words in each theme: its icon and name (THEMED_MODES), the creature, the item that summons it, and what that does. */
export function towerWords(theme?: SeasonTheme) {
  const shown = { icon: themedIcon("tower", theme), name: themedName("tower", theme) };
  return modeTheme("tower", theme) === "christmas"
    ? { ...shown, creature: "yeti", creatureIcon: "❄️", item: "bell", itemIcon: "🔔", action: "rang the bell and summoned the yeti" }
    : { ...shown, creature: "monster", creatureIcon: "👾", item: "egg", itemIcon: "🥚", action: "hatched the monster" };
}
