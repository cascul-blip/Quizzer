# Deliver phone views from per-socket baselines

A classroom's phones share the host's network. View delivery starts each phone connection with a snapshot and sends a patch against its last view when the patch is smaller. If a socket backs up, delivery builds the current view when it drains. For comparison, running timers are represented by their approximate start or end times so the passage of time alone usually avoids a resend. Delivery recognises those timers by name: a view field ending in `RemainingMs` is a countdown and one ending in `ElapsedMs` counts up from a start, so a mode adds a timer without editing delivery. The coding standards require every view time field to carry one of these suffixes or `DurationMs`.

Modes with expensive shared view work can opt into View batching. Classic and Showdown reuse their rankings and other shared calculations within a broadcast. The cache ends with that broadcast, where every view describes the same state.
