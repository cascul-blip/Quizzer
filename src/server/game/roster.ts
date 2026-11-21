import type { AvatarChoice } from "../../shared/avatars.ts";
import { newId } from "../../shared/quiz-schema.ts";
import { cleanNickname, GameError, MAX_PLAYERS } from "./common.ts";

/** What every mode knows about a player; mode-specific state is added on top. */
export interface BasePlayer {
  id: string;
  nickname: string;
  token: string;
  connected: boolean;
  avatar: AvatarChoice;
}

/** Players of one game, in join order, findable by id or reconnect token. */
export class Roster<P extends BasePlayer> {
  readonly players = new Map<string, P>();
  private readonly tokens = new Map<string, string>();

  /** Validate the nickname (unique, case-insensitive) and create a player. Throws GameError. */
  add(rawNickname: unknown, avatar: AvatarChoice, make: (base: BasePlayer) => P): P {
    const nickname = cleanNickname(rawNickname);
    const key = nickname.toLocaleLowerCase();
    for (const p of this.players.values()) {
      if (p.nickname.toLocaleLowerCase() === key) throw new GameError("That nickname is taken, pick another");
    }
    if (this.players.size >= MAX_PLAYERS) throw new GameError("This game is full");
    return this.adopt(make({ id: "p" + newId(8), nickname, token: crypto.randomUUID(), connected: true, avatar }));
  }

  /** Insert an existing player (keeping id and token), e.g. when a lobby hands over to another mode. */
  adopt(player: P): P {
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    return player;
  }

  /** Insert a copy of each player (keeping id and token), shaped by `make`: how a lobby hands its players to another mode. */
  adoptFrom(source: Iterable<BasePlayer>, make: (base: BasePlayer) => P): void {
    for (const { id, nickname, token, connected, avatar } of source) {
      this.adopt(make({ id, nickname, token, connected, avatar }));
    }
  }

  /** Flip a player's connection flag. Returns the player only when the flag changed, so callers react to real changes. */
  setConnected(playerId: string, connected: boolean): P | null {
    const p = this.players.get(playerId);
    if (!p || p.connected === connected) return null;
    p.connected = connected;
    return p;
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
