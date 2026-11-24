import type { MEMORY_FACE_COUNT } from "../../../shared/modes/memory.ts";
import type { ThemeOf } from "../../../shared/themed-modes.ts";
import { modeTheme } from "../../../shared/themed-modes.ts";
import christmasFaces from "./christmas/faces.webp";
import christmasTable from "./christmas/table.webp";
import "./christmas/card-back.css";

interface MemoryThemeArt {
  table: string;
  cardBackClass: string;
  faces: {
    image: string;
    columns: number;
    names: readonly string[] & { length: typeof MEMORY_FACE_COUNT };
  };
}

const MEMORY_THEME_ART = {
  christmas: {
    table: christmasTable,
    cardBackClass: "memory-card-back",
    faces: {
      image: christmasFaces,
      columns: 5,
      names: [
        "Santa Claus",
        "Christmas tree",
        "Candy cane",
        "Reindeer",
        "Snowman",
        "Wrapped present",
        "Bauble",
        "Gingerbread person",
        "Candle",
        "Teddy bear",
        "Stocking",
        "Bell",
        "Rocking horse",
        "Wreath",
        "Toy train",
        "Holly",
        "Cranberry punch",
        "Hot chocolate",
        "Penguin",
        "Ice skate",
        "Sleigh",
        "Gold star",
        "Cardinal",
        "Mitten",
        "Pine cone",
        "Earmuffs",
        "Trumpet",
        "Gingerbread house",
        "Peppermint candy",
        "Nutcracker",
        "Snow globe",
        "Yule log cake",
        "Elf",
        "Basket of apples",
        "Hockey stick and puck",
        "Snow shovel",
        "Clementine",
        "Scarf",
        "Sealed letter",
        "Lantern",
        "Lamppost",
        "Polar bear",
        "Skis",
        "Violin",
        "Winter hat",
        "Icicle",
        "Ribbon bow",
        "Acorn",
        "Winter coat",
        "Advent calendar",
      ],
    },
  },
} as const satisfies Record<ThemeOf<"memory">, MemoryThemeArt>;

export const memoryThemeArt = MEMORY_THEME_ART[modeTheme("memory")];
