import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TOUR_DONE_KEY,
  TOUR_STEPS,
  clearTourProgress,
  getVisibleSteps,
  initialTourState,
  loadTourProgress,
  saveTourProgress,
  tourReducer,
  type TourStep,
} from "@/lib/tour";
import { TourOverlay } from "./TourOverlay";

/**
 * The always-there wizard entry point. Renders the persistent Tour
 * button and owns tour state: auto-opens on first visit (localStorage
 * unset), marks done on finish OR skip, and reopens at step 0 on click.
 * Mounted from SidebarFooter so the tour ships without touching App.tsx.
 */
export function TourLauncher() {
  const navigate = useNavigate();
  // Lazy init: a stale-token 401 on a routed step reloads the page, so
  // rehydrate any in-progress tour parked in sessionStorage instead of
  // remounting fresh (which would restart the user at "welcome").
  const [state, dispatch] = useReducer(
    tourReducer,
    initialTourState,
    () => loadTourProgress() ?? initialTourState,
  );
  // Captured once on the first render: true when we resumed a tour from
  // storage. Guards the first-run effect from clobbering the resumed step.
  const resumedFromReload = useRef(state.open);
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>(() =>
    state.open ? getVisibleSteps(TOUR_STEPS) : [],
  );

  // react-router's navigate changes identity when the pathname changes,
  // which would re-run the overlay's measure effect and navigate twice
  // per routed step. Keep it in a ref so the overlay sees one stable
  // callback for the life of the tour.
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const openTour = useCallback(() => {
    setVisibleSteps(getVisibleSteps(TOUR_STEPS));
    dispatch({ type: "open" });
  }, []);

  // First-run auto-open. By the time the sidebar footer mounts, the app
  // shell has rendered. localStorage access wrapped in try/catch to match
  // the App.tsx pattern; when storage is unavailable (private browsing)
  // we cannot remember completion, so do not nag on every load.
  useEffect(() => {
    // We already rehydrated an in-progress tour from a reload; never let
    // the first-run path reopen it at step 0 mid-walkthrough.
    if (resumedFromReload.current) return;
    let done = true;
    try {
      done = localStorage.getItem(TOUR_DONE_KEY) === "done";
    } catch {
      done = true;
    }
    if (!done) openTour();
  }, [openTour]);

  // Mirror tour state into sessionStorage so a stale-token reload mid-tour
  // resumes where the user was instead of restarting. Closing clears it.
  useEffect(() => {
    saveTourProgress(state);
  }, [state]);

  const buttonRef = useRef<HTMLButtonElement>(null);

  const closeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONE_KEY, "done");
    } catch {
      /* localStorage may be unavailable in private browsing */
    }
    // Drop any parked progress so a later reload does not resurrect a
    // tour the user just finished or skipped.
    clearTourProgress();
    dispatch({ type: "close" });
    // Return focus to the launcher so keyboard users are not stranded
    // on a removed dialog.
    buttonRef.current?.focus();
  }, []);

  // replace:true keeps tour hops out of the history stack so browser
  // Back after the tour does not walk through tour routes.
  const handleNavigate = useCallback((route: string) => {
    navigateRef.current(route, { replace: true });
  }, []);

  return (
    <>
      <button
        aria-label="Open the guided tour"
        className={cn(
          "flex shrink-0 items-center gap-1.5",
          "font-mono-ui text-xs tracking-[0.08em] text-text-tertiary",
          "transition-colors hover:text-midground",
          "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-midground/40",
        )}
        onClick={openTour}
        ref={buttonRef}
        type="button"
      >
        <Compass aria-hidden className="h-3.5 w-3.5" />
        <span>Tour</span>
      </button>

      {state.open &&
        visibleSteps.length > 0 &&
        // Portal to <body> so the overlay's position:fixed children anchor to
        // the viewport, not the sidebar. The sidebar is a transformed ancestor
        // (collapse animation), which would otherwise become their containing
        // block and pin the centered card to the sidebar's left edge.
        createPortal(
          <TourOverlay
            onBack={() => dispatch({ type: "back" })}
            onFinish={closeTour}
            onNavigate={handleNavigate}
            onNext={() => dispatch({ type: "next", total: visibleSteps.length })}
            onSkip={closeTour}
            stepIndex={state.stepIndex}
            steps={visibleSteps}
          />,
          document.body,
        )}
    </>
  );
}
