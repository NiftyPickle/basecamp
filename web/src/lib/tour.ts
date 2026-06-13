/**
 * First-run guided tour: step registry + pure state machine.
 *
 * Steps are data. `target` is a CSS selector; the canonical form is
 * `[data-tour="<id>"]`, and some steps carry a comma-separated fallback
 * selector for UI that lives in files this branch cannot stamp yet
 * (App.tsx nav and the chat composer). `target: null` renders a centered
 * card with no spotlight. `route` navigates before the overlay measures
 * the target. getVisibleSteps drops any step whose target is absent so
 * the tour never points at nothing.
 */

export interface TourStep {
  id: string;
  /** CSS selector for the highlight target, or null for a centered card. */
  target: string | null;
  title: string;
  body: string;
  /** Optional disclosure content: how to set the feature up and use it. */
  learnMore?: string;
  /** Optional route to navigate to before highlighting. */
  route?: string;
}

/** Bump the suffix to re-trigger the tour after major UI changes. */
export const TOUR_DONE_KEY = "sidekick.tour.v1";

/**
 * Where an in-progress tour parks its `{open, stepIndex}` so it survives
 * a full-page reload. A routed tour step (e.g. `/studio`) can hit a
 * stale-token 401 the first time it fetches; `fetchJSON` recovers by
 * reloading the page once to pick up a fresh injected token. Without
 * this, that reload remounts the app and the first-run effect restarts
 * the tour at "welcome" - the user sees card 4 snap back to card 1.
 * sessionStorage (not localStorage) so it lives exactly as long as the
 * window and never resurrects a tour in a brand-new launch.
 */
export const TOUR_PROGRESS_KEY = "sidekick.tour.progress.v1";

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Basecamp",
    body: "Basecamp is your personal agent dashboard. This one minute tour points out where everything lives and how to get set up. You can leave at any time and rerun it later.",
  },
  {
    id: "nav",
    target: '[data-tour="nav"], aside nav',
    title: "Find your way around",
    body: "The sidebar is home base. Chat and Studio sit at the top because they are the main surfaces. Everything else lives below.",
    learnMore:
      "Click any item to jump to that page. Less common tools are folded under the Advanced section in the list. Open it to reach Cron, Skills, Plugins, MCP, Logs and more. On small screens the sidebar slides in from the menu button.",
  },
  {
    id: "chat",
    target: '[data-tour="chat"], textarea[placeholder^="Message"]',
    route: "/sidekick",
    title: "Talk to your agent",
    body: "This is the composer. Type a message and press Enter to send it to your agent.",
    learnMore:
      "Messages go to the model configured on the server, and your conversation history is saved automatically. Tip: ask the agent what it can do and it will list its tools and skills. Shift plus Enter adds a new line without sending.",
  },
  {
    id: "studio",
    target: '[data-tour="studio"]',
    route: "/studio",
    title: "Studio",
    body: "Generate images and video, apply effects, animate stills and enhance media.",
    learnMore:
      "Studio needs a MUAPI key on the server: set MUAPI_API_KEY on the Keys page. Then pick a tab such as Image, Video, Templates or Enhance. Finished results land in the history rail so you can download or reuse them later.",
  },
  {
    id: "freechat",
    target: '[data-tour="freechat"]',
    title: "Free chat and Council mode",
    body: "Chat with any model directly, or switch on Council mode to get answers from several models at once.",
    learnMore:
      "Council mode fans your question out to multiple models and shows their answers side by side, which is great for comparing reasoning. It needs an OpenRouter key: set OPENROUTER_API_KEY on the Keys page and you are ready.",
  },
  {
    id: "organize",
    target: '[data-tour="organize"]',
    route: "/organize",
    title: "Organize your Desktop",
    body: "Point Basecamp at your Desktop or a folder you add, describe how you want it tidied, preview the plan, then approve. Everything is undoable.",
    learnMore:
      "Basecamp only touches your Desktop and folders you explicitly add, and it moves files to the Trash rather than deleting them. Every run records an undo step, so you can roll back the last organize at any time.",
  },
  {
    id: "keys",
    target: '[data-tour="keys"], nav a[href$="/env"]',
    title: "API keys",
    body: "API keys live on the Keys page. This is the first stop when something says a key is missing.",
    learnMore:
      "OPENROUTER_API_KEY unlocks free chat and Council mode. MUAPI_API_KEY unlocks Studio. Keys are stored on the server and are never shared with the browser.",
  },
  {
    id: "sessions",
    target: '[data-tour="sessions"], nav a[href$="/sessions"]',
    title: "Sessions",
    body: "Past conversations are saved here.",
    learnMore:
      "Open any session to inspect the full transcript, or resume it to continue where you left off. Handy for reviewing what the agent did while you were away.",
  },
  {
    id: "advanced",
    target: '[data-tour="advanced"], aside nav details > summary',
    title: "Advanced tools",
    body: "Power tools live under this accordion.",
    learnMore:
      "Cron schedules recurring agent jobs. Skills are reusable abilities the agent can load. Plugins add new pages to this dashboard. MCP connects external tool servers. Logs shows what the server is doing under the hood.",
  },
  {
    id: "finish",
    target: null,
    title: "That is the tour",
    body: "Rerun it any time from the Tour button at the bottom of the sidebar. Enjoy Basecamp.",
  },
];

/**
 * Default size check for getVisibleSteps. An element inside a closed
 * <details> accordion has a zero rect but is still reachable: the
 * overlay opens the accordion before measuring, so count it visible.
 */
export function defaultHasSize(el: Element): boolean {
  const details = el.closest("details");
  if (details && !details.open) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

/**
 * Drop steps whose target is not currently in the DOM (plugin tabs
 * hidden, free chat not merged, embedded chat off) so the tour never
 * points at nothing. Steps that carry a `route` are exempt: their
 * target lives on a page that is not mounted yet, the overlay
 * navigates there before measuring, and it degrades to a centered
 * card if the target is still missing afterwards. `hasSize` is
 * injectable because jsdom reports a zero rect for every element.
 */
export function getVisibleSteps(
  steps: readonly TourStep[],
  doc: Document = document,
  hasSize: (el: Element) => boolean = defaultHasSize,
): TourStep[] {
  return steps.filter((step) => {
    if (step.target === null || step.route) return true;
    const el = doc.querySelector(step.target);
    return el !== null && hasSize(el);
  });
}

export interface TourState {
  open: boolean;
  /** Index into the VISIBLE steps array, not TOUR_STEPS. */
  stepIndex: number;
}

export const initialTourState: TourState = { open: false, stepIndex: 0 };

export type TourAction =
  | { type: "open" }
  | { type: "next"; total: number }
  | { type: "back" }
  | { type: "close" };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "open":
      return { open: true, stepIndex: 0 };
    case "next":
      return {
        ...state,
        stepIndex: Math.min(state.stepIndex + 1, Math.max(action.total - 1, 0)),
      };
    case "back":
      return { ...state, stepIndex: Math.max(state.stepIndex - 1, 0) };
    case "close":
      return { open: false, stepIndex: 0 };
    default:
      return state;
  }
}

/**
 * Persist an in-progress tour so a reload resumes it. A closed tour has
 * nothing to resume, so saving one clears the key instead of writing
 * `open:false` (which `loadTourProgress` would reject anyway). Storage is
 * best-effort: private browsing throws on access and we silently skip.
 */
export function saveTourProgress(state: TourState): void {
  try {
    if (!state.open) {
      sessionStorage.removeItem(TOUR_PROGRESS_KEY);
      return;
    }
    sessionStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable (private browsing) - skip */
  }
}

/**
 * Read a resumable tour, or null when there is nothing valid to resume.
 * Rejects absent/corrupt entries, closed tours, and out-of-range indices
 * so a poisoned key can never strand the user on a broken card.
 */
export function loadTourProgress(): TourState | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(TOUR_PROGRESS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TourState>;
    if (parsed.open !== true) return null;
    if (typeof parsed.stepIndex !== "number") return null;
    if (!Number.isFinite(parsed.stepIndex) || parsed.stepIndex < 0) return null;
    return { open: true, stepIndex: parsed.stepIndex };
  } catch {
    return null;
  }
}

/** Drop any persisted tour - used when the tour is finished or skipped. */
export function clearTourProgress(): void {
  try {
    sessionStorage.removeItem(TOUR_PROGRESS_KEY);
  } catch {
    /* sessionStorage unavailable - nothing to clear */
  }
}
