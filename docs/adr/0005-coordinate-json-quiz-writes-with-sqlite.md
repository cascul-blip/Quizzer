# Coordinate JSON quiz writes with SQLite

The HTTP server and standalone MCP can edit the same quiz directory from separate processes. Quiz files remain JSON. Both processes take a SQLite writer lock before reading the current quiz, checking its revision, and renaming the replacement into place. The lock spans the entire write operation and SQLite releases it when the connection closes or the process exits, so a crashed writer leaves no lock for an operator to clear.
