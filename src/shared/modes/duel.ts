import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionError, QuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme } from "../themed-modes.ts";

/** why: options stay hidden during intro, while the duelists face off. */
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
  /** why: null means didn't answer. */
  correct: boolean | null;
  answerDurationMs: number | null;
  /** why: a 3-way duel's middle player and everyone in a draw get "stay". */
  outcome: "win" | "lose" | "stay";
  /** why: this round only, see arenaPoints; 0 without a win. */
  points: number;
  /** why: 1-based. */
  nextArena: number;
}

export interface DuelArenaResult {
  /** why: 1-based; 1 is High Noon. */
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
  /** why: 3 in the bottom arena when the count is odd; disconnected players stay in place. */
  duelists: (DuelPlayerRef & { connected: boolean; answered: boolean })[];
}

const DUEL_AWARDS = { mostArenaOneWins: "Longest reign", mostWins: "Most wins", mostArenasClimbed: "Biggest climb" } as const;

export type DuelAwardKey = keyof typeof DUEL_AWARDS;
export type DuelAwards = Record<DuelAwardKey, SubAward | null>;

export interface HostDuelPlayer extends DuelPlayerRef {
  connected: boolean;
  /** why: 1-based. */
  arena: number;
  /** why: competition rank (ties share), starting at 1. */
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
  /** why: manual waits for host.next on the reveal; auto moves on after 5 s. */
  pacing: Pacing;
  round: number;
  rounds: number;
  /** why: `index` is the play-order slot, `total` the round count; options empty during intro. */
  question: QuestionView | null;
  /** why: during reveal, as they stood when the round was played; empty at the podium. */
  arenas: DuelArena[];
  answeredCount: number;
  playerCount: number;
  /** why: reveal only. */
  correct: number[] | null;
  /** why: null before the first reveal. */
  lastRound: DuelRound | null;
  /** why: in standing order, rank 1 first. */
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
  /** why: reveal only. */
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean; answerDurationMs: number | null } | null;
  /** why: reveal only; the whole duel, so the phone can show the face-off. */
  myDuel: DuelArenaResult | null;
  /** why: podium only. */
  result: { rank: number; playerCount: number; awards: string[] } | null;
}

export type DuelMsg =
  /** why: open phase only; one answer per player per round. */
  PacedAnswerMsg<"duel">;

export const duelShared = sharedModeEntry<ModeProtocol<DuelMsg, DuelSettings, HostDuelState, PlayerDuelView>>()({
  name: "Showdown",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["duel.answer"],
  awards: DUEL_AWARDS,
});

export const duelArenaName = (arena: number, theme?: SeasonTheme) =>
  arena === 1 ? (modeTheme("duel", theme) === "christmas" ? "North Pole Plaza" : "High Noon") : `Arena ${arena}`;
