# Deliver phone views from per-socket baselines

A classroom's phones share the host's network. View delivery starts each phone connection with a snapshot and sends a patch against its last view when the patch is smaller. If a socket backs up, delivery builds the current view when it drains. For comparison, running timers are represented by their approximate start or end times so the passage of time alone usually avoids a resend. Delivery recognises those timers by name: a view field ending in `RemainingMs` is a countdown and one ending in `ElapsedMs` counts up from a start, so a mode adds a timer without editing delivery. The coding standards require every view time field to carry one of these suffixes or `DurationMs`.

Modes with expensive shared view work can opt into View batching. Classic and Showdown reuse their rankings and other shared calculations within a broadcast. The cache ends with that broadcast, where every view describes the same state.

On reconnect, the socket's first snapshot can arrive before the server processes the phone's resume message. The phone uses that snapshot as its patch baseline even if it still shows the previous game or the joining screen. A resumed view for the same mode keeps the mounted game screen so transient state survives. A resume version tells that screen when to accept fresh timing from the server.

A patch removes a key with a path-only operation and replaces the whole view with an empty path and a value. When more than half of an array's items change, diffing replaces the array as a unit. Applying a patch returns a new root for Preact and copies only the branches that change.
