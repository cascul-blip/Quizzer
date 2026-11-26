export type PatchPath = (string | number)[];
/** why: [path] deletes a key; an empty path replaces the whole view. */
export type PatchOp = [PatchPath, unknown] | [PatchPath];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const isObject = (v: unknown): v is Record<string, Json> => typeof v === "object" && v !== null && !Array.isArray(v);

/** why: both must be plain JSON; an array with over half its items changed is sent whole. */
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

/** why: copies along changed paths and always returns a new root so the page re-renders. */
export function applyPatch<T>(view: T, ops: PatchOp[]): T {
  let root: unknown = Array.isArray(view) ? [...view] : { ...(view as object) };
  const copiedThisPatch = new Set<unknown>([root]);
  for (const op of ops) {
    const [path] = op;
    if (path.length === 0) {
      root = op[1];
      copiedThisPatch.clear();
      continue;
    }
    let node = root as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
      let child = node[key] as Record<string | number, unknown>;
      if (!copiedThisPatch.has(child)) {
        child = Array.isArray(child) ? ([...child] as unknown as Record<number, unknown>) : { ...child };
        copiedThisPatch.add(child);
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
