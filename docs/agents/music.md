# Maintaining music

The [game mode checklist](game-modes.md#adding-or-removing-a-game-mode) shows where to register a track and choose it for a screen. Preserve published track IDs when changing seasonal arrangements. The filenames in `data/music/` use the ID as the stem, and an uploaded file replaces the corresponding built-in arrangement.

For a track arranged from an existing score, record the source and any licensing details in [the music credits](../../src/client/shared/music/samples/CREDITS.md). Add `?music=synth` to the projector URL to compare an arrangement with its synthesized voices.
