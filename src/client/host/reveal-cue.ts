// why: dropped phones don't count, because the server closes the question once every connected player has answered.
export function everyoneAnswered(answeredCount: number, players: { connected: boolean }[]): boolean {
  return answeredCount >= players.filter((p) => p.connected).length;
}

export function revealCue(wasOpen: boolean, answeredCount: number, players: { connected: boolean }[]): "timeUp" | "reveal" {
  return wasOpen && !everyoneAnswered(answeredCount, players) ? "timeUp" : "reveal";
}
