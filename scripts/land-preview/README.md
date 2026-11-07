# Land Grab artwork review

Run `bun scripts/land-preview/serve.ts` and visit `http://127.0.0.1:8095/` or `/phone`.
The preview renders the production components, with controls for Christmas/Classic, 2–6 teams, territories, questions, countdown and podium.

Run `node scripts/land-preview/check.mjs` with Playwright installed. If needed set `QUIZZER_PLAYWRIGHT_MODULE` and `QUIZZER_CHROMIUM`. Screenshots are saved in `output/land-christmas-review/`. The check exercises map asset loading, side placement, board sizes, Classic fallback and actual phone hex selection.

For the real lobby-to-game check, start an isolated server on port 8094 (or set `QUIZZER_REVIEW_URL`), then run `node scripts/land-preview/lobby-check.mjs`. This creates a review quiz and checks default theme, reload, quiz-to-claim, and replay.

Visit `/music` for the actual sampled soundtrack with a capture-threat slider. Play, then choose Capture close / Ring broken to hear the same melody accelerate and settle without restarting. The lobby and podium have their own gentle arrangements; Classic remains available. `music-check.mjs` verifies live tempo changes and renders the full sampled verses to `output/land-christmas-music/`.
