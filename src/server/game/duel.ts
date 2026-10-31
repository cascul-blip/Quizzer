import type {
  DuelArena,
  DuelArenaResult,
  DuelAwards,
  DuelPhase,
  DuelPlayerRef,
  DuelRound,
  HostDuelPlayer,
  HostDuelState,
  Pacing,
  PlayerDuelView,
  QuestionError,
  QuestionView,
  ShuffleOptions,
  SubAward,
} from "../../shared/protocol.ts";
import { DUEL_DEFAULT_ROUNDS, DUEL_ROUNDS } from "../../shared/protocol.ts";
import { randomAvatar, type AvatarChoice } from "../../shared/avatars.ts";
import { MAX_TYPED_ANSWER, checkAnswer, type AnswerValue } from "../../shared/answer-match.ts";
import type { Question, Quiz } from "../../shared/quiz-schema.ts";
import { arenaOf, climbLadder, duelOutcome, pairArenas } from "../../shared/duel-rules.ts";
import { GameError, realClock, shuffle, topErrors, type Clock } from "./common.ts";
import { AUTO_REVEAL_MS, GRACE_MS, preparePlayOrder, type Game } from "./game.ts";
import { Roster, type BasePlayer } from "./roster.ts";

export { AUTO_REVEAL_MS, GRACE_MS } from "./game.ts";

/** Each round shows the question this long before the options. */
export const INTRO_MS = 3000;

export const AWARD_LONGEST_REIGN = "Longest reign";
export const AWARD_MOST_WINS = "Most wins";
export const AWARD_BIGGEST_CLIMB = "Biggest climb";

export interface DuelAnswer {
  /** Chosen option index; -1 for a typed answer. */
  option: number;
  text?: string;
  correct: boolean;
  /** From the question opening. */
  ms: number;
}

export interface DuelPlayer extends BasePlayer {
  /** By round slot (round − 1). */
  answers: (DuelAnswer | undefined)[];
  wins: number;
  losses: number;
  draws: number;
  /** Counted when a round closes, for duelists only. */
  correct: number;
  /** Answered wrong; a round left unanswered is not counted. */
  wrong: number;
  /** Rounds won in Arena 1. */
  reign: number;
  /** Arena of the first round they played; 0 until they have one. */
  startArena: number;
}

interface DuelOptions {
  clock?: Clock;
  rng?: () => number;
  onChange?: () => void;
  /** One player answered: they need their own view at once, everyone else can wait a moment. */
  onActivity?: (playerId: string) => void;
  onFinish?: (game: DuelGame) => void;
}

interface DuelGameSettings {
  shuffle: ShuffleOptions;
  rounds?: number;
  pacing?: Pacing;
}

/**
 * Showdown: every round one shared question, and every arena of the ladder duels on it at once
 * (intro → open → reveal), then the podium after the last round. The ladder order is the ranking.
 */
export class DuelGame {
  readonly quizId: string;
  readonly title: string;
  readonly rounds: number;
  /** One question per round slot: the quiz's play order, repeated in fresh cycles. */
  readonly questions: Question[];
  readonly roster = new Roster<DuelPlayer>();
  phase: DuelPhase = "intro";
  /** Current round slot (round − 1); -1 before the start. */
  qIndex = -1;
  pacing: Pacing;
  /** Player ids, top of the ladder first. */
  ladder: string[] = [];
  /** This round's arenas (player ids), fixed when the round starts; kicked players are taken out. */
  arenas: string[][] = [];
  lastRound: DuelRound | null = null;
  /** Rounds played to the end. */
  played = 0;
  openedAt = 0;
  /** When the current phase's countdown ends; 0 when it has none. */
  phaseEndsAt = 0;
  phaseDurationMs = 0;

  private readonly source: Question[];
  /** Index into the quiz's questions for each slot. */
  private readonly slotSource: number[];
  private readonly clock: Clock;
  private readonly rng: () => number;
  private timer: unknown = null;
  private readonly onChange: () => void;
  private readonly onActivity: (playerId: string) => void;
  private readonly onFinish: (game: DuelGame) => void;

  constructor(quiz: Quiz, settings: DuelGameSettings, opts: DuelOptions = {}) {
    if (quiz.questions.length === 0) throw new GameError("This quiz has no questions");
    this.quizId = quiz.id;
    this.title = quiz.title;
    this.clock = opts.clock ?? realClock;
    this.rng = opts.rng ?? Math.random;
    const rounds = settings.rounds ?? DUEL_DEFAULT_ROUNDS;
    this.rounds = (DUEL_ROUNDS as readonly number[]).includes(rounds) ? rounds : DUEL_DEFAULT_ROUNDS;
    this.source = quiz.questions;
    const sourceIndex = new Map(quiz.questions.map((q, i) => [q.id, i]));
    this.questions = [];
    this.slotSource = [];
    while (this.questions.length < this.rounds) {
      for (const q of preparePlayOrder(quiz.questions, settings.shuffle, this.rng)) {
        if (this.questions.length >= this.rounds) break;
        this.questions.push(q);
        this.slotSource.push(sourceIndex.get(q.id) ?? 0);
      }
    }
    this.pacing = settings.pacing ?? "manual";
    this.onChange = opts.onChange ?? (() => {});
    this.onActivity = opts.onActivity ?? (() => this.onChange());
    this.onFinish = opts.onFinish ?? (() => {});
  }

  /** Take over a lobby's players (same ids and tokens), its rounds, shuffle choices and pacing. */
  static fromLobby(lobby: Game, opts: DuelOptions = {}): DuelGame {
    const game = new DuelGame(lobby.quiz, { shuffle: lobby.shuffle, rounds: lobby.duel.rounds, pacing: lobby.pacing }, opts);
    for (const p of lobby.players.values()) {
      game.roster.adopt(game.newPlayer({ id: p.id, nickname: p.nickname, token: p.token, connected: p.connected, avatar: p.avatar }));
    }
    return game;
  }

  get players(): Map<string, DuelPlayer> {
    return this.roster.players;
  }

  get currentQuestion(): Question | null {
    return this.questions[this.qIndex] ?? null;
  }

  get round(): number {
    return this.qIndex + 1;
  }

  private newPlayer(base: BasePlayer): DuelPlayer {
    return { ...base, answers: [], wins: 0, losses: 0, draws: 0, correct: 0, wrong: 0, reign: 0, startArena: 0 };
  }

  /** The arena (index) a player duels in this round, or -1. */
  private arenaIndex(playerId: string): number {
    return this.arenas.findIndex((a) => a.includes(playerId));
  }

  // ---------- players ----------

  /** Late joiners go to the bottom of the ladder and duel from the next round. */
  join(rawNickname: unknown, avatar?: AvatarChoice | null): DuelPlayer {
    if (this.phase === "podium") throw new GameError("This game has finished");
    const player = this.roster.add(rawNickname, avatar ?? randomAvatar(this.rng), (base) => this.newPlayer(base));
    if (this.qIndex >= 0) this.ladder.push(player.id);
    this.onChange();
    return player;
  }

  byToken(token: unknown): DuelPlayer | null {
    return this.roster.byToken(token);
  }

  /** Away players keep their place and count as no answer. */
  setConnected(playerId: string, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    this.onChange();
    if (!connected) this.maybeCloseEarly();
  }

  /** The ladder closes up; an arena left with one duelist ends in "stay". */
  kick(playerId: string): DuelPlayer | null {
    const p = this.roster.remove(playerId);
    if (!p) return null;
    this.ladder = this.ladder.filter((id) => id !== playerId);
    this.arenas = this.arenas.map((a) => a.filter((id) => id !== playerId)).filter((a) => a.length > 0);
    this.onChange();
    this.maybeCloseEarly();
    return p;
  }

  // ---------- player actions ----------

  /** One answer per duelist per round. Returns whether it was accepted. */
  answer(playerId: string, qIndex: number, answer: AnswerValue): boolean {
    const p = this.players.get(playerId);
    const q = this.currentQuestion;
    if (!p || !q || this.phase !== "open" || qIndex !== this.qIndex) return false;
    if (p.answers[qIndex] || this.arenaIndex(playerId) < 0) return false;
    const correct = checkAnswer(q, answer);
    if (correct === null) return false;
    const now = this.clock.now();
    if (now > this.phaseEndsAt + GRACE_MS) return false;
    p.answers[qIndex] = {
      ...(typeof answer === "string" ? { option: -1, text: answer.slice(0, MAX_TYPED_ANSWER) } : { option: answer }),
      correct,
      ms: Math.max(0, now - this.openedAt),
    };
    if (!this.maybeCloseEarly()) this.onActivity(p.id);
    return true;
  }

  // ---------- host controls ----------

  start(pacing?: Pacing): void {
    if (this.qIndex >= 0) throw new GameError("The game has already started");
    if (this.players.size === 0) throw new GameError("Wait for at least one player to join");
    if (pacing) this.pacing = pacing;
    this.ladder = shuffle([...this.players.keys()], this.rng);
    this.beginRound(0);
  }

  setPacing(pacing: Pacing): void {
    this.pacing = pacing;
    if (this.phase === "reveal") {
      this.clearTimer();
      this.scheduleAuto();
    }
    this.onChange();
  }

  /** Advance to whatever comes next from the current phase. */
  next(): void {
    switch (this.phase) {
      case "intro":
        return this.openQuestion();
      case "open":
        return this.closeQuestion();
      case "reveal":
        return this.afterReveal();
      case "podium":
        return;
    }
  }

  /** Cut the current countdown short: straight to the options, or close the question. */
  skip(): void {
    if (this.phase === "intro") this.openQuestion();
    else if (this.phase === "open") this.closeQuestion();
  }

  /** Host ends the game now. An open round is settled first; a round that hadn't opened yet is dropped. */
  end(): void {
    if (this.phase === "podium") return;
    if (this.phase === "open") this.closeQuestion();
    this.finish();
  }

  dispose(): void {
    this.clearTimer();
  }

  // ---------- state machine ----------

  private setPhase(phase: DuelPhase, ms: number, then: (() => void) | null, graceMs = 0): void {
    this.clearTimer();
    this.phase = phase;
    this.phaseDurationMs = ms;
    this.phaseEndsAt = ms > 0 ? this.clock.now() + ms : 0;
    if (then) {
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        then();
      }, ms + graceMs);
    }
  }

  private beginRound(index: number): void {
    this.qIndex = index;
    this.arenas = pairArenas(this.ladder);
    this.arenas.forEach((arena, k) => {
      for (const id of arena) {
        const p = this.players.get(id);
        if (p && !p.startArena) p.startArena = k + 1;
      }
    });
    this.setPhase("intro", INTRO_MS, () => this.openQuestion());
    this.onChange();
  }

  private openQuestion(): void {
    const q = this.currentQuestion;
    if (this.phase !== "intro" || !q) return;
    this.openedAt = this.clock.now();
    this.setPhase("open", q.timeLimitSec * 1000, () => this.closeQuestion(), GRACE_MS);
    this.onChange();
  }

  /** Close as soon as every connected duelist has answered. Returns whether it closed. */
  private maybeCloseEarly(): boolean {
    if (this.phase !== "open") return false;
    const duelists = this.arenas.flat().map((id) => this.players.get(id)!).filter((p) => p.connected);
    if (duelists.length === 0 || !duelists.every((p) => p.answers[this.qIndex])) return false;
    this.closeQuestion();
    return true;
  }

  private closeQuestion(): void {
    if (this.phase !== "open") return;
    const slot = this.qIndex;
    const results = this.arenas.map((arena) => {
      const answers = arena.map((id) => this.players.get(id)!.answers[slot]);
      return duelOutcome(answers.map((a) => ({ correct: a ? a.correct : null, ms: a ? a.ms : null })));
    });
    this.ladder = climbLadder(
      this.ladder,
      this.arenas,
      results.map((r) => r.outcomes),
    );
    const next = arenaOf(this.ladder);
    const arenas: DuelArenaResult[] = this.arenas.map((arena, k) => {
      const { outcomes, draw } = results[k]!;
      return {
        arena: k + 1,
        draw,
        duelists: arena.map((id, i) => {
          const p = this.players.get(id)!;
          const a = p.answers[slot];
          const outcome = outcomes[i]!;
          if (a?.correct) p.correct++;
          else if (a) p.wrong++;
          if (outcome === "win") p.wins++;
          if (outcome === "lose") p.losses++;
          if (draw) p.draws++;
          if (outcome === "win" && k === 0) p.reign++;
          return { ...ref(p), correct: a ? a.correct : null, ms: a ? a.ms : null, outcome, nextArena: next.get(id) ?? 0 };
        }),
      };
    });
    this.played++;
    this.lastRound = { round: slot + 1, arenas };
    this.phase = "reveal";
    this.scheduleAuto();
    this.onChange();
  }

  private afterReveal(): void {
    if (this.phase !== "reveal") return;
    if (this.qIndex >= this.rounds - 1) return this.finish();
    this.beginRound(this.qIndex + 1);
  }

  private finish(): void {
    if (this.phase === "podium") return;
    this.setPhase("podium", 0, null);
    this.arenas = [];
    this.onFinish(this);
    this.onChange();
  }

  /** The reveal waits for the host, or moves on by itself with auto pacing. */
  private scheduleAuto(): void {
    if (this.phase !== "reveal") return;
    if (this.pacing === "auto") this.setPhase("reveal", AUTO_REVEAL_MS, () => this.afterReveal());
    else this.setPhase("reveal", 0, null);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  // ---------- results ----------

  /** Players in ladder order (rank 1 first). */
  ranked(): DuelPlayer[] {
    return this.ladder.map((id) => this.players.get(id)).filter((p): p is DuelPlayer => !!p);
  }

  /** Arena per player id on the current ladder (next round's arena during the reveal; the final one at the podium). */
  ladderArenas(): Map<string, number> {
    return arenaOf(this.ladder);
  }

  /** Arena climbed from the start to the current ladder; 0 for someone who never duelled. */
  climb(p: DuelPlayer, arenas = this.ladderArenas()): number {
    return p.startArena ? p.startArena - (arenas.get(p.id) ?? p.startArena) : 0;
  }

  awards(): DuelAwards {
    const players = this.ranked();
    const arenas = this.ladderArenas();
    const best = (value: (p: DuelPlayer) => number): SubAward | null => {
      const top = Math.max(0, ...players.map(value));
      return top > 0 ? { value: top, nicknames: players.filter((p) => value(p) === top).map((p) => p.nickname) } : null;
    };
    return { longestReign: best((p) => p.reign), mostWins: best((p) => p.wins), biggestClimb: best((p) => this.climb(p, arenas)) };
  }

  /** The most-missed questions (counted per quiz question, over every round it was asked); unanswered doesn't count. */
  errors(): QuestionError[] {
    const wrong = this.source.map(() => 0);
    this.questions.forEach((_, slot) => {
      for (const p of this.players.values()) if (p.answers[slot] && !p.answers[slot]!.correct) wrong[this.slotSource[slot]!]!++;
    });
    return topErrors(this.source, wrong);
  }

  // ---------- views ----------

  private remainingMs(): number {
    return this.phaseEndsAt ? Math.max(0, this.phaseEndsAt - this.clock.now()) : 0;
  }

  private questionView(): QuestionView | null {
    const q = this.currentQuestion;
    if (!q || this.phase === "podium") return null;
    return {
      index: this.qIndex,
      total: this.rounds,
      type: q.type,
      text: q.text,
      ...(q.image ? { image: q.image } : {}),
      timeLimitSec: q.timeLimitSec,
      // A typed question's accepted answers stay hidden until the reveal.
      options: this.phase === "intro" || (q.type === "text" && this.phase !== "reveal") ? [] : q.options,
      ...(q.spots && this.phase !== "intro" ? { spots: q.spots } : {}),
      remainingMs: this.phase === "reveal" ? 0 : this.remainingMs(),
    };
  }

  /** The arena number a player is shown with: this round's while it is being played, else where the ladder puts them. */
  private arenaNow(playerId: string, ladderArenas: Map<string, number>): number {
    if (this.phase === "intro" || this.phase === "open") {
      const i = this.arenaIndex(playerId);
      if (i >= 0) return i + 1;
    }
    return ladderArenas.get(playerId) ?? 0;
  }

  hostView(): HostDuelState {
    const q = this.currentQuestion;
    const podium = this.phase === "podium";
    const answering = this.phase === "open" || this.phase === "reveal";
    const ladderArenas = this.ladderArenas();
    const arenas: DuelArena[] = this.arenas.map((arena, k) => ({
      arena: k + 1,
      duelists: arena.map((id) => {
        const p = this.players.get(id)!;
        return { ...ref(p), connected: p.connected, answered: answering && !!p.answers[this.qIndex] };
      }),
    }));
    const players: HostDuelPlayer[] = this.ranked().map((p, i) => ({
      ...ref(p),
      connected: p.connected,
      arena: this.arenaNow(p.id, ladderArenas),
      rank: i + 1,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      correct: p.correct,
      wrong: p.wrong,
      reign: p.reign,
      startArena: p.startArena || (ladderArenas.get(p.id) ?? 0),
    }));
    return {
      kind: "duel",
      phase: this.phase,
      quiz: { id: this.quizId, title: this.title, questionCount: this.source.length },
      pacing: this.pacing,
      round: Math.max(1, this.round),
      rounds: this.rounds,
      question: this.questionView(),
      arenas,
      answeredCount: answering ? arenas.reduce((n, a) => n + a.duelists.filter((d) => d.answered).length, 0) : 0,
      playerCount: this.players.size,
      correct: this.phase === "reveal" && q ? q.correct : null,
      lastRound: this.lastRound,
      players,
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      awards: podium ? this.awards() : null,
      errors: podium ? this.errors() : null,
      hasResults: podium,
    };
  }

  playerView(playerId: string): PlayerDuelView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const q = this.currentQuestion;
    const ladderArenas = this.ladderArenas();
    const rank = this.ladder.indexOf(p.id) + 1;
    const arenaNow = this.arenaNow(p.id, ladderArenas);
    // This round's arena and opponents (still this round's on the reveal); a late joiner waiting for the next round
    // gets the arena the ladder puts them in and no opponents.
    const k = this.phase === "podium" ? -1 : this.arenaIndex(p.id);
    const arena = k >= 0 ? k + 1 : arenaNow;
    const opponents = k >= 0 ? this.arenas[k]!.filter((id) => id !== p.id).map((id) => ref(this.players.get(id)!)) : [];
    const ans = this.phase === "open" || this.phase === "reveal" ? p.answers[this.qIndex] : undefined;
    const revealed = this.phase === "reveal" && !!q;
    let result: PlayerDuelView["result"] = null;
    if (this.phase === "podium") {
      const aw = this.awards();
      result = {
        rank,
        playerCount: this.players.size,
        awards: [
          ...(aw.longestReign?.nicknames.includes(p.nickname) ? [AWARD_LONGEST_REIGN] : []),
          ...(aw.mostWins?.nicknames.includes(p.nickname) ? [AWARD_MOST_WINS] : []),
          ...(aw.biggestClimb?.nicknames.includes(p.nickname) ? [AWARD_BIGGEST_CLIMB] : []),
        ],
      };
    }
    return {
      kind: "duel",
      phase: this.phase,
      title: this.title,
      me: { ...ref(p), arena: arenaNow, rank, wins: p.wins, losses: p.losses, draws: p.draws, reign: p.reign },
      playerCount: this.players.size,
      round: Math.max(1, this.round),
      rounds: this.rounds,
      question: this.questionView(),
      phaseRemainingMs: this.remainingMs(),
      phaseDurationMs: this.phaseDurationMs,
      arena,
      arenaCount: this.phase === "podium" ? pairArenas(this.ladder).length : this.arenas.length,
      opponents,
      myChoice: ans && ans.option >= 0 ? ans.option : null,
      myText: ans?.text ?? null,
      reveal: revealed ? { choice: ans && ans.option >= 0 ? ans.option : null, correct: q!.correct, wasCorrect: !!ans?.correct, ms: ans?.ms ?? null } : null,
      myDuel: revealed && this.lastRound?.round === this.round ? (this.lastRound.arenas.find((a) => a.duelists.some((d) => d.id === p.id)) ?? null) : null,
      result,
    };
  }
}

function ref(p: DuelPlayer): DuelPlayerRef {
  return { id: p.id, nickname: p.nickname, avatar: p.avatar };
}
