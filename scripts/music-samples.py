#!/usr/bin/env python3
"""Builds the recorded instrument samples the built-in music plays (src/client/shared/music/samples/)
from free sample libraries. Needs numpy, scipy and ffmpeg. The MP3s are committed, so a normal
build does not run this.

    python3 scripts/music-samples.py [--cache DIR] [--out DIR]

Sources (see samples/CREDITS.md):
- VSCO 2 Community Edition (CC0): string sections, brass, flute, harp, pipe organ, timpani.
- VCSL, the Versilian Community Sample Library (CC0): grand piano, glockenspiel, tubular
  bells, concert bass drum, snare, hi-hat, claps, suspended cymbal, woodblock.
- FluidR3_GM (CC BY 3.0, via gleitz/midi-js-soundfonts): finger and acoustic bass, clean
  electric guitar, which the CC0 libraries don't have.

For each instrument it keeps about one note every 3-5 semitones over the range the tracks
play (the player re-pitches the nearest one), checks each file's pitch against its name
(most of these libraries call middle C "C3"), trims the silence before the note, cuts it
to length with a fade, levels it, and writes mono 32 kHz MP3s plus manifest.ts, which
imports them and lists each one's root note.
"""
import argparse
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import warnings

from scipy.io import wavfile
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parent.parent
RATE = 32000
warnings.filterwarnings("ignore", category=wavfile.WavFileWarning)
NOTE_INDEX = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

VSCO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/"
VCSL = "https://raw.githubusercontent.com/sgossner/VCSL/master/"
FLUID = "https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/"


def midi_of(name: str) -> int:
    """'C4' → 60, 'A#-1' → 22, 'Bb2' → 46."""
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", name)
    if not m:
        raise ValueError(name)
    return NOTE_INDEX[m[1]] + {"#": 1, "b": -1, "": 0}[m[2]] + (int(m[3]) + 1) * 12


def name_of(midi: int) -> str:
    return f"{NAMES[midi % 12]}{midi // 12 - 1}"


def fluid_name(midi: int) -> str:
    """FluidR3 file names use flats: Db3, Eb3 …"""
    n = name_of(midi)
    flats = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}
    return flats.get(n[:2], n[:2]) + n[2:] if "#" in n else n


# Pitched instruments. `files` maps the library's note name to a path; `octave` is how many
# octaves to add to the library's names (+1 where middle C is called C3). `lo`…`hi` is the
# MIDI range the tracks play (tests check it). `length` is how many seconds to keep: enough
# for the longest held note, since samples are not looped.
TIMPANI_HZ = {"Timpani1": 89.6, "Timpani2": 122.4, "Timpani3": 142.8, "Timpani4": 168.9, "Timpani5": 190.9}


def vsco_set(folder: str, pattern: str) -> dict[str, str]:
    return {"folder": folder, "pattern": pattern}


PITCHED = {
    "piano": {"base": VCSL, "sets": [vsco_set("Chordophones/Zithers/Grand Piano, Kawai/Sustains/", r"GPiano_sus_([A-G]#?-?\d)_v3_rr1_Player\.wav")], "octave": 1, "lo": 38, "hi": 86, "length": 3.2, "step": 4},
    "strings": {
        "base": VSCO,
        "sets": [
            vsco_set("Strings/Cello Section/susvib/", r"susvib_([A-G]#?\d)_v3_1\.wav"),
            vsco_set("Strings/Viola Section/susvib/", r"ViolaEns_susvib_([A-G]#?\d)_v2_1\.wav"),
            vsco_set("Strings/Violin Section/susVib/", r"VlnEns_susVib_([A-G]#?\d)_v2\.wav"),
        ],
        "octave": 1, "lo": 31, "hi": 93, "length": 5.2, "step": 4,
    },
    "brass": {
        "base": VSCO,
        "sets": [
            vsco_set("Brass/F Horn/sus/", r"MOHorn_sus_([A-G]#?\d)_v3_1\.wav"),
            vsco_set("Brass/Trumpet/sus/", r"Sum_SHTrumpet_sus_([A-G]#?\d)_v3_rr1\.wav"),
        ],
        "octave": 1, "lo": 48, "hi": 86, "length": 3.6, "step": 4,
    },
    "flute": {"base": VSCO, "sets": [vsco_set("Woodwinds/Flute/susvib/", r"LDFlute_susvib_([A-G]#?\d)_v1_1\.wav")], "octave": 1, "lo": 62, "hi": 86, "length": 3.8, "step": 4},
    "pluck": {"base": VSCO, "sets": [vsco_set("Strings/Harp/", r"KSHarp_([A-G]#?\d)_mf\.wav")], "octave": 0, "lo": 47, "hi": 84, "length": 2.2, "step": 3},
    "bell": {
        "base": VCSL,
        "sets": [
            vsco_set("Idiophones/Struck Idiophones/Tubular Bells 1/", r"chimes_([A-G]#?\d)_(?:ff|f|fff)_rr\d\.wav"),
            vsco_set("Idiophones/Struck Idiophones/Glockenspiel/", r"glock_medium_([A-G]#?\d)_01\.wav"),
        ],
        "octave": 1, "lo": 55, "hi": 96, "length": 2.4, "step": 5, "detect": False,
    },
    # The organ files are numbered by MIDI note + 86.
    "organ": {"base": VSCO, "sets": [vsco_set("Keys/Organ/Quiet/", r"NT5_Man3Quiet_(\d+)_rr1\.wav")], "pitch": lambda n: int(n) - 86, "lo": 43, "hi": 69, "length": 3.6, "step": 4},
    # The five timpani, by their lowest strong partial (the one heard as the note; the next ones are near 1.5x and 2x).
    "timpani": {"base": VSCO, "sets": [vsco_set("Percussion/Timpani/", r"(Timpani\d)_Hit_v3_rr1_Sum\.wav")], "pitch": lambda n: float(midi_from_hz(TIMPANI_HZ[n])), "lo": 31, "hi": 52, "length": 2.0, "step": 6},
    "bass": {"fluid": "electric_bass_finger", "lo": 28, "hi": 53, "length": 2.2, "step": 4},
    "tribass": {"fluid": "acoustic_bass", "lo": 21, "hi": 55, "length": 2.4, "step": 4},
    "twang": {"fluid": "electric_guitar_clean", "lo": 38, "hi": 64, "length": 2.2, "step": 4},
}

# Drums: a normal hit and an accented one (louder, harder), each with how many seconds to keep.
DRUMS = {
    "kick": (VCSL + "Membranophones/Struck Membranophones/Bass Drum 3 - Legacy/", "bdrum_muted_mf_rr1.wav", "bdrum_muted_ff_rr1.wav", 0.6),
    "taiko": (VCSL + "Membranophones/Struck Membranophones/Bass Drum 2/", "bassdrum_hit_mf1.wav", "bassdrum_hit_ff.wav", 1.6),
    "snare": (VCSL + "Membranophones/Struck Membranophones/Snare Drum, Modern 1/", "Snare2_HitSN_v5_rr1_Mid.wav", "Snare2_HitSN_v7_rr1_Mid.wav", 0.5),
    "hat": (VCSL + "Idiophones/Struck Idiophones/Hi-Hat Cymbal/", "HiHat_HitC_v2_rr1_Mid.wav", "HiHat_HitC_v4_rr1_Mid.wav", 0.3),
    "clap": (VCSL + "Idiophones/Struck Idiophones/Claps/", "Clap_rr1.wav", "Clap_rr2.wav", 0.45),
    "cymbal": (VCSL + "Idiophones/Struck Idiophones/Suspended Cymbal 1/", "susCymb1_hit_mp1.wav", "susCymb1_hit_f1.wav", 2.6),
    "woodblock": (VCSL + "Idiophones/Struck Idiophones/Woodblock/", "wood_click_mp.wav", "wood_click_ff.wav", 0.3),
}


def fetch(url: str, cache: Path) -> Path:
    path = cache / urllib.parse.unquote(url.split("/master/")[-1].split("/gh-pages/")[-1])
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        parts = url.split("/")
        quoted = "/".join(parts[:3] + [urllib.parse.quote(p) for p in parts[3:]])
        with urllib.request.urlopen(quoted) as r:
            path.write_bytes(r.read())
    return path


def tree(repo: str, cache: Path) -> list[str]:
    path = cache / f"{repo.replace('/', '_')}.json"
    if not path.exists():
        out = subprocess.run(["gh", "api", f"repos/{repo}/git/trees/HEAD?recursive=1"], check=True, capture_output=True).stdout
        path.write_bytes(out)
    return [e["path"] for e in json.loads(path.read_text())["tree"] if e["type"] == "blob"]


def load(path: Path) -> np.ndarray:
    """Any WAV or MP3 → mono float32 at RATE."""
    if path.suffix == ".mp3":
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"], check=True, capture_output=True).stdout
        return np.frombuffer(raw, dtype=np.float32).copy()
    rate, data = wavfile.read(path)
    if data.dtype.kind == "i":
        data = data / float(np.iinfo(data.dtype).max)
    elif data.dtype.kind == "u":
        data = (data - 128) / 128.0
    data = data.astype(np.float64)
    if data.ndim > 1:
        data = data.mean(axis=1)
    g = np.gcd(rate, RATE)
    return resample_poly(data, RATE // g, rate // g).astype(np.float32)


def onset(x: np.ndarray) -> int:
    """First sample above -40 dB of the peak, less 3 ms so the attack stays whole."""
    i = int(np.argmax(np.abs(x) > np.abs(x).max() * 0.01))
    return max(0, i - int(0.003 * RATE))


def f0(x: np.ndarray, fmin=25.0, fmax=2500.0) -> float | None:
    """Fundamental by autocorrelation over a steady part of the note."""
    seg = x[int(0.15 * RATE) : int(0.65 * RATE)]
    if len(seg) < 2048 or np.abs(seg).max() < 1e-4:
        return None
    seg = seg - seg.mean()
    n = 1 << (len(seg) * 2 - 1).bit_length()
    spec = np.fft.rfft(seg * np.hanning(len(seg)), n)
    ac = np.fft.irfft(np.abs(spec) ** 2)[: len(seg)]
    lo, hi = int(RATE / fmax), min(int(RATE / fmin), len(ac) - 1)
    lag = lo + int(np.argmax(ac[lo:hi]))
    # Prefer the shortest lag that is nearly as strong (avoids octave-low errors).
    for div in (4, 3, 2):
        cand = int(round(lag / div))
        if cand >= lo:
            w = ac[max(lo, cand - 2) : cand + 3]
            if w.max() > 0.9 * ac[lag]:
                lag = max(lo, cand - 2) + int(np.argmax(w))
                break
    if 1 <= lag < len(ac) - 1:  # parabolic interpolation
        a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]
        lag = lag + 0.5 * (a - c) / (a - 2 * b + c)
    return RATE / lag if np.isfinite(lag) and lag > 0 else None


def midi_from_hz(hz: float) -> float:
    return 69 + 12 * np.log2(hz / 440)


def shape(x: np.ndarray, length: float) -> np.ndarray:
    """Start at the note, cut to `length` with a gentle fade, and level it."""
    x = x[onset(x) :]
    n = int(length * RATE)
    x = x[:n].copy()
    fade = min(len(x), int(min(0.25, length * 0.3) * RATE))
    x[len(x) - fade :] *= np.linspace(1, 0, fade) ** 2
    # Level on the loudest 300 ms, so short and long notes sit the same.
    win = int(0.3 * RATE)
    rms = max(np.sqrt(np.mean(x[i : i + win] ** 2)) for i in range(0, max(1, len(x) - win), win // 3))
    x *= 0.18 / max(rms, 1e-6)
    peak = np.abs(x).max()
    if peak > 0.97:
        x *= 0.97 / peak
    return x


def write_mp3(x: np.ndarray, out: Path, kbps=96) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "-", "-c:a", "libmp3lame", "-b:a", f"{kbps}k", str(out)], input=pcm, check=True)


def choose(available: dict, lo: int, hi: int, step: int) -> list[int]:
    """Roots from `available` so every note lo…hi is near one, about `step` semitones apart."""
    roots = sorted(available)
    picked: list[int] = []
    note = lo
    while note <= hi:
        # The highest root at most step//2 above the lowest note not yet covered (else the lowest root).
        below = [r for r in roots if r <= note + step // 2]
        r = below[-1] if below else roots[0]
        if not picked or r != picked[-1]:
            picked.append(r)
        note = max(note + 1, r + step // 2 + 1)
    return picked


def build_pitched(name: str, spec: dict, cache: Path, out: Path) -> list[tuple[str, float]]:
    found: dict[int, str] = {}  # nearest MIDI note → url
    exact: dict[int, float] = {}  # the sample's real pitch, where it isn't exactly that note
    if "fluid" in spec:
        for m in range(spec["lo"] - 2, spec["hi"] + 3):
            if 21 <= m <= 108:
                found[m] = f"{FLUID}{spec['fluid']}-mp3/{fluid_name(m)}.mp3"
    else:
        repo = "sgossner/VSCO-2-CE" if spec["base"] == VSCO else "sgossner/VCSL"
        files = tree(repo, cache)
        for s in spec["sets"]:
            for p in files:
                m = re.fullmatch(s["pattern"], p[len(s["folder"]) :]) if p.startswith(s["folder"]) else None
                if not m:
                    continue
                pitch = spec["pitch"](m[1]) if "pitch" in spec else midi_of(m[1]) + 12 * spec["octave"]
                # Sets go from low instruments to high: where two overlap, the higher one plays.
                found[round(pitch)] = spec["base"] + p
                exact[round(pitch)] = pitch
    picked = choose(found, spec["lo"], spec["hi"], spec["step"])
    zones = []
    for root in picked:
        url = found[root]
        x = load(fetch(url, cache))
        if spec.get("detect", True) and "octave" in spec:
            hz = f0(x[onset(x) :])
            if hz is not None:
                off = midi_from_hz(hz) - root
                if abs(off - round(off / 12) * 12) < 0.6 and round(off / 12) != 0:
                    print(f"  ! {name} {name_of(root)}: sounds {round(off / 12):+d} octave(s) from its name", file=sys.stderr)
                elif abs(off) > 0.6 and abs(off - round(off / 12) * 12) > 0.6:
                    print(f"  ? {name} {name_of(root)}: pitch unclear ({hz:.1f} Hz)", file=sys.stderr)
        file = f"{name_of(root).replace('#', 's')}.mp3"
        write_mp3(shape(x, spec["length"]), out / name / file)
        zones.append((file, round(exact.get(root, root), 2)))
        print(f"  {name} {name_of(root)} ← {url.rsplit('/', 1)[-1]}")
    return zones


def build_drum(name: str, spec: tuple, cache: Path, out: Path) -> dict:
    base, hit, accent, length = spec
    for kind, f in (("hit", hit), ("accent", accent)):
        write_mp3(shape(load(fetch(base + f, cache)), length), out / name / f"{kind}.mp3", kbps=112)
        print(f"  {name} {kind} ← {f}")
    return {"hit": "hit.mp3", "accent": "accent.mp3", "seconds": length}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=ROOT / "node_modules" / ".cache" / "music-samples")
    ap.add_argument("--out", type=Path, default=ROOT / "src" / "client" / "shared" / "music" / "samples")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)

    sets: dict = {}
    for name, spec in PITCHED.items():
        for old in (args.out / name).glob("*.mp3"):
            old.unlink()
        sets[name] = {"zones": build_pitched(name, spec, args.cache, args.out), "seconds": spec["length"]}
    for name, spec in DRUMS.items():
        sets[name] = build_drum(name, spec, args.cache, args.out)
    write_manifest(sets, args.out / "manifest.ts")


def write_manifest(sets: dict, path: Path) -> None:
    imports, entries = [], []
    ident = lambda inst, f: re.sub(r"\W", "_", f"{inst}_{f[:-4]}")
    for inst in sorted(sets):
        z = sets[inst]
        if "zones" in z:
            for f, _ in z["zones"]:
                imports.append(f'import {ident(inst, f)} from "./{inst}/{f}";')
            body = ", ".join(f"{{ root: {r}, url: {ident(inst, f)} }}" for f, r in z["zones"])
            entries.append(f"  {inst}: {{ seconds: {z['seconds']}, zones: [{body}] }},")
        else:
            for f in (z["hit"], z["accent"]):
                imports.append(f'import {ident(inst, f)} from "./{inst}/{f}";')
            entries.append(f"  {inst}: {{ seconds: {z['seconds']}, hit: {ident(inst, z['hit'])}, accent: {ident(inst, z['accent'])} }},")
    path.write_text(
        "// Generated by scripts/music-samples.py: do not edit by hand.\n"
        "// Roots are MIDI note numbers (60 = middle C); see CREDITS.md for where each recording comes from.\n"
        + "\n".join(imports)
        + "\n\nexport interface Zone {\n  root: number;\n  url: string;\n}\n\n"
        "/** `seconds` is how long each recording lasts (at its own pitch). */\n"
        "export type SampleSet = { seconds: number } & ({ zones: Zone[] } | { hit: string; accent: string });\n\n"
        "export const SAMPLE_SETS: Record<string, SampleSet> = {\n" + "\n".join(entries) + "\n};\n"
    )


if __name__ == "__main__":
    main()
