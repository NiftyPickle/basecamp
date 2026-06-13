// vitest 4 + jsdom 29 does not expose localStorage; this shim provides it.
// Mirrors web/vitest.setup.ts so renderer code that persists to localStorage
// (studio history, pane state, onboarding, composer queue) is testable under
// jsdom. Do not remove - several suites depend on it.
if (typeof localStorage === "undefined") {
  const store: Record<string, string> = Object.create(null);

  global.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}
