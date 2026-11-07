# Snowball Showdown review

Run `bun scripts/duel-christmas-preview/game-serve.ts` and open http://127.0.0.1:8102/ (host) or `/phone`. This uses the production host and phone components, with nine players across all four locations. Controls exercise phases, themes, draws, reversed winners and replay. Add `?elapsed=1550` for the impact or `?elapsed=6000` for a late reconnect.

Run `node scripts/duel-christmas-preview/game-check.mjs` to verify four distinct arenas, avatar geometry, release and impact, loser-only puffs, draws, reversed winners, reconnect, host and phone podiums, classic fallback, phone artwork and reduced motion. Optional `QUIZZER_PLAYWRIGHT_MODULE` and `QUIZZER_CHROMIUM` override the installed Playwright/browser paths. Screenshots go to `output/duel-christmas-review/`.

`lobby-check.mjs` verifies the actual application: create a quiz, choose themes and rounds, reload, join two phones, answer a round, verify the live impact, reconnect, end the game, and Play Again. Run it against an isolated server on port 8103 with a temporary data directory; it creates test data.

Artwork sources, prompts and the converter are in `scripts/duel-christmas-art/` and `scripts/duel-christmas-art.py`.

## Original art prototype

Run `bun scripts/duel-christmas-preview/serve.ts` and open http://127.0.0.1:8101/.

Review avatar attachment, eight character poses, a separate snowball arc, and a snow puff on the losing player. Includes replay, winner/ avatar selection, half speed, and a timeline scrubber. This does not modify the live game or lobby defaults.

Artwork, screenshots and generation prompts are in `output/duel-christmas-prototype/`. Uses the actual Avatar component. Both players use the same red elf costume in this prototype.

Run `node scripts/duel-christmas-preview/check.mjs` with Playwright installed; optional `QUIZZER_PLAYWRIGHT_MODULE` and `QUIZZER_CHROMIUM` override its module and browser paths. Checks collision timing, both directions, the hit reaction, replay, reduced motion, phone rendering and browser errors.
