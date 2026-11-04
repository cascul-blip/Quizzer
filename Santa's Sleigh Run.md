Every player for themselves, delivering Christmas presents over a snowy city at night.  The game alternates between a short quiz, where every correct answer buys flying time, and a flight, where every player steers their own sleigh with a steering wheel on their phone.  The city is only on the projector, so players have to look up to fly.

## Lobby
Choose **Game mode → 🎅 Santa's Sleigh Run**.

Settings:
* **Houses**: any number from 15 to 30 (default 20).  Each house needs one present, and the game lasts until every present is delivered.
* **Protect from abuse** works the same as in Robot Attack.

## Quiz
The quiz lasts **15 seconds**.  A bar across the top of the projector drains as time runs out.

Everyone answers their own stream of questions on their phone as fast as they can, the same as in Robot Attack.  **Each correct answer is 1 point**, and each point is **3 seconds of flying** in the next flight.  Questions come in a random order and repeat once the quiz runs out.

## Intro
The projector shows the reindeer ready to take off, with the words "Get ready to fly in 3, 2, 1".  Phones switch to the steering wheel.

## Flight
* **The reindeer are always running.**  Players only steer.
* Every sleigh flies at the same top speed, for as long as its flying time lasts: a player with 7 points flies for 7 seconds.
* **Sleighs fly over the rooftops**, so houses never get in the way.
* **Only the city's edge is a wall.**  A sleigh that bumps into it bounces off and slows down for a moment, then picks its speed back up.
* **Sleighs are ghosts.**  They fly through each other, so nobody can block or ram anyone.
* When a sleigh runs out of flying time it **glides to a stop** and hovers there.  A player with 0 points doesn't move this round.
* **Positions carry over.**  The next flight starts from wherever each sleigh stopped, facing the way it was going.
* The flight ends when the last sleigh stops (at most 60 seconds), then the next round's quiz starts.

## Houses and deliveries
The city is one painted town with a fixed set of houses (39 of them can take part).  At the start of the game the chosen number of them are picked at random to wait for presents.  The launch pad (the North Pole) is in the middle of town, where every sleigh starts; the houses under it never take part.

Each house starts dark, waiting for its present: its chimney glows and a present bobs over it.  **Flying over the roof of a house that still needs a present delivers it**: the first sleigh there claims it and scores 1 present.  The house then lights up with festive lights, and a delivered house can't be claimed again.  If two sleighs reach the same house in the same instant, the one closer to its centre gets it.

Rounds repeat until **every present is delivered**.  Then the whole city lights up for a short celebration, and the podium follows.

## Steering
The phone shows a large steering wheel.

* **Drag** the wheel round to turn.  It turns up to **135° each way**; the further it is turned, the tighter the sleigh turns.
* **Let go** and the wheel springs back to the centre, and the sleigh flies straight.

## Display
A painted top-down view of a snowy town at night: snow-covered roofs, dark streets and bare trees, with a low snow-capped stone wall round the edge (wreaths along it).  Houses still waiting for a present are dark; delivered ones switch to their lit picture, strung with coloured Christmas lights, with a present in the deliverer's colour on the roof.  A counter shows how many presents are delivered out of the total.

The city is **1600 × 900 units** and a sleigh team (sleigh plus reindeer) is **80 long**; crossing the city takes about 4 seconds.  The projector scales the whole city to fit the screen.

Each player's sleigh is **painted in that player's colour**, pulled by a team of reindeer with **Rudolph leading** (red nose glowing).  A small name tag with the player's avatar, nickname and number of presents follows each sleigh.  A bump into the city edge throws up a puff of snow.  A delivery drops a present down the chimney with a sparkle.

## Sound
The music is public-domain Christmas carols, with sleigh bells jingling through all three.

* **Lobby**: "O Come, All Ye Faithful" (Adeste Fideles, J. F. Wade, 18th century) on flute and glockenspiel, with strings, piano and a pizzicato bass.
* **Rounds** (quiz, intro and flight): "Joy to the World" (Lowell Mason's "Antioch", 1839), one track for the whole round.  It starts sparse at the start of the quiz (sleigh bells, held strings and a bass note on each beat), builds as the quiz runs out (the tune on pizzicato, the clip-clop of hooves, an oom-pah piano, then glockenspiel), keeps building through the intro, and plays the full band with brass on the tune, faster, while the sleighs fly.
* **Celebration and podium**: "Hark! The Herald Angels Sing" (Mendelssohn, 1840) on festive brass with glockenspiel, strings and timpani.  The celebration adds a flute descant, faster sleigh bells and a snare.

Sound effects: a sleigh-bell shimmer under each flying sleigh that follows its speed, a short sleigh-bell jingle, and a bright magic chime with a low "ho" for each present delivered.

## Decisions
The host chooses 15 to 30 houses, default 20.  There is no round limit: the game ends when every present is delivered.

A game starts with a 3, 2, 1 countdown, then each round is: a 15 second quiz, the 3 second intro, then the flight.

Each correct answer is 1 point.  Wrong answers cost nothing, apart from the wait when Protect from abuse is on.

Each point is 3 seconds of flying.  Points don't carry over: the flying time for each flight comes only from that round's quiz.

The reindeer are always running; players only steer.  The wheel turns ±135° and springs back to the centre when released.

Sleighs fly over the houses.  Only the city's edge is a wall: a sleigh that bumps into it bounces off and slows down briefly.

Sleighs are ghosts: there are no collisions between sleighs.

A sleigh that runs out of flying time glides to a stop and waits there.  Positions carry over between rounds.

The flight ends when the last sleigh stops, or after 60 seconds.

The first sleigh to fly over a house that still needs a present delivers it.  After the last present, a 3 second celebration, then the podium.

The winner is the player who delivered the most presents; a tie is broken by distance flown.

There are awards for "Most correct answers", "Smoothest flyer" (fewest bumps into the city edge among players who flew) and "Furthest flown".

The results CSV has one row per player: rank, presents, distance (m), correct, wrong, accuracy, bumps and seconds flown.

Late joiners start on the launch pad and can answer questions straight away.  A disconnected player's wheel springs back to the centre, so their sleigh flies straight until its flying time runs out.
