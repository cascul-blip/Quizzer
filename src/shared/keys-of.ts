export function keysOf<T extends object>(table: T): (keyof T & string)[] {
  return Object.keys(table).filter((key): key is keyof T & string => Object.hasOwn(table, key));
}
