import map from "./land/christmas/north-pole.webp";
import phoneMap from "./land/christmas/phone/north-pole.webp";
import phoneTable from "./land/christmas/phone/tabletop.webp";
import table from "./land/christmas/tabletop.webp";
import { pickArt } from "./phone-art.ts";
import { createSkin } from "./season-skin.tsx";

const skin = createSkin("land");
export const LandThemeProvider = skin.Provider;
export const useNorthPole = skin.useChristmas;
export const northPoleArt = () => ({ map: pickArt(map, phoneMap), table: pickArt(table, phoneTable) });
