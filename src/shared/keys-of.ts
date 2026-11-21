/** A table's own keys, typed as the table's key type, without a cast. tests/standards.test.ts requires it over casting `Object.keys`. */
export function keysOf<T extends object>(table: T): (keyof T & string)[] {
  return Object.keys(table).filter((key): key is keyof T & string => Object.hasOwn(table, key));
}
