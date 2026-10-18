import { describe, expect, test } from "bun:test";
import { COUNTDOWN_MS, DragonGame, FEEDBACK_MS, FIRE_MIN_BATTLE_LEFT_MS, RUNE_GRACE_MS, type DragonPlayer } from "../src/server/game/dragon.ts";
import { Game } from "../src/server/game/game.ts";
import { WRONG_PENALTY_2_MS } from "../src/server/game/stream.ts";
import { buildDragonResultsCsv } from "../src/server/game/results.ts";
import {
  DRAGON_CHEST_MS,
  DRAGON_FIRE_WARN_MS,
  DRAGON_GRAB_COOLDOWN_MS,
  DRAGON_GRAB_MS,
  DRAGON_HITS_SHOWN,
  DRAGON_JACKPOT_LOCK_MS,
  DRAGON_LOOT_MS,
  DRAGON_LOOT_TABLE,
  DRAGON_RUNE_REVEAL_MS,
  DRAGON_TRANSITION_MS,
  dragonCoinValue,
  dragonFireSec,
  dragonStage,
  type DragonLoot,
  type DragonSettings,
} from "../src/shared/protocol.ts";
import type { Quiz } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

function quiz(count = 5): Quiz {
  return sampleQuiz({
    questions: Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      type: "multiple_choice" as const,
      text: `Question ${i}`,
      timeLimitSec: 20,
      options: ["yes", "no", "maybe"],
      correct: [0],
    })),
  });
}

function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

interface Setup {
  names: string[];
  settings?: Partial<DragonSettings>;
  protect?: boolean;
  questions?: number;
  /** Lobby team per name, applied by dragging (index into names). */
  teams?: number[];
}

function setup({ names, settings = {}, protect = false, questions = 5, teams }: Setup) {
  const clock = new FakeClock();
  let finished = 0;
  const lobby = new Game(quiz(questions), { clock, protect });
  lobby.setMode("dragon");
  lobby.setDragon({ teams: 2, toughness: "normal", battleMinutes: 5, fireSec: 45, scrambleMinutes: 3, ...settings });
  for (const n of names) lobby.join(n);
  if (teams) [...lobby.players.values()].forEach((p, i) => lobby.setTeam(p.id, teams[i]!));
  const game = DragonGame.fromLobby(lobby, { clock, rng: seeded(), onFinish: () => finished++ });
  game.start();
  clock.advance(COUNTDOWN_MS);
  expect(game.phase).toBe("battle");
  return { clock, game, finished: () => finished };
}

const byName = (game: DragonGame, name: string) => [...game.players.values()].find((p) => p.nickname === name)!;

function answer(game: DragonGame, clock: FakeClock, p: DragonPlayer, right: boolean) {
  const cur = p.current!;
  const option = right ? cur.correct[0]! : cur.options.findIndex((_, i) => !cur.correct.includes(i));
  expect(game.answer(p.id, cur.seq, option)).toBe(true);
  clock.advance(FEEDBACK_MS);
}

/** Hit the dragon n times, spread over the players so nobody waits on feedback. */
function hitTimes(game: DragonGame, clock: FakeClock, n: number) {
  const players = [...game.players.values()];
  for (let i = 0; i < n; i++) {
    const p = players[i % players.length]!;
    const cur = p.current!;
    expect(game.answer(p.id, cur.seq, cur.correct[0]!)).toBe(true);
    if (i % players.length === players.length - 1) clock.advance(FEEDBACK_MS);
  }
  clock.advance(FEEDBACK_MS);
}

/** Answer the rune question for these players (right or wrong). */
function rune(game: DragonGame, p: DragonPlayer, right: boolean) {
  const f = game.fire!;
  const option = right ? f.correct[0]! : f.options.findIndex((_, i) => !f.correct.includes(i));
  expect(game.answer(p.id, f.seq, option, true)).toBe(true);
}

/** Slay the dragon outright (sitting out any fire breath) and get to the scramble. */
function toScramble(game: DragonGame, clock: FakeClock) {
  while (game.phase === "battle" || game.phase === "fire") {
    if (game.phase === "fire") clock.advance(game.phaseEndsAt - clock.now() + RUNE_GRACE_MS);
    else hitTimes(game, clock, 1);
  }
  expect(game.phase).toBe("transition");
  clock.advance(DRAGON_TRANSITION_MS);
  expect(game.phase).toBe("scramble");
}

/** Get a player to the chest screen with a correct answer. */
function earnChest(game: DragonGame, clock: FakeClock, p: DragonPlayer) {
  const cur = p.current!;
  expect(game.answer(p.id, cur.seq, cur.correct[0]!)).toBe(true);
  expect(p.state).toBe("chest");
}

function forceLoot(game: DragonGame, ...kinds: DragonLoot[]) {
  game.rollLoot = () => kinds.shift() ?? "bats";
}

describe("Dragon's Hoard lobby", () => {
  test("never more teams than players, and the host can drag names", () => {
    const lobby = new Game(quiz());
    lobby.setMode("dragon");
    lobby.setDragon({ teams: 6, toughness: "normal", battleMinutes: 5, fireSec: 45, scrambleMinutes: 3 });
    lobby.join("A");
    expect(lobby.hostView().teams).toHaveLength(1);
    lobby.join("B");
    lobby.join("C");
    expect(lobby.hostView().teams!.map((t) => t.members.length)).toEqual([1, 1, 1]);
    const c = [...lobby.players.values()][2]!;
    lobby.setTeam(c.id, 0);
    expect(lobby.hostView().teams!.map((t) => t.members.length)).toEqual([2, 1, 0]);
    expect(lobby.playerView(c.id)).toMatchObject({ team: { index: 0 } });
  });

  test("settings are checked", () => {
    const lobby = new Game(quiz());
    lobby.setMode("dragon");
    const ok: DragonSettings = { teams: 2, toughness: "hard", battleMinutes: 7, fireSec: 30, scrambleMinutes: 5 };
    lobby.setDragon(ok);
    expect(lobby.hostView().dragon).toEqual(ok);
    expect(() => lobby.setDragon({ ...ok, teams: 1 })).toThrow("between 2 and 6");
    expect(() => lobby.setDragon({ ...ok, teams: 7 })).toThrow();
    expect(() => lobby.setDragon({ ...ok, toughness: "brutal" as never })).toThrow("toughness");
    expect(() => lobby.setDragon({ ...ok, battleMinutes: 4 })).toThrow("battle");
    expect(() => lobby.setDragon({ ...ok, fireSec: 40 })).toThrow("fire");
    expect(() => lobby.setDragon({ ...ok, scrambleMinutes: 6 })).toThrow("scramble");
  });

  test("a game started with fewer players than teams drops to one team per player", () => {
    const { game } = setup({ names: ["A", "B", "C"], settings: { teams: 6 } });
    expect(game.teams.map((t) => t.name)).toEqual(["Red", "Blue", "Yellow"]);
    expect(new Set([...game.players.values()].map((p) => p.team))).toEqual(new Set([0, 1, 2]));
  });

  test("lobby drags carry over to the game", () => {
    const { game } = setup({ names: ["A", "B", "C", "D"], teams: [1, 1, 0, 1] });
    expect([...game.players.values()].map((p) => p.team)).toEqual([1, 1, 0, 1]);
  });
});

describe("Act 1: the battle", () => {
  test("health is players × hits per player, at least 30", () => {
    expect(setup({ names: ["A", "B", "C"] }).game.maxHealth).toBe(30);
    expect(setup({ names: ["A", "B", "C", "D", "E"] }).game.maxHealth).toBe(50);
    expect(setup({ names: ["A", "B", "C"], settings: { toughness: "hard" } }).game.maxHealth).toBe(45);
    expect(setup({ names: ["A", "B", "C", "D", "E", "F"], settings: { toughness: "easy" } }).game.maxHealth).toBe(36);
    expect(setup({ names: ["A"] }).game.maxHealth).toBe(30);
  });

  test("a correct answer is one hit; a wrong one shows the right answer and does nothing", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    const a = byName(game, "A");
    answer(game, clock, a, true);
    expect(game.health).toBe(29);
    expect(a.hits).toBe(1);
    expect(game.hostView().hits).toMatchObject([{ nickname: "A" }]);
    const cur = a.current!;
    expect(game.answer(a.id, cur.seq, 1)).toBe(true);
    expect(game.health).toBe(29);
    expect(game.playerView(a.id)!.feedback).toMatchObject({ correct: false, answers: ["yes"] });
  });

  test("phones see whole percents and no teams; the projector keeps only the last hits", () => {
    const { game, clock } = setup({ names: ["A", "B", "C", "D", "E", "F"], settings: { toughness: "hard" } });
    expect(game.maxHealth).toBe(90);
    const a = byName(game, "A");
    const view = game.playerView(a.id)!;
    expect(view).toMatchObject({ healthPct: 100, team: null, teamGold: null, stage: 0 });
    // Another player's hit: 89/90 rounds up to 99%.
    answer(game, clock, byName(game, "B"), true);
    expect(game.playerView(a.id)!.healthPct).toBe(99);
    answer(game, clock, byName(game, "C"), true);
    expect(game.playerView(a.id)!.healthPct).toBe(98);
    hitTimes(game, clock, 20);
    expect(game.hostView().hits).toHaveLength(DRAGON_HITS_SHOWN);
  });

  test("each new wounded stage roars and brings the fire breath 10 s sooner", () => {
    expect([0, 1, 2].map((s) => dragonFireSec(45, s))).toEqual([45, 35, 25]);
    expect([0, 1, 2].map((s) => dragonFireSec(30, s))).toEqual([30, 20, 20]);
    expect([30, 20, 19, 10, 9, 0].map((h) => dragonStage(h, 30))).toEqual([0, 0, 1, 1, 2, 2]);
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    clock.advance(5000);
    expect(game.hostView().nextFireMs).toBe(40_000);
    const t0 = clock.now();
    hitTimes(game, clock, 11); // 19/30 < 66%
    expect(game.hostView()).toMatchObject({ stage: 1, maxStage: 1 });
    expect(game.hostView().nextFireMs).toBe(40_000 - (clock.now() - t0) - 10_000);
  });

  test("a late joiner adds their hits and the bar keeps its percentage", () => {
    const { game, clock } = setup({ names: ["A", "B", "C", "D"] });
    expect(game.maxHealth).toBe(40);
    hitTimes(game, clock, 20);
    const e = game.join("E");
    expect(game.maxHealth).toBe(50);
    expect(game.health).toBe(25);
    expect(e.current).not.toBeNull();
  });

  test("slaying the dragon goes to the transition, with the time it took", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    clock.advance(10_000);
    hitTimes(game, clock, 30);
    expect(game.phase).toBe("transition");
    expect(game.slain).toBe(true);
    expect(game.slainMs).toBeGreaterThanOrEqual(10_000);
    const a = byName(game, "A");
    expect(game.playerView(a.id)).toMatchObject({ team: { index: a.team }, teamGold: 0, question: null });
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
    clock.advance(DRAGON_TRANSITION_MS);
    expect(game.phase).toBe("scramble");
    expect(game.jackpot).toBe(130);
  });

  test("when the battle clock runs out the dragon escapes, and coin chests pay half", () => {
    expect(dragonCoinValue("coins", true)).toBe(13);
    expect(dragonCoinValue("bigPile", true)).toBe(30);
    const { game, clock } = setup({ names: ["A", "B", "C"], settings: { battleMinutes: 3, fireSec: 60 } });
    // Rune rounds play out; let them run with nobody answering.
    for (let i = 0; i < 400 && game.phase !== "transition"; i++) clock.advance(1000);
    expect(game.phase).toBe("transition");
    expect(game).toMatchObject({ slain: false, escaped: true, slainMs: null });
    clock.advance(DRAGON_TRANSITION_MS);
    const a = byName(game, "A");
    forceLoot(game, "coins", "bigPile");
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    expect(game.teams[a.team]!.gold).toBe(13);
    clock.advance(DRAGON_LOOT_MS);
    earnChest(game, clock, a);
    game.chest(a.id, 2);
    expect(game.teams[a.team]!.gold).toBe(43);
  });
});

describe("fire breath", () => {
  test("warning, then the most-missed question for everyone; the shield holds with 2/3 right", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    const [a, b, c] = ["A", "B", "C"].map((n) => byName(game, n)) as [DragonPlayer, DragonPlayer, DragonPlayer];
    // Miss one question twice so it becomes the rune question.
    const missed = a.current!.qIndex;
    answer(game, clock, a, false);
    const bq = b.current!;
    b.deck.unshift(bq.qIndex);
    b.current = { ...bq, qIndex: missed };
    answer(game, clock, b, false);
    hitTimes(game, clock, 3);
    clock.advance(game.hostView().nextFireMs!);
    expect(game.phase).toBe("fire");
    expect(game.fire!.step).toBe("warning");
    expect(game.hostView().fire).toMatchObject({ step: "warning", question: null });
    // Self-paced questions are paused.
    expect(game.answer(c.id, c.current!.seq, 0)).toBe(false);
    expect(game.playerView(c.id)!.question).toBeNull();
    clock.advance(DRAGON_FIRE_WARN_MS);
    expect(game.fire!.step).toBe("question");
    expect(game.fire!.qIndex).toBe(missed);
    expect(game.playerView(c.id)!.fire).toMatchObject({ step: "question", question: { text: `Question ${missed}` } });
    const before = game.health;
    rune(game, a, true);
    expect(game.answer(a.id, game.fire!.seq, 0, true)).toBe(false); // once only
    rune(game, b, true);
    rune(game, c, false);
    // Everyone answered: the round ends early.
    expect(game.fire!.step).toBe("reveal");
    expect(game.hostView().fire).toMatchObject({ right: 2, needed: 2, held: true, amount: 2 });
    expect(game.health).toBe(before - 2);
    expect(game.playerView(c.id)!.fire!.result).toMatchObject({ wasCorrect: false, answers: ["yes"], held: true });
    expect(a.runeRight).toBe(1);
    expect(c.runeWrong).toBe(1);
    clock.advance(DRAGON_RUNE_REVEAL_MS);
    expect(game.phase).toBe("battle");
    // The paused question comes back.
    expect(game.answer(c.id, c.current!.seq, c.current!.correct[0]!)).toBe(true);
  });

  test("fewer than 2/3 right: the fire gets through and the dragon heals 10%, never above full", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    hitTimes(game, clock, 1);
    clock.advance(game.hostView().nextFireMs! + DRAGON_FIRE_WARN_MS);
    rune(game, byName(game, "A"), true);
    clock.advance(20_000 + RUNE_GRACE_MS);
    expect(game.hostView().fire).toMatchObject({ step: "reveal", right: 1, held: false, amount: 1 });
    expect(game.health).toBe(30);
    expect(game.runeFailed).toBe(1);
  });

  test("a disconnected player doesn't count toward the 2/3; a late joiner waits it out", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    clock.advance(45_000);
    expect(game.phase).toBe("fire");
    const late = game.join("Late");
    expect(game.playerView(late.id)).toMatchObject({ state: "waiting", fire: null, question: null });
    clock.advance(DRAGON_FIRE_WARN_MS);
    game.setConnected(byName(game, "C").id, false);
    rune(game, byName(game, "A"), true);
    expect(game.fire!.step).toBe("question");
    rune(game, byName(game, "B"), false);
    // A and B are all that's left to wait for: 1 of 2 isn't 2/3.
    expect(game.hostView().fire).toMatchObject({ step: "reveal", right: 1, needed: 2, held: false });
  });

  test("the same question is never the rune question twice in a row; a random one when nothing was missed", () => {
    const { game, clock } = setup({ names: ["A"], questions: 3 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      clock.advance(game.hostView().nextFireMs! + DRAGON_FIRE_WARN_MS);
      seen.push(game.fire!.qIndex);
      rune(game, byName(game, "A"), false);
      clock.advance(DRAGON_RUNE_REVEAL_MS);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  test("the rune question's time is its own limit, between 10 and 20 s", () => {
    const q = quiz(2);
    q.questions[0]!.timeLimitSec = 5;
    q.questions[1]!.timeLimitSec = 5;
    const clock = new FakeClock();
    const game = new DragonGame(q, { teams: 2, toughness: "normal", battleMinutes: 5, fireSec: 30, scrambleMinutes: 3, shuffleAnswers: false }, { clock });
    game.join("A");
    game.start();
    clock.advance(COUNTDOWN_MS + 30_000 + DRAGON_FIRE_WARN_MS);
    expect(game.phaseDurationMs).toBe(10_000);
  });

  test("no new fire breath right before the battle clock runs out", () => {
    // 3 minutes, a fire every 30 s that takes 7 s when answered at once: the 5th would come 2 s before the end.
    const { game, clock } = setup({ names: ["A"], settings: { battleMinutes: 3, fireSec: 30 } });
    for (let i = 0; i < 4; i++) {
      clock.advance(game.hostView().nextFireMs! + DRAGON_FIRE_WARN_MS);
      rune(game, byName(game, "A"), false);
      clock.advance(DRAGON_RUNE_REVEAL_MS);
    }
    expect(game.hostView().remainingMs).toBe(32_000);
    clock.advance(game.hostView().nextFireMs!);
    expect(game.hostView().remainingMs).toBeLessThan(FIRE_MIN_BATTLE_LEFT_MS);
    expect(game.phase).toBe("battle");
    clock.advance(game.hostView().remainingMs);
    expect(game.phase).toBe("transition");
  });
});

describe("Act 2: the scramble", () => {
  test("a correct answer offers 3 chests; tapping one opens it; time runs out and one opens for you", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"] });
    toScramble(game, clock);
    const a = byName(game, "A");
    forceLoot(game, "coins", "bigPile");
    answer(game, clock, a, false);
    expect(a.state).toBe("question");
    earnChest(game, clock, a);
    expect(game.playerView(a.id)!.chest).toMatchObject({ remainingMs: DRAGON_CHEST_MS + FEEDBACK_MS });
    expect(game.chest(a.id, 3)).toBe(false);
    expect(game.chest(a.id, 1)).toBe(true);
    expect(game.playerView(a.id)).toMatchObject({ state: "loot", loot: { kind: "coins", gold: 25 }, teamGold: 25 });
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
    clock.advance(DRAGON_LOOT_MS);
    expect(a.state).toBe("question");
    earnChest(game, clock, a);
    clock.advance(DRAGON_CHEST_MS + FEEDBACK_MS);
    expect(game.playerView(a.id)!.loot).toMatchObject({ kind: "bigPile", gold: 60 });
    expect(a.chestsOpened).toBe(2);
    expect(a.goldFound).toBe(85);
    // Teammates see their team's gold; other teams don't.
    for (const p of game.players.values()) expect(game.playerView(p.id)!.teamGold).toBe(p.team === a.team ? 85 : 0);
  });

  test("a lucky charm doubles the next 3 coin chests", () => {
    const { game, clock } = setup({ names: ["A", "B"] });
    toScramble(game, clock);
    const a = byName(game, "A");
    forceLoot(game, "charm", "coins", "bats", "bigPile", "coins", "coins");
    for (let i = 0; i < 6; i++) {
      earnChest(game, clock, a);
      game.chest(a.id, 0);
      clock.advance(DRAGON_LOOT_MS);
    }
    expect(game.teams[a.team]!.gold).toBe(50 + 120 + 50 + 25);
    expect(a.charm).toBe(0);
  });

  test("a trap sends 10% of the team's gold to the Jackpot, which is locked for the first minute", () => {
    const { game, clock } = setup({ names: ["A", "B"] });
    toScramble(game, clock);
    const a = byName(game, "A");
    game.teams[a.team]!.gold = 200;
    forceLoot(game, "trap");
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    expect(game.teams[a.team]!.gold).toBe(180);
    expect(game.jackpot).toBe(120 + 20);
    expect(a.lostToTraps).toBe(20);
    expect(game.hostView().events).toMatchObject([{ kind: "trap", nickname: "A", gold: 20 }]);
    // The real roll: no jackpot before 60 s.
    const real = DragonGame.prototype.rollLoot.bind(game);
    expect(game.hostView().jackpotLocked).toBe(true);
    for (let i = 0; i < 2000; i++) expect(real()).not.toBe("jackpot");
    clock.advance(DRAGON_JACKPOT_LOCK_MS);
    expect(game.hostView().jackpotLocked).toBe(false);
    const counts = new Map<DragonLoot, number>();
    for (let i = 0; i < 20_000; i++) {
      const kind = real();
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const l of DRAGON_LOOT_TABLE) expect(Math.abs((counts.get(l.kind) ?? 0) / 200 - l.chance)).toBeLessThan(2);
  });

  test("the Jackpot chest wins the whole pile, which starts again at 0", () => {
    const { game, clock } = setup({ names: ["A", "B"] });
    toScramble(game, clock);
    const a = byName(game, "A");
    forceLoot(game, "jackpot");
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    expect(game.teams[a.team]!.gold).toBe(120);
    expect(game.jackpot).toBe(0);
    expect(a.jackpots).toBe(1);
    expect(game.hostView().events.at(-1)).toMatchObject({ kind: "jackpot", gold: 120 });
  });

  test("grab: pick another team with gold; it's protected for 5 s; a dragon scale blocks it", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"], settings: { teams: 3 } });
    toScramble(game, clock);
    const [a, b, c] = ["A", "B", "C"].map((n) => byName(game, n)) as [DragonPlayer, DragonPlayer, DragonPlayer];
    game.teams[b.team]!.gold = 200;
    forceLoot(game, "grab25", "grab10", "scale", "grab10");
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    const view = game.playerView(a.id)!;
    expect(view.state).toBe("grab");
    expect(view.grab!.teams.map((t) => [t.index, t.gold])).toEqual([
      [b.team, 200],
      [c.team, 0],
    ]);
    expect(game.grab(a.id, a.team)).toBe(false);
    expect(game.grab(a.id, c.team)).toBe(false); // no gold
    expect(game.grab(a.id, b.team)).toBe(true);
    expect(game.teams[a.team]!.gold).toBe(50);
    expect(game.teams[b.team]!.gold).toBe(150);
    expect(a.goldGrabbed).toBe(50);
    expect(game.hostView().events.at(-1)).toMatchObject({ kind: "grab", nickname: "A", target: b.team, gold: 50 });
    expect(game.playerView(a.id)!.loot).toMatchObject({ kind: "grab25", gold: 50, target: { index: b.team }, blocked: false });
    // C grabs right away: B is protected, pick again.
    earnChest(game, clock, c);
    game.chest(c.id, 0);
    expect(game.playerView(c.id)!.grab!.teams.find((t) => t.index === b.team)!.protectedMs).toBeGreaterThan(0);
    expect(game.grab(c.id, b.team)).toBe(false);
    clock.advance(DRAGON_GRAB_COOLDOWN_MS);
    expect(game.grab(c.id, b.team)).toBe(true);
    expect(game.teams[c.team]!.gold).toBe(15);
    clock.advance(DRAGON_LOOT_MS);
    // B finds a scale; the next grab against B is blocked.
    earnChest(game, clock, b);
    game.chest(b.id, 0);
    expect(game.teams[b.team]!.scales).toBe(1);
    clock.advance(DRAGON_GRAB_COOLDOWN_MS);
    earnChest(game, clock, c);
    game.chest(c.id, 0);
    expect(game.grab(c.id, b.team)).toBe(true);
    expect(game.playerView(c.id)!.loot).toMatchObject({ blocked: true, gold: 0 });
    expect(game.teams[b.team]!).toMatchObject({ gold: 135, scales: 0 });
    expect(game.hostView().events.at(-1)).toMatchObject({ kind: "blocked", target: b.team });
  });

  test("a grab that isn't picked in time takes from the richest team; nobody to grab from pays as Coins", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"], settings: { teams: 3 } });
    toScramble(game, clock);
    const [a, b, c] = ["A", "B", "C"].map((n) => byName(game, n)) as [DragonPlayer, DragonPlayer, DragonPlayer];
    forceLoot(game, "grab10", "grab10");
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    expect(game.playerView(a.id)!.loot).toMatchObject({ kind: "grab10", asCoins: true, gold: 25 });
    clock.advance(DRAGON_LOOT_MS);
    game.teams[b.team]!.gold = 100;
    game.teams[c.team]!.gold = 300;
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    clock.advance(DRAGON_GRAB_MS);
    expect(game.teams[c.team]!.gold).toBe(270);
    expect(game.teams[a.team]!.gold).toBe(55);
  });

  test("with one player there is one team, and grabs pay as Coins", () => {
    const { game, clock } = setup({ names: ["Solo"] });
    expect(game.teams).toHaveLength(1);
    toScramble(game, clock);
    const p = byName(game, "Solo");
    forceLoot(game, "grab25");
    earnChest(game, clock, p);
    game.chest(p.id, 0);
    expect(game.playerView(p.id)!.loot).toMatchObject({ asCoins: true, gold: 25 });
  });

  test("a player who joins during the scramble goes to the smallest team", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"], teams: [0, 0, 1] });
    toScramble(game, clock);
    const d = game.join("D");
    expect(d.team).toBe(1);
    expect(game.playerView(d.id)).toMatchObject({ team: { index: 1 }, state: "question" });
    expect(game.playerView(d.id)!.question).not.toBeNull();
  });

  test("chest and grab timers keep running while a player is disconnected", () => {
    const { game, clock } = setup({ names: ["A", "B"] });
    toScramble(game, clock);
    const a = byName(game, "A");
    forceLoot(game, "coins");
    earnChest(game, clock, a);
    game.setConnected(a.id, false);
    clock.advance(DRAGON_CHEST_MS + FEEDBACK_MS + DRAGON_LOOT_MS);
    game.setConnected(a.id, true);
    expect(game.teams[a.team]!.gold).toBe(25);
    expect(game.playerView(a.id)!.state).toBe("question");
  });

  test("Protect from abuse holds the ✗ longer after 2 wrong answers in a row", () => {
    const { game, clock } = setup({ names: ["A", "B"], protect: true });
    const a = byName(game, "A");
    answer(game, clock, a, false);
    const cur = a.current!;
    expect(game.answer(a.id, cur.seq, 1)).toBe(true);
    expect(game.playerView(a.id)!.feedback!.penaltyMs).toBe(WRONG_PENALTY_2_MS);
    clock.advance(FEEDBACK_MS);
    expect(game.answer(a.id, a.current!.seq, 0)).toBe(false);
  });
});

describe("bandwidth", () => {
  /** What a phone's snapshot would change by, leaving out countdowns (the hub compares deadlines instead). */
  const still = (v: unknown) => JSON.stringify(v, (k, x) => (/(remaining|protected)Ms$/i.test(k) ? undefined : x));

  test("in the battle, other players' hits only change a phone's view when the whole percent changes", () => {
    const { game, clock } = setup({ names: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], settings: { toughness: "hard" } });
    expect(game.maxHealth).toBe(150);
    const a = byName(game, "A");
    const views = new Set<string>();
    const others = [...game.players.values()].filter((p) => p !== a);
    for (let i = 0; i < 9; i++) {
      const p = others[i]!;
      game.answer(p.id, p.current!.seq, p.current!.correct[0]!);
      views.add(still(game.playerView(a.id)));
    }
    clock.advance(FEEDBACK_MS);
    // 150 → 141 is 100% → 94%: 9 hits, at most 7 different views.
    expect(views.size).toBeLessThanOrEqual(7);
    expect(game.playerView(a.id)).not.toHaveProperty("teams");
  });

  test("in the scramble, phones only see their own team's gold, and the team list only while grabbing", () => {
    const { game, clock } = setup({ names: ["A", "B", "C"], settings: { teams: 3 } });
    toScramble(game, clock);
    const [a, b] = ["A", "B"].map((n) => byName(game, n)) as [DragonPlayer, DragonPlayer];
    const before = still(game.playerView(a.id));
    forceLoot(game, "bigPile");
    earnChest(game, clock, b);
    game.chest(b.id, 0);
    expect(still(game.playerView(a.id))).toBe(before);
    expect(game.playerView(a.id)!.grab).toBeNull();
  });
});

/** Width and height from a WebP file's header (lossy, lossless or extended). */
function webpSize(b: Buffer): [number, number] {
  expect(b.toString("latin1", 0, 4) + b.toString("latin1", 8, 12)).toBe("RIFFWEBP");
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

describe("art slots", () => {
  test("the art module lists exactly the WebPs in src/client/shared/dragon/, at their real sizes, and uses every one", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { DRAGON_ART_SLOTS, PHONE_ART, PROJECTOR_ART } = await import("../src/client/shared/dragon-art.tsx");
    const dir = new URL("../src/client/shared/dragon/", import.meta.url);
    const byId = (a: [string, number[]], b: [string, number[]]) => (a[0] < b[0] ? -1 : 1);
    const onDisk = (sub: string) =>
      readdirSync(new URL(sub, dir))
        .filter((f) => f.endsWith(".webp"))
        .map((f): [string, number[]] => [f.replace(/\.webp$/, ""), webpSize(readFileSync(new URL(sub + f, dir)))])
        .sort(byId);
    const listed = (pick: (s: (typeof DRAGON_ART_SLOTS)[number]) => { w: number; h: number } | null) =>
      DRAGON_ART_SLOTS.flatMap((s): [string, number[]][] => {
        const f = pick(s);
        return f ? [[s.id, [f.w, f.h]]] : [];
      }).sort(byId);
    expect(listed((s) => s.projector)).toEqual(onDisk("./"));
    expect(listed((s) => s.phone)).toEqual(onDisk("phone/"));
    expect(Object.keys(PROJECTOR_ART).sort()).toEqual(DRAGON_ART_SLOTS.map((s) => s.id).sort());
    expect(Object.keys(PHONE_ART).sort()).toEqual(DRAGON_ART_SLOTS.filter((s) => s.phone).map((s) => s.id).sort());
    expect(new Set(DRAGON_ART_SLOTS.map((s) => s.id)).size).toBe(DRAGON_ART_SLOTS.length);
    // The cave is the only opaque picture.
    for (const s of DRAGON_ART_SLOTS) {
      const b = readFileSync(new URL(`${s.id}.webp`, dir));
      const alpha = b.toString("latin1", 12, 16) === "VP8X" && (b[20]! & 0x10) !== 0;
      expect([s.id, alpha]).toEqual([s.id, s.id !== "cave"]);
    }
  });
});

describe("the end", () => {
  test("most gold wins, ties go to more correct answers in Act 2; awards and the CSV", () => {
    const { game, clock, finished } = setup({ names: ["A", "B", "C", "D"], teams: [0, 0, 1, 1] });
    const [a, b, c, d] = ["A", "B", "C", "D"].map((n) => byName(game, n)) as [DragonPlayer, DragonPlayer, DragonPlayer, DragonPlayer];
    // A lands most hits, C gets a rune question right.
    hitTimes(game, clock, 4);
    for (let i = 0; i < 3; i++) answer(game, clock, a, true);
    clock.advance(game.hostView().nextFireMs! + DRAGON_FIRE_WARN_MS);
    rune(game, c, true);
    clock.advance(20_000 + RUNE_GRACE_MS + DRAGON_RUNE_REVEAL_MS);
    toScramble(game, clock);
    forceLoot(game, "coins", "coins", "bats");
    earnChest(game, clock, a);
    game.chest(a.id, 0);
    earnChest(game, clock, c);
    game.chest(c.id, 0);
    clock.advance(DRAGON_LOOT_MS);
    // 25 each; D's extra correct answer breaks the tie for team 1.
    earnChest(game, clock, d);
    game.chest(d.id, 0);
    clock.advance(game.phaseEndsAt - clock.now());
    expect(game.phase).toBe("podium");
    expect(finished()).toBe(1);
    expect(game.rankedTeams().map((t) => [t.index, t.rank, t.gold])).toEqual([
      [1, 1, 25],
      [0, 2, 25],
    ]);
    const host = game.hostView();
    // Fire breath came again while the dragon was finished off; nobody answered those.
    expect(host.result).toMatchObject({ slain: true, runeHeld: 0 });
    expect(host.result!.runeFailed).toBeGreaterThanOrEqual(1);
    expect(host.awards).toMatchObject({ dragonSlayer: { nicknames: ["A"] }, runeMaster: { nicknames: ["C"] }, masterThief: null });
    expect(game.playerView(d.id)!.result).toMatchObject({ teamRank: 1, won: true, teamGold: 25, slain: true });
    expect(game.playerView(a.id)!.result!.awards).toContain("Dragon slayer");
    const csv = buildDragonResultsCsv(game);
    const [header, first] = csv.replace("﻿", "").split("\r\n");
    expect(header).toBe(
      "Team,Team rank,Team gold,Nickname,Correct,Wrong,Accuracy %,Dragon hits,Shield of Faith right,Shield of Faith wrong,Chests opened,Gold found,Gold grabbed,Team gold lost to grabs,Gold lost to traps,Jackpots won,Dragon,Time to slay,Shield of Faith held,Shield of Faith failed",
    );
    expect(first).toMatch(/^Blue,1,25,/);
    expect(csv).toContain(",Slain,");
    expect(csv.trim().split("\r\n")).toHaveLength(5);
    void b;
  });

  test("ending during the battle counts as the dragon escaping", () => {
    const { game } = setup({ names: ["A", "B"] });
    game.end();
    expect(game.phase).toBe("podium");
    expect(game.hostView().result).toMatchObject({ slain: false });
    expect(game.escaped).toBe(true);
    expect(buildDragonResultsCsv(game)).toContain(",Escaped,,");
  });
});
