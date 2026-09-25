import { newId } from "../../shared/quiz-schema.ts";
import { GameError, MAX_PLAYERS, cleanNickname } from "./common.ts";

/** What every mode knows about a player; mode-specific state is added on top. */
export interface BasePlayer {
  id: string;
  nickname: string;
  token: string;
  connected: boolean;
}

/** Players of one game, in join order, findable by id or reconnect token. */
export class Roster<P extends BasePlayer> {
  readonly players = new Map<string, P>();
  private readonly tokens = new Map<string, string>();

  /** Validate the nickname (unique, case-insensitive) and create a player. Throws GameError. */
  add(rawNickname: unknown, make: (base: BasePlayer) => P): P {
    const nickname = cleanNickname(rawNickname);
    const key = nickname.toLocaleLowerCase();
    for (const p of this.players.values()) {
      if (p.nickname.toLocaleLowerCase() === key) throw new GameError("That nickname is taken, pick another");
    }
    if (this.players.size >= MAX_PLAYERS) throw new GameError("This game is full");
    return this.adopt(make({ id: "p" + newId(8), nickname, token: crypto.randomUUID(), connected: true }));
  }

  /** Insert an existing player (keeping id and token), e.g. when a lobby hands over to another mode. */
  adopt(player: P): P {
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    return player;
  }

  byToken(token: unknown): P | null {
    if (typeof token !== "string") return null;
    const id = this.tokens.get(token);
    return id ? (this.players.get(id) ?? null) : null;
  }

  remove(playerId: string): P | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    this.players.delete(playerId);
    this.tokens.delete(p.token);
    return p;
  }
}
