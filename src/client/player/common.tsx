import type { ComponentChildren, ComponentType } from "preact";
import type { GameMode } from "../../shared/mode-entries.ts";
import type { ClientMsg, PlayerLobbyView, PlayerView } from "../../shared/protocol.ts";
import { StreakBadge } from "../shared/ui.tsx";

export type Send = (m: ClientMsg) => void;

/** A joined phone's gameplay view. */
export type PhoneView = Exclude<PlayerView, { kind: "none" | "lobby" }>;

/** A phone's view of a game of the mode; its kind is the mode. */
export type PhoneModeView<M extends GameMode> = Extract<PhoneView, { kind: M }>;

export type ClassicView = PhoneModeView<"classic">;

/** What a mode's banner adds to the phone's lobby screen (Kingdom Siege's castle). */
export interface PhoneBanner {
  /** Extra class on the player's avatar. */
  avatarClass: string;
  /** The line under "You're in!". */
  Line: ComponentType;
}

export function Center({ children }: { children: ComponentChildren }) {
  return <main class="center">{children}</main>;
}

/** The top bar of the lobby and Classic: the nickname and streak, then the question number and score once the game is on. */
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
