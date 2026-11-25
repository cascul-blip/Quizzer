import { useEffect, useState } from "preact/hooks";
import { keysOf } from "../../shared/keys-of.ts";
import type { GameMode } from "../../shared/mode-entries.ts";
import { SHARED_MODES } from "../../shared/mode-entries.ts";
import type { HostPlayer, Pacing } from "../../shared/mode-views.ts";
import type { HostView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { teamVars } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { ScreenControls, toggleFullscreen } from "./common.tsx";
import { HOST_MODES, lobbyEntryOf } from "./modes.tsx";

type LobbyView = Extract<HostView, { kind: "lobby" }>;

const MENU = keysOf(HOST_MODES);

export function LobbyStage({ view, send }: { view: LobbyView; send: Send }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        if (view.players.length > 0) send({ type: "host.start", pacing: view.pacing });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.players.length, view.pacing, send]);

  return (
    <div class="stage">
      <header class="topbar">
        <div class="title">{view.quiz.title}</div>
        <div class="spacer" />
        <div class="pill">
          👥 {view.players.filter((p) => p.connected).length}
          {view.players.some((p) => !p.connected) && <span class="dim"> / {view.players.length}</span>}
        </div>
        <ScreenControls />
        <button class="btn ghost small" onClick={() => confirm("Close this lobby?") && send({ type: "host.close" })}>
          Close
        </button>
      </header>
      <Lobby view={view} send={send} />
    </div>
  );
}

function PlayerChip({ p, send, draggable }: { p: HostPlayer; send: Send; draggable?: boolean }) {
  return (
    <button
      class={`chip ${p.connected ? "" : "offline"}`}
      title={draggable ? "Drag to another team · click to remove" : "Click to remove"}
      draggable={draggable}
      onDragStart={(e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData("text/plain", p.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("dragging");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
      onClick={() => confirm(`Remove ${p.nickname} from the game?`) && send({ type: "host.kick", playerId: p.id })}
    >
      <Avatar choice={p.avatar} />
      {p.nickname}
    </button>
  );
}

function Lobby({ view, send }: { view: LobbyView; send: Send }) {
  const { join } = view;
  const connected = view.players.length;
  const { Settings, Preview } = lobbyEntryOf(view.mode);
  const flags = SHARED_MODES[view.mode].flags;
  const [dragOver, setDragOver] = useState<number | null>(null);
  const canDrag = (view.teams?.length ?? 0) > 1;
  return (
    <main class="lobby">
      <section class="join-panel">
        <div class="join-steps">
          <div class="step-label">Join on your phone</div>
          <div class="step">
            Scan the QR code or go to
            <div class="join-url">{join.url.replace(/^http:\/\//, "").replace(/\/$/, "")}</div>
          </div>
          <div class="wifi-note">Connect to the same Wi-Fi as this computer first.</div>
        </div>
        <div class="qr" dangerouslySetInnerHTML={{ __html: join.qrSvg }} aria-label={`QR code for ${join.url}`} role="img" />
        <details class="net">
          <summary>Network settings</summary>
          <label>
            Address shown to players
            <select value={join.address} onChange={(e) => send({ type: "host.setAddress", address: e.currentTarget.value })}>
              {join.addresses.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.address} ({a.iface})
                </option>
              ))}
              {join.addresses.length === 0 && <option value={join.address}>{join.address}</option>}
            </select>
          </label>
          <p>If phones can't load the page, pick the address of the Wi-Fi/Ethernet adapter, and allow port {join.port} through the firewall.</p>
        </details>
      </section>
      <section class="players-panel">
        <div class="players-head">
          <h2>
            {connected} player{connected === 1 ? "" : "s"}
          </h2>
          <button class="btn primary start" disabled={connected === 0} onClick={() => send({ type: "host.start", pacing: view.pacing })}>
            Start
          </button>
        </div>
        <div class="game-options">
          <label class="opt">
            Game mode
            <select value={view.mode} onChange={(e) => send({ type: "host.setMode", mode: e.currentTarget.value as GameMode })}>
              {MENU.map((mode) => (
                <option key={mode} value={mode}>
                  {lobbyEntryOf(mode).label(view.settings[mode])}
                </option>
              ))}
            </select>
          </label>
          <Settings settings={view.settings[view.mode]} send={send}>
            {flags.paced && (
              <>
                <label class="opt">
                  Pacing
                  <select value={view.pacing} onChange={(e) => send({ type: "host.setPacing", pacing: e.currentTarget.value as Pacing })}>
                    <option value="manual">Manual: I click Next</option>
                    <option value="auto">Auto-advance</option>
                  </select>
                </label>
                <label class="opt check">
                  <input
                    type="checkbox"
                    checked={view.shuffle.questions}
                    onChange={(e) => send({ type: "host.setShuffle", questions: e.currentTarget.checked, answers: view.shuffle.answers })}
                  />
                  Shuffle question order
                </label>
              </>
            )}
          </Settings>
          <label class="opt check">
            <input
              type="checkbox"
              checked={view.shuffle.answers}
              onChange={(e) => send({ type: "host.setShuffle", questions: view.shuffle.questions, answers: e.currentTarget.checked })}
            />
            Shuffle answer positions
          </label>
          {flags.protect && (
            <label class="opt check" title="Wrong answers in a row make a player wait longer before the next question">
              <input type="checkbox" checked={view.protect} onChange={(e) => send({ type: "host.setProtect", on: e.currentTarget.checked })} />
              Protect from abuse
            </label>
          )}
        </div>
        {Preview && <Preview settings={view.settings[view.mode]} />}
        {connected === 0 ? (
          <div class="waiting">Waiting for players…</div>
        ) : view.teams ? (
          <div class={`team-preview n${view.teams.length}`}>
            {view.teams.map((t) => (
              <section
                key={t.index}
                class={`team-box ${dragOver === t.index ? "drop-target" : ""}`}
                style={teamVars(t.color)}
                {...(canDrag && {
                  onDragOver: (e: DragEvent) => {
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    setDragOver(t.index);
                  },
                  onDragLeave: (e: DragEvent) => {
                    if (!(e.currentTarget as Element).contains(e.relatedTarget as Node | null)) setDragOver(null);
                  },
                  onDrop: (e: DragEvent) => {
                    e.preventDefault();
                    const playerId = e.dataTransfer?.getData("text/plain");
                    setDragOver(null);
                    if (playerId && !t.members.some((p) => p.id === playerId)) send({ type: "host.setTeam", playerId, team: t.index });
                  },
                })}
              >
                <h3>
                  Team {t.name} <span>{t.members.length}</span>
                </h3>
                <ul class="player-chips">
                  {t.members.map((p) => (
                    <li key={p.id}>
                      <PlayerChip p={p} send={send} draggable={canDrag} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul class="player-chips">
            {view.players.map((p) => (
              <li key={p.id}>
                <PlayerChip p={p} send={send} />
              </li>
            ))}
          </ul>
        )}
        <p class="hint">
          {view.quiz.questionCount} questions · {canDrag ? "drag a name to move it to another team · " : ""}click a name to remove a player · Space to start
        </p>
      </section>
    </main>
  );
}
