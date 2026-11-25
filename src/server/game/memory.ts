import type { AnswerValue } from "../../shared/answer-match.ts";
import type { AvatarChoice } from "../../shared/avatars.ts";
import { randomAvatar } from "../../shared/avatars.ts";
import type { Pacing } from "../../shared/mode-views.ts";
import type { HostMemoryState, MemoryBoardSize, MemoryCardView, MemoryPlayer, PlayerMemoryView } from "../../shared/modes/memory.ts";
import { MEMORY_FACE_COUNT, MEMORY_QUESTIONS_PER_PHASE, MEMORY_TURN_MS } from "../../shared/modes/memory.ts";
import type { Question } from "../../shared/quiz-schema.ts";
import type { Clock } from "./common.ts";
import { GameError, preparePlayOrder, realClock, shuffle } from "./common.ts";
import type { LobbyFacts } from "./lobby-facts.ts";
import type { PacedAnswer } from "./paced-round.ts";
import { PacedRound } from "./paced-round.ts";
import { GameFinish } from "./phase-timer.ts";
import type { BasePlayer } from "./roster.ts";
import { Roster } from "./roster.ts";
import { most, rankBy } from "./standings.ts";

interface MemoryParticipant extends BasePlayer {
  answers: (PacedAnswer | undefined)[];
  chips: number;
  pairs: number;
  correct: number;
  totalMs: number;
  revealStarts: number;
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

const MATCH_MS = 1_000;
const MISS_MS = 2_000;

export class MemoryGame {
  readonly runningMode: "memory" = "memory";
  private readonly roster = new Roster<MemoryParticipant>();
  private readonly clock: Clock;
  private readonly rng: () => number;
  private readonly paced: PacedRound<"turn" | "feedback" | "podium">;
  private readonly questions: Question[] = [];
  private readonly boardSize: MemoryBoardSize;
  private readonly board: (number | null)[];
  private readonly onChange: () => void;
  private readonly onActivity: (id: string) => void;
  private readonly onFinish: (game: MemoryGame) => void;
  private readonly gameFinish: GameFinish<MemoryGame["phase"]>;
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
    this.clock = options.clock ?? realClock;
    this.rng = options.rng ?? Math.random;
    this.onChange = options.onChange ?? (() => {});
    this.onActivity = options.onActivity ?? this.onChange;
    this.onFinish = options.onFinish ?? (() => {});
    this.boardSize = lobby.settings.boardSize;
    const pairCount = this.boardSize ** 2 / 2;
    const faces = Array.from({ length: MEMORY_FACE_COUNT }, (_, face) => face);
    const chosenFaces = pairCount === faces.length ? faces : shuffle(faces, this.rng).slice(0, pairCount);
    this.board = shuffle(
      chosenFaces.flatMap((face) => [face, face]),
      this.rng,
    );
    this.roster.adoptFrom(lobby.players, newPlayer);
    this.paced = new PacedRound<"turn" | "feedback" | "podium">(this.clock, {
      initial: "intro",
      pacing: lobby.pacing,
      questions: () => this.questions,
      asked: () => this.players.values(),
      settle: () => {},
      advance: () => this.afterQuestion(),
      onChange: this.onChange,
    });
    this.gameFinish = new GameFinish(this.paced.phases, "podium", {
      cleanup: () => {
        this.turn = null;
        this.feedback = null;
      },
      onFinish: () => this.onFinish(this),
      onChange: () => this.onChange(),
    });
  }

  get quizId(): string {
    return this.lobby.quiz.id;
  }

  get title(): string {
    return this.lobby.quiz.title;
  }

  get players(): Map<string, MemoryParticipant> {
    return this.roster.players;
  }

  get choices() {
    return { ...this.lobby.choices, pacing: this.pacing };
  }

  get phase() {
    return this.paced.phase;
  }

  get pacing(): Pacing {
    return this.paced.pacing;
  }

  start(pacing?: Pacing): void {
    if (this.paced.qIndex >= 0) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (pacing) this.paced.pacing = pacing;
    this.beginQuestion();
  }

  join(nickname: unknown, avatar?: AvatarChoice | null): MemoryParticipant {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(nickname, avatar ?? randomAvatar(this.rng), newPlayer);
    this.onChange();
    return player;
  }

  byToken(token: unknown): MemoryParticipant | null {
    return this.roster.byToken(token);
  }

  setConnected(playerId: string, connected: boolean): void {
    if (!this.roster.setConnected(playerId, connected)) return;
    if (connected || !this.paced.closeIfAllAnswered()) this.onChange();
  }

  kick(playerId: string): MemoryParticipant | null {
    const player = this.roster.remove(playerId);
    if (!player) return null;
    if (this.phase === "turn" && this.turn?.playerId === playerId) this.nextTurn();
    else if (!this.paced.closeIfAllAnswered()) this.onChange();
    return player;
  }

  setPacing(pacing: Pacing): void {
    this.paced.setPacing(pacing);
    this.onChange();
  }

  next(): void {
    this.paced.next();
  }

  skip(): void {
    this.paced.skip();
  }

  answer(playerId: string, index: number, value: AnswerValue): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    const answer = this.paced.take(player, index, value, (accepted) => accepted);
    if (!answer) return false;
    player.totalMs += answer.msSinceOpen;
    if (answer.correct) {
      player.correct++;
      player.chips++;
    }
    if (!this.paced.closeIfAllAnswered()) this.onActivity(playerId);
    return true;
  }

  confirm(playerId: string, turnId: number, step: number, position: unknown): boolean {
    const turn = this.turn;
    if (this.phase !== "turn" || !turn || playerId !== turn.playerId || turnId !== turn.id || this.clock.now() >= this.paced.phases.endsAt) return false;
    const { first } = turn;
    if (step !== (first === null ? 1 : 2) || !this.eligible(position) || first === position) return false;
    if (first === null) {
      turn.first = position;
      this.onChange();
      return true;
    }
    const player = this.players.get(playerId);
    if (!player) return false;

    player.chips--;
    const matched = this.board[first] === this.board[position];
    if (matched) player.pairs++;
    this.feedback = { matched, positions: [first, position] };
    this.paced.phases.set("feedback", matched ? MATCH_MS : MISS_MS, () => this.afterFeedback());
    this.onChange();
    return true;
  }

  end(): void {
    this.gameFinish.finish();
  }

  dispose(): void {
    this.paced.phases.dispose();
  }

  private beginQuestion(): void {
    const index = this.paced.qIndex + 1;
    if (index === this.questions.length) {
      for (const question of preparePlayOrder(this.lobby.quiz.questions, this.lobby.shuffle, this.rng)) this.questions.push(question);
    }
    this.paced.intro(index);
  }

  private get revealTurnsNext(): boolean {
    return this.phase === "reveal" && (this.paced.qIndex + 1) % MEMORY_QUESTIONS_PER_PHASE === 0 && [...this.players.values()].some((p) => p.chips > 0);
  }

  private afterQuestion(): void {
    if (this.revealTurnsNext) {
      this.beginRevealPhase();
    } else {
      this.beginQuestion();
    }
  }

  private beginRevealPhase(): void {
    const end = this.paced.qIndex + 1;
    const order = [...this.players.values()]
      .filter((player) => player.chips > 0)
      .map((player) => {
        const answers = player.answers.slice(end - MEMORY_QUESTIONS_PER_PHASE, end);
        const correctMs = answers.reduce((total, answer) => total + (answer?.correct ? answer.msSinceOpen : 0), 0);
        return { player, averageMs: correctMs / player.chips };
      })
      // The roster starts in join order, which a stable sort preserves for remaining ties.
      .sort((a, b) => a.averageMs - b.averageMs || a.player.revealStarts - b.player.revealStarts);
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
      this.paced.phases.set("turn", MEMORY_TURN_MS, () => {
        player.chips--;
        this.nextTurn();
      });
      this.onChange();
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

  ranked() {
    return rankBy([...this.players.values()], [most((p) => p.pairs)]);
  }

  private questionView() {
    return this.phase === "intro" || this.phase === "open" || this.phase === "reveal" ? this.paced.view() : null;
  }

  hostView(): HostMemoryState {
    const quiz = this.lobby.quiz;
    const question = this.questionView();
    const answers = [...this.players.values()].flatMap((p) => {
      const answer = this.paced.shownAnswer(p);
      return answer ? [answer] : [];
    });
    const revealed = this.phase === "reveal";
    return {
      kind: "memory",
      phase: this.phase,
      quiz: { id: quiz.id, title: quiz.title, questionCount: quiz.questions.length },
      pacing: this.pacing,
      question,
      correct: revealed ? (this.paced.currentQuestion?.correct ?? null) : null,
      answeredCount: answers.length,
      revealTurnsNext: this.revealTurnsNext,
      answerCounts: revealed && question ? question.options.map((_, i) => answers.filter((a) => a.option === i).length) : null,
      players: this.ranked().map((p) => ({ ...playerView(p), connected: p.connected, rank: p.rank })),
      boardSize: this.boardSize,
      board: this.boardView(),
      turn: this.turn && { id: this.turn.id, playerId: this.turn.playerId, nickname: this.turn.nickname },
      feedback: this.feedback ? { matched: this.feedback.matched } : null,
      phaseRemainingMs: this.paced.phases.remainingMs(),
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
    const answer = this.paced.shownAnswer(player);
    const choice = answer && answer.option >= 0 ? answer.option : null;
    const correct = this.phase === "reveal" ? this.paced.currentQuestion?.correct : null;
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
      turn: turn ? { id: turn.id, step: this.phase === "feedback" ? null : turn.first === null ? 1 : 2, board: this.boardView() } : null,
      phaseRemainingMs: this.paced.phases.remainingMs(),
      result: this.phase === "podium" ? { rank: this.ranked().find((p) => p.id === id)!.rank, playerCount: this.players.size } : null,
    };
  }
}

function newPlayer(base: BasePlayer): MemoryParticipant {
  return { ...base, answers: [], chips: 0, pairs: 0, correct: 0, totalMs: 0, revealStarts: 0 };
}

function playerView({ id, nickname, avatar, chips, pairs }: MemoryParticipant): MemoryPlayer {
  return { id, nickname, avatar, chips, pairs };
}
