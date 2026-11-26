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
  revealTurnsNext: boolean;
  answerCounts: number[] | null;
  players: (MemoryPlayer & { connected: boolean })[];
  podium: { place: number; player: MemoryPlayer }[] | null;
  boardSize: number;
  board: MemoryCardView[];
  turn: { id: number; playerId: string; nickname: string } | null;
  feedback: { matched: boolean } | null;
  phaseRemainingMs: number;
}

export const MEMORY_FLIP_MS = 400;
export const MEMORY_PAUSE_BEFORE_SLIDE_MS = 500;
export const MEMORY_SLIDE_MS = 500;
export const MEMORY_MATCH_RESULT_MS = MEMORY_FLIP_MS + MEMORY_PAUSE_BEFORE_SLIDE_MS + MEMORY_SLIDE_MS;
export const MEMORY_URGENT_SECONDS_LEFT = 5;

export type PlayerMemoryTurnStage = { stage: "picking"; step: 1 | 2 } | { stage: "feedback"; matched: boolean };

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
  turn: ({ id: number; board: MemoryCardView[] } & PlayerMemoryTurnStage) | null;
  phaseRemainingMs: number;
  result: { place: number; playerCount: number; awards: string[] } | null;
}

export type MemoryMsg = PacedAnswerMsg<"memory"> | { type: "memory.confirm"; turnId: number; step: 1 | 2; position: number };

export const memoryShared = sharedModeEntry<ModeProtocol<MemoryMsg, MemorySettings, HostMemoryState, PlayerMemoryView>>()({
  name: "Memory Game",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  awards: {},
  msgTypes: ["memory.answer", "memory.confirm"],
});
