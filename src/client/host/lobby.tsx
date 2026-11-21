import { GIFT_MINUTES } from "../../shared/gift-rules.ts";
import { duelArenaName, duelName, duelTheme, type DuelTheme } from "../../shared/duel-theme.ts";
import { SnowballLobbyPreview } from "../shared/duel-christmas.tsx";
import { landTheme, type LandTheme } from "../../shared/land-theme.ts";
import { fightName, fightTheme, type FightTheme } from "../../shared/fight-theme.ts";
import { racerName, racerTheme, type RacerTheme } from "../../shared/racer-theme.ts";
import { towerTheme, towerWords, type TowerTheme } from "../../shared/tower-theme.ts";
import { cupName, cupTheme, type CupTheme } from "../../shared/cup-theme.ts";
import { siegeName, siegeTheme, type SiegeTheme } from "../../shared/siege-theme.ts";
import { useState } from "preact/hooks";
import { CUP_MAX_CUPS, CUP_MIN_CUPS, DUEL_ROUNDS, HILL_SETTINGS, LAND_MINUTES, LAND_MIN_TEAMS, MAX_TEAMS, TOWER_MINUTES, type GameMode, type HillSetting, type HostPlayer, type HostView, type Pacing } from "../../shared/protocol.ts";
import { SIEGE_WAVE_CHOICES } from "../../shared/siege-rules.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { teamVars } from "../shared/ui.tsx";
import type { Send } from "./common.tsx";
import { SiegeLobbyPreview } from "./siege.tsx";

type GameView = Extract<HostView, { kind: "classic" }>;

const HILL_LABELS: Record<HillSetting, string> = { random: "🎲 Random", low: "Low", medium: "Medium", high: "High" };

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

/** The lobby screen: how to join, the game mode and its mode settings, and the players. Classic's stage shows it, since the lobby is the first phase of Classic's view. */
export function Lobby({ view, send }: { view: GameView; send: Send }) {
  const { join } = view;
  const connected = view.players.length;
  const tower = view.mode === "tower";
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
          <p>
            If phones can't load the page, pick the address of the Wi-Fi/Ethernet adapter, and allow port {join.port} through the firewall.
          </p>
        </details>
      </section>
      <section class="players-panel">
        <div class="players-head">
          <h2>
            {connected} player{connected === 1 ? "" : "s"}
          </h2>
          <button
            class="btn primary start"
            disabled={connected === 0}
            onClick={() => send({ type: "host.start", pacing: view.pacing })}
          >
            Start
          </button>
        </div>
        <div class="game-options">
          <label class="opt">
            Game mode
            <select value={view.mode} onChange={(e) => send({ type: "host.setMode", mode: e.currentTarget.value as GameMode })}>
              <option value="classic">Classic</option>
              <option value="tower">{towerWords(view.settings.tower.theme).icon} {towerWords(view.settings.tower.theme).name}</option>
              <option value="submarine">🛷 Sled Squad</option>
              <option value="fight">{fightName(view.settings.fight.theme)}</option>
              <option value="robot">🤖 Robot Attack</option>
              <option value="land">🚩 Land Grab</option>
              <option value="racer">{racerName(view.settings.racer?.theme)}</option>
              <option value="gift">🎁 Gift Grab</option>
              <option value="cup">{cupName(view.settings.cup.theme)}</option>
              <option value="siege">{siegeTheme(view.settings.siege.theme) === "christmas" ? "🎄" : "🛡️"} {siegeName(view.settings.siege.theme)}</option>
              <option value="duel">{duelTheme(view.settings.duel.theme) === "christmas" ? "❄️ Snowball Showdown" : "🤠 Showdown"}</option>
            </select>
          </label>
          {view.mode === "racer" && (
            <label class="opt">
              Theme
              <select aria-label="Racer theme" value={racerTheme(view.settings.racer?.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "racer", settings: { theme: e.currentTarget.value as RacerTheme } })}>
                <option value="christmas">🎄 Neon Noel</option>
                <option value="classic">🏎 Normal</option>
              </select>
            </label>
          )}
          {tower ? (
            <>
              <label class="opt">
                Theme
                <select aria-label="Tower theme" value={towerTheme(view.settings.tower.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "tower", settings: { teams: view.settings.tower.teams, minutes: view.settings.tower.minutes, theme: e.currentTarget.value as TowerTheme } })}>
                  <option value="christmas">🎄 North Pole Workshop</option>
                  <option value="classic">🏗 Normal</option>
                </select>
              </label>
              <label class="opt">
                Teams
                <select value={view.settings.tower.teams} onChange={(e) => send({ type: "host.setModeSettings", mode: "tower", settings: { teams: Number(e.currentTarget.value), minutes: view.settings.tower.minutes } })}>
                  {Array.from({ length: MAX_TEAMS }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label class="opt">
                Time
                <select value={view.settings.tower.minutes} onChange={(e) => send({ type: "host.setModeSettings", mode: "tower", settings: { teams: view.settings.tower.teams, minutes: Number(e.currentTarget.value) } })}>
                  {TOWER_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <label class="opt check" title={view.settings.tower.teams < 2 ? "Needs 2 or more teams" : `${towerWords(view.settings.tower.theme).item === "bell" ? "Bells" : "Monster eggs"} appear 4 times per game`}>
                <input
                  type="checkbox"
                  disabled={view.settings.tower.teams < 2}
                  checked={view.settings.tower.monster && view.settings.tower.teams >= 2}
                  onChange={(e) => send({ type: "host.setModeSettings", mode: "tower", settings: { teams: view.settings.tower.teams, minutes: view.settings.tower.minutes, monster: e.currentTarget.checked } })}
                />
                {towerWords(view.settings.tower.theme).creatureIcon} {towerTheme(view.settings.tower.theme) === "christmas" ? "Yeti" : "Monster"}{view.settings.tower.teams < 2 ? " (needs 2+ teams)" : ""}
              </label>
            </>
          ) : view.mode === "fight" ? (
            <>
              <label class="opt">
                Theme
                <select aria-label="Tower Fight theme" value={fightTheme(view.settings.fight.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "fight", settings: { theme: e.currentTarget.value as FightTheme } })}>
                  <option value="classic">🏰 Normal</option>
                  <option value="christmas">🎄 Gingerbread Siege</option>
                </select>
              </label>
              <label class="opt">
                Hill
                <select value={view.settings.fight.hill} onChange={(e) => send({ type: "host.setModeSettings", mode: "fight", settings: { hill: e.currentTarget.value as HillSetting } })}>
                  {HILL_SETTINGS.map((h) => (
                    <option key={h} value={h}>
                      {HILL_LABELS[h]}
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">Red vs Blue: knock down the other team's tower. The game runs until a tower falls or you end it.</span>
            </>
          ) : view.mode === "land" ? (
            <>
              <label class="opt">
                Theme
                <select aria-label="Land Grab theme" value={landTheme(view.settings.land.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "land", settings: { teams: view.settings.land.teams, minutes: view.settings.land.minutes, theme: e.currentTarget.value as LandTheme } })}>
                  <option value="christmas">🎄 North Pole</option>
                  <option value="classic">🚩 Classic</option>
                </select>
              </label>
              <label class="opt">
                Teams
                <select value={view.settings.land.teams} onChange={(e) => send({ type: "host.setModeSettings", mode: "land", settings: { teams: Number(e.currentTarget.value), minutes: view.settings.land.minutes } })}>
                  {Array.from({ length: MAX_TEAMS - LAND_MIN_TEAMS + 1 }, (_, i) => (
                    <option key={i} value={i + LAND_MIN_TEAMS}>
                      {i + LAND_MIN_TEAMS}
                    </option>
                  ))}
                </select>
              </label>
              <label class="opt">
                Time
                <select value={view.settings.land.minutes} onChange={(e) => send({ type: "host.setModeSettings", mode: "land", settings: { teams: view.settings.land.teams, minutes: Number(e.currentTarget.value) } })}>
                  {LAND_MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">Every 3 questions, correct answers become tiles. Surround land to capture it, and another team's starting point to knock them out.</span>
            </>
          ) : view.mode === "robot" ? (
            <span class="opt mode-hint">Answer questions to earn moves, then dodge the robot's lasers. Last one standing wins.</span>
          ) : view.mode === "gift" ? (
            <>
              <label class="opt">
                Time
                <select value={view.settings.gift.minutes} onChange={(e) => send({ type: "host.setModeSettings", mode: "gift", settings: { minutes: Number(e.currentTarget.value) } })}>
                  {GIFT_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                </select>
              </label>
              <span class="opt mode-hint">Every five correct answers earns 15 seconds to tap gifts and dodge duds. Later rounds are worth more.</span>
            </>
          ) : view.mode === "cup" ? (
            <>
              <label class="opt">
                Theme
                <select aria-label="Cup theme" value={cupTheme(view.settings.cup.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "cup", settings: { cups: view.settings.cup.cups, theme: e.currentTarget.value as CupTheme } })}>
                  <option value="christmas">🎄 Santa's Workshop</option>
                  <option value="classic">☠️ Normal</option>
                </select>
              </label>
              <label class="opt">
                Cups
                <select value={view.settings.cup.cups} onChange={(e) => send({ type: "host.setModeSettings", mode: "cup", settings: { cups: Number(e.currentTarget.value) } })}>
                  {Array.from({ length: CUP_MAX_CUPS - CUP_MIN_CUPS + 1 }, (_, i) => (
                    <option key={i} value={i + CUP_MIN_CUPS}>
                      {i + CUP_MIN_CUPS}
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">{cupTheme(view.settings.cup.theme) === "christmas" ? "Roll the die, then answer that many questions before time runs out, or sip some cocoa. One cup is supercharged: shake, sparkle and blast off! Last one in the workshop wins." : "Roll the die, then answer that many questions before time runs out, or drink from a cup. One is poisoned. Last one standing wins."}</span>
            </>
          ) : view.mode === "siege" ? (
            <>
              <label class="opt">
                Theme
                <select aria-label="Kingdom Siege theme" value={siegeTheme(view.settings.siege.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "siege", settings: { ...view.settings.siege, theme: e.currentTarget.value as SiegeTheme } })}>
                  <option value="classic">🛡️ Classic Kingdom Siege</option>
                  <option value="christmas">🎄 Christmas Toybox</option>
                </select>
              </label>
              <label class="opt">
                Waves
                <select aria-label="Kingdom Siege waves" value={String(view.settings.siege.waves)} onChange={(e) => send({ type: "host.setModeSettings", mode: "siege", settings: { ...view.settings.siege, waves: e.currentTarget.value === "endless" ? "endless" : (Number(e.currentTarget.value) as 5 | 10) } })}>
                  {SIEGE_WAVE_CHOICES.map((w) => (
                    <option key={w} value={String(w)}>
                      {w === "endless" ? "♾ Endless" : `${w} waves`}
                    </option>
                  ))}
                </select>
              </label>
              <span class="opt mode-hint">The whole class defends one castle. Every right answer earns you gold to spend on {siegeTheme(view.settings.siege.theme) === "christmas" ? "elf archers, nutcrackers and present barricades" : "archers, knights and stone walls"} before the monsters reach the wall.</span>
            </>
          ) : view.mode === "submarine" ? (
            <span class="opt mode-hint">Everyone works together to outrun the Christmas goblin. The game ends when it catches you.</span>
          ) : (
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
              {view.mode === "racer" && <span class="opt mode-hint">One car for the whole class. Each turn a driver bets on how well everyone will answer.</span>}
              {view.mode === "duel" && (
                <>
                  <label class="opt">
                    Rounds
                    <select aria-label="Showdown rounds" value={view.settings.duel.rounds} onChange={(e) => send({ type: "host.setModeSettings", mode: "duel", settings: { ...view.settings.duel, rounds: Number(e.currentTarget.value) } })}>
                      {DUEL_ROUNDS.map((r) => (
                        <option key={r} value={r}>
                          {r} rounds
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="opt">Theme
                    <select aria-label="Showdown theme" value={duelTheme(view.settings.duel.theme)} onChange={(e) => send({ type: "host.setModeSettings", mode: "duel", settings: { ...view.settings.duel, theme: e.currentTarget.value as DuelTheme } })}>
                      <option value="christmas">North Pole Snowball Showdown</option>
                      <option value="classic">Classic Showdown</option>
                    </select>
                  </label>
                  <span class="opt mode-hint">{duelName(view.settings.duel.theme)}: everyone duels at once. Win to climb toward {duelArenaName(1, view.settings.duel.theme)}, lose and you drop an arena.</span>
                </>
              )}
            </>
          )}
          <label class="opt check">
            <input
              type="checkbox"
              checked={view.shuffle.answers}
              onChange={(e) => send({ type: "host.setShuffle", questions: view.shuffle.questions, answers: e.currentTarget.checked })}
            />
            Shuffle answer positions
          </label>
          {(view.mode === "tower" || view.mode === "submarine" || view.mode === "fight" || view.mode === "robot" || view.mode === "cup" || view.mode === "siege" || view.mode === "gift") && (
            <label class="opt check" title="Wrong answers in a row make a player wait longer before the next question">
              <input type="checkbox" checked={view.protect} onChange={(e) => send({ type: "host.setProtect", on: e.currentTarget.checked })} />
              Protect from abuse
            </label>
          )}
        </div>
        {view.mode === "siege" && <SiegeLobbyPreview theme={view.settings.siege.theme} />}
        {view.mode === "duel" && duelTheme(view.settings.duel.theme) === "christmas" && <SnowballLobbyPreview />}
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
