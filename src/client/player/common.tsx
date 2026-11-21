import type { ComponentChildren, ComponentType } from "preact";
import type { ClientMsg, PlayerView } from "../../shared/protocol.ts";
import { StreakBadge } from "../shared/ui.tsx";

export type Send = (m: ClientMsg) => void;

/** A joined phone's view in the lobby and in Classic. */
export type Joined = Extract<PlayerView, { kind: "classic" }>;

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
export function Bar({ view }: { view: Joined }) {
  return (
    <header class="bar">
      <span class="name">
        {view.me.nickname}
        <StreakBadge streak={view.me.streak} />
      </span>
      {view.question && view.phase !== "lobby" && (
        <span class="qnum">
          {view.question.index + 1} / {view.question.total}
        </span>
      )}
      {view.phase !== "lobby" && <span class="score">{view.me.score.toLocaleString()}</span>}
    </header>
  );
}
