import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionView } from "../mode-views.ts";
import type { ModeProtocol } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";

export const MEMORY_BOARD_SIZES = [6, 8, 10] as const;
export const MEMORY_DEFAULT_BOARD_SIZE = 10;
export const MEMORY_FACE_COUNT = 50;

export type MemoryBoardSize = (typeof MEMORY_BOARD_SIZES)[number];

export interface MemorySettings {
  boardSize: MemoryBoardSize;
}
export const MEMORY_QUESTIONS_PER_PHASE = 3;
export const MEMORY_TURN_MS = 20_000;

export type MemoryPhase = "intro" | "open" | "reveal" | "turn" | "feedback" | "podium";

export type MemoryCardView = { state: "down" | "empty" } | { state: "up"; face: number };

export interface MemoryPlayer {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  pairs: number;
  chips: number;
}

export interface HostMemoryState {
  kind: "memory";
  phase: MemoryPhase;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  question: QuestionView | null;
  correct: number[] | null;
  answeredCount: number;
  /** Whether the current answer reveal advances to reveal turns. */
  revealTurnsNext: boolean;
  answerCounts: number[] | null;
  players: (MemoryPlayer & { connected: boolean; rank: number })[];
  boardSize: number;
  board: MemoryCardView[];
  turn: { id: number; playerId: string; nickname: string } | null;
  feedback: { matched: boolean } | null;
  phaseRemainingMs: number;
}

export interface PlayerMemoryView {
  kind: "memory";
  phase: MemoryPhase;
  title: string;
  me: MemoryPlayer;
  question: QuestionView | null;
  myChoice: number | null;
  myText: string | null;
  reveal: { choice: number | null; correct: number[]; wasCorrect: boolean } | null;
  boardSize: number;
  /** A null step keeps the confirmed faces visible during feedback. */
  turn: { id: number; step: 1 | 2 | null; board: MemoryCardView[] } | null;
  phaseRemainingMs: number;
  result: { rank: number; playerCount: number } | null;
}

export type MemoryMsg = PacedAnswerMsg<"memory"> | { type: "memory.confirm"; turnId: number; step: 1 | 2; position: number };

export const memoryShared = sharedModeEntry<ModeProtocol<MemoryMsg, MemorySettings, HostMemoryState, PlayerMemoryView>>()({
  name: "Memory Game",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["memory.answer", "memory.confirm"],
});
