/** why: tests/standards.test.ts requires this over casting `Object.keys`. */
export function keysOf<T extends object>(table: T): (keyof T & string)[] {
  return Object.keys(table).filter((key): key is keyof T & string => Object.hasOwn(table, key));
}
