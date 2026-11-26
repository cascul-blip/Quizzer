import type { ComponentChildren, ComponentType } from "preact";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { ClientMsg, PlayerLobbyView, PlayerView } from "../../shared/protocol.ts";
import { StreakBadge } from "../shared/ui.tsx";

export type Send = (m: ClientMsg) => void;

export type PhoneView = Exclude<PlayerView, { kind: "none" | "lobby" }>;

export type PhoneModeView<M extends GameMode> = Extract<PhoneView, { kind: M }>;

export type ClassicView = PhoneModeView<"classic">;

export interface PhoneBanner {
  avatarClass: string;
  JoinedSubtitle: ComponentType;
}

export function Center({ children }: { children: ComponentChildren }) {
  return <main class="center">{children}</main>;
}

export function Bar({ view }: { view: ClassicView | PlayerLobbyView }) {
  return (
    <header class="bar">
      <span class="name">
        {view.me.nickname}
        {view.kind !== "lobby" && <StreakBadge streak={view.me.streak} />}
      </span>
      {view.kind !== "lobby" && view.question && (
        <span class="qnum">
          {view.question.index + 1} / {view.question.total}
        </span>
      )}
      {view.kind !== "lobby" && <span class="score">{view.me.score.toLocaleString()}</span>}
    </header>
  );
}
