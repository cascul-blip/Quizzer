import type { QuestionType } from "./quiz-schema.ts";

export type Phase = "lobby" | "intro" | "open" | "reveal" | "leaderboard" | "podium";
export type Pacing = "manual" | "auto";

// ---------- client → server ----------

export type PlayerMsg =
  | { type: "join"; nickname: string }
  | { type: "resume"; token: string }
  | { type: "answer"; qIndex: number; option: number };

export type HostMsg =
  | { type: "host.hello" }
  | { type: "host.open"; quizId: string }
  | { type: "host.start"; pacing: Pacing }
  | { type: "host.setPacing"; pacing: Pacing }
  | { type: "host.next" }
  | { type: "host.skip" }
  | { type: "host.kick"; playerId: string }
  | { type: "host.end" }
  | { type: "host.close" }
  | { type: "host.setAddress"; address: string };

export type ClientMsg = PlayerMsg | HostMsg;

// ---------- server → client ----------

export interface QuestionView {
  index: number;
  total: number;
  type: QuestionType;
  text: string;
  image?: string;
  timeLimitSec: number;
  /** Empty during the intro phase so phones can't answer early. */
  options: string[];
  /** Milliseconds left when the message was sent (clients add it to their own clock). */
  remainingMs: number;
}

export interface RankedEntry {
  id: string;
  nickname: string;
  score: number;
  rank: number;
  /** Points gained on the most recent question. */
  delta: number;
}

export interface PlayerResult {
  choice: number | null;
  correct: number[];
  wasCorrect: boolean;
  points: number;
}

export type PlayerView =
  | { kind: "none"; game: null }
  | { kind: "none"; game: { title: string; phase: Phase } }
  | {
      kind: "player";
      phase: Phase;
      title: string;
      me: { id: string; nickname: string; score: number; rank: number };
      playerCount: number;
      question: QuestionView | null;
      /** The option chosen for the current question, if any. */
      myChoice: number | null;
      result: PlayerResult | null;
      podium: RankedEntry[] | null;
    };

export interface HostPlayer {
  id: string;
  nickname: string;
  score: number;
  connected: boolean;
}

export interface JoinInfo {
  url: string;
  qrSvg: string;
  address: string;
  addresses: { address: string; iface: string }[];
  port: number;
}

/** Everything the projector needs about a live game, except join info. */
export interface HostGameState {
  phase: Phase;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  players: HostPlayer[];
  question: QuestionView | null;
  /** Revealed only once answering has closed. */
  correct: number[] | null;
  answeredCount: number;
  answerCounts: number[] | null;
  leaderboard: RankedEntry[];
  hasResults: boolean;
}

export type HostView = { phase: "idle"; join: JoinInfo } | (HostGameState & { join: JoinInfo });

export type ServerMsg =
  | { type: "player.state"; view: PlayerView }
  | { type: "host.state"; view: HostView }
  | { type: "joined"; token: string; playerId: string }
  | { type: "kicked" }
  | { type: "resumeFailed" }
  | { type: "error"; message: string };
