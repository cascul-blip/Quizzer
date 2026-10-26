import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { ROBOT_BOARD } from "../src/shared/protocol.ts";
import { tileBox } from "../src/client/shared/robot-art.tsx";
import { TILE_ART } from "../src/client/shared/robot/tiles.ts";

const dir = new URL("../src/client/shared/robot/", import.meta.url);
const tilesDir = new URL("tiles/", dir);

/** Width and height from a WebP file's header (lossy, lossless or extended). */
function webpSize(b: Buffer): [number, number] {
  expect(b.toString("latin1", 0, 4) + b.toString("latin1", 8, 12)).toBe("RIFFWEBP");
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const v = b.readUInt32LE(21);
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1];
  }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

const tileFile = (i: number) => `t-${String(i).padStart(3, "0")}.webp`;

describe("robot arena art", () => {
  test("there is one granite tile per board index, imported in order", () => {
    const onDisk = readdirSync(tilesDir)
      .filter((f) => f.endsWith(".webp"))
      .sort();
    const n = ROBOT_BOARD * ROBOT_BOARD;
    expect(onDisk).toEqual(Array.from({ length: n }, (_, i) => tileFile(i)));
    expect(TILE_ART.length).toBe(n);
    TILE_ART.forEach((url, i) => expect(url.endsWith(tileFile(i))).toBe(true));
  });

  test("each tile goes where the art was baked for, at 2 px per arena unit", () => {
    // tiles.json is the art build's record of where it rendered each tile; a change to the board's
    // perspective constants without re-rendering the tiles shows up here.
    const baked: Record<string, [number, number, number, number]> = JSON.parse(readFileSync(new URL("tiles.json", tilesDir), "utf8"));
    for (let i = 0; i < ROBOT_BOARD * ROBOT_BOARD; i++) {
      const b = tileBox(i % ROBOT_BOARD, Math.floor(i / ROBOT_BOARD));
      expect([i, b.x, b.y, b.width, b.height]).toEqual([i, ...baked[i]!]);
      expect([i, ...webpSize(readFileSync(new URL(tileFile(i), tilesDir)))]).toEqual([i, 2 * b.width, 2 * b.height]);
    }
  });

  test("the retired arm and joint pieces are gone", () => {
    expect(existsSync(new URL("arm.webp", dir))).toBe(false);
    expect(existsSync(new URL("joint.webp", dir))).toBe(false);
  });
});
