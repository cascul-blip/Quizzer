import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionError, QuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";
import type { SeasonTheme } from "../themed-modes.ts";
import { modeTheme } from "../themed-modes.ts";

// Showdown protocol types.
//
// Western quick-draw duels on an arena ladder. Paced like Classic/Racer: one shared question per round for everyone.
// Every round, all the duels run at once: players are paired from the top of the ladder (Arena 1 = High Noon),
// an odd count makes the bottom arena a 3-way duel. Right beats wrong, both right → faster wins, both wrong → draw.
// At each boundary the upper arena's loser swaps with the lower arena's winner, unless either arena was a draw.
// A win scores points: 1 in the bottom arena, 1 more for each arena above it. Most points wins the game.
// The rules live in duel-rules.ts. There is no lobby phase: the lobby is the classic game (mode "duel").

/**
 * intro: 3 s look at the question (options hidden) while the duelists face off.
 * open: options visible, everyone answers once.
 * reveal: who drew first in each arena and who moves where (`lastRound`).
 * podium: the game is over; points decide the final ranking (equal points: higher on the ladder first).
 */
export type DuelPhase = "intro" | "open" | "reveal" | "podium";

export const DUEL_ROUNDS = [10, 15, 20] as const;
export const DUEL_DEFAULT_ROUNDS = 15;

export interface DuelSettings {
  theme?: SeasonTheme;
  /** Rounds to play; questions repeat in a fresh order once they run out. */
  rounds: number;
}

export interface DuelPlayerRef {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
}

/** One duelist's part in a finished round. */
export interface DuelistResult extends DuelPlayerRef {
  /** Null: didn't answer. */
  correct: boolean | null;
  /** Answer time from the question opening, ms; null if they didn't answer. */
  ms: number | null;
  /** "win" moves up a boundary, "lose" moves down; a 3-way duel's middle player and everyone in a draw get "stay". */
  outcome: "win" | "lose" | "stay";
  /** Points won this round: a win in the bottom arena is worth 1, each arena above it 1 more; 0 without a win. */
  points: number;
  /** Arena (1-based) they are in for the next round. */
  nextArena: number;
}

/** One arena of a finished round. */
export interface DuelArenaResult {
  /** 1-based; 1 is High Noon. */
  arena: number;
  /** Ordered as they stood (left, right, then the third in a 3-way duel). */
  duelists: DuelistResult[];
  draw: boolean;
}

export interface DuelRound {
  /** Round number (1-based); use it to play the reveal animation once. */
  round: number;
  arenas: DuelArenaResult[];
}

/** The arenas as they stand for the current round. */
export interface DuelArena {
  arena: number;
  /** 2 duelists, or 3 in the bottom arena when the count is odd. Disconnected players stay in place. */
  duelists: (DuelPlayerRef & { connected: boolean; answered: boolean })[];
}

export interface DuelAwards {
  /** Most rounds won in Arena 1. */
  longestReign: SubAward | null;
  mostWins: SubAward | null;
  /** Most arenas climbed from where they started (start arena − final arena). */
  biggestClimb: SubAward | null;
}

export interface HostDuelPlayer extends DuelPlayerRef {
  connected: boolean;
  /** 1-based arena now. */
  arena: number;
  /** Standing (1-based): most points first, equal points by ladder order. Also the final ranking. */
  rank: number;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  correct: number;
  wrong: number;
  /** Rounds won while in Arena 1. */
  reign: number;
  startArena: number;
}

export interface HostDuelState {
  /** Time since reveal started, for reconnect-safe animation. */
  revealElapsedMs?: number;
  theme?: SeasonTheme;
  kind: "duel";
  phase: DuelPhase;
  quiz: { id: string; title: string; questionCount: number };
  /** Manual waits for host.next on the reveal; auto moves on after 5 s. */
  pacing: Pacing;
  /** 1-based round now; total rounds. */
  round: number;
  rounds: number;
  /** `index` is the play-order slot (unique per round); `total` is the round count. Options empty during intro. */
  question: QuestionView | null;
  /** The arenas for this round (during reveal: as they stood when the round was played). Empty at the podium. */
  arenas: DuelArena[];
  answeredCount: number;
  playerCount: number;
  /** Reveal only. */
  correct: number[] | null;
  /** The latest finished round (this one on the reveal). Null before the first reveal. */
  lastRound: DuelRound | null;
  /** Players in standing order (rank 1 first). */
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
  /** As HostDuelState.question. */
  question: QuestionView | null;
  phaseRemainingMs: number;
  phaseDurationMs: number;
  /** This player's arena this round and who they face (1 opponent, or 2 in a 3-way duel). */
  arena: number;
  arenaCount: number;
  opponents: DuelPlayerRef[];
  myChoice: number | null;
  myText: string | null;
  /** Reveal only. */
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean; ms: number | null } | null;
  /** Reveal only: this player's arena result (the whole duel, so the phone can show the face-off). */
  myDuel: DuelArenaResult | null;
  /** Podium only. */
  result: { rank: number; playerCount: number; awards: string[] } | null;
}

/** What a phone sends during Showdown games. */
export type DuelMsg =
  /** Open phase only. One answer per player per round. */
  PacedAnswerMsg<"duel">;

/** Showdown's shared mode entry. */
export const duelShared = sharedModeEntry<ModeProtocol<DuelMsg, DuelSettings, HostDuelState, PlayerDuelView>>()({
  name: "Showdown",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["duel.answer"],
});

/** An arena's name; arena 1 has its own in each theme. */
export const duelArenaName = (arena: number, theme?: SeasonTheme) =>
  arena === 1 ? (modeTheme("duel", theme) === "christmas" ? "North Pole Plaza" : "High Noon") : `Arena ${arena}`;
