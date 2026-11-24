# Serve compiled assets by content type

Quizzer distributes a single executable. The compiled server prepares gzip copies of HTML, JavaScript, and CSS once because Bun's bundle routes serve them uncompressed. Images, audio, and fonts are served from the executable on demand to avoid holding the bulk of the bundle in memory. When running from source, Bun handles the page bundles directly.

Phones and the projector share artwork, but the phone displays are smaller and connect over the same classroom network. The executable includes compact phone variants alongside the projector assets. Each page requests the artwork it draws.
