// Player views as patches: the server sends one full snapshot, then only what changed.
// A phone keeps the stable bulk (question text, Tower Fight terrain, Robot Attack marks,
// the Land Grab board) and gets the parts that moved.

export type PatchPath = (string | number)[];
/** [path, value] sets a value; [path] deletes a key. An empty path replaces the whole view. */
export type PatchOp = [PatchPath, unknown] | [PatchPath];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isObject = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The ops that turn `prev` into `next`. Both must be plain JSON (as JSON.parse returns).
 * Objects are compared key by key. Arrays of the same length are compared item by item,
 * unless more than half the items changed, when the whole array is sent.
 */
export function diffView(prev: unknown, next: unknown): PatchOp[] {
  const ops: PatchOp[] = [];
  diff(prev as Json, next as Json, [], ops);
  return ops;
}

function diff(a: Json, b: Json, path: PatchPath, ops: PatchOp[]): void {
  if (a === b) return;
  if (isObject(a) && isObject(b)) {
    for (const k of Object.keys(a)) if (!(k in b)) ops.push([[...path, k]]);
    for (const k of Object.keys(b)) {
      if (k in a) diff(a[k]!, b[k]!, [...path, k], ops);
      else ops.push([[...path, k], b[k]]);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const inner: PatchOp[] = [];
    let changed = 0;
    for (let i = 0; i < b.length; i++) {
      const before = inner.length;
      diff(a[i]!, b[i]!, [...path, i], inner);
      if (inner.length > before) changed++;
    }
    if (changed * 2 <= b.length) ops.push(...inner);
    else ops.push([path, b]);
    return;
  }
  ops.push([path, b]);
}

/**
 * Applies ops to a view without mutating it. Every object along a changed path is copied,
 * the rest is shared, and the result is always a new object so the page re-renders.
 */
export function applyPatch<T>(view: T, ops: PatchOp[]): T {
  let root: unknown = Array.isArray(view) ? [...view] : { ...(view as object) };
  // Containers already copied for this patch, so each is copied once however many ops touch it.
  const fresh = new Set<unknown>([root]);
  for (const op of ops) {
    const [path] = op;
    if (path.length === 0) {
      root = op[1];
      fresh.clear();
      continue;
    }
    let node = root as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      let child = node[key] as Record<string | number, unknown>;
      if (!fresh.has(child)) {
        child = Array.isArray(child) ? ([...child] as unknown as Record<number, unknown>) : { ...child };
        fresh.add(child);
        node[key] = child;
      }
      node = child;
    }
    const last = path[path.length - 1]!;
    if (op.length === 2) node[last] = op[1];
    else delete node[last];
  }
  return root as T;
}
