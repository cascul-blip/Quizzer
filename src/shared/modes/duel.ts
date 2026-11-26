import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionError, QuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme } from "../themed-modes.ts";

export type DuelPhase = "intro" | "open" | "reveal" | "podium";

export const DUEL_ROUNDS = [10, 15, 20] as const;
export const DUEL_DEFAULT_ROUNDS = 15;

export interface DuelSettings {
  theme?: SeasonTheme;
  /** why: may exceed the question count; questions repeat in a fresh order. */
  rounds: number;
}

export interface DuelPlayerRef {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
}

export interface DuelistResult extends DuelPlayerRef {
  correct: boolean | null;
  answerDurationMs: number | null;
  outcome: "win" | "lose" | "stay";
  points: number;
  nextArena: number;
}

export interface DuelArenaResult {
  arena: number;
  /** why: ordered left, right, then the third in a 3-way duel. */
  duelists: DuelistResult[];
  draw: boolean;
}

export interface DuelRound {
  /** why: 1-based; screens key the reveal animation on it to play it once. */
  round: number;
  arenas: DuelArenaResult[];
}

export interface DuelArena {
  arena: number;
  duelists: (DuelPlayerRef & { connected: boolean; answered: boolean })[];
}

const DUEL_AWARDS = { mostArenaOneWins: "Longest reign", mostWins: "Most wins", mostArenasClimbed: "Biggest climb" } as const;

export type DuelAwardKey = keyof typeof DUEL_AWARDS;
export type DuelAwards = Record<DuelAwardKey, SubAward | null>;

export interface HostDuelPlayer extends DuelPlayerRef {
  connected: boolean;
  arena: number;
  rank: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  correct: number;
  wrong: number;
  reign: number;
  startArena: number;
}

export interface HostDuelState {
  /** why: lets a reconnecting screen resume the reveal animation. */
  revealElapsedMs?: number;
  theme?: SeasonTheme;
  kind: "duel";
  phase: DuelPhase;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  round: number;
  rounds: number;
  /** why: index identifies the round in play order, so repeated quiz questions still have distinct answer slots. */
  question: QuestionView | null;
  /** why: The reveal shows the arenas before their players move to their new places. */
  arenas: DuelArena[];
  answeredCount: number;
  playerCount: number;
  correct: number[] | null;
  lastRound: DuelRound | null;
  players: HostDuelPlayer[];
  phaseRemainingMs: number;
  phaseDurationMs: number;
  awards: DuelAwards | null;
  errors: QuestionError[] | null;
}

export interface PlayerDuelView {
  revealElapsedMs?: number;
  theme?: SeasonTheme;
  kind: "duel";
  phase: DuelPhase;
  title: string;
  me: DuelPlayerRef & { arena: number; rank: number; points: number; wins: number; losses: number; draws: number; reign: number };
  playerCount: number;
  round: number;
  rounds: number;
  question: QuestionView | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  arena: number;
  arenaCount: number;
  opponents: DuelPlayerRef[];
  myChoice: number | null;
  myText: string | null;
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean; answerDurationMs: number | null } | null;
  /** why: The phone needs the other duelists to show the face-off. */
  myDuel: DuelArenaResult | null;
  result: { rank: number; playerCount: number; awards: string[] } | null;
}

export type DuelMsg = PacedAnswerMsg<"duel">;

export const duelShared = sharedModeEntry<ModeProtocol<DuelMsg, DuelSettings, HostDuelState, PlayerDuelView>>()({
  name: "Showdown",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["duel.answer"],
  awards: DUEL_AWARDS,
});

export const duelArenaName = (arena: number, theme?: SeasonTheme) =>
  arena === 1 ? (modeTheme("duel", theme) === "christmas" ? "North Pole Plaza" : "High Noon") : `Arena ${arena}`;
