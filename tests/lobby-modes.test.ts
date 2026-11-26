import { describe, expect, test } from "bun:test";
import type { ComponentChildren, FunctionComponent } from "preact";
import { h } from "preact";
import type { LobbySettingsProps } from "../src/client/host/lobby-modes.tsx";
import { HOST_MODES, lobbyEntryOf } from "../src/client/host/modes.tsx";
import { MODES } from "../src/server/game/modes.ts";
import { keysOf } from "../src/shared/keys-of.ts";
import type { GameMode } from "../src/shared/mode-entries.ts";
import { SHARED_MODES } from "../src/shared/mode-entries.ts";

function containsInChildren(tree: ComponentChildren, node: unknown): boolean {
  if (tree === node) return true;
  if (Array.isArray(tree)) return tree.some((child) => containsInChildren(child, node));
  if (tree && typeof tree === "object" && "props" in tree) return containsInChildren((tree.props as { children?: ComponentChildren }).children, node);
  return false;
}

describe("Lobby mode entries", () => {
  test("projector mode entries preserve the Game mode menu order", () => {
    expect(Object.keys(HOST_MODES)).toEqual(["classic", "tower", "submarine", "fight", "robot", "land", "racer", "gift", "cup", "siege", "duel", "memory"]);
  });

  for (const mode of keysOf(HOST_MODES)) {
    test.if(SHARED_MODES[mode].flags.paced)(`${SHARED_MODES[mode].name}'s settings panel places the shared rows`, () => {
      const rows = h("span", { class: "shared-rows" });
      const Settings = lobbyEntryOf(mode).Settings as FunctionComponent<LobbySettingsProps<GameMode>>;
      expect(containsInChildren(Settings({ settings: MODES[mode].defaultSettings, send: () => {}, children: rows }), rows)).toBe(true);
    });
  }
});
