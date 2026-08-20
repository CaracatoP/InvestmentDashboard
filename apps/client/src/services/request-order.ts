export function createLatestRequestTracker<T extends string>() {
  const versions = new Map<T, number>();

  function start(keys: T[]) {
    return new Map(
      keys.map((key) => {
        const version = (versions.get(key) ?? 0) + 1;
        versions.set(key, version);
        return [key, version] as const;
      })
    );
  }

  function isLatest(key: T, version: number) {
    return versions.get(key) === version;
  }

  function invalidateAll(keys: T[]) {
    for (const key of keys) versions.set(key, (versions.get(key) ?? 0) + 1);
  }

  return { start, isLatest, invalidateAll };
}
