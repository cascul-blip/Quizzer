// Symbols for Submarine Squad's diving mode: 8 sea shapes × 4 colors, each easy to say out loud ("the red octopus").

export const SEA_SHAPES = ["octopus", "anchor", "starfish", "shell", "fish", "crab", "whale", "jellyfish"] as const;
export const SEA_COLORS = [
  { id: "red", hex: "#e21b3c" },
  { id: "blue", hex: "#1368ce" },
  { id: "yellow", hex: "#e0a800" },
  { id: "green", hex: "#26890c" },
] as const;

export type SeaShape = (typeof SEA_SHAPES)[number];
export type SeaColor = (typeof SEA_COLORS)[number]["id"];

export const symbolId = (color: SeaColor, shape: SeaShape) => `${color}-${shape}`;

export function parseSymbol(id: string): { color: SeaColor; shape: SeaShape } | null {
  const [color, shape] = id.split("-") as [SeaColor, SeaShape];
  if (!SEA_COLORS.some((c) => c.id === color) || !SEA_SHAPES.includes(shape)) return null;
  return { color, shape };
}

export const symbolName = (id: string) => id.replace("-", " ");

export const ALL_SYMBOLS: string[] = SEA_COLORS.flatMap((c) => SEA_SHAPES.map((s) => symbolId(c.id, s)));
