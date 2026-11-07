import { createContext } from "preact";
import { useContext } from "preact/hooks";
import { cupTheme, type CupTheme } from "../../shared/cup-theme.ts";

const CupThemeContext = createContext<CupTheme>(cupTheme());
export const CupThemeProvider = CupThemeContext.Provider;
export const useChristmasCup = () => useContext(CupThemeContext) === "christmas";
