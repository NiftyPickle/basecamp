// vitest 3.2.4 + jsdom 29 does not expose localStorage; this shim provides it
// under both envs. Do not remove - the whole suite depends on it.
if (typeof localStorage === "undefined") {
  const store: Record<string, string> = Object.create(null);

  global.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  } as Storage;
}
