Every player for themselves, delivering Christmas presents over a snowy city at night.  The game alternates between a short quiz, where every correct answer buys flying time, and a flight, where every player steers their own sleigh with a joystick on their phone.  The city is only on the projector, so players have to look up to fly.

## Lobby
Choose **Game mode → 🎅 Santa's Sleigh Run**.

Settings:
* **Time**: 3, 5, 7 or 10 minutes (default 5).  The clock starts with the first quiz.  When it runs out, the round under way still finishes (its flight too, even if the clock ran out during the quiz), then the game ends.
* **Protect from abuse** works the same as in Robot Attack.

## Quiz
The quiz lasts **15 seconds**.  A bar across the top of the projector drains as time runs out.

Everyone answers their own stream of questions on their phone as fast as they can, the same as in Robot Attack.  **Each correct answer is 1 point**, and each point is **2 seconds of flying** in the next flight.  Questions come in a random order and repeat once the quiz runs out.

## Intro
The projector shows the reindeer ready to take off, with the words "Get ready to fly in 3, 2, 1".  Phones switch to the joystick.

## Flight
* **Sleighs wait on the launch pad until their player pushes the stick**, and only move while it is pushed (see Steering).
* A sleigh's flying time is a clock: it starts running down when the flight starts, whether the sleigh is moving or not.  A player with 7 points can fly for 14 seconds.
* **Sleighs fly over the rooftops**, so houses never get in the way.
* **Only the city's edge is a wall.**  A sleigh that bumps into it bounces off and slows down for a moment, then picks its speed back up.
* **Sleighs are ghosts.**  They fly through each other, so nobody can block or ram anyone.
* When a sleigh runs out of flying time it **glides to a stop** and hovers there.  A player with 0 points doesn't move this round.
* **Positions carry over.**  The next flight starts from wherever each sleigh stopped, facing the way it was going.
* The flight ends when the last sleigh stops (at most 60 seconds), or early when all 20 presents are delivered.  Then the next round's quiz starts with 20 new houses, or, if time has run out, the game ends.

## Houses and deliveries
The city is one painted town with a fixed set of houses (39 of them can take part).  Each round, 20 of them are picked at random to wait for presents.  The next round picks a new set, using as few of the last round's houses as it can (the town only has 39, so a few may repeat) and never a house a parked sleigh is sitting on.  Undelivered presents from a round are gone.  The launch pad (the North Pole) is in the middle of town, where every sleigh starts; the houses under it never take part.

Each house starts dark, waiting for its present: its chimney glows and a present bobs over it.  **Flying over the roof of a house that still needs a present delivers it**: the first sleigh there claims it and scores 1 present.  The house then lights up with festive lights, and a delivered house can't be claimed again.  If two sleighs reach the same house in the same instant, the one closer to its centre gets it.

If all 20 are delivered before the flight's time runs out, the sleighs stop and the city celebrates for 3 seconds before the next round.  Rounds repeat until **the game clock runs out**; after the last flight, "Time's up!" shows for 3 seconds and the podium follows.

## Steering
The phone shows an analogue joystick: a knob in the sleigh's colour on the painted sleigh wheel.

* **Hold** the stick the way you want to fly.  Directions match the projector (up on the phone is up on the city), and the sleigh turns to face that way at its usual turning speed (a half turn takes about 1.6 seconds), then flies straight on.
* **How far** the stick is pushed sets the speed: a little push creeps along, the edge of the wheel is full speed.  A small dead zone in the middle counts as let go.
* **Let go** and the knob springs back to the centre and the sleigh slows to a stop (in under half a second), staying where it is.
* The wheel turns so its marker points the way the stick was last pushed.  The arrow keys work too, on a computer.

## Display
A painted top-down view of a snowy town at night: snow-covered roofs, dark streets and bare trees, with a low snow-capped stone wall round the edge (wreaths along it).  Houses still waiting for a present are dark; delivered ones switch to their lit picture, strung with coloured Christmas lights, with a present in the deliverer's colour on the roof.  A counter shows how many of this round's 20 presents are delivered, and a clock in the top bar shows the game time left (red for the last 30 seconds, "Last flight!" once it has run out).  Phones show the clock too.

The city is **1600 × 900 units** and a sleigh team (sleigh plus reindeer) is **180 long**; crossing the city takes about 4 seconds.  The projector scales the whole city to fit the screen.

Each player's sleigh is **painted in that player's colour**, pulled by a team of reindeer with **Rudolph leading** (red nose glowing).  A small name tag with the player's avatar, nickname and number of presents follows each sleigh.  A bump into the city edge throws up a puff of snow.  A delivery drops a present down the chimney with a sparkle.

## Sound
The music is public-domain Christmas carols, with sleigh bells jingling through all three.

* **Lobby**: "O Come, All Ye Faithful" (Adeste Fideles, J. F. Wade, 18th century) on flute and glockenspiel, with strings, piano and a pizzicato bass.
* **Rounds** (quiz, intro and flight): "O Come, O Come, Emmanuel" (the 15th-century French tune "Veni Emmanuel"), in E minor, one track for the whole round.  (The earlier "Joy to the World" arrangement is kept in the code as `sleighFlightJoy` in case we switch back.)  It starts sparse at the start of the quiz (sleigh bells, held strings and a bass note on each beat), builds as the quiz runs out (the tune on pizzicato, the clip-clop of hooves, an oom-pah piano, then glockenspiel), keeps building through the intro, and plays the full band with brass on the tune, faster, while the sleighs fly.
* **"Time's up!" and podium**: "Hark! The Herald Angels Sing" (Mendelssohn, 1840) on festive brass with glockenspiel, strings and timpani.  The celebration adds a flute descant, faster sleigh bells and a snare.

Sound effects: a sleigh-bell shimmer under each flying sleigh that follows its speed, a short sleigh-bell jingle, and a bright magic chime with a low "ho" for each present delivered.

## Decisions
The host chooses a game length of 3, 5, 7 or 10 minutes, default 5.  The clock starts with the first quiz.  When it runs out, the round under way still finishes, so a game can run up to about 80 seconds over (a 15 second quiz, the 3 second intro and a flight of up to 60 seconds).

Every round has 20 new houses.  Presents left undelivered at the end of a flight are gone.

A game starts with a 3, 2, 1 countdown, then each round is: a 15 second quiz, the 3 second intro, then the flight.

Each correct answer is 1 point.  Wrong answers cost nothing, apart from the wait when Protect from abuse is on.

Each point is 2 seconds of flying.  Points don't carry over: the flying time for each flight comes only from that round's quiz.

Sleighs move only while the stick is pushed: they turn toward its direction (at most 2 radians a second, a turn radius of 190 at top speed) and their speed follows how far it is pushed.  Flying time runs down from the start of the flight either way.

Sleighs fly over the houses.  Only the city's edge is a wall: a sleigh that bumps into it bounces off and slows down briefly.

Sleighs are ghosts: there are no collisions between sleighs.

A sleigh that runs out of flying time glides to a stop and waits there, whatever its stick says.  Positions carry over between rounds.

The flight ends when the last sleigh has used up its flying time and stopped, or after 60 seconds.

The first sleigh to fly over a house that still needs a present delivers it.  After the round's last present, the flight ends with a 3 second celebration, then the next round.  After the last flight once time is up, 3 seconds of "Time's up!", then the podium.

The winner is the player who delivered the most presents; a tie is broken by distance flown.

There are awards for "Most correct answers", "Smoothest flyer" (fewest bumps into the city edge among players who flew) and "Furthest flown".

The results CSV has one row per player: rank, presents, distance (m), correct, wrong, accuracy, bumps and seconds flown.

Late joiners start on the launch pad and can answer questions straight away.  A disconnected player's stick counts as let go, so their sleigh stops where it is.
