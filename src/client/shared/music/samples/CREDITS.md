# Instrument recordings

The built-in music plays these recordings (trimmed, levelled and converted to MP3 by
`scripts/music-samples.py`).

| Instruments | Source | License |
|---|---|---|
| String sections (cello, viola, violin; also the pads), brass (French horn, trumpet), flute, harp, pipe organ, timpani | [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) by Versilian Studios | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Grand piano (Kawai), tubular bells, glockenspiel, concert bass drum (kick and taiko), snare drum, hi-hat, claps, suspended cymbal, woodblock | [VCSL, the Versilian Community Sample Library](https://github.com/sgossner/VCSL) by Versilian Studios | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Finger bass (`bass`), acoustic bass (`tribass`), clean electric guitar (`twang`) | FluidR3_GM SoundFont by Frank Wen, as rendered by [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/us/) |

## Evil Snowman Christmas arrangements

The seasonal Robot Attack soundtrack uses traditional public-domain melodies with
accompaniment arranged in code for this game, without third-party song recordings
or modern published arrangements:

| Cue | Traditional melody | Source |
|---|---|---|
| Lobby | O Come, All Ye Faithful (ADESTE FIDELES, John Francis Wade, 18th century) | [Hymnary: public-domain tune](https://hymnary.org/tune/adeste_fideles_wade) |
| Quiz | God Rest Ye Merry, Gentlemen (traditional English) | [Hymnary: public-domain tune](https://hymnary.org/tune/god_rest_you_merry_11554) |
| Movement / attack | O Come, O Come, Emmanuel (VENI EMMANUEL, historic French melody; published in The Hymnal Noted, Part II, 1856) | [Hymnology Archive: historical score and publication history](https://www.hymnologyarchive.com/bone-jesu-dulcis-cunctis) |
| Results | Joy to the World (ANTIOCH, Lowell Mason, 19th century) | [Hymnary: public-domain tune](https://hymnary.org/tune/antioch_handel) |

Only the CC0 VSCO 2 CE and VCSL instruments listed above are used in these four
arrangements: flute, harp (`pluck`), strings, brass, piano, bells, timpani, and
percussion. Piano supplies the bass parts; neither FluidR3 bass nor guitar is used.
The existing synthesized fallback also works without external recordings.

## Sled Squad: Jingle Bells

All four `submarine-*` cues now use original game arrangements of **Jingle Bells / The One Horse Open Sleigh**, by James Lord Pierpont (1857, revised 1859), a public-domain composition in the United States. Historical source: [Project Gutenberg's public-domain score](https://www.gutenberg.org/ebooks/10535) and [Library of Congress's 1857 edition](https://www.loc.gov/item/2023812429/). The familiar refrain is arranged in C major with newly written accompaniment; no commercial song recording or modern published arrangement is included.

The intro/lobby uses flute, glockenspiel, strings, plucked accompaniment, piano bass, and light jingling percussion. The chase adds brass and drums and builds from 120 to 150 BPM as the goblin approaches. The trail challenge uses quiet piano and bells; the score screen uses a warm festive brass arrangement. All instruments in these four tracks use the existing CC0 VSCO 2 CE / VCSL samples listed above, with the standard synthesized fallback. No FluidR3 bass or guitar recordings are used.

## North Pole Tower Christmas arrangements

The Christmas theme selects these built-in cues; the classic theme retains the
original chiptune cues. These reuse the game's carol melodies and accompaniment,
with no third-party song recordings or modern published arrangements:

| Cue | Public-domain melody | Source |
|---|---|---|
| `tower-christmas-lobby` | O Come, All Ye Faithful (ADESTE FIDELES, attributed to John Francis Wade, 18th century) | [Hymnary: tune and public-domain status](https://hymnary.org/tune/adeste_fideles_wade) |
| `tower-christmas-play` | Joy to the World (ANTIOCH, Lowell Mason, 19th century) | [Hymnary: tune and public-domain status](https://hymnary.org/tune/antioch_handel) |
| `tower-christmas-results` | Hark! The Herald Angels Sing (MENDELSSOHN, Felix Mendelssohn, 1840; adapted by William H. Cummings, 1855) | [Hymnary: tune and public-domain status](https://hymnary.org/tune/mendelssohn_mendelssohn) |

The underlying compositions are public domain in the United States. All instrument
recordings in these cues come from the CC0 VSCO 2 CE and VCSL libraries above;
piano replaces the FluidR3 bass in the podium arrangement. The building cue keeps
Joy to the World's melody audible at every intensity and builds from 104 to 130 BPM.

## Neon Noel Racer Christmas arrangements

The Christmas racer uses original game arrangements of these public-domain
melodies. The classic theme retains its original arcade soundtrack.

| Cue | Public-domain melody | Source |
|---|---|---|
| `racer-christmas-lobby` | Angels We Have Heard on High (GLORIA, traditional French carol) | [Hymnary: public-domain score](https://hymnary.org/media/fetch/100443); [public-domain melody transcription by Douglas D. Anderson](https://abcnotation.com/tunePage?a=trillian.mit.edu%2F~jc%2Fmusic%2Fabc%2Fmirror%2Fwww.stephenmerrony.co.uk%2FAngels_We_Have_Heard_On_High%2F0000) |
| `racer-christmas-drive` | God Rest Ye Merry, Gentlemen (traditional English carol) | [Hymnary: public-domain tune](https://hymnary.org/tune/god_rest_you_merry_11554) |
| `racer-christmas-results` | Hark! The Herald Angels Sing (MENDELSSOHN, Felix Mendelssohn, 1840; adapted by William H. Cummings, 1855) | [Hymnary: public-domain tune](https://hymnary.org/tune/mendelssohn_mendelssohn) |

The underlying compositions are public domain in the United States. All voices
are synthesized in WebAudio, including the FM bells and brass: no third-party
song recordings, instrument recordings, or modern copyrighted arrangements are
included in these cues. Driving keeps the complete melody audible while its
rhythm section builds with speed, from 112 to 162.4 BPM at full intensity.

## Christmas Toybox: Patapan

`siege-christmas-lobby`, `siege-christmas-battle`, and `siege-christmas-results`
use the traditional Burgundian **Patapan / Guillô, pran ton tamborin** melody,
associated with Bernard de la Monnoye (c. 1700). The complete 48-beat soprano melody
in A minor is transcribed from Douglas D. Anderson's score, explicitly marked
"Released to the Public Domain": [score and dedication](https://www.hymnsandcarolsofchristmas.com/Hymns_and_Carols/PDF/Guillo_pran_ton_tamborin-da.pdf).
[Hymnary's tune record](https://hymnary.org/tune/guillaume_prends_ton_tambourin_11554)
also identifies the traditional tune as public domain. The score's Charles Wood
SATB harmonization is not used; accompaniment and orchestration are written for
this game. The two-beat pickup begins the 12-bar loop, with the final two beats
completing its last bar.

The lobby uses flute, bells, plucked accompaniment, piano bass and light toy-like
woodblock/snare percussion. The battle keeps the tune audible during build breaks
and adds strings, brass, drums and timpani as danger increases. Results use a
brighter bell-and-brass setting for victory and a gentler flute/piano setting for
a fallen castle. All instrument recordings used here are CC0 VSCO 2 CE / VCSL
samples listed above; no commercial performance, modern song arrangement,
FluidR3 bass or guitar is included. Synthesized fallback remains available.

## Tower Fight: A Mighty Fortress Is Our God

The battle cue (`fight-play`) uses **EIN FESTE BURG / A Mighty Fortress Is Our God**
by Martin Luther (1529), with original accompaniment arranged in code for the game.
The complete melody in C major is transcribed from the public-domain soprano part in
[Mutopia-2008/01/13-1237](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1237),
typeset by Steve Dunlop from the Cyber Hymnal. The pickup starts on the first step
of the game loop. No commercial song recording or modern published arrangement is used.

Brass, organ, strings, piano, timpani and percussion use only the existing CC0
VSCO 2 CE / VCSL samples listed above, with the synthesized fallback available.
Both Tower Fight themes use this battle arrangement; lobby and results cues retain
their original music.

## North Pole Land Grab: Silent Night

The Christmas lobby, land and podium use a new game arrangement of **Silent Night /
STILLE NACHT**, Franz Xaver Gruber (1818). The composition is public domain:
[Silent Night Society: historical authorship](https://www.stillenacht.at/en/text-and-music),
[the publisher of Lift Up Your Hearts: explicit public-domain designation](https://liftupyourheartshymnal.org/songs/silent-night-holy-night),
and [Mutopia's public-domain score](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=81).
The familiar tune is in C major, with doubled 6/8 note values phrased as 24 3/4 bars;
the harmony and accompaniment are newly written for this game. No commercial song
recording or modern published accompaniment is included.

Quiet piano carries the complete melody at all intensities, above sparse piano
chords, low strings, and occasional glockenspiel notes. The play cue builds from
60 to 120 quarter-note BPM as the existing capture-threat calculation rises,
adding harp, melodic strings, a low piano pulse and flute. Close captures add
moving low strings, warm brass, snare, pulsing timpani, high bells and light cymbal
accents. It eases
back when a ring is broken, without restarting the melody or changing its pitch.
Lobby stays at 60 BPM; podium is a gentle 68 BPM arrangement.

All instrument recordings used by these cues come from the CC0 VSCO 2 CE / VCSL
libraries listed above. Classic Land Grab keeps its original soundtrack.
