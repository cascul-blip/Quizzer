import type { ServerWebSocket } from "bun";
import QRCode from "qrcode";
import type { ClientMsg, GameMode, HostView, JoinInfo, Pacing, PlayerView, ServerMsg, TowerSettings } from "../shared/protocol.ts";
import { ValidationError } from "../shared/quiz-schema.ts";
import { DEFAULT_TOWER, Game, GameError, type Clock } from "./game/game.ts";
import { buildResultsCsv, buildTowerResultsCsv, writeResultsFile } from "./game/results.ts";
import { TowerGame } from "./game/tower.ts";
import { lanAddresses, type LanAddress } from "./network.ts";
import { NotFoundError, type QuizStore } from "./quiz/store.ts";

export interface SocketData {
  /** Request came from this machine to a loopback hostname; may use host controls. */
  admin: boolean;
  role: "player" | "host";
  playerId: string | null;
}

type WS = ServerWebSocket<SocketData>;

export interface HubOptions {
  /** Forced join address (--host). */
  address?: string;
  clock?: Clock;
  log?: (msg: string) => void;
}

export interface LastResults {
  quizId: string;
  title: string;
  csv: string;
  /** Where the CSV was saved, or null if writing failed. */
  file: string | null;
}

const PACINGS = new Set<Pacing>(["manual", "auto"]);
/** In Tallest Tower, answers stream in constantly: the acting player is updated at once, everyone else at most this often. */
const ACTIVITY_THROTTLE_MS = 100;

export type LiveGame = Game | TowerGame;

/** Owns the single live game and every connected socket; pushes full view snapshots on each change. */
export class GameHub {
  game: LiveGame | null = null;
  lastResults: LastResults | null = null;
  port = 0;
  /** Changes on every server start; pages that reconnect to a different one reload to pick up new code. */
  readonly serverId = crypto.randomUUID();

  private readonly sockets = new Set<WS>();
  private selected: string | null;
  private addressCache: { at: number; list: LanAddress[] } | null = null;
  private qrCache = new Map<string, string>();
  private broadcastQueued = false;
  private activityTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mode and tower settings carry over to the next lobby ("Play again"). */
  private lastSetup: { mode: GameMode; tower: TowerSettings } = { mode: "classic", tower: DEFAULT_TOWER };
  private readonly log: (msg: string) => void;

  constructor(
    private readonly store: QuizStore,
    private readonly opts: HubOptions = {},
  ) {
    this.selected = opts.address ?? null;
    this.log = opts.log ?? (() => {});
  }

  // ---------- join info ----------

  addresses(): LanAddress[] {
    const now = Date.now();
    if (!this.addressCache || now - this.addressCache.at > 5000) this.addressCache = { at: now, list: lanAddresses() };
    return this.addressCache.list;
  }

  get address(): string {
    const list = this.addresses();
    if (this.selected && (this.opts.address === this.selected || list.some((a) => a.address === this.selected))) return this.selected;
    return list[0]?.address ?? "localhost";
  }

  setAddress(address: string): void {
    if (!this.addresses().some((a) => a.address === address) && address !== this.opts.address) {
      throw new GameError(`${address} is not an address of this computer`);
    }
    this.selected = address;
    this.scheduleBroadcast();
  }

  joinUrl(): string {
    return `http://${this.address}:${this.port}/`;
  }

  joinInfo(): JoinInfo {
    const url = this.joinUrl();
    let qrSvg = this.qrCache.get(url);
    if (qrSvg === undefined) {
      this.qrCache.set(url, "");
      QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
        .then((svg) => {
          this.qrCache.set(url, svg);
          this.scheduleBroadcast();
        })
        .catch((e) => this.log(`QR code generation failed: ${e}`));
      qrSvg = "";
    }
    const addresses = this.addresses().map(({ address, iface }) => ({ address, iface }));
    if (this.opts.address && !addresses.some((a) => a.address === this.opts.address)) addresses.unshift({ address: this.opts.address, iface: "--host" });
    return { url, qrSvg, address: this.address, addresses, port: this.port };
  }

  // ---------- views ----------

  hostView(): HostView {
    const join = this.joinInfo();
    return this.game ? { ...this.game.hostView(), join } : { kind: "idle", phase: "idle", join };
  }

  playerView(ws: WS): PlayerView {
    if (!this.game) return { kind: "none", game: null };
    const none: PlayerView = { kind: "none", game: { title: this.game.title, phase: this.game.phase } };
    if (!ws.data.playerId) return none;
    return this.game.playerView(ws.data.playerId) ?? none;
  }

  private send(ws: WS, msg: ServerMsg): void {
    ws.send(JSON.stringify(msg));
  }

  private sendState(ws: WS): void {
    if (ws.data.role === "host") this.send(ws, { type: "host.state", view: this.hostView() });
    else this.send(ws, { type: "player.state", view: this.playerView(ws) });
  }

  /** Coalesce bursts of changes (e.g. many answers) into one push per tick. */
  scheduleBroadcast(): void {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    queueMicrotask(() => {
      this.broadcastQueued = false;
      this.broadcast();
    });
  }

  /** One player acted (Tallest Tower): update them now and everyone else shortly. */
  private onActivity(playerId: string): void {
    for (const ws of this.sockets) if (ws.data.playerId === playerId) this.sendState(ws);
    this.activityTimer ??= setTimeout(() => {
      this.activityTimer = null;
      this.broadcast();
    }, ACTIVITY_THROTTLE_MS);
  }

  broadcast(): void {
    let hostMsg: string | null = null;
    for (const ws of this.sockets) {
      if (ws.data.role === "host") ws.send((hostMsg ??= JSON.stringify({ type: "host.state", view: this.hostView() } satisfies ServerMsg)));
      else this.sendState(ws);
    }
  }

  // ---------- socket lifecycle ----------

  onOpen(ws: WS): void {
    this.sockets.add(ws);
    this.send(ws, { type: "hello", serverId: this.serverId });
    this.sendState(ws);
  }

  onClose(ws: WS): void {
    this.sockets.delete(ws);
    const pid = ws.data.playerId;
    if (pid && this.game && ![...this.sockets].some((s) => s.data.playerId === pid)) this.game.setConnected(pid, false);
  }

  onMessage(ws: WS, raw: string | Buffer): void {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") throw new Error();
    } catch {
      return this.send(ws, { type: "error", message: "Malformed message" });
    }
    try {
      if (msg.type.startsWith("host.")) {
        if (!ws.data.admin) throw new GameError("Host controls are only available on the host computer (http://localhost)");
        this.handleHost(ws, msg);
      } else {
        this.handlePlayer(ws, msg);
      }
    } catch (e) {
      if (e instanceof GameError || e instanceof ValidationError || e instanceof NotFoundError) {
        this.send(ws, { type: "error", message: e.message });
      } else {
        this.log(`Error handling ${msg.type}: ${(e as Error).stack ?? e}`);
        this.send(ws, { type: "error", message: "Something went wrong" });
      }
    }
  }

  private handlePlayer(ws: WS, msg: ClientMsg): void {
    switch (msg.type) {
      case "join": {
        if (!this.game) throw new GameError("No game is open yet. Wait for the host.");
        if (ws.data.playerId && this.game.players.has(ws.data.playerId)) return this.sendState(ws);
        const p = this.game.join(msg.nickname);
        ws.data.playerId = p.id;
        this.send(ws, { type: "joined", token: p.token, playerId: p.id });
        this.log(`Player joined: ${p.nickname}`);
        return;
      }
      case "resume": {
        const p = this.game?.byToken(msg.token);
        if (!p) {
          this.send(ws, { type: "resumeFailed" });
          return this.sendState(ws);
        }
        ws.data.playerId = p.id;
        this.send(ws, { type: "joined", token: p.token, playerId: p.id });
        this.game!.setConnected(p.id, true);
        return this.sendState(ws);
      }
      case "answer": {
        if (!(this.game instanceof Game) || !ws.data.playerId) return;
        this.game.answer(ws.data.playerId, Number(msg.qIndex), Number(msg.option));
        return;
      }
      case "tower.answer": {
        if (!(this.game instanceof TowerGame) || !ws.data.playerId) return;
        if (!this.game.answer(ws.data.playerId, Number(msg.seq), Number(msg.option))) this.sendState(ws);
        return;
      }
      case "tower.drop": {
        if (!(this.game instanceof TowerGame) || !ws.data.playerId) return;
        if (this.game.drop(ws.data.playerId, Number(msg.zone)) === null) this.sendState(ws);
        return;
      }
      default:
        throw new GameError(`Unknown message ${(msg as { type: string }).type}`);
    }
  }

  private handleHost(ws: WS, msg: ClientMsg): void {
    const game = () => {
      if (!this.game) throw new GameError("No game is open");
      return this.game;
    };
    const classic = () => {
      const g = game();
      if (!(g instanceof Game)) throw new GameError("Not available in Tallest Tower");
      return g;
    };
    switch (msg.type) {
      case "host.hello":
        ws.data.role = "host";
        return this.sendState(ws);
      case "host.open": {
        const quiz = this.store.get(String(msg.quizId));
        if (quiz.questions.length === 0) throw new GameError("This quiz has no questions yet");
        this.closeGame();
        this.game = new Game(quiz, {
          clock: this.opts.clock,
          onChange: () => this.scheduleBroadcast(),
          onFinish: (g) => this.onFinish(g),
          ...this.lastSetup,
        });
        this.log(`Game opened: ${quiz.title}. Players join at ${this.joinUrl()}`);
        this.scheduleBroadcast();
        return;
      }
      case "host.start": {
        const lobby = classic();
        if (lobby.phase === "lobby" && lobby.mode === "tower") return this.startTower(lobby);
        return lobby.start(PACINGS.has(msg.pacing) ? msg.pacing : undefined);
      }
      case "host.setPacing":
        if (!PACINGS.has(msg.pacing)) throw new GameError("Unknown pacing");
        return classic().setPacing(msg.pacing);
      case "host.setShuffle":
        return classic().setShuffle({ questions: !!msg.questions, answers: !!msg.answers });
      case "host.setMode":
        classic().setMode(msg.mode);
        this.lastSetup.mode = classic().mode;
        return;
      case "host.setTower":
        classic().setTower({ teams: Number(msg.teams), minutes: Number(msg.minutes), monster: msg.monster });
        this.lastSetup.tower = { ...classic().tower };
        return;
      case "host.next":
        return classic().next();
      case "host.skip":
        return classic().skip();
      case "host.end":
        return game().end();
      case "host.kick": {
        const p = game().kick(String(msg.playerId));
        if (!p) return;
        for (const s of this.sockets) {
          if (s.data.playerId === p.id) {
            s.data.playerId = null;
            this.send(s, { type: "kicked" });
          }
        }
        this.log(`Player removed: ${p.nickname}`);
        return;
      }
      case "host.close":
        this.closeGame();
        this.scheduleBroadcast();
        return;
      case "host.setAddress":
        return this.setAddress(String(msg.address));
      default:
        throw new GameError(`Unknown message ${(msg as { type: string }).type}`);
    }
  }

  /** Hand the lobby's players (same ids/tokens, so sockets stay attached) to a Tallest Tower game. */
  private startTower(lobby: Game): void {
    if (lobby.players.size === 0) throw new GameError("Wait for at least one player to join");
    const tower = TowerGame.fromLobby(lobby, {
      clock: this.opts.clock,
      onChange: () => this.scheduleBroadcast(),
      onActivity: (pid) => this.onActivity(pid),
      onFinish: (g) => this.onFinish(g),
    });
    lobby.dispose();
    this.game = tower;
    tower.start();
    this.log(`Tallest Tower started: ${tower.teams.length} team(s), ${tower.settings.minutes} min`);
  }

  private closeGame(): void {
    if (this.activityTimer) clearTimeout(this.activityTimer);
    this.activityTimer = null;
    if (!this.game) return;
    this.game.dispose();
    this.game = null;
    for (const s of this.sockets) s.data.playerId = null;
  }

  private onFinish(game: LiveGame): void {
    const csv = game instanceof TowerGame ? buildTowerResultsCsv(game) : buildResultsCsv(game);
    let file: string | null = null;
    try {
      file = writeResultsFile(game, csv, this.store.resultsDir);
      this.log(`Results saved to ${file}`);
    } catch (e) {
      this.log(`Could not save results: ${(e as Error).message}`);
    }
    this.lastResults = { quizId: game.quizId, title: game.title, csv, file };
  }
}
