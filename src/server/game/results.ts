import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FightGame } from "./fight.ts";
import type { Game } from "./game.ts";
import type { LandGame } from "./land.ts";
import type { RacerGame } from "./racer.ts";
import type { RobotGame } from "./robot.ts";
import type { CupGame } from "./cup.ts";
import type { BombGame } from "./bomb.ts";
import type { DragonGame } from "./dragon.ts";
import type { SiegeGame } from "./siege.ts";
import type { SubGame } from "./submarine.ts";
import type { TowerGame } from "./tower.ts";

function csvCell(v: string | number): string {
  const s = String(v);
  // Prefix formula-looking text so spreadsheets don't execute it.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One row per player (by rank) with per-question answer, correctness, points and time. */
export function buildResultsCsv(game: Game): string {
  const header: string[] = ["Rank", "Nickname", "Score", "Correct answers"];
  game.questions.forEach((q, i) => {
    const n = i + 1;
    header.push(`Q${n} answer (${q.text})`, `Q${n} correct`, `Q${n} points`, `Q${n} time (s)`);
  });
  const rows: (string | number)[][] = game.ranked().map((p) => {
    const row: (string | number)[] = [p.rank, p.nickname, p.score, p.answers.filter((a) => a?.correct).length];
    game.questions.forEach((q, i) => {
      const a = p.answers[i];
      if (a) row.push((q.type === "text" ? a.text : q.options[a.option]) ?? "", a.correct ? "yes" : "no", a.points, (a.ms / 1000).toFixed(2));
      else row.push("", "no answer", 0, "");
    });
    return row;
  });
  return toCsv([header, ...rows]);
}

function toCsv(rows: (string | number)[][]): string {
  // BOM so Excel opens UTF-8 correctly.
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Tallest Tower: one row per player, grouped by team in final team order. */
export function buildTowerResultsCsv(game: TowerGame): string {
  const header = ["Team", "Team rank", "Team floors", "Team blocks", "Nickname", "Correct", "Wrong", "Accuracy %", "Blocks placed", "Blocks missed", "Monster hatched"];
  const rows: (string | number)[][] = [];
  for (const t of game.rankedTeams()) {
    const members = [...game.players.values()].filter((p) => p.team === t.index).sort((a, b) => b.placed - a.placed || b.correct - a.correct);
    for (const p of members) {
      const answered = p.correct + p.wrong;
      rows.push([t.name, t.rank, t.floors, t.placed, p.nickname, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.placed, p.missed, p.hatched]);
    }
  }
  return toCsv([header, ...rows]);
}

/** Submarine Squad: one row per player; the squad's final depth is in every row. */
export function buildSubResultsCsv(game: SubGame): string {
  const header = ["Nickname", "Correct", "Wrong", "Boosts", "Dive taps (correct)", "Instructor rounds", "Squad depth (m)", "Level reached"];
  const rows: (string | number)[][] = [...game.players.values()]
    .sort((a, b) => b.boosts - a.boosts || b.correct - a.correct)
    .map((p) => [p.nickname, p.correct, p.wrong, p.boosts, p.diveHits, p.instructorRounds, game.depth, game.level]);
  return toCsv([header, ...rows]);
}

/** Tower Fight: one row per player, winning team first. */
export function buildFightResultsCsv(game: FightGame): string {
  const outcome = game.outcome ?? game.judge();
  const header = ["Team", "Result", "Tower damage", "Nickname", "Correct", "Wrong", "Accuracy %", "Shots", "Enemy hits", "Friendly hits", "Rebuilds"];
  const order = [...game.teams].sort((a, b) => Number(b.index === outcome.winner) - Number(a.index === outcome.winner) || a.index - b.index);
  const rows: (string | number)[][] = [];
  for (const t of order) {
    const result = outcome.winner === null ? "Draw" : t.index === outcome.winner ? "Won" : "Lost";
    const members = [...game.players.values()].filter((p) => p.team === t.index).sort((a, b) => b.hits - a.hits || b.correct - a.correct);
    for (const p of members) {
      const answered = p.correct + p.wrong;
      rows.push([t.name, result, t.damage, p.nickname, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.shots, p.hits, p.friendlyHits, p.rebuilds]);
    }
  }
  return toCsv([header, ...rows]);
}

/** Robot Attack: one row per player in final standing order. */
export function buildRobotResultsCsv(game: RobotGame): string {
  const header = ["Rank", "Nickname", "Status", "Lives left", "Rounds survived", "Correct", "Wrong", "Accuracy %", "Moves", "Laser hits"];
  const rows: (string | number)[][] = game.standings().map((s) => {
    const p = game.players.get(s.id)!;
    const answered = p.correct + p.wrong;
    const status = s.rank === 1 ? "Winner" : p.outRound === null ? "Survived" : `Out in round ${p.outRound}`;
    return [s.rank, p.nickname, status, p.lives, p.outRound === null ? game.attacks : p.outRound - 1, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.moves, p.hits];
  });
  return toCsv([header, ...rows]);
}

/** Cup of Death: one row per player in final standing order. */
export function buildCupResultsCsv(game: CupGame): string {
  const header = ["Rank", "Nickname", "Status", "Cups left", "Rounds survived", "Correct", "Wrong", "Accuracy %", "Drinks survived", "Rounds safe"];
  const rows: (string | number)[][] = game.standings().map((s) => {
    const p = game.players.get(s.id)!;
    const answered = p.correct + p.wrong;
    const status = s.rank === 1 ? "Winner" : p.outRound === null ? "Survived" : `Poisoned in round ${p.outRound}`;
    return [s.rank, p.nickname, status, p.cups, p.outRound === null ? game.round : p.outRound - 1, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.drinksSurvived, p.safeRounds];
  });
  return toCsv([header, ...rows]);
}

/** Land Grab: one row per player, grouped by the team they started on, in final team order. */
export function buildLandResultsCsv(game: LandGame): string {
  const header = ["Team", "Team rank", "Team tiles", "Knocked out by", "Nickname", "Correct", "Wrong", "Accuracy %", "Tiles placed", "Tiles stolen", "Tiles surrounded"];
  const rows: (string | number)[][] = [];
  for (const t of game.rankedTeams()) {
    const members = [...game.players.values()].filter((p) => p.firstTeam === t.index).sort((a, b) => b.placed - a.placed || b.correct - a.correct);
    for (const p of members) {
      const answered = p.correct + p.wrong;
      const by = t.conqueredBy === null ? "" : game.teams[t.conqueredBy]!.name;
      rows.push([t.name, t.rank, t.tiles, by, p.nickname, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.placed, p.stolen, p.captured]);
    }
  }
  return toCsv([header, ...rows]);
}

/** Racer: one row per player; the class's shared distance, top speed and crashes are in every row. */
export function buildRacerResultsCsv(game: RacerGame): string {
  const header = ["Nickname", "Correct", "Wrong", "Accuracy %", "Turns driven", "Mph gained", "Fail points as driver", "Class distance (miles)", "Top speed (mph)", "Crashes"];
  const round = (v: number) => Math.round(v * 100) / 100;
  const rows: (string | number)[][] = [...game.players.values()]
    .sort((a, b) => b.correct - a.correct || b.mphGained - a.mphGained)
    .map((p) => {
      const answered = p.correct + p.wrong;
      return [p.nickname, p.correct, p.wrong, answered ? Math.round((p.correct / answered) * 100) : "", p.turnsDriven, p.mphGained, p.failsAsDriver, round(game.car.distance), round(game.car.topSpeed), game.car.crashes];
    });
  return toCsv([header, ...rows]);
}

/** 222000 → "3:42" */
function minutesSeconds(ms: number): string {
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/**
 * Dragon's Hoard: one row per player, grouped by team in final team order. The class's
 * Act 1 result is in every row. A grab hits a team, not a player, so "Team gold lost to grabs" is the team's.
 */
export function buildDragonResultsCsv(game: DragonGame): string {
  const header = [
    "Team",
    "Team rank",
    "Team gold",
    "Nickname",
    "Correct",
    "Wrong",
    "Accuracy %",
    "Dragon hits",
    "Shield of Faith right",
    "Shield of Faith wrong",
    "Chests opened",
    "Gold found",
    "Gold grabbed",
    "Team gold lost to grabs",
    "Gold lost to traps",
    "Jackpots won",
    "Dragon",
    "Time to slay",
    "Shield of Faith held",
    "Shield of Faith failed",
  ];
  const r = game.result();
  const dragon = r.slain ? "Slain" : "Escaped";
  const slay = r.slain && r.slainMs !== null ? minutesSeconds(r.slainMs) : "";
  const rows: (string | number)[][] = [];
  for (const t of game.rankedTeams()) {
    const members = [...game.players.values()].filter((p) => p.team === t.index).sort((a, b) => b.goldFound + b.goldGrabbed - (a.goldFound + a.goldGrabbed) || b.correct - a.correct);
    for (const p of members) {
      const answered = p.correct + p.wrong;
      rows.push([
        t.name,
        t.rank,
        t.gold,
        p.nickname,
        p.correct,
        p.wrong,
        answered ? Math.round((p.correct / answered) * 100) : "",
        p.hits,
        p.runeRight,
        p.runeWrong,
        p.chestsOpened,
        p.goldFound,
        p.goldGrabbed,
        t.lostToGrabs,
        p.lostToTraps,
        p.jackpots,
        dragon,
        slay,
        r.runeHeld,
        r.runeFailed,
      ]);
    }
  }
  return toCsv([header, ...rows]);
}

/**
 * Bomb Squad: one row per player. Together rows share the class result. Race rank is blank
 * in Together. "Time lost" is seconds the player's own wrong cuts and wrong keypad entries took off.
 */
export function buildBombResultsCsv(game: BombGame): string {
  const header = [
    "Squad",
    "Squad result",
    "Squad time left",
    "Squad rank",
    "Nickname",
    "Wires held",
    "Right wires held",
    "Right cuts",
    "Wrong cuts",
    "Keypad right",
    "Keypad wrong",
    "Time lost to wrong cuts",
    "Modules cleared",
    "Total time lost",
  ];
  const race = game.settings.game === "race";
  const ranks = new Map(game.rankedSquads().map((s) => [s.index, s.rank]));
  const classResult = game.outcome === "defused" ? "defused" : "exploded";
  const rows: (string | number)[][] = [];
  const order = race ? game.rankedSquads() : game.squads.map((s) => ({ ...s, rank: 0 }));
  for (const s of order) {
    const members = [...game.players.values()].filter((p) => p.squad === s.index).sort((a, b) => b.rightCuts - a.rightCuts || a.nickname.localeCompare(b.nickname));
    const result = race ? (s.finished ? "defused" : "exploded") : classResult;
    const left = minutesSeconds(s.timeLeftMs);
    const lost = Math.round(s.timeLostMs / 1000);
    for (const p of members) {
      rows.push([
        s.name,
        result,
        left,
        race ? (ranks.get(s.index) ?? "") : "",
        p.nickname,
        p.wiresHeld,
        p.rightHeld,
        p.rightCuts,
        p.wrongCuts,
        p.keypadRight,
        p.keypadWrong,
        Math.round(p.timeLostMs / 1000),
        s.modulesCleared,
        lost,
      ]);
    }
  }
  return toCsv([header, ...rows]);
}

function resultsFileName(game: { quizId: string }, when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${stamp}_${game.quizId}.csv`;
}

export function writeResultsFile(game: { quizId: string }, csv: string, resultsDir: string): string {
  const file = join(resultsDir, resultsFileName(game));
  writeFileSync(file, csv);
  return file;
}

/**
 * Kingdom Siege: one row per player (kicked players included), each with the class result,
 * then a wave log with one row per wave.
 */
export function buildSiegeResultsCsv(game: SiegeGame): string {
  const header = [
    "Nickname",
    "Correct",
    "Wrong",
    "Accuracy %",
    "Gold earned",
    "Gold spent",
    "Archers placed",
    "Knights placed",
    "Walls placed",
    "Upgrades bought",
    "Monsters defeated",
    "Class result",
    "Waves survived",
    "Hearts left",
    "Endless record",
  ];
  const r = game.result();
  const result = r.outcome === "stands" ? "Stood" : r.outcome === "fallen" ? "Fell" : "Ended";
  const record = r.record ? `${r.record.waves} waves, ${r.record.avgScale}% difficulty${r.newRecord ? " (new record)" : ""}` : "";
  const rows: (string | number)[][] = game.everyone
    .sort((a, b) => b.goldEarned - a.goldEarned || b.correct - a.correct)
    .map((p) => {
      const answered = p.correct + p.wrong;
      return [
        p.nickname,
        p.correct,
        p.wrong,
        answered ? Math.round((p.correct / answered) * 100) : "",
        p.goldEarned,
        p.goldSpent,
        p.placed.archer,
        p.placed.knight,
        p.placed.wall,
        p.upgrades,
        p.defeated,
        result,
        r.wavesSurvived,
        r.hearts,
        record,
      ];
    });
  const log: (string | number)[][] = [
    [],
    ["Wave", "Difficulty scale %", "Defense gold", "Strength boost", "Monster budget", "Monster health ×", "Monsters sent", "Class accuracy %", "Hearts lost"],
    ...game.waveLog.map((w) => [w.wave, w.scale, w.defense, w.boost, w.budget, w.toughness, w.sent, w.answered ? Math.round((w.correct / w.answered) * 100) : "", w.heartsLost]),
  ];
  return toCsv([header, ...rows, ...log]);
}
