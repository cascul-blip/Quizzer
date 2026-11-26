import type { AnswerValue } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { cleanAvatar } from "../../shared/avatars.ts";
import type { Pacing, QuestionError, QuestionView } from "../../shared/mode-views.ts";
import type { ClassicPhase, HostClassicState, RankedEntry } from "../../shared/modes/classic.ts";
import type { PlayerView, ShuffleOptions } from "../../shared/protocol.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, preparePlayOrder, topErrors } from "./common.ts";
import type { LobbyChoices } from "./lobby-facts.ts";
import { INTRO_MS } from "./paced-round.ts";
import { PacedSession } from "./paced-session.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { Column, ResultsSheet } from "./results.ts";
import { sheet } from "./results.ts";
import type { BasePlayer } from "./roster.ts";
import { scoreAnswer } from "./scoring.ts";
import { most, rankBy } from "./standings.ts";

export { AUTO_REVEAL_MS, type Clock, GameError, GRACE_MS, preparePlayOrder } from "./common.ts";

export { INTRO_MS };
export const AUTO_LEADERBOARD_MS = 5000;
const LEADERBOARD_SIZE = 10;

interface Answer {
  /** Chosen option index; -1 for a typed answer. */
  option: number;
  text?: string;
  correct: boolean;
  points: number;
  msSinceOpen: number;
}

interface Player extends BasePlayer {
  score: number;
  /** On the most recently closed question. */
  lastQuestionPoints: number;
  /** Consecutive correct answers up to the most recently closed question. */
  streak: number;
  answers: (Answer | undefined)[];
}

interface GameOptions {
  clock?: Clock;
  rng?: () => number;
  pacing?: Pacing;
  onChange?: () => void;
  /** A player answered: the hub updates that phone at once and everyone else a moment later. Defaults to onChange. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: ClassicGame) => void;
  shuffle?: ShuffleOptions;
}

export class ClassicGame {
  readonly quiz: Quiz;
  readonly quizId: string;
  readonly title: string;
  /** Play order; fixed (and shuffled if chosen) when the game starts. */
  questions: Question[];
  shuffle: ShuffleOptions;
  readonly runningMode = "classic" as const;

  private readonly source: Question[];
  private readonly session: PacedSession<Player, "lobby" | "leaderboard", Podium<Player, Player, never>, ClassicGame>;
  private batch: { ranked?: (Player & { rank: number })[]; rankById?: Map<string, number> } | null = null;

  constructor(quiz: Quiz, opts: GameOptions = {}) {
    this.quiz = quiz;
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.source = quiz.questions;
    this.questions = preparePlayOrder(quiz.questions, { questions: false, answers: false });
    this.shuffle = opts.shuffle ?? { questions: quiz.settings.shuffleQuestions, answers: quiz.settings.shuffleAnswers };
    this.session = new PacedSession<Player, "lobby" | "leaderboard", Podium<Player, Player, never>, ClassicGame>({
      game: this,
      clock: opts.clock,
      rng: opts.rng,
      initial: "lobby",
      pacing: opts.pacing ?? "manual",
      questions: () => this.questions,
      afterReveal: ["leaderboard"],
      hideAutoCountdown: true,
      settle: () => this.settleQuestion(),
      advance: () => this.afterReveal(),
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium({}) },
      hub: { onChange: opts.onChange, onActivity: opts.onActivity, onFinish: opts.onFinish },
    });
  }

  get phase(): ClassicPhase | "lobby" {
    return this.session.paced.phase;
  }

  get qIndex(): number {
    return this.session.paced.qIndex;
  }

  get pacing(): Pacing {
    return this.session.paced.pacing;
  }

  setup!: LobbyChoices;

  /** The lobby's choices with the pacing as the host left it; the next lobby opens with them. */
  get choices(): LobbyChoices {
    return { ...this.setup, pacing: this.pacing };
  }

  get openedAt(): number {
    return this.session.paced.openedAt;
  }

  /** When the current phase's countdown ends (intro/open), for views; 0 when it has none. */
  get phaseEndsAt(): number {
    return this.session.paced.phases.endsAt;
  }

  get players(): Map<string, Player> {
    return this.session.players;
  }

  get currentQuestion(): Question | null {
    return this.session.paced.currentQuestion;
  }

  /** `avatar` is the player's previous pick (if any); otherwise they get a random one to change in the lobby. */
  join(rawNickname: unknown, avatar?: AvatarChoice | null): Player {
    const player = this.session.addPlayer(rawNickname, avatar, newPlayer);
    this.session.changed();
    return player;
  }

  adoptPlayers(players: Iterable<BasePlayer>): void {
    this.session.adoptPlayers(players, newPlayer);
  }

  byToken(token: unknown): Player | null {
    return this.session.byToken(token);
  }

  /** Change a player's character/accessory; only while waiting in the lobby. */
  setAvatar(playerId: string, avatar: unknown, accessory: unknown): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.phase !== "lobby") throw new GameError("The game has already started");
    const choice = cleanAvatar(avatar, accessory);
    if (!choice) throw new GameError("Unknown avatar");
    p.avatar = choice;
    this.session.changed();
  }

  setConnected(playerId: string, connected: boolean): void {
    this.session.setConnected(playerId, connected);
  }

  kick(playerId: string): Player | null {
    const p = this.session.removePlayer(playerId);
    if (!p) return null;
    this.session.playerLeft();
    return p;
  }

  answer(playerId: string, qIndex: number, answer: AnswerValue): boolean {
    const limitSec = this.currentQuestion?.timeLimitSec ?? 0;
    const taken = this.session.paced.take(this.players.get(playerId), qIndex, answer, (a) => ({
      ...a,
      points: scoreAnswer(a.correct, a.msSinceOpen, limitSec),
    }));
    if (!taken) return false;
    this.session.answered(playerId);
    return true;
  }

  start(pacing?: Pacing): void {
    if (this.phase === "lobby" && this.questions.length === 0) throw new GameError("This quiz has no questions");
    this.session.start(() => {
      if (pacing) this.session.paced.pacing = pacing;
      this.questions = preparePlayOrder(this.source, this.shuffle, this.session.rng);
      this.enterIntro(0);
    });
  }

  setShuffle(opts: ShuffleOptions): void {
    if (this.phase !== "lobby") throw new GameError("Shuffle can only be changed before the game starts");
    this.shuffle = { questions: !!opts.questions, answers: !!opts.answers };
    this.session.changed();
  }

  setPacing(pacing: Pacing): void {
    if (this.phase === "leaderboard") this.session.paced.phases.cancelPhase();
    this.session.setPacing(pacing);
    this.scheduleLeaderboardAuto();
  }

  next(): void {
    switch (this.phase) {
      case "lobby":
        return this.start();
      case "intro":
      case "open":
      case "reveal":
        return this.session.paced.next();
      case "leaderboard":
        return this.enterIntro(this.qIndex + 1);
      case "podium":
        return;
    }
  }

  skip(): void {
    this.session.paced.skip();
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  private enterIntro(index: number): void {
    this.session.paced.intro(index);
  }

  private settleQuestion(): void {
    for (const p of this.players.values()) {
      const ans = p.answers[this.qIndex];
      p.score += ans?.points ?? 0;
      p.lastQuestionPoints = ans?.points ?? 0;
      p.streak = ans?.correct ? p.streak + 1 : 0;
    }
  }

  private afterReveal(): void {
    if (this.qIndex >= this.questions.length - 1) return this.session.end();
    this.session.paced.phases.enter("leaderboard");
    this.scheduleLeaderboardAuto();
    this.session.changed();
  }

  private scheduleLeaderboardAuto(): void {
    // The timer runs behind the scenes: views show no countdown for an auto-paced leaderboard.
    if (this.pacing === "auto" && this.phase === "leaderboard") {
      this.session.paced.phases.set("leaderboard", AUTO_LEADERBOARD_MS, () => this.enterIntro(this.qIndex + 1), { hidden: true });
    }
  }

  ranked(): (Player & { rank: number })[] {
    return rankBy([...this.players.values()], [most((p) => p.score)]);
  }

  /** Per option, who picked it on the current question (fastest first). */
  private answerAvatars(optionCount: number): HostClassicState["answerAvatars"] {
    const picks = [...this.players.values()]
      .map((p) => ({ p, a: p.answers[this.qIndex] }))
      .filter((x): x is { p: Player; a: Answer } => !!x.a)
      .sort((x, y) => x.a.msSinceOpen - y.a.msSinceOpen);
    return Array.from({ length: optionCount }, (_, i) => picks.filter((x) => x.a.option === i).map((x) => x.p.avatar));
  }

  /** Most points first; equal points share a place. Classic gives no awards. */
  private buildPodium(): Podium<Player, Player, never> {
    const players = [...this.players.values()];
    return buildPodium({ entries: players, order: [most((p) => p.score)], players, entryOf: (p) => p, awards: { labels: {}, values: {} } });
  }

  /** The finished game's Podium (GLOSSARY.md), worked out once in Game finish. */
  get podium(): Podium<Player, Player, never> {
    return this.session.podium;
  }

  leaderboard(limit = LEADERBOARD_SIZE): RankedEntry[] {
    const ranked = this.phase === "podium" ? this.podium.places.map((p) => ({ ...p, rank: p.place })) : this.rankedNow();
    return ranked.slice(0, limit).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      rank: p.rank,
      lastQuestionPoints: p.lastQuestionPoints,
      streak: p.streak,
    }));
  }

  /** The most-missed questions: wrong answers only, a question left unanswered doesn't count. */
  errors(): QuestionError[] {
    const wrong = this.questions.map((_, i) => [...this.players.values()].filter((p) => p.answers[i] && !p.answers[i]!.correct).length);
    return topErrors(this.questions, wrong);
  }

  private questionView(): QuestionView | null {
    return this.phase === "lobby" || this.phase === "podium" ? null : this.session.paced.view();
  }

  private get revealed(): boolean {
    return this.session.paced.revealed;
  }

  hostView(): HostClassicState {
    if (this.phase === "lobby") throw new GameError("The game has not started");
    const q = this.currentQuestion;
    const answered = [...this.players.values()].map((p) => p.answers[this.qIndex]).filter((a): a is Answer => !!a);
    const hostPlayer = (p: Player) => ({ id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, connected: p.connected });
    return {
      kind: "classic",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.questions.length },
      pacing: this.pacing,
      players: [...this.players.values()].map(hostPlayer),
      question: this.questionView(),
      correct: this.revealed && q ? q.correct : null,
      answeredCount: answered.length,
      answerCounts: this.revealed && q ? q.options.map((_, i) => answered.filter((a) => a.option === i).length) : null,
      answerAvatars: this.revealed && q ? this.answerAvatars(q.options.length) : null,
      leaderboard: this.leaderboard(),
      errors: this.phase === "podium" ? this.errors() : null,
    };
  }

  viewBatch<T>(build: () => T): T {
    if (this.batch) return build();
    this.batch = {};
    try {
      return build();
    } finally {
      this.batch = null;
    }
  }

  private rankedNow(): (Player & { rank: number })[] {
    return this.batch ? (this.batch.ranked ??= this.ranked()) : this.ranked();
  }

  private rankOf(playerId: string): number {
    // Someone missing from the Podium shows last.
    if (this.phase === "podium") return this.podium.result(playerId)?.place ?? this.players.size;
    if (!this.batch) return this.ranked().find((r) => r.id === playerId)!.rank;
    this.batch.rankById ??= new Map(this.rankedNow().map((r) => [r.id, r.rank]));
    return this.batch.rankById.get(playerId)!;
  }

  playerView(playerId: string): PlayerView {
    const p = this.players.get(playerId);
    if (this.phase === "lobby") throw new GameError("The game has not started");
    if (!p) return { kind: "none", game: { title: this.title, phase: this.phase } };
    const q = this.currentQuestion;
    const ans = this.session.paced.shownAnswer(p);
    return {
      kind: "classic",
      phase: this.phase,
      title: this.title,
      me: { id: p.id, nickname: p.nickname, avatar: p.avatar, score: p.score, rank: this.rankOf(p.id), streak: p.streak },
      playerCount: this.players.size,
      question: this.questionView(),
      myChoice: ans && ans.option >= 0 ? ans.option : null,
      myText: ans?.text ?? null,
      result:
        this.revealed && q
          ? { choice: ans && ans.option >= 0 ? ans.option : null, correct: q.correct, wasCorrect: !!ans?.correct, points: ans?.points ?? 0 }
          : null,
      podium: this.phase === "podium" ? this.leaderboard(5) : null,
    };
  }
}

function newPlayer(base: BasePlayer): Player {
  return { ...base, score: 0, lastQuestionPoints: 0, streak: 0, answers: [] };
}

type ClassicPlayer = ReturnType<ClassicGame["ranked"]>[number];

function classicColumns(game: ClassicGame): Column<ClassicPlayer>[] {
  const columns: Column<ClassicPlayer>[] = [
    { header: "Rank", value: (p) => p.rank },
    { header: "Nickname", value: (p) => p.nickname },
    { header: "Score", value: (p) => p.score },
    { header: "Correct answers", value: (p) => p.answers.filter((a) => a?.correct).length },
  ];
  game.questions.forEach((q, i) => {
    const n = i + 1;
    columns.push(
      {
        header: `Q${n} answer (${q.text})`,
        value: (p) => {
          const a = p.answers[i];
          return a ? ((q.type === "text" ? a.text : q.options[a.option]) ?? "") : "";
        },
      },
      {
        header: `Q${n} correct`,
        value: (p) => {
          const a = p.answers[i];
          return a ? (a.correct ? "yes" : "no") : "no answer";
        },
      },
      { header: `Q${n} points`, value: (p) => p.answers[i]?.points ?? 0 },
      {
        header: `Q${n} time (s)`,
        value: (p) => {
          const a = p.answers[i];
          return a ? (a.msSinceOpen / 1000).toFixed(2) : "";
        },
      },
    );
  });
  return columns;
}

export function buildClassicResults(game: ClassicGame): ResultsSheet {
  return sheet(
    classicColumns(game),
    game.podium.rows.map((r) => ({ ...r.player, rank: r.place })),
  );
}
