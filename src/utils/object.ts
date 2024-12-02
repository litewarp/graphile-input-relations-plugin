/**
 * Utility to avoid using reducer and spread operator together
 * https://biomejs.dev/linter/rules/no-accumulating-spread/
 * https://prateeksurana.me/blog/why-using-object-spread-with-reduce-bad-idea/
 *
 **/

export function rebuildObject<TResult, TVal>({
  obj,
  map,
  filter,
}: {
  obj: Record<string, TVal>;
  map: (entry: [string, TVal]) => [string, TResult];
  filter?: (entry: [string, TVal]) => boolean | undefined | null;
}): Record<string, TResult> {
  const entries = Object.entries(obj);
  return Object.fromEntries(filter ? entries.filter(filter).map(map) : entries.map(map));
}
