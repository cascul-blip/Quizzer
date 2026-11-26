import type { AvatarChoice } from "../avatars.ts";
import type { HostPlayer, Pacing, QuestionError, QuestionView } from "../mode-views.ts";
import type { ModeProtocol, NoSettings } from "../shared-mode-entry.ts";
import { sharedModeEntry } from "../shared-mode-entry.ts";

export type ClassicPhase = "intro" | "open" | "reveal" | "leaderboard" | "podium";

export interface RankedEntry {
  id: string;
  nickname: string;
  avatar: AvatarChoice;
  score: number;
  rank: number;
  lastQuestionPoints: number;
  streak: number;
}

export interface PlayerResult {
  choice: number | null;
  correct: number[];
  wasCorrect: boolean;
  points: number;
}

export interface ClassicView {
  kind: "classic";
  phase: ClassicPhase;
  title: string;
  me: { id: string; nickname: string; avatar: AvatarChoice; score: number; rank: number; streak: number };
  playerCount: number;
  question: QuestionView | null;
  myChoice: number | null;
  myText: string | null;
  result: PlayerResult | null;
  podium: RankedEntry[] | null;
}

export interface HostClassicState {
  kind: "classic";
  phase: ClassicPhase;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  players: HostPlayer[];
  question: QuestionView | null;
  /** why: The projector must keep typed answers private until answering closes. */
  correct: number[] | null;
  answeredCount: number;
  answerCounts: number[] | null;
  /** why: reveal only; per option, pickers fastest first. */
  answerAvatars: AvatarChoice[][] | null;
  leaderboard: RankedEntry[];
  errors: QuestionError[] | null;
}

export type ClassicMsg = { type: "setAvatar"; avatar: string; accessory: string } | { type: "answer"; qIndex: number; option: number; text?: string };

export const classicShared = sharedModeEntry<ModeProtocol<ClassicMsg, NoSettings, HostClassicState, ClassicView>>()({
  name: "Classic",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["answer", "setAvatar"],
});
