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
