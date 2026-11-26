import { MAX_JOINS_PER_ADDRESS, MAX_SOCKETS_PER_ADDRESS } from "./game/common.ts";
import { isLoopbackAddress } from "./network.ts";

type Socket = { data: { ip: string } };

export class PhoneAttachments<S extends Socket> {
  private readonly sockets = new Map<S, string | null>();

  constructor(private readonly setConnected: (playerId: string, connected: boolean) => void) {}

  [Symbol.iterator](): IterableIterator<S> {
    return this.sockets.keys();
  }

  open(socket: S): void {
    this.sockets.set(socket, null);
  }

  playerId(socket: S): string | null {
    return this.sockets.get(socket) ?? null;
  }

  forPlayer(playerId: string): S[] {
    return [...this.sockets].filter(([, attached]) => attached === playerId).map(([socket]) => socket);
  }

  socketLimitReached(ip: string): boolean {
    if (isLoopbackAddress(ip)) return false;
    let count = 0;
    for (const socket of this) if (socket.data.ip === ip) count++;
    return count >= MAX_SOCKETS_PER_ADDRESS;
  }

  joinLimitReached(socket: S, players: ReadonlyMap<string, unknown>): boolean {
    const ip = socket.data.ip;
    if (isLoopbackAddress(ip)) return false;
    const attached = new Set<string>();
    for (const [other, playerId] of this.sockets) {
      if (other.data.ip === ip && playerId && players.has(playerId)) attached.add(playerId);
    }
    return attached.size >= MAX_JOINS_PER_ADDRESS;
  }

  attach(socket: S, playerId: string): void {
    const previous = this.playerId(socket);
    this.sockets.set(socket, playerId);
    // why: reconnect first so a game checking for early round completion sees the replacement.
    this.setConnected(playerId, true);
    if (previous !== playerId) this.disconnectIfAbsent(previous);
  }

  close(socket: S): void {
    const playerId = this.playerId(socket);
    this.sockets.delete(socket);
    this.disconnectIfAbsent(playerId);
  }

  detachPlayer(playerId: string): S[] {
    const sockets = this.forPlayer(playerId);
    for (const socket of sockets) this.sockets.set(socket, null);
    return sockets;
  }

  detachAll(): void {
    for (const socket of this) this.sockets.set(socket, null);
  }

  private disconnectIfAbsent(playerId: string | null): void {
    if (playerId && this.forPlayer(playerId).length === 0) this.setConnected(playerId, false);
  }
}
