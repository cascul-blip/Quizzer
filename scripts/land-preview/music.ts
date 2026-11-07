/** Listen to the actual adaptive tracks and render sampled WAVs for review. */
import "../winter-art/music-preview.ts";
import { MusicPlayer, stepSeconds } from "../../src/client/shared/music/engine.ts";
import { TRACKS } from "../../src/client/shared/music/tracks.ts";
import type { MusicTrackId } from "../../src/shared/music-tracks.ts";

const context = new AudioContext();
const player = new MusicPlayer(() => context, TRACKS, () => null);
player.setLevel(0.6);
document.title = "North Pole Land Grab · music review";
document.body.innerHTML = `<style>
body{margin:0;padding:48px 24px;background:#2d241c;color:#f9f0df;font:18px system-ui;max-width:780px;margin:auto}h1{font-family:Georgia,serif}label{display:block;margin:24px 0}button,select{font:inherit;padding:10px 14px;margin:4px;border-radius:8px;border:1px solid #ab9370}input{width:100%}output{display:block;margin-top:16px;color:#f4cf83}p{line-height:1.6}a{color:#f4cf83}
</style><h1>Silent Night at the North Pole</h1>
<p>Quiet piano, soft strings and occasional bells. Raise capture threat to hear the accompaniment build and tempo rise; lower it to return to calm.</p>
<label>Theme <select id="theme"><option value="land-christmas">North Pole</option><option value="land">Classic</option></select></label>
<label>Scene <select id="scene"><option value="play">The land</option><option value="lobby">Lobby</option><option value="results">Podium</option></select></label>
<button id="play">Play</button><button id="stop">Stop</button>
<label>Capture threat <input id="threat" type="range" min="0" max="1" step="0.01" value="0"></label>
<button id="calm">Calm</button><button id="close">Capture close</button><button id="broken">Ring broken</button>
<output id="status"></output><p><a href="/">Back to the map</a></p>`;
const theme = document.querySelector<HTMLSelectElement>("#theme")!;
const scene = document.querySelector<HTMLSelectElement>("#scene")!;
const threat = document.querySelector<HTMLInputElement>("#threat")!;
let playing = false;
const id = () => `${theme.value}-${scene.value}` as MusicTrackId;
const info = () => ({ track: id(), intensity: Number(threat.value), bpm: 60 / (stepSeconds(TRACKS[id()], Number(threat.value)) * 4), playing });
function update() {
  if (playing) player.play(id());
  player.setIntensity(Number(threat.value), 600);
  const state = info();
  document.querySelector("#status")!.textContent = `${state.playing ? "Playing" : "Stopped"} · ${Math.round(state.bpm)} BPM · ${Math.round(state.intensity * 100)}% threat`;
}
document.querySelector("#play")!.addEventListener("click", async () => { await context.resume(); playing = true; update(); });
document.querySelector("#stop")!.addEventListener("click", () => { playing = false; player.play(null); update(); });
for (const el of [theme, scene, threat]) el.addEventListener("input", update);
for (const [selector, value] of [["#calm", "0"], ["#close", "1"], ["#broken", "0"]]) {
  document.querySelector(selector!)!.addEventListener("click", () => { threat.value = value!; update(); });
}
declare global { interface Window { landMusicReview: { player: MusicPlayer; context: AudioContext; info: typeof info } } }
window.landMusicReview = { player, context, info };
update();
