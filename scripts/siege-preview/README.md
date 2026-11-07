# Christmas Toybox review

For soundtrack QA, run `bun scripts/siege-preview/music-serve.ts`, then `node scripts/siege-preview/music-check.mjs` with the Playwright/Chromium environment variables below. This renders six full sampled Patapan loops (lobby, build, battle, giant, victory and fallen), checks for audible output and clipping, and saves WAV/MP3 previews and a level report under `output/siege-christmas-music/`.

Run `bun scripts/siege-preview/serve.ts` to open the production host and phone components at http://127.0.0.1:8095/ and /phone. The controls switch between both themes, lobby, countdown, build, waves, castle damage, victory, collapse and results. Attack triggers the existing pose swaps, sword and hammer rotations, and arrows. Phone placement updates the preview lane map.

Run `node scripts/siege-preview/check.mjs` with `QUIZZER_PLAYWRIGHT_MODULE` and `QUIZZER_CHROMIUM` set if Playwright/Chromium are not on the default paths. Review screenshots are saved under `output/siege-christmas-review/` (ignored by Git).

The browser check also measures the ruined wall's rendered artwork: its far end must reach the back board border at y=58 and its near end the front border at y=664. `castle-ruins-depth.png` shows that footprint without the ending overlay. This guards against a shallow-camera sprite stopping short of the back edge.

For intact and cracked castles it also compares clearance from the board's left rim at the front and back, catching a wall that pulls inward toward the far corner. `castle-rim-alignment.png` is a close-up of that corner.

For the actual lobby and compiled-asset smoke test, compile `src/server/main.ts` to a temporary executable, start it on port 8094 with `--no-open` and a temporary `--data-dir`, then run `node scripts/siege-preview/lobby-check.mjs`. It creates a temporary quiz, verifies the Christmas default and Classic switch, joins a phone, places a defender, reconnects the host, and checks Play again.
