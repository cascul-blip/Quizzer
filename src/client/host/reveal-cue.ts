/**
 * Whether everyone who could answer did: players whose phones dropped don't count, because the
 * server closes the question early once every connected player has answered.
 */
export function everyoneAnswered(answeredCount: number, players: { connected: boolean }[]): boolean {
  return answeredCount >= players.filter((p) => p.connected).length;
}

/** The sound for a question closing: the time-up buzzer only when the clock ran out on someone. */
export function revealCue(wasOpen: boolean, answeredCount: number, players: { connected: boolean }[]): "timeUp" | "reveal" {
  return wasOpen && !everyoneAnswered(answeredCount, players) ? "timeUp" : "reveal";
}
