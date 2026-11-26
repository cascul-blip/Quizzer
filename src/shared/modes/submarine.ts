import type { AvatarChoice } from "../avatars.ts";
import type { QuestionError, StreamAnswerMsg, StreamFeedbackView, StreamQuestionView, SubAward } from "../mode-views.ts";
import type { ModeProtocol, NoSettings } from "../shared-mode-entry.ts";
import { MOST_CORRECT_LABEL, sharedModeEntry } from "../shared-mode-entry.ts";

export type SubPhase = "countdown" | "chase" | "escaped" | "dive" | "caught" | "podium";
export const CORRECT_PER_BOOST = 4;

const SUB_AWARDS = { topBooster: "Top booster", sharpestEyes: "Sharpest eyes", mostCorrect: MOST_CORRECT_LABEL } as const;

export type SubAwardKey = keyof typeof SUB_AWARDS;
export type SubAwards = Record<SubAwardKey, SubAward | null>;

export interface HostSubState {
  kind: "submarine";
  phase: SubPhase;
  quiz: { id: string; title: string; questionCount: number };
  level: number;
  depthMeters: number;
  phaseRemainingMs: number;
  /** why: in seconds of fish travel, as of when this was sent. */
  gapSeconds: number;
  /** why: gap-seconds closed per second. */
  speed: number;
  maxGap: number;
  boosts: number;
  required: number;
  lastBoost: { seq: number; nickname: string; avatar: AvatarChoice } | null;
  dive: {
    instructors: { nickname: string; index: number; total: number; found: number; groupSize: number; done: boolean }[];
  } | null;
  players: { id: string; nickname: string; avatar: AvatarChoice; connected: boolean; state: "question" | "boost" | "waiting" }[];
  playerCount: number;
  awards: SubAwards | null;
  /** why: podium only. */
  errors: QuestionError[] | null;
}

export interface PlayerSubView {
  kind: "submarine";
  phase: SubPhase;
  title: string;
  level: number;
  depth: number;
  phaseRemainingMs: number;
  me: { id: string; nickname: string; avatar: AvatarChoice; correct: number; boosts: number; diveHits: number };
  state: "question" | "boost" | "waiting";
  /** why: 0 … CORRECT_PER_BOOST-1. */
  towardBoost: number;
  question: StreamQuestionView | null;
  feedback: StreamFeedbackView | null;
  // why: symbolRemainingMs is time left to find the current symbol before the instructor moves on.
  dive:
    | {
        role: "instructor";
        symbol: string;
        index: number;
        total: number;
        found: number;
        groupSize: number;
        symbolRemainingMs: number;
        symbolDurationMs: number;
      }
    | {
        role: "diver";
        grid: string[];
        index: number;
        total: number;
        lockRemainingMs: number;
        done: boolean;
        hint: string | null;
        symbolRemainingMs: number;
        symbolDurationMs: number;
      }
    | { role: "waiting" }
    | null;
  result: { depth: number; level: number; awards: string[] } | null;
}

export type SubMsg = StreamAnswerMsg<"sub"> | { type: "sub.boost" } | { type: "sub.tap"; symbol: string };

export const submarineShared = sharedModeEntry<ModeProtocol<SubMsg, NoSettings, HostSubState, PlayerSubView>>()({
  name: "Sled Squad",
  flags: { paced: false, protect: true },
  lobbyBanner: false,
  msgTypes: ["sub.answer", "sub.boost", "sub.tap"],
  awards: SUB_AWARDS,
});
