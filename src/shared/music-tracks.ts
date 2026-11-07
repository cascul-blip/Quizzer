// Background music tracks. Each id is also the file name (minus extension) that
// replaces the built-in track when placed in data/music/, e.g. submarine-chase.mp3.

export const MUSIC_TRACKS = [
  { id: "classic-lobby", mode: "Classic", screen: "Lobby" },
  { id: "classic-question", mode: "Classic", screen: "Questions" },
  { id: "classic-leaderboard", mode: "Classic", screen: "Answer reveal & leaderboard" },
  { id: "classic-results", mode: "Classic", screen: "Final podium" },
  { id: "tower-lobby", mode: "Tallest Tower", screen: "Lobby" },
  { id: "tower-play", mode: "Tallest Tower", screen: "Building" },
  { id: "tower-results", mode: "Tallest Tower", screen: "Final podium" },
  { id: "tower-christmas-lobby", mode: "North Pole Tower", screen: "Lobby" },
  { id: "tower-christmas-play", mode: "North Pole Tower", screen: "Building" },
  { id: "tower-christmas-results", mode: "North Pole Tower", screen: "Final podium" },
  { id: "submarine-lobby", mode: "Sled Squad", screen: "Lobby" },
  { id: "submarine-chase", mode: "Sled Squad", screen: "Chase" },
  { id: "submarine-dive", mode: "Sled Squad", screen: "Trail challenge" },
  { id: "submarine-results", mode: "Sled Squad", screen: "Final results" },
  { id: "fight-lobby", mode: "Tower Fight", screen: "Lobby" },
  { id: "fight-play", mode: "Tower Fight", screen: "Battle" },
  { id: "fight-results", mode: "Tower Fight", screen: "Final results" },
  { id: "robot-lobby", mode: "Robot Attack", screen: "Lobby" },
  { id: "robot-quiz", mode: "Robot Attack", screen: "Quiz" },
  { id: "robot-move", mode: "Robot Attack", screen: "Movement & laser attack" },
  { id: "robot-results", mode: "Robot Attack", screen: "Final results" },
  { id: "land-lobby", mode: "Land Grab", screen: "Lobby" },
  { id: "land-play", mode: "Land Grab", screen: "The land" },
  { id: "land-results", mode: "Land Grab", screen: "Final podium" },
  { id: "racer-lobby", mode: "Racer", screen: "Lobby" },
  { id: "racer-drive", mode: "Racer", screen: "Driving" },
  { id: "racer-results", mode: "Racer", screen: "Final results" },
  { id: "racer-christmas-lobby", mode: "Neon Noel Racer", screen: "Lobby" },
  { id: "racer-christmas-drive", mode: "Neon Noel Racer", screen: "Driving" },
  { id: "racer-christmas-results", mode: "Neon Noel Racer", screen: "Final results" },
  { id: "cup-lobby", mode: "Cup of Death", screen: "Lobby" },
  { id: "cup-quiz", mode: "Cup of Death", screen: "Dice & quiz" },
  { id: "cup-drink", mode: "Cup of Death", screen: "Drinking" },
  { id: "cup-results", mode: "Cup of Death", screen: "Final results" },
  { id: "dragon-lobby", mode: "Dragon's Hoard", screen: "Lobby" },
  { id: "dragon-battle", mode: "Dragon's Hoard", screen: "Battle" },
  { id: "dragon-fire", mode: "Dragon's Hoard", screen: "Fire breath" },
  { id: "dragon-scramble", mode: "Dragon's Hoard", screen: "Hoard scramble" },
  { id: "dragon-results", mode: "Dragon's Hoard", screen: "Final podium" },
  { id: "bomb-lobby", mode: "Bomb Squad", screen: "Lobby" },
  { id: "bomb-defuse", mode: "Bomb Squad", screen: "Defusing" },
  { id: "bomb-results", mode: "Bomb Squad", screen: "Defused, exploded, or podium" },
  { id: "siege-lobby", mode: "Kingdom Siege", screen: "Lobby" },
  { id: "siege-battle", mode: "Kingdom Siege", screen: "Countdown, build breaks and waves" },
  { id: "siege-results", mode: "Kingdom Siege", screen: "The kingdom stands, the castle falls, or podium" },
  { id: "showdown-lobby", mode: "Showdown", screen: "Lobby" },
  { id: "showdown", mode: "Showdown", screen: "The standoff (question and reveal)" },
  { id: "showdown-draw", mode: "Showdown", screen: "Draw sting (plays once on each reveal)" },
  { id: "showdown-results", mode: "Showdown", screen: "Final podium" },
  { id: "sleigh-lobby", mode: "Santa's Sleigh Run", screen: "Lobby" },
  { id: "sleigh-flight", mode: "Santa's Sleigh Run", screen: "Quiz, intro and flight" },
  { id: "sleigh-results", mode: "Santa's Sleigh Run", screen: "Final podium" },
] as const;

export type MusicTrackId = (typeof MUSIC_TRACKS)[number]["id"];

export const MUSIC_EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
};

const TRACK_IDS = new Set<string>(MUSIC_TRACKS.map((t) => t.id));

/** "submarine-chase.mp3" → "submarine-chase" if it's a known track with a supported extension, else null. */
export function musicTrackForFile(fileName: string): MusicTrackId | null {
  const m = /^([a-z-]+)\.([a-z0-9]+)$/i.exec(fileName);
  if (!m || !MUSIC_EXTENSIONS[m[2]!.toLowerCase()]) return null;
  const id = m[1]!.toLowerCase();
  return TRACK_IDS.has(id) ? (id as MusicTrackId) : null;
}
