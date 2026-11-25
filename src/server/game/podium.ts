import { keysOf } from "../../shared/keys-of.ts";
import type { SubAward } from "../../shared/mode-views.ts";
import type { RankKey } from "./standings.ts";
import { rankBy } from "./standings.ts";

/** A mode's awards: each key's label (from its shared mode entry) and the value a player is judged on. */
export interface AwardDeclarations<P, K extends string> {
  labels: Readonly<Record<K, string>>;
  values: Readonly<Record<K, (player: P) => number>>;
}

interface PodiumPlayer {
  id: string;
  nickname: string;
}

/** What a game mode gives the Podium (GLOSSARY.md). */
export interface PodiumSpec<E extends object, P extends PodiumPlayer, K extends string> {
  /** Players, or teams. */
  entries: readonly E[];
  /** The Standings order: entries equal on every key share a place. */
  order: RankKey<E>[];
  /** Orders entries only within a shared place. */
  then?: RankKey<E>[];
  players: readonly P[];
  /** The entry a player finishes with (themselves, or their team). */
  entryOf: (player: P) => E;
  awards: AwardDeclarations<P, K>;
}

export interface PodiumResult {
  place: number;
  playerCount: number;
  /** Labels of the awards this player won. */
  awards: string[];
}

export interface Podium<E extends object, P extends PodiumPlayer, K extends string> {
  /** Entries best first, each a copy taken when the game finished, with its place. */
  readonly places: readonly (E & { place: number })[];
  /** Each award's winners, or null when nobody scored above 0. */
  readonly awards: Readonly<Record<K, SubAward | null>>;
  /** Results sheet rows: each player (copied when the game finished) with their entry's place, in Standings order. */
  readonly rows: readonly { place: number; player: P }[];
  /** A player's place, the player count and their award labels; null for someone not in the game. */
  result(playerId: string): PodiumResult | null;
}

/** The highest value wins, everyone tied on it shares the award, and nobody gets it when the highest value is 0. */
function winners<P extends PodiumPlayer>(players: readonly P[], value: (p: P) => number): { value: number; players: P[] } | null {
  const values = players.map(value);
  const top = Math.max(0, ...values);
  return top > 0 ? { value: top, players: players.filter((_, i) => values[i] === top) } : null;
}

/** Work out the finished game's Podium once; nothing about it changes after. */
export function buildPodium<E extends object, P extends PodiumPlayer, K extends string>(spec: PodiumSpec<E, P, K>): Podium<E, P, K> {
  const wrap = (keys: RankKey<E>[]): RankKey<{ entry: E }>[] => keys.map((key) => (a, b) => key(a.entry, b.entry));
  const ranked = rankBy(
    spec.entries.map((entry) => ({ entry })),
    wrap(spec.order),
    wrap(spec.then ?? []),
  );
  const placeOf = new Map<E, number>(ranked.map((r) => [r.entry, r.rank]));
  const orderOf = new Map<E, number>(ranked.map((r, i) => [r.entry, i]));
  const places = ranked.map((r) => ({ ...r.entry, place: r.rank }));

  const keys = keysOf(spec.awards.values);
  const won = new Map(keys.map((k) => [k, winners(spec.players, spec.awards.values[k])]));
  // checked: the loop below fills every key of the award values.
  const awards = {} as Record<K, SubAward | null>;
  for (const [k, w] of won) awards[k] = w && { value: w.value, nicknames: w.players.map((p) => p.nickname) };

  const results = new Map<string, PodiumResult>();
  const rows: { place: number; player: P; order: number }[] = [];
  for (const player of spec.players) {
    const entry = spec.entryOf(player);
    const place = placeOf.get(entry) ?? spec.entries.length;
    results.set(player.id, {
      place,
      playerCount: spec.players.length,
      awards: keys.filter((k) => won.get(k)?.players.includes(player)).map((k) => spec.awards.labels[k]),
    });
    rows.push({ place, player: { ...player }, order: orderOf.get(entry) ?? rows.length });
  }
  rows.sort((a, b) => a.order - b.order);

  return {
    places,
    awards,
    rows: rows.map(({ place, player }) => ({ place, player })),
    result: (playerId) => results.get(playerId) ?? null,
  };
}
