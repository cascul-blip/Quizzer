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
