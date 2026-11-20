import type { Pacing } from "../../shared/protocol.ts";
import { loadSiegeRecord } from "../siege-records.ts";
import { type Clock, Game, GameError } from "./game.ts";
import { CupGame } from "./cup.ts";
import { DuelGame } from "./duel.ts";
import { FightGame } from "./fight.ts";
import { GiftGame } from "./gift.ts";
import { LandGame } from "./land.ts";
import { RacerGame } from "./racer.ts";
import { RobotGame } from "./robot.ts";
import { SiegeGame } from "./siege.ts";
import { SubGame } from "./submarine.ts";
import { TowerGame } from "./tower.ts";

export type LiveGame = Game | TowerGame | SubGame | FightGame | RobotGame | LandGame | RacerGame | CupGame | SiegeGame | DuelGame | GiftGame;

interface HandoffOptions {
  clock?: Clock;
  dataDir: string;
  onChange: () => void;
  onActivity: (playerId: string) => void;
  onTick: () => void;
  onFinish: (game: LiveGame) => void;
  install: (game: LiveGame) => void;
  log: (message: string) => void;
}

/** Start the selected mode and return its pacing if it carries forward to the next lobby. */
export function startLobbyGame(lobby: Game, pacing: Pacing | undefined, { install, log, onTick, dataDir, ...gameOptions }: HandoffOptions): Pacing | undefined {
  if (lobby.phase !== "lobby" || lobby.mode === "classic") {
    lobby.start(pacing);
    return lobby.pacing;
  }
  if (lobby.players.size === 0) throw new GameError("Wait for at least one player to join");

  function handoff(game: Exclude<LiveGame, Game>, message: string): Pacing | undefined {
    lobby.dispose();
    // Starting can immediately notify the hub, which must already see the new game.
    install(game);
    game.start(pacing);
    log(message);
    if (game instanceof RacerGame || game instanceof DuelGame) return game.pacing;
  }

  switch (lobby.mode) {
    case "tower": {
      const tower = TowerGame.fromLobby(lobby, gameOptions);
      return handoff(tower, `Tallest Tower started: ${tower.teams.length} team(s), ${tower.settings.minutes} min`);
    }
    case "submarine": {
      const sub = SubGame.fromLobby(lobby, gameOptions);
      return handoff(sub, `Sled Squad started with ${sub.players.size} player(s)`);
    }
    case "fight": {
      const fight = FightGame.fromLobby(lobby, gameOptions);
      return handoff(fight, `Tower Fight started with ${fight.players.size} player(s), ${fight.hill} hill`);
    }
    case "robot": {
      const robot = RobotGame.fromLobby(lobby, gameOptions);
      return handoff(robot, `Robot Attack started with ${robot.players.size} player(s)`);
    }
    case "gift": {
      const gift = GiftGame.fromLobby(lobby, gameOptions);
      return handoff(gift, `Gift Grab started with ${gift.players.size} player(s), ${gift.minutes} min`);
    }
    case "cup": {
      const cup = CupGame.fromLobby(lobby, gameOptions);
      return handoff(cup, `Cup of Death started with ${cup.players.size} player(s)`);
    }
    case "siege": {
      const siege = SiegeGame.fromLobby(lobby, {
        ...gameOptions,
        onTick,
        record: lobby.siege.waves === "endless" ? loadSiegeRecord(dataDir, lobby.quizId) : null,
      });
      const waves = siege.settings.waves;
      return handoff(siege, `Kingdom Siege started with ${siege.players.size} player(s), ${waves === "endless" ? "Endless" : `${waves} waves`}`);
    }
    case "land": {
      const land = LandGame.fromLobby(lobby, gameOptions);
      return handoff(land, `Land Grab started: ${land.teams.length} teams, ${land.settings.minutes} min`);
    }
    case "racer": {
      const racer = RacerGame.fromLobby(lobby, gameOptions);
      return handoff(racer, `Racer started with ${racer.players.size} player(s), ${racer.questions.length} question(s)`);
    }
    case "duel": {
      const duel = DuelGame.fromLobby(lobby, gameOptions);
      return handoff(duel, `Showdown started with ${duel.players.size} player(s), ${duel.rounds} round(s)`);
    }
  }
  lobby.mode satisfies never;
}
