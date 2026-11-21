import { useEffect, useState } from "preact/hooks";
import type { AvatarChoice } from "../../shared/avatars.ts";
import type { PlayerLobbyView } from "../../shared/protocol.ts";
import { Avatar } from "../shared/avatar-art.tsx";
import { teamInk } from "../shared/ui.tsx";
import { AvatarPicker } from "./avatar-picker.tsx";
import { Bar } from "./common.tsx";
import { PLAYER_MODES } from "./modes.tsx";

export function LobbyScreen({ view, onAvatarPick }: { view: PlayerLobbyView; onAvatarPick: (choice: AvatarChoice) => void }) {
  // Show a pick straight away; the next snapshot from the server confirms it.
  const [picked, setPicked] = useState<AvatarChoice | null>(null);
  const server = view.me.avatar;
  useEffect(() => setPicked(null), [server.avatar, server.accessory]);
  const look = picked ?? server;
  const banner = PLAYER_MODES[view.mode].banner;
  return (
    <div class="game">
      <Bar view={view} />
      <main class="center lobby-wait">
        <div class={`me-avatar ${banner ? banner.avatarClass : ""}`}>
          <Avatar choice={look} />
        </div>
        <h1>You're in!</h1>
        {banner && <banner.Line />}
        {view.team && (
          <div class="team-badge" style={{ background: view.team.color, color: teamInk(view.team.color) }}>
            Team {view.team.name}
          </div>
        )}
        <p class="muted">Pick your look while you wait. It shows on the big screen!</p>
        <AvatarPicker
          value={look}
          onPick={(choice) => {
            setPicked(choice);
            onAvatarPick(choice);
          }}
        />
        <p class="muted small">
          {view.playerCount} player{view.playerCount === 1 ? "" : "s"} joined
        </p>
      </main>
    </div>
  );
}
