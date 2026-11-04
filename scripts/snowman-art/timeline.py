"""Sweep + idle timelines (seconds). Pure maths: this is what the TSX should do every animation frame."""
import math
import rig as R
from build import project, N
def ease(t): t = min(max(t, 0), 1); return t*t*(3 - 2*t)
def ein(t): t = min(max(t, 0), 1); return t*t
FPS = 30
# ---- idle (loopable, IDLE_T seconds; every period divides it) ----
IDLE_T = 4.0
def idle(t, side_phase=0.0):
    w = 2*math.pi*t/IDLE_T
    arms = {"R": dict(shoulder=0 + 4*math.sin(w), elbow=-60 + 6*math.sin(w + 0.9), wrist=15 + 5*math.sin(2*w + 0.4), hand=R.pose_mix("half", "closed", 0.25 + 0.25*math.sin(2*w))),
            "L": dict(shoulder=-5 + 4*math.sin(w + 2.1), elbow=-60 + 6*math.sin(w + 3.0), wrist=15 + 5*math.sin(2*w + 2.5), hand=R.pose_mix("open", "half", 0.3 + 0.3*math.sin(2*w + 1.7)))}
    for k in ("R", "L"):   # per-claw twitch is folded into the tip curl
        kc, tc, sp, th = arms[k]["hand"]; arms[k]["hand"] = (kc, tc + 8*math.sin(4*w + (0 if k == "R" else 1.3)), sp, th)
    return dict(arms=arms, head_dy=-2.0*math.sin(w), breathe=0.006*(1 + math.sin(w)), eye=0.75 + 0.25*math.sin(2*w))
# ---- sweep: right hand rakes rows SWEEP_ROWS from column U0 to U1 ----
SWEEP_ROWS = (3, 4); U0, U1 = 11.9, 5.7; VLINE = 4.0
KEY = dict(windup=0.45, reach=0.80, sweep_end=1.70, close=1.95, back=2.75, end=3.40)
HSWEEP = 108.0          # hand angle (deg) while raking: pointing down, slightly back toward the snowman
def tip_offset(h, hand):
    ops, E, W, hh = R.layout((0, 0), 0, 0, h, hand); T = ops[-3][3]; return (T[0] - W[0], T[1] - W[1])
def arm_for_tip(S, P, h, hand):
    o = tip_offset(h, hand); Wt = (P[0] - o[0], P[1] - o[1]); s, e = R.ik(S, Wt, bend=1); return dict(shoulder=s, elbow=e, wrist=(h - (s + e) + 180) % 360 - 180, hand=hand)
def mix_arm(a, b, t):
    return dict(shoulder=R.lerp(a["shoulder"], b["shoulder"], t), elbow=R.lerp(a["elbow"], b["elbow"], t), wrist=R.lerp(a["wrist"], b["wrist"], t), hand=R.pose_mix(a["hand"], b["hand"], t))
def board_pt(u, v): p = project(u, v); return (p[0], p[1])
def sweep(t, RS):
    k = KEY; base = idle(0.0); rest = base["arms"]["R"]
    wind = dict(shoulder=-30, elbow=-70, wrist=-25, hand=R.POSE["open"])      # hand raised high, claws spread, well clear of the face
    start = arm_for_tip(RS, board_pt(U0, VLINE), HSWEEP, R.POSE["open"])
    eye = 0.75
    if t < k["windup"]: a = mix_arm(rest, wind, ease(t/k["windup"])); eye = R.lerp(0.75, 1.6, ease(t/k["windup"]))
    elif t < k["reach"]: a = mix_arm(wind, start, ein((t - k["windup"])/(k["reach"] - k["windup"]))); eye = 1.6
    elif t < k["sweep_end"]:
        f = (t - k["reach"])/(k["sweep_end"] - k["reach"]); u = R.lerp(U0, U1, ease(f)); hand = R.pose_mix("open", "grasp", ease(f))
        a = arm_for_tip(RS, board_pt(u, VLINE + 0.15*math.sin(math.pi*f)), HSWEEP - 18*ease(f), hand); eye = 1.6
    elif t < k["close"]:
        f = ease((t - k["sweep_end"])/(k["close"] - k["sweep_end"])); u = U1
        a = arm_for_tip(RS, (board_pt(u, VLINE)[0], board_pt(u, VLINE)[1] - 40*f), HSWEEP - 18 + 10*f, R.pose_mix("grasp", "closed", f)); eye = R.lerp(1.6, 1.2, f)
    elif t < k["back"]:
        f = ease((t - k["close"])/(k["back"] - k["close"])); last = arm_for_tip(RS, (board_pt(U1, VLINE)[0], board_pt(U1, VLINE)[1] - 40), HSWEEP - 8, R.POSE["closed"])
        a = mix_arm(last, rest, f); eye = R.lerp(1.2, 0.75, f)
    else: a = rest
    st = dict(base); st["arms"] = dict(base["arms"]); st["arms"]["R"] = a; st["eye"] = eye
    st["over_board"] = k["windup"] < t < k["back"]
    return st
def sweep_tip_u(t):
    k = KEY
    if t < k["reach"]: return None
    if t < k["sweep_end"]: return R.lerp(U0, U1, ease((t - k["reach"])/(k["sweep_end"] - k["reach"])))
    return U1
def swept_tiles():
    return [v*N + u for v in SWEEP_ROWS for u in range(N) if U1 <= u + 0.5 <= U0]
def contact_time(i):
    """Time the claws pass tile i's centre (inverse of the ease)."""
    u = i % N + 0.5; k = KEY; target = (U0 - u)/(U0 - U1); lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi)/2
        if ease(m) < target: lo = m
        else: hi = m
    return k["reach"] + lo*(k["sweep_end"] - k["reach"])
TILE_FX_T = 0.8
def tile_motion(age, row):
    """Swept tile, age s after contact: slides with the claws (-x), hops, tips over and drops off the board."""
    a = age/TILE_FX_T; dx = -95*ease(a/0.7) - 10*row; dy = -16*math.sin(math.pi*min(a/0.45, 1)) + 300*max(0, a - 0.35)**2
    return dx, dy, 55*ein(a), 1 - ease((a - 0.55)/0.45)
