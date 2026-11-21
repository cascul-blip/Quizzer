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
  /** Points gained on the most recent question. */
  delta: number;
  /** Current run of consecutive correct answers. */
  streak: number;
}

export interface PlayerResult {
  choice: number | null;
  correct: number[];
  wasCorrect: boolean;
  points: number;
}

export interface PlayerClassicView {
  kind: "classic";
  phase: ClassicPhase;
  title: string;
  me: { id: string; nickname: string; avatar: AvatarChoice; score: number; rank: number; streak: number };
  playerCount: number;
  question: QuestionView | null;
  /** The option chosen for the current question, if any. */
  myChoice: number | null;
  /** What was typed for the current question, if it is a typed one and answered. */
  myText: string | null;
  result: PlayerResult | null;
  podium: RankedEntry[] | null;
}

/** Everything the projector needs about a live Classic game, except join info. */
export interface HostClassicState {
  kind: "classic";
  phase: ClassicPhase;
  quiz: { id: string; title: string; questionCount: number };
  pacing: Pacing;
  players: HostPlayer[];
  question: QuestionView | null;
  /** Revealed only once answering has closed. */
  correct: number[] | null;
  answeredCount: number;
  answerCounts: number[] | null;
  /** Revealed only: per option, the avatars of the players who picked it, fastest first. */
  answerAvatars: AvatarChoice[][] | null;
  leaderboard: RankedEntry[];
  /** The questions answered wrongly most often (podium only). */
  errors: QuestionError[] | null;
}

/** Classic's phone messages. Typed questions send `text` (the typed answer) and ignore `option`. */
export type ClassicMsg = { type: "setAvatar"; avatar: string; accessory: string } | { type: "answer"; qIndex: number; option: number; text?: string };

/** Classic's shared mode entry. */
export const classicShared = sharedModeEntry<ModeProtocol<ClassicMsg, NoSettings, HostClassicState, PlayerClassicView>>()({
  name: "Classic",
  flags: { paced: true, protect: false },
  lobbyBanner: false,
  msgTypes: ["answer", "setAvatar"],
});
