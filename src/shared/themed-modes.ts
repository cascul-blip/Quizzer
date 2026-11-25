export type SeasonTheme = "classic" | "christmas";
export const SEASON_THEMES: readonly SeasonTheme[] = ["classic", "christmas"];
export const isSeasonTheme = (value: unknown): value is SeasonTheme => SEASON_THEMES.some((theme) => theme === value);

/** How a themed mode is shown in one theme: its name, its icon, and the track each of its screens plays. */
interface Look<Screen extends string> {
  name: string;
  icon: string;
  tracks: Record<Screen, string>;
  /** Credited after the screen in the admin music list, such as the tune the tracks arrange. */
  tune?: string;
}

/** A themed mode: the theme new lobbies use, its screens (each with its label in the admin music list) and a look for each theme it offers. */
function themedMode<const Screen extends string, const L extends Partial<Record<SeasonTheme, Look<Screen>>>>(mode: {
  default: keyof L & SeasonTheme;
  screens: Record<Screen, string>;
  looks: L;
}) {
  return mode;
}

/**
 * Every themed mode's looks. A track id several modes or screens share is declared here and nowhere else;
 * MUSIC_TRACKS (music-tracks.ts) builds its rows from this table, and tests/themed-modes.test.ts pins every theme × screen → track.
 */
export const THEMED_MODES = {
  tower: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "Building", results: "Final podium" },
    looks: {
      classic: { name: "Tallest Tower", icon: "🏗", tracks: { lobby: "tower-lobby", play: "tower-play", results: "tower-results" } },
      christmas: {
        name: "North Pole Tower",
        icon: "🎄",
        tracks: { lobby: "tower-christmas-lobby", play: "tower-christmas-medley", results: "tower-christmas-results" },
      },
    },
  }),
  fight: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "Battle", results: "Final results" },
    looks: {
      classic: { name: "Tower Fight", icon: "🏰", tracks: { lobby: "fight-lobby", play: "fight-play", results: "fight-results" } },
      christmas: { name: "Gingerbread Siege", icon: "🎄", tracks: { lobby: "fight-lobby", play: "fight-play", results: "fight-results" } },
    },
  }),
  land: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "The land", results: "Final podium" },
    looks: {
      classic: { name: "Land Grab", icon: "🚩", tracks: { lobby: "land-lobby", play: "land-play", results: "land-results" } },
      christmas: {
        name: "North Pole Land Grab",
        icon: "🎄",
        tracks: { lobby: "land-christmas-lobby", play: "land-christmas-play", results: "land-christmas-results" },
      },
    },
  }),
  racer: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "Driving", results: "Final results" },
    looks: {
      classic: { name: "Racer", icon: "🏎", tracks: { lobby: "racer-lobby", play: "racer-drive", results: "racer-results" } },
      christmas: {
        name: "Neon Noel Racer",
        icon: "🎄",
        tracks: { lobby: "racer-christmas-lobby", play: "racer-christmas-drive", results: "racer-christmas-results" },
      },
    },
  }),
  cup: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", quiz: "Dice & quiz", drink: "Drinking", results: "Final results" },
    looks: {
      classic: { name: "Cup of Death", icon: "☠️", tracks: { lobby: "cup-lobby", quiz: "cup-quiz", drink: "cup-drink", results: "cup-results" } },
      christmas: {
        name: "Cup of Cheer",
        icon: "☕",
        tracks: { lobby: "tower-christmas-lobby", quiz: "tower-christmas-play", drink: "tower-christmas-play", results: "tower-christmas-results" },
      },
    },
  }),
  siege: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "Countdown, build breaks and waves", results: "Victory, fallen castle or podium" },
    looks: {
      classic: { name: "Kingdom Siege", icon: "🛡️", tracks: { lobby: "siege-lobby", play: "siege-battle", results: "siege-results" } },
      christmas: {
        name: "Christmas Toybox",
        icon: "🎄",
        tune: "Patapan",
        tracks: { lobby: "siege-christmas-lobby", play: "siege-christmas-battle", results: "siege-christmas-results" },
      },
    },
  }),
  duel: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "The standoff (question and reveal)", results: "Final podium" },
    looks: {
      classic: { name: "Showdown", icon: "🤠", tracks: { lobby: "showdown-lobby", play: "showdown", results: "showdown-results" } },
      christmas: {
        name: "North Pole Snowball Showdown",
        icon: "❄️",
        tracks: { lobby: "tower-christmas-lobby", play: "tower-christmas-play", results: "tower-christmas-results" },
      },
    },
  }),
  gift: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "The game", results: "Final podium" },
    looks: {
      christmas: {
        name: "Gift Grab",
        icon: "🎁",
        tracks: { lobby: "tower-christmas-lobby", play: "tower-christmas-play", results: "tower-christmas-results" },
      },
    },
  }),
  memory: themedMode({
    default: "christmas",
    screens: { lobby: "Lobby", play: "Questions and card reveals", results: "Final podium" },
    looks: {
      christmas: {
        name: "Memory Game",
        icon: "🃏",
        tracks: { lobby: "tower-christmas-lobby", play: "tower-christmas-play", results: "tower-christmas-results" },
      },
    },
  }),
};

export type ThemedMode = keyof typeof THEMED_MODES;
type Looks<M extends ThemedMode> = (typeof THEMED_MODES)[M]["looks"];
export type ThemeOf<M extends ThemedMode> = keyof Looks<M> & SeasonTheme;
export type ScreenOf<M extends ThemedMode> = keyof (typeof THEMED_MODES)[M]["screens"] & string;
type TracksOf<M extends ThemedMode> = { [T in ThemeOf<M>]: Looks<M>[T] extends { tracks: infer R } ? R[keyof R] : never }[ThemeOf<M>];
export type ThemedTrackId = { [M in ThemedMode]: TracksOf<M> }[ThemedMode] & string;

/** The theme a mode is shown in: the one given if the mode offers it, else the mode's default. */
export function modeTheme<M extends ThemedMode>(mode: M, theme?: SeasonTheme): ThemeOf<M> {
  const entry = THEMED_MODES[mode];
  // checked: a theme in the mode's looks is one it offers, and entry.default is one by themedMode's type
  return (theme !== undefined && theme in entry.looks ? theme : entry.default) as ThemeOf<M>;
}

function lookOf<M extends ThemedMode>(mode: M, theme?: SeasonTheme): Look<ScreenOf<M>> {
  // checked: every look of mode M has a track for each of M's screens (themedMode's type)
  return (THEMED_MODES[mode].looks as Record<string, Look<ScreenOf<M>>>)[modeTheme(mode, theme)]!;
}

export const themedName = (mode: ThemedMode, theme?: SeasonTheme): string => lookOf(mode, theme).name;
export const themedIcon = (mode: ThemedMode, theme?: SeasonTheme): string => lookOf(mode, theme).icon;
/** The icon and name, as the Game mode menu shows them. */
export const themedLabel = (mode: ThemedMode, theme?: SeasonTheme): string => `${themedIcon(mode, theme)} ${themedName(mode, theme)}`;

export function themedTrack<M extends ThemedMode>(mode: M, theme: SeasonTheme | undefined, screen: ScreenOf<M>): ThemedTrackId {
  // checked: ThemedTrackId is the union of every look's tracks
  return lookOf(mode, theme).tracks[screen] as ThemedTrackId;
}

/** One admin music list row per themed track; a track several modes or screens share gets one row naming them all. */
export function themedMusicTracks(): { id: ThemedTrackId; mode: string; screen: string }[] {
  const rows = new Map<string, { modes: string[]; screens: string[] }>();
  const add = (list: string[], item: string) => list.includes(item) || list.push(item);
  for (const entry of Object.values(THEMED_MODES)) {
    const screens: Record<string, string> = entry.screens;
    const looks: Partial<Record<SeasonTheme, Look<string>>> = entry.looks;
    for (const look of Object.values(looks)) {
      for (const [screen, id] of Object.entries(look.tracks)) {
        const row = rows.get(id) ?? { modes: [], screens: [] };
        rows.set(id, row);
        add(row.modes, look.name);
        add(row.screens, look.tune ? `${screens[screen]} — ${look.tune}` : screens[screen]!);
      }
    }
  }
  // checked: every id was read from a look's tracks
  return [...rows].map(([id, row]) => ({ id: id as ThemedTrackId, mode: row.modes.join(", "), screen: row.screens.join(", ") }));
}
