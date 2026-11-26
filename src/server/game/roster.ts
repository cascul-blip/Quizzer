import type { AvatarChoice } from "../../shared/avatars.ts";
import { newId } from "../../shared/quiz-schema.ts";
import { cleanNickname, GameError, MAX_PLAYERS } from "./common.ts";

export interface BasePlayer {
  id: string;
  nickname: string;
  token: string;
  connected: boolean;
  avatar: AvatarChoice;
}

export class Roster<P extends BasePlayer> {
  readonly players = new Map<string, P>();
  private readonly tokens = new Map<string, string>();

  add(rawNickname: unknown, avatar: AvatarChoice, make: (base: BasePlayer) => P): P {
    const nickname = cleanNickname(rawNickname);
    const key = nickname.toLocaleLowerCase();
    for (const p of this.players.values()) {
      if (p.nickname.toLocaleLowerCase() === key) throw new GameError("That nickname is taken, pick another");
    }
    if (this.players.size >= MAX_PLAYERS) throw new GameError("This game is full");
    return this.adopt(make({ id: "p" + newId(8), nickname, token: crypto.randomUUID(), connected: true, avatar }));
  }

  adopt(player: P): P {
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    return player;
  }

  adoptFrom(source: Iterable<BasePlayer>, make: (base: BasePlayer) => P): void {
    for (const { id, nickname, token, connected, avatar } of source) {
      this.adopt(make({ id, nickname, token, connected, avatar }));
    }
  }

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
