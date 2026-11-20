import { describe, expect, test } from "bun:test";
import { Game } from "../src/server/game/game.ts";
import { GiftGame } from "../src/server/game/gift.ts";
import { buildGiftResultsCsv } from "../src/server/game/results.ts";
import { FEEDBACK_MS } from "../src/server/game/stream.ts";
import {
  GIFT_DUDS, GIFT_GOODS, GIFT_READY_MS, GIFT_ROUND_MS, GIFT_TAP_GRACE_MS, type GiftItem,
} from "../src/shared/gift-rules.ts";
import { normalizeQuestions } from "../src/shared/quiz-schema.ts";
import { FakeClock, sampleQuiz } from "./helpers.ts";

type Kind = GiftItem["kind"];
const good = (kind: Kind) => (GIFT_GOODS as readonly Kind[]).includes(kind);
const dud = (kind: Kind) => (GIFT_DUDS as readonly Kind[]).includes(kind);

function setup(count: number) {
  const clock = new FakeClock();
  const lobby = new Game(sampleQuiz(), { clock, settings: { gift: { minutes: 3 } }, protect: false });
  for (let i = 0; i < count; i++) lobby.join(`Player ${i + 1}`);
  const game = GiftGame.fromLobby(lobby, { clock, rng: () => 0.4 });
  const players = [...game.players.values()];
  game.start();
  clock.advance(3_000);

  function answer(id: string, right = true) {
    const question = game.playerView(id)!.question!;
    const correct = question.text === "2 + 2?" ? 1 : 0;
    expect(game.answer(id, question.seq, right ? correct : 1 - correct)).toBe(true);
    expect(game.answer(id, question.seq, correct)).toBe(false);
  }

  function earn(id: string) {
    for (let i = 0; i < 5; i++) {
      answer(id);
      if (i < 4) clock.advance(FEEDBACK_MS);
    }
    return game.playerView(id)!.bonus!;
  }

  return { clock, game, players, answer, earn };
}

describe("Gift Grab", () => {
  for (const count of [4, 12]) {
    test(`${count} players earn independent bonuses, and correct answers award no points`, () => {
      const { clock, game, players, answer } = setup(count);
      for (let i = 0; i < 5; i++) {
        for (const player of players) answer(player.id);
        if (i < 4) clock.advance(FEEDBACK_MS);
      }
      const first = players[0]!;
      const next = players[1]!;
      const bonus = game.playerView(first.id)!.bonus!;
      expect(bonus).toMatchObject({ round: 1, multiplier: 1, remainingMs: 17_000 });
      expect(bonus.items.filter((item) => good(item.kind))).toHaveLength(24);
      expect(bonus.items.filter((item) => dud(item.kind))).toHaveLength(12);
      expect(game.hostView().standings.filter((row) => row.rank === 1 && row.inBonus && row.score === 0)).toHaveLength(count);
      const item = bonus.items.find((item) => good(item.kind))!;
      expect(game.tap(first.id, bonus.round, item.id)).toBe(false);
      clock.advance(FEEDBACK_MS + GIFT_READY_MS + item.from);
      expect(game.tap(first.id, bonus.round + 1, item.id)).toBe(false);
      expect(game.tap(first.id, bonus.round, item.id)).toBe(true);
      expect(game.tap(first.id, bonus.round, item.id)).toBe(false);
      expect(game.playerView(next.id)).toMatchObject({ score: 0, bonus: { hits: [] } });
      game.setConnected(first.id, false);
      expect(game.byToken(first.token)?.id).toBe(first.id);
      game.setConnected(first.id, true);
      expect(game.playerView(first.id)).toMatchObject({ score: 10, bonus: { hits: [{ item: item.id, delta: 10 }] } });
      const last = bonus.items.at(-1)!;
      expect(last.from).toBeGreaterThan(13_000);
      clock.advance(last.from - item.from);
      expect(game.tap(first.id, bonus.round, last.id)).toBe(true);
      clock.advance(GIFT_ROUND_MS - last.from);
      expect(game.playerView(first.id)).toMatchObject({ bonus: null, progress: 0, question: {} });
    });
  }

  test("typed answers and pin selections count toward the bonus", () => {
    const clock = new FakeClock();
    const questions = normalizeQuestions([
      { type: "text", text: "Who brings the gifts?", options: ["Santa Claus"] },
      { type: "pin", text: "Which marker is the North Pole?", image: "media/map.png", spots: [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }], correct: [0] },
    ]);
    const lobby = new Game(sampleQuiz({ questions }), { clock });
    const { id } = lobby.join("Noel");
    const game = GiftGame.fromLobby(lobby, { clock });
    game.start();
    clock.advance(3_000);
    for (let i = 0; i < 5; i++) {
      const question = game.playerView(id)!.question!;
      expect(game.answer(id, question.seq, question.type === "text" ? "santa claus" : 0)).toBe(true);
      clock.advance(FEEDBACK_MS);
    }
    expect(game.playerView(id)).toMatchObject({ correct: 5, score: 0, bonus: { round: 1 } });
  });

  test("score clamps at zero and expired taps are rejected", () => {
    const { clock, game, players, answer } = setup(1);
    const id = players[0]!.id;
    answer(id);
    clock.advance(FEEDBACK_MS);
    answer(id, false);
    expect(game.playerView(id)?.progress).toBe(1);
    for (let i = 0; i < 4; i++) {
      clock.advance(FEEDBACK_MS);
      answer(id);
    }
    const bonus = game.playerView(id)!.bonus!;
    const start = clock.now() + FEEDBACK_MS + GIFT_READY_MS;
    for (const item of bonus.items) {
      clock.advance(start + item.from - clock.now());
      expect(game.tap(id, bonus.round, item.id)).toBe(true);
    }
    const expected = bonus.items.reduce((points, item) => Math.max(0, points + (good(item.kind) ? 10 : -10)), 0);
    expect(game.playerView(id)?.score).toBe(expected);
    clock.advance(GIFT_ROUND_MS - bonus.items.at(-1)!.from);
    expect(game.tap(id, bonus.round, 0)).toBe(false);

    const next = setup(1);
    const pid = next.players[0]!.id;
    const second = next.earn(pid);
    const item = second.items[0]!;
    next.clock.advance(FEEDBACK_MS + GIFT_READY_MS + item.until + GIFT_TAP_GRACE_MS - 1);
    expect(next.game.tap(pid, second.round, item.id)).toBe(true);
    expect(next.game.tap(pid, second.round, -1)).toBe(false);
    const later = second.items[1]!;
    next.clock.advance(later.until - item.until + 1);
    expect(next.game.tap(pid, second.round, later.id)).toBe(false);
  });

  test("the third and sixth bonus rounds carry consumable power-ups", () => {
    const { clock, game, players, earn } = setup(1);
    const id = players[0]!.id;
    for (let round = 1; round <= 6; round++) {
      const bonus = earn(id);
      const expected = round === 3 ? "shield" : round === 6 ? "star" : null;
      const power = bonus.items.find((item) => item.kind === "shield" || item.kind === "star");
      expect(power?.kind ?? null).toBe(expected);
      const start = clock.now() + FEEDBACK_MS + GIFT_READY_MS;
      if (power) {
        clock.advance(start + power.from - clock.now());
        expect(game.tap(id, round, power.id)).toBe(true);
        expect(game.playerView(id)?.bonus?.power).toBe(expected);
        const target = bonus.items.find((item) => item.from > power.from && (expected === "shield" ? dud(item.kind) : good(item.kind)))!;
        clock.advance(start + target.from - clock.now());
        expect(game.tap(id, round, target.id)).toBe(true);
        expect(game.playerView(id)?.bonus?.hits.at(-1)).toMatchObject(expected === "shield" ? { delta: 0, effect: "blocked" } : { delta: 20 * bonus.multiplier });
        expect(game.playerView(id)?.bonus?.power).toBeNull();
      }
      clock.advance(start + GIFT_ROUND_MS - clock.now());
    }
  });

  test("the multiplier locks at earn time, and the last earned round survives time expiry", () => {
    const { clock, game, players, answer, earn } = setup(2);
    const [one, two] = players;
    clock.advance(55_999);
    for (let i = 0; i < 4; i++) {
      answer(one!.id);
      answer(two!.id);
      clock.advance(FEEDBACK_MS);
    }
    answer(one!.id);
    expect(game.playerView(one!.id)?.bonus?.multiplier).toBe(1);
    clock.advance(1);
    answer(two!.id);
    expect(game.playerView(two!.id)?.bonus?.multiplier).toBe(2);
    expect(game.playerView(one!.id)?.bonus?.multiplier).toBe(1);
    clock.advance(115_999);
    const bonus = earn(one!.id);
    expect(bonus.multiplier).toBe(3);
    clock.advance(1);
    expect(game.phase).toBe("finishing");
    expect(game.answer(two!.id, two!.seq, 1)).toBe(false);
    const item = bonus.items.find((item) => good(item.kind))!;
    clock.advance(FEEDBACK_MS + GIFT_READY_MS + item.from - 1);
    expect(game.tap(one!.id, bonus.round, item.id)).toBe(true);
    clock.advance(GIFT_ROUND_MS - item.from);
    expect(game.phase).toBe("podium");
    expect(game.hostView().mostCorrect).toEqual({ value: 10, nicknames: ["Player 1"] });
    expect(buildGiftResultsCsv(game)).toContain("1,Player 1,30,10,0,2,1,0,0");
  });
});
