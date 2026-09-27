// Generates the robot's pre-recorded voice lines into src/client/shared/voice/.
// Needs espeak-ng and ffmpeg; the generated MP3s are committed, so builds don't.
//   bun scripts/voice.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VOICE_LINES } from "../src/shared/voice-lines.ts";

const OUT = "src/client/shared/voice";
/** Main voice pitch (with its resonances) relative to espeak's lowest: ~5 semitones down. */
const MAIN = 0.75;
/** A quieter layer an octave below that for rumble. */
const SUB = 0.5;

// espeak-ng renders at 22050 Hz. Resampling lowers pitch and formants together (a huge
// chest); atempo puts the length back. Then a slow metallic flange and a hall echo.
const filter = [
  `[0]asetrate=22050*${MAIN},aresample=44100,atempo=${1 / MAIN}[main]`,
  `[0]asetrate=22050*${SUB},aresample=44100,atempo=${1 / SUB},lowpass=f=600[sub]`,
  `[main][sub]amix=inputs=2:weights=1 0.55:normalize=0,flanger=delay=3:depth=2:speed=0.25:width=60,aecho=0.8:0.55:70|140:0.3|0.15,loudnorm=I=-14:TP=-1.5`,
].join(";");

function run(cmd: string[]): void {
  const p = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0) throw new Error(`${cmd[0]} failed`);
}

const tmp = mkdtempSync(join(tmpdir(), "quizzer-voice-"));
try {
  for (const [id, text] of Object.entries(VOICE_LINES)) {
    const raw = join(tmp, `${id}.wav`);
    // Lowest pitch, slow and flat: a machine intoning.
    run(["espeak-ng", "-v", "en-us", "-p", "0", "-s", "115", "-g", "4", "-w", raw, text]);
    run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-filter_complex", filter, "-ac", "1", "-ar", "44100", "-b:a", "96k", join(OUT, `${id}.mp3`)]);
    console.log(`${id}.mp3  "${text}"`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
