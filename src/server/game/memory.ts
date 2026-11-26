import type { AnswerValue } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { HostMemoryState, MemoryAwardKey, MemoryBoardSize, MemoryCardView, MemoryPlayer, PlayerMemoryView } from "../../shared/modes/memory.ts";
import {
  encodeFastestAnswers,
  MEMORY_FACE_COUNT,
  MEMORY_MATCH_RESULT_MS,
  MEMORY_QUESTIONS_PER_PHASE,
  MEMORY_TURN_MS,
  memoryShared,
} from "../../shared/modes/memory.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, preparePlayOrder, shuffle } from "./common.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import type { PacedAnswer } from "./paced-round.ts";
import { PacedSession } from "./paced-session.ts";
import type { Podium } from "./podium.ts";
import { buildPodium, emptyPodium } from "./podium.ts";
import type { BasePlayer } from "./roster.ts";
import { most, rankBy } from "./standings.ts";

interface MemoryParticipant extends BasePlayer {
  answers: (PacedAnswer | undefined)[];
  chips: number;
  pairs: number;
  correct: number;
  totalMs: number;
  correctMs: number;
  revealStarts: number;
  misses: number;
}

interface MemoryOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  onActivity?: (playerId: string) => void;
  onFinish?: (game: MemoryGame) => void;
}

interface Turn {
  id: number;
  playerId: string;
  nickname: string;
  first: number | null;
}

interface Feedback {
  positions: [number, number];
  matched: boolean;
}

const MISS_MS = 2_000;

type MemoryPodium = Podium<MemoryParticipant, MemoryParticipant, MemoryAwardKey>;

const PLACE_ORDER = [most<MemoryParticipant>((p) => p.pairs)];
const SHARED_PLACE_ORDER = [most<MemoryParticipant>((p) => p.correct)];

const MEMORY_AWARD_VALUES: Record<MemoryAwardKey, (p: MemoryParticipant) => number> = {
  fastestAnswers: (p) => (p.correct ? encodeFastestAnswers(p.correctMs / p.correct) : 0),
  mostCorrect: (p) => p.correct,
  worstFlipper: (p) => p.misses,
};

export class MemoryGame {
  readonly runningMode: "memory" = "memory";
  private readonly session: PacedSession<MemoryParticipant, "turn" | "feedback", MemoryPodium, MemoryGame>;
  private readonly questions: Question[] = [];
  private readonly boardSize: MemoryBoardSize;
  private readonly board: (number | null)[];
  private turnOrder: string[] = [];
  private nextInOrder = 0;
  private turnId = 0;
  private turn: Turn | null = null;
  private feedback: Feedback | null = null;

  constructor(
    private readonly lobby: LobbyFacts<"memory">,
    options: MemoryOptions = {},
  ) {
    if (lobby.quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.session = new PacedSession<MemoryParticipant, "turn" | "feedback", MemoryPodium, MemoryGame>({
      game: this,
      clock: options.clock,
      rng: options.rng,
      initial: "intro",
      pacing: lobby.pacing,
      questions: () => this.questions,
      settle: () => {},
      advance: () => this.afterQuestion(),
      cleanup: () => {
        this.turn = null;
        this.feedback = null;
      },
      podium: { build: () => this.buildPodium(), empty: () => emptyPodium(memoryShared.awards) },
      hub: { onChange: options.onChange, onActivity: options.onActivity, onFinish: options.onFinish },
    });
    this.boardSize = lobby.settings.boardSize;
    const pairCount = this.boardSize ** 2 / 2;
    const faces = Array.from({ length: MEMORY_FACE_COUNT }, (_, face) => face);
    const chosenFaces = pairCount === faces.length ? faces : shuffle(faces, this.session.rng).slice(0, pairCount);
    this.board = shuffle(
      chosenFaces.flatMap((face) => [face, face]),
      this.session.rng,
    );
    this.session.adoptPlayers(lobby.players, newPlayer);
  }

  get quizId(): string {
    return this.lobby.quiz.id;
  }

  get title(): string {
    return this.lobby.quiz.title;
  }

  get players(): Map<string, MemoryParticipant> {
    return this.session.players;
  }

  get choices() {
    return { ...this.lobby.choices, pacing: this.pacing };
  }

  get phase() {
    return this.session.paced.phase;
  }

  get pacing(): Pacing {
    return this.session.paced.pacing;
  }

  start(pacing?: Pacing): void {
    this.session.start(() => {
      if (pacing) this.session.paced.pacing = pacing;
      this.beginQuestion();
    });
  }

  join(nickname: unknown, avatar?: AvatarChoice | null): MemoryParticipant {
    const player = this.session.addPlayer(nickname, avatar, newPlayer);
    this.session.changed();
    return player;
  }

  byToken(token: unknown): MemoryParticipant | null {
    return this.session.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    this.session.setConnected(playerId, connected);
  }

  kick(playerId: string): MemoryParticipant | null {
    const player = this.session.removePlayer(playerId);
    if (!player) return null;
    if (this.phase === "turn" && this.turn?.playerId === playerId) this.nextTurn();
    else this.session.playerLeft();
    return player;
  }

  setPacing(pacing: Pacing): void {
    this.session.setPacing(pacing);
  }

  next(): void {
    this.session.paced.next();
  }

  skip(): void {
    this.session.paced.skip();
  }

  answer(playerId: string, index: number, value: AnswerValue): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    const answer = this.session.paced.take(player, index, value, (accepted) => accepted);
    if (!answer) return false;
    player.totalMs += answer.msSinceOpen;
    if (answer.correct) {
      player.correct++;
      player.correctMs += answer.msSinceOpen;
      player.chips++;
    }
    this.session.answered(playerId);
    return true;
  }

  confirm(playerId: string, turnId: number, step: number, position: unknown): boolean {
    const turn = this.turn;
    if (this.phase !== "turn" || !turn || playerId !== turn.playerId || turnId !== turn.id || this.session.clock.now() >= this.session.paced.phases.endsAt)
      return false;
    const { first } = turn;
    if (step !== (first === null ? 1 : 2) || !this.eligible(position) || first === position) return false;
    if (first === null) {
      turn.first = position;
      this.session.changed();
      return true;
    }
    const player = this.players.get(playerId);
    if (!player) return false;

    player.chips--;
    const matched = this.board[first] === this.board[position];
    if (matched) player.pairs++;
    else player.misses++;
    this.feedback = { matched, positions: [first, position] };
    this.session.paced.phases.set("feedback", matched ? MEMORY_MATCH_RESULT_MS : MISS_MS, () => this.afterFeedback());
    this.session.changed();
    return true;
  }

  end(): void {
    this.session.end();
  }

  dispose(): void {
    this.session.dispose();
  }

  private beginQuestion(): void {
    const index = this.session.paced.qIndex + 1;
    if (index === this.questions.length) {
      for (const question of preparePlayOrder(this.lobby.quiz.questions, this.lobby.shuffle, this.session.rng)) this.questions.push(question);
    }
    this.session.paced.intro(index);
  }

  private get revealTurnsNext(): boolean {
    return this.phase === "reveal" && (this.session.paced.qIndex + 1) % MEMORY_QUESTIONS_PER_PHASE === 0 && [...this.players.values()].some((p) => p.chips > 0);
  }

  private afterQuestion(): void {
    if (this.revealTurnsNext) {
      this.beginRevealPhase();
    } else {
      this.beginQuestion();
    }
  }

  private beginRevealPhase(): void {
    const end = this.session.paced.qIndex + 1;
    const order = [...this.players.values()]
      .map((player, joinOrder): RevealCandidate => {
        const answers = player.answers.slice(end - MEMORY_QUESTIONS_PER_PHASE, end);
        const correctMs = answers.reduce((total, answer) => total + (answer?.correct ? answer.msSinceOpen : 0), 0);
        return { player, averageMs: correctMs / player.chips, joinOrder };
      })
      .filter(({ player }) => player.chips > 0)
      .sort(fastestAverageThenFewestStartsThenJoinOrder);
    order[0]!.player.revealStarts++;
    this.turnOrder = order.map(({ player }) => player.id);
    this.nextInOrder = 0;
    this.nextTurn();
  }

  private nextTurn(): void {
    this.turn = null;
    for (let i = 0; i < this.turnOrder.length; i++) {
      const player = this.players.get(this.turnOrder[this.nextInOrder]!);
      this.nextInOrder = (this.nextInOrder + 1) % this.turnOrder.length;
      if (!player?.chips) continue;
      this.turn = { id: ++this.turnId, playerId: player.id, nickname: player.nickname, first: null };
      this.session.paced.phases.set("turn", MEMORY_TURN_MS, () => {
        player.chips--;
        this.nextTurn();
      });
      this.session.changed();
      return;
    }
    this.beginQuestion();
  }

  private afterFeedback(): void {
    const feedback = this.feedback!;
    this.feedback = null;
    if (feedback.matched) {
      for (const position of feedback.positions) this.board[position] = null;
      if (this.board.every((face) => face === null)) {
        this.end();
        return;
      }
    }
    this.nextTurn();
  }

  private eligible(position: unknown): position is number {
    return typeof position === "number" && Number.isInteger(position) && this.board[position] != null;
  }

  /** why: places come from matched pairs alone; correct answers only order players who share a place. */
  private buildPodium(): MemoryPodium {
    const players = [...this.players.values()];
    return buildPodium({
      entries: players,
      order: PLACE_ORDER,
      then: SHARED_PLACE_ORDER,
      players,
      entryOf: (p) => p,
      awards: { labels: memoryShared.awards, values: MEMORY_AWARD_VALUES },
    });
  }

  get podium(): MemoryPodium {
    return this.session.podium;
  }

  private questionView() {
    return this.phase === "intro" || this.phase === "open" || this.phase === "reveal" ? this.session.paced.view() : null;
  }

  hostView(): HostMemoryState {
    const quiz = this.lobby.quiz;
    const question = this.questionView();
    const answers = [...this.players.values()].flatMap((p) => {
      const answer = this.session.paced.shownAnswer(p);
      return answer ? [answer] : [];
    });
    const revealed = this.phase === "reveal";
    return {
      kind: "memory",
      phase: this.phase,
      quiz: { id: quiz.id, title: quiz.title, questionCount: quiz.questions.length },
      pacing: this.pacing,
      question,
      correct: revealed ? (this.session.paced.currentQuestion?.correct ?? null) : null,
      answeredCount: answers.length,
      revealTurnsNext: this.revealTurnsNext,
      answerCounts: revealed && question ? question.options.map((_, i) => answers.filter((a) => a.option === i).length) : null,
      players: rankBy([...this.players.values()], PLACE_ORDER, SHARED_PLACE_ORDER).map((p) => ({ ...playerView(p), connected: p.connected })),
      awards: this.phase === "podium" ? this.podium.awards : null,
      podium: this.phase === "podium" ? this.podium.rows.map((r) => ({ place: r.place, player: playerView(r.player) })) : null,
      boardSize: this.boardSize,
      board: this.boardView(),
      turn: this.turn && { id: this.turn.id, playerId: this.turn.playerId, nickname: this.turn.nickname },
      feedback: this.feedback ? { matched: this.feedback.matched } : null,
      phaseRemainingMs: this.session.paced.phases.remainingMs(),
    };
  }

  private boardView(): MemoryCardView[] {
    return this.board.map((face, position) => {
      if (face === null) return { state: "empty" };
      if (this.turn?.first === position || this.feedback?.positions.includes(position)) return { state: "up", face };
      return { state: "down" };
    });
  }

  playerView(id: string): PlayerMemoryView | null {
    const player = this.players.get(id);
    if (!player) return null;
    const answer = this.session.paced.shownAnswer(player);
    const choice = answer && answer.option >= 0 ? answer.option : null;
    const correct = this.phase === "reveal" ? this.session.paced.currentQuestion?.correct : null;
    const turn = this.turn?.playerId === id ? this.turn : null;
    return {
      kind: "memory",
      phase: this.phase,
      title: this.lobby.quiz.title,
      me: playerView(player),
      question: this.questionView(),
      myChoice: choice,
      myText: answer?.text ?? null,
      reveal: correct ? { choice, correct, wasCorrect: !!answer?.correct } : null,
      boardSize: this.boardSize,
      turn: turn
        ? {
            id: turn.id,
            board: this.boardView(),
            ...(this.phase === "feedback" && this.feedback
              ? { stage: "feedback", matched: this.feedback.matched }
              : { stage: "picking", step: turn.first === null ? 1 : 2 }),
          }
        : null,
      phaseRemainingMs: this.session.paced.phases.remainingMs(),
      result: this.phase === "podium" ? this.podium.result(id) : null,
    };
  }
}

interface RevealCandidate {
  player: MemoryParticipant;
  averageMs: number;
  joinOrder: number;
}

function fastestAverageThenFewestStartsThenJoinOrder(a: RevealCandidate, b: RevealCandidate): number {
  return a.averageMs - b.averageMs || a.player.revealStarts - b.player.revealStarts || a.joinOrder - b.joinOrder;
}

function newPlayer(base: BasePlayer): MemoryParticipant {
  return { ...base, answers: [], chips: 0, pairs: 0, correct: 0, totalMs: 0, correctMs: 0, revealStarts: 0, misses: 0 };
}

function playerView({ id, nickname, avatar, chips, pairs }: MemoryParticipant): MemoryPlayer {
  return { id, nickname, avatar, chips, pairs };
}
