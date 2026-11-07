# Gingerbread Siege visual review

Run `bun scripts/fight-preview/serve.ts` and open `http://127.0.0.1:8099/` (host) or `/phone` (phone). Controls exercise both themes, damage stages, repairs, firing, old shots, collapse and results using the actual game components.

With Playwright and Chromium installed:

```
bun scripts/fight-preview/check.mjs
```

If needed, set `QUIZZER_PLAYWRIGHT_MODULE` to a Playwright module path and `QUIZZER_CHROMIUM` to the Chromium executable. Screenshots go to `output/fight-christmas-review/`. Checks cover both throwing arms, return to rest, expired shots, theme fallback, phone states, and reduced motion.

`lobby-check.mjs` exercises the real lobby and gameplay on **an isolated server** on port 8097. Start that server with temporary data (do not point this test at a real game):

```
bun src/server/main.ts --port 8097 --data-dir /tmp/quizzer-fight-review-data --host 127.0.0.1 --no-open
bun scripts/fight-preview/lobby-check.mjs
```

It creates a review quiz, joins a phone, answers four questions, aims and fires, reloads the host, ends the game, and verifies that Play Again retains the selected theme.

Run `bun scripts/fight-preview/icing-check.mjs` against the preview server to check the three distinct icing images, fixed art placement after cratering, preserved flags, removed band, candy clipping and phone rendering.
