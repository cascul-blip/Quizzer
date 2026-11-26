# Preserve music continuity through audio changes

Browser autoplay restrictions can postpone audio until a user gesture. The client prefetches music recordings before it can decode them in an unlocked audio context. The sequencer can start with synthesized voices and switches an instrument to recordings only when its complete set is ready, keeping its timbre consistent across pitches and accents. While music is muted or disabled, the sequencer advances without creating notes or requesting decoding for the current track. Re-enabling music picks up at the current beat.

The sequencer and rich synth share a mix bus across the currently playing rich track and each rich track still fading. Retaining the bus until the last user has faded prevents an abrupt cut when switching to a plain or uploaded track. A track's echo returns to its own gain so its repeats fade with it.

Music volume and temporary speech ducking use separate gain nodes so ducking automation cannot overwrite the user's most recent volume or mute change. A one-shot musical cue called a sting lowers the background track's own gain because changing the master would lower the sting too.
