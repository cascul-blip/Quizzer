import { describe, expect, test } from "bun:test";
import type { ComponentChildren, FunctionComponent } from "preact";
import { h } from "preact";
import type { LobbySettingsProps } from "../src/client/host/lobby-modes.tsx";
import { HOST_MODES, lobbyEntryOf } from "../src/client/host/modes.tsx";
import { MODES } from "../src/server/game/modes.ts";
import { MODE_FLAGS } from "../src/shared/mode-flags.ts";
import { MODE_NAMES } from "../src/shared/mode-names.ts";
import type { GameMode } from "../src/shared/protocol.ts";

/** Whether the rendered tree holds the node, looking through elements' children (not into components). */
function holds(tree: ComponentChildren, node: unknown): boolean {
  if (tree === node) return true;
  if (Array.isArray(tree)) return tree.some((child) => holds(child, node));
  if (tree && typeof tree === "object" && "props" in tree) return holds((tree.props as { children?: ComponentChildren }).children, node);
  return false;
}

describe("Lobby mode entries", () => {
  test("projector mode entries preserve the Game mode menu order", () => {
    expect(Object.keys(HOST_MODES)).toEqual(["classic", "tower", "submarine", "fight", "robot", "land", "racer", "gift", "cup", "siege", "duel"]);
  });

  for (const mode of Object.keys(HOST_MODES) as GameMode[]) {
    // The lobby hands a paced mode's panel the shared Pacing and Shuffle question order rows to place.
    test.if(MODE_FLAGS[mode].paced)(`${MODE_NAMES[mode]}'s settings panel places the shared rows`, () => {
      const rows = h("span", { class: "shared-rows" });
      const Settings = lobbyEntryOf(mode).Settings as FunctionComponent<LobbySettingsProps<GameMode>>;
      expect(holds(Settings({ settings: MODES[mode].defaultSettings, send: () => {}, children: rows }), rows)).toBe(true);
    });
  }
});
