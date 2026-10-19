import type { CSSProperties } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ClientMsg } from "../../shared/protocol.ts";
import { BOMB_HOLD_MS, type PlayerBombView, type PlayerBombWire } from "../../shared/protocol.ts";
import { bombArt, Confetti, CuttersIcon, WireGraphic } from "../shared/bomb-art.tsx";
import { play } from "../shared/sounds.ts";
import { formatClock, ordinal, useCountdown } from "../shared/ui.tsx";

type Send = (m: ClientMsg) => void;

/** Phone: the question, this player's wires, and the Cut button. The big bomb stays on the projector. */
export function BombPlayer({ view, send }: { view: PlayerBombView; send: Send }) {
  const [shake, setShake] = useState(false);
  const boom = view.phase !== "podium" && (view.phase === "exploded" || view.squadState === "exploded");
  useEffect(() => {
    // Only on the way into the explosion, not again for the podium.
    if (!boom) return;
    setShake(true);
    play("explosion");
    navigator.vibrate?.([80, 40, 120, 40, 200]);
    const t = setTimeout(() => setShake(false), 600);
    return () => clearTimeout(t);
  }, [boom]);

  if (view.phase === "countdown") return <Countdown view={view} />;
  if (view.phase === "podium") return <Podium view={view} />;
  if (boom) return <Boom shake={shake} />;
  if (view.phase === "defused" || view.squadState === "defused") return <Defused view={view} />;
  if (view.squadState === "cheer") return <Note title="Your modules are done!" body="Cheer on the others." />;
  if (view.squadState === "waiting" || !view.question) return <Note title={view.squad?.name ?? "Bomb Squad"} body={view.status ?? "Hang on — you'll get the next wire."} />;
  return <Defusing view={view} send={send} />;
}

function Countdown({ view }: { view: PlayerBombView }) {
  const n = useCountdown(view.remainingMs, "bomb-count");
  return (
    <main class="bomb-phone center">
      <p class="bw-squad" style={{ color: view.squad?.color }}>{view.squad ? `Squad ${view.squad.name}` : "Bomb Squad"}</p>
      <div class="bw-count">{n > 0 ? n : 1}</div>
    </main>
  );
}

function Boom({ shake }: { shake: boolean }) {
  return (
    <main class={`bomb-phone center boom ${shake ? "is-shaking" : ""}`}>
      <div class="bw-phone-flash" />
      <h1>BOOM! The bomb exploded.</h1>
    </main>
  );
}

function Defused({ view }: { view: PlayerBombView }) {
  return (
    <main class="bomb-phone center">
      <Confetti />
      <h1>{view.result?.headline ?? "Defused!"}</h1>
      {view.squad && <p class="bw-squad" style={{ color: view.squad.color }}>Squad {view.squad.name}</p>}
    </main>
  );
}

function Podium({ view }: { view: PlayerBombView }) {
  const r = view.result;
  return (
    <main class="bomb-phone center">
      <h1>{r?.headline ?? "Results"}</h1>
      {r?.rank != null && (
        <p class="bw-place">
          {ordinal(r.rank)} of {r.squads}
        </p>
      )}
      {view.squad && <p class="bw-squad" style={{ color: view.squad.color }}>Squad {view.squad.name}</p>}
      {r && r.awards.length > 0 && (
        <ul class="bw-awards">
          {r.awards.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <main class="bomb-phone center">
      <h1>{title}</h1>
      <p>{body}</p>
    </main>
  );
}

function Defusing({ view, send }: { view: PlayerBombView; send: Send }) {
  const q = view.question!;
  const secs = useCountdown(view.remainingMs, `bomb-${view.timerRev}`);
  const frac = view.durationMs > 0 ? Math.max(0, Math.min(1, (secs * 1000) / view.durationMs)) : 0;
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    setSelected(view.wires.length === 1 ? view.wires[0]!.id : null);
  }, [q.seq, view.wires.map((w) => w.id).join()]);

  const line = view.cutting ? `${view.cutting.name} is cutting ${view.cutting.detail}…` : view.status;
  const wire = view.wires.find((w) => w.id === selected) ?? null;
  const fx = useCutFx(view);

  return (
    <main class={`bomb-phone ${fx ? `fx-${fx}` : ""}`}>
      {fx === "wrong" && <div class="bw-phone-flash red" key={`w${view.timerRev}`} />}
      {fx === "snip" && <img class="bw-phone-sparks" src={bombArt("sparks")} alt="" draggable={false} />}
      <div class={`bw-timebar ${secs > 0 && secs <= 30 ? "urgent" : ""}`}>
        <div style={{ width: `${frac * 100}%` }} />
        <span>{formatClock(secs)}</span>
      </div>
      {view.squad && (
        <p class="bw-squad" style={{ color: view.squad.color }}>
          Squad {view.squad.name}
        </p>
      )}
      <h1 class="bw-q">{q.text}</h1>
      {q.image && q.type !== "pin" && <img class="bw-qimg" src={`/${q.image}`} alt="" />}
      {/* Always there, so "… is cutting" appearing never pushes the Cut button out from under a finger. */}
      <p class={`bw-status ${view.reveal ? "good" : ""}`}>{line || "\u00a0"}</p>
      {view.reveal ? (
        <p class="bw-reveal">Answer: {view.reveal.join(", ")}</p>
      ) : view.wires.length === 0 && !view.keypad ? (
        <p class="bw-sitout">You'll get the next wire. Help your squad talk it out!</p>
      ) : view.keypad ? (
        <Keypad onSubmit={(text) => send({ type: "bomb.type", text })} />
      ) : q.type === "pin" && q.image ? (
        <PinWires image={q.image} wires={view.wires} locked={view.cutLocked} send={send} />
      ) : (
        <>
          <div class="bw-wires">
            {view.wires.map((w) => (
              <button key={w.id} type="button" class={`bw-phone-wire ${selected === w.id ? "selected" : ""}`} onClick={() => setSelected(w.id)}>
                <span class="bw-wire-line">
                  <WireGraphic color={w.color} />
                </span>
                <span class="bw-tag">
                  <span class="bw-color">{w.color}</span>
                  {w.label}
                </span>
              </button>
            ))}
          </div>
          {wire && (
            <HoldCut
              key={`${q.seq}:${wire.id}`}
              disabled={view.cutLocked}
              label="Cut"
              onStart={() => send({ type: "bomb.hold", wireId: wire.id, holding: true })}
              onCancel={() => send({ type: "bomb.hold", wireId: wire.id, holding: false })}
              onDone={() => send({ type: "bomb.cut", wireId: wire.id })}
            />
          )}
        </>
      )}
    </main>
  );
}

/**
 * Red flash and buzz on a wrong cut or wrong keypad entry, sparks on a right cut.
 * A wrong answer bumps timerRev and sets a "Wrong …" status on this squad only.
 */
function useCutFx(view: PlayerBombView): "wrong" | "snip" | null {
  const [fx, setFx] = useState<"wrong" | "snip" | null>(null);
  const prev = useRef({ rev: view.timerRev, reveal: !!view.reveal });
  useEffect(() => {
    const p = prev.current;
    prev.current = { rev: view.timerRev, reveal: !!view.reveal };
    let next: "wrong" | "snip" | null = null;
    if (view.timerRev > p.rev && view.status?.startsWith("Wrong")) {
      next = "wrong";
      play("wrongWire");
      navigator.vibrate?.([120, 60, 120]);
    } else if (view.reveal && !p.reveal) {
      next = "snip";
      play("snip");
      play("spark");
      navigator.vibrate?.(40);
    }
    if (!next) return;
    setFx(next);
    const t = setTimeout(() => setFx(null), 700);
    return () => clearTimeout(t);
  }, [view.timerRev, view.reveal, view.status]);
  return fx;
}

function Keypad({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      class="bw-keypad"
      onSubmit={(e) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;
        play("keypad");
        onSubmit(value);
        setText("");
      }}
    >
      <input value={text} maxLength={100} autoCapitalize="off" autoCorrect="off" enterKeyHint="done" onInput={(e) => setText(e.currentTarget.value)} placeholder="Type the answer" />
      <button type="submit" class="btn primary">
        Enter
      </button>
    </form>
  );
}

function PinWires({ image, wires, locked, send }: { image: string; wires: PlayerBombWire[]; locked: boolean; send: Send }) {
  return (
    <div class="bw-pin">
      <img src={`/${image}`} alt="" draggable={false} />
      {wires.map(
        (w) =>
          w.spot && (
            <HoldCut
              key={w.id}
              class={`bw-spot ${locked ? "locked" : ""}`}
              style={{ left: `${w.spot.x * 100}%`, top: `${w.spot.y * 100}%` }}
              disabled={locked}
              label={w.label}
              onStart={() => send({ type: "bomb.hold", wireId: w.id, holding: true })}
              onCancel={() => send({ type: "bomb.hold", wireId: w.id, holding: false })}
              onDone={() => send({ type: "bomb.cut", wireId: w.id })}
            />
          ),
      )}
    </div>
  );
}

/** Hold for 1.5s. Letting go early cancels. A full hold sends the cut and does not also send "let go". */
function HoldCut({
  disabled,
  label,
  class: cls = "",
  style,
  onStart,
  onCancel,
  onDone,
}: {
  disabled?: boolean;
  label: string;
  class?: string;
  style?: CSSProperties;
  onStart: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [charge, setCharge] = useState(0);
  const [sent, setSent] = useState(false);
  const holding = useRef(false);
  const level = useRef(0);
  const done = useRef(false);
  const lastBuzz = useRef(0);
  const start = useRef(onStart);
  const cancel = useRef(onCancel);
  const finish = useRef(onDone);
  start.current = onStart;
  cancel.current = onCancel;
  finish.current = onDone;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;
      if (!done.current) {
        level.current = Math.max(0, Math.min(1, level.current + ((holding.current ? dt : -dt) / BOMB_HOLD_MS)));
        if (holding.current && t - lastBuzz.current > 220) {
          lastBuzz.current = t;
          navigator.vibrate?.(12);
        }
        setCharge(level.current);
        if (level.current >= 1) {
          done.current = true;
          holding.current = false;
          navigator.vibrate?.([40, 30, 80]);
          setSent(true);
          finish.current();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const press = (e: PointerEvent) => {
    e.preventDefault();
    if (disabled || done.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    holding.current = true;
    start.current();
  };
  const release = () => {
    if (!holding.current || done.current) return;
    holding.current = false;
    level.current = 0;
    setCharge(0);
    cancel.current();
  };

  // A landed cut removes this wire (or moves to the next question), which unmounts the button.
  // Still here a moment later means the server refused it: let the player try again.
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => {
      done.current = false;
      level.current = 0;
      setCharge(0);
      setSent(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [sent]);
  const r = 42;
  const circ = 2 * Math.PI * r;
  return (
    <button
      type="button"
      class={`bw-cut ${cls} ${charge > 0 ? "charging" : ""} ${disabled ? "locked" : ""}`}
      style={{ ...style, "--charge": String(charge) }}
      disabled={disabled}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} class="ring-bg" />
        <circle cx="50" cy="50" r={r} class="ring" style={{ strokeDasharray: `${circ}`, strokeDashoffset: `${circ * (1 - charge)}` }} />
      </svg>
      <CuttersIcon />
      <span>{label}</span>
    </button>
  );
}
