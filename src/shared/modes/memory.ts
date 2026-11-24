import type { AvatarChoice } from "../avatars.ts";
import type { PacedAnswerMsg, Pacing, QuestionView } from "../mode-views.ts";
import type { ModeProtocol, NoSettings } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";

export const MEMORY_BOARD_SIZE = 10;
export const MEMORY_QUESTIONS_PER_PHASE = 3;
export const MEMORY_TURN_MS = 15_000;

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
  turn: { id: number; available: boolean[] } | null;
  phaseRemainingMs: number;
  result: { rank: number; playerCount: number } | null;
}

export type MemoryMsg = PacedAnswerMsg<"memory"> | { type: "memory.confirm"; turnId: number; positions: [number, number] };

export const memoryShared = sharedModeEntry<ModeProtocol<MemoryMsg, NoSettings, HostMemoryState, PlayerMemoryView>>()({
  name: "Memory Game",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["memory.answer", "memory.confirm"],
});
