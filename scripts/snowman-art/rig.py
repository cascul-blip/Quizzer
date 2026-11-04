"""Evil Snowman rig maths (mirror this in the TSX). Arena units; right arm defined, left arm = mirror about x=600."""
import math
H = 40.0                 # arm thickness at the upper arm (forearm 0.8H)
L1, L2 = 180.0, 160.0    # upper arm, forearm (rigid, no stretch)
CXM = 600.0              # mirror axis
# hand presets: knuckle curl, tip curl, spread multiplier, thumb close
POSE = {"open": (0, 0, 1.3, 0), "half": (30, 35, 1.0, 0.45), "closed": (65, 80, 0.55, 1.0), "grasp": (40, 55, 0.75, 0.7)}
SPREAD = 22.0            # deg between claws at spread 1
CLAW_LS = (1.0, 1.08, 0.95)
def lerp(a, b, t): return a + (b - a)*t
def pose_mix(p, q, t): return tuple(lerp(a, b, t) for a, b in zip(POSE[p] if isinstance(p, str) else p, POSE[q] if isinstance(q, str) else q))
def at(p, deg, L): r = math.radians(deg); return (p[0] + L*math.cos(r), p[1] + L*math.sin(r))
def ik(S, T, bend=1):
    """Two-bone IK. Returns (shoulder_deg, elbow_bend_deg). bend=+1 elbow up for the right arm."""
    d = min(max(math.dist(S, T), abs(L1 - L2) + 1), L1 + L2 - 1e-3); base = math.degrees(math.atan2(T[1] - S[1], T[0] - S[0]))
    a = math.degrees(math.acos((L1*L1 + d*d - L2*L2)/(2*L1*d))); s = base - bend*a
    E = at(S, s, L1); f = math.degrees(math.atan2(T[1] - E[1], T[0] - E[0])); return s, (f - s + 180) % 360 - 180
def layout(S, shoulder, elbow, wrist, hand):
    """Right-arm piece ops in draw order. elbow = forearm angle minus upper angle (deg).
    Returns list of (piece, A, B, height, pivot_y_frac) segments plus ('knot'/'shoulder', centre, size, angle)."""
    kc, tc, sp, th = hand
    E = at(S, shoulder, L1); fa = shoulder + elbow; W = at(E, fa, L2); h = fa + wrist
    n = (-math.sin(math.radians(h)), math.cos(math.radians(h)))
    ops = [("seg", "arm-upper", S, E, H), ("seg", "arm-fore", E, W, H*0.8), ("sq", "arm-elbow", E, H*1.3, 0)]
    T0 = at(W, h, H*0.20); T0 = (T0[0] + n[0]*H*0.12, T0[1] + n[1]*H*0.12); ta = h + 62 - th*55
    ops.append(("seg", "thumb", at(T0, ta, -H*0.30), at(T0, ta, H*0.85), H*0.42))          # starts inside the palm: never detached
    ops.append(("seg", "hand-palm", at(W, h, -H*0.25), at(W, h, H*1.45), H*0.95))
    F = at(W, h, H*1.2)
    for i in range(3):
        o = (i - 1)*H*0.30*min(sp, 1.1); B0 = (F[0] + n[0]*o, F[1] + n[1]*o); ls = CLAW_LS[i]
        a1 = h + (i - 1)*SPREAD*sp + kc; M1 = at(B0, a1, H*0.85*ls); a2 = a1 + tc
        ops.append(("seg", "claw-prox", at(B0, a1, -H*0.1), at(M1, a1, H*0.08), H*0.32*ls))
        ops.append(("dist", "claw-dist", M1, at(M1, a2, H*1.15*ls), H*0.32*ls))
    return ops, E, W, h
def tip(S, shoulder, elbow, wrist, hand):
    ops, E, W, h = layout(S, shoulder, elbow, wrist, hand); return ops[-3][3]   # middle claw tip
def mirror_pt(p): return (2*CXM - p[0], p[1])
