import { createContext, type ComponentChildren } from "preact";
import { useContext } from "preact/hooks";
import { towerTheme, type TowerTheme } from "../../shared/tower-theme.ts";
import { isPhoneArt, pickArt } from "./phone-art.ts";
import art0 from "./tower/christmas/office-1.webp";
import phone0 from "./tower/christmas/phone/office-1.webp";
import art1 from "./tower/christmas/office-2.webp";
import phone1 from "./tower/christmas/phone/office-2.webp";
import art2 from "./tower/christmas/office-3.webp";
import phone2 from "./tower/christmas/phone/office-3.webp";
import art3 from "./tower/christmas/office-4.webp";
import phone3 from "./tower/christmas/phone/office-4.webp";
import art4 from "./tower/christmas/lobby.webp";
import phone4 from "./tower/christmas/phone/lobby.webp";
import art5 from "./tower/christmas/shop.webp";
import phone5 from "./tower/christmas/phone/shop.webp";
import art6 from "./tower/christmas/crane.webp";
import phone6 from "./tower/christmas/phone/crane.webp";
import art7 from "./tower/christmas/crane-mask.webp";
import phone7 from "./tower/christmas/phone/crane-mask.webp";
import art8 from "./tower/christmas/bell.webp";
import phone8 from "./tower/christmas/phone/bell.webp";
import art9 from "./tower/christmas/yeti.webp";
import phone9 from "./tower/christmas/phone/yeti.webp";
import art10 from "./tower/christmas/background.webp";
import phone10 from "./tower/christmas/phone/background.webp";

const Theme = createContext<TowerTheme>("classic");
export function TowerThemeProvider({ theme, children }: { theme?: TowerTheme; children: ComponentChildren }) {
  return <Theme.Provider value={towerTheme(theme)}>{children}</Theme.Provider>;
}
export const useTowerTheme = () => useContext(Theme);
export const useChristmasTower = () => useTowerTheme() === "christmas";

const hostTiles = { offices: [art0, art1, art2, art3], lobby: art4, shop: art5 };
const phoneTiles = { offices: [phone0, phone1, phone2, phone3], lobby: phone4, shop: phone5 };
export const christmasTiles = () => isPhoneArt() ? phoneTiles : hostTiles;
export const christmasCrane = () => pickArt(art6, phone6);
export const christmasCraneMask = () => pickArt(art7, phone7);
export const christmasBell = () => pickArt(art8, phone8);
export const christmasYeti = () => pickArt(art9, phone9);
export const christmasBackground = () => pickArt(art10, phone10);
export function ChristmasBackdrop() {
  return <div class="tower-winter-backdrop" style={{ backgroundImage: `url(${christmasBackground()})` }} aria-hidden="true" />;
}
