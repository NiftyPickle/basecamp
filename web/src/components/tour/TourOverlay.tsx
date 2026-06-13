import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { TourStep } from "@/lib/tour";

export interface TourOverlayProps {
  steps: readonly TourStep[];
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
  /** Provided by the launcher; steps with a `route` navigate before measuring. */
  onNavigate?: (route: string) => void;
}

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HALO_PX = 6;
const CARD_W = 320;
const CARD_GAP = 12;
const CARD_EST_H = 280;
const SHADE = "rgba(8, 6, 18, 0.65)";

/**
 * Resolve a step target to a viewport rect. Returns null when the
 * selector is missing or the element measures zero size, which the
 * overlay renders as a centered card over a full-screen dim, so the
 * spotlight never points at nothing. Closed <details> ancestors are
 * opened first so accordion entries can be highlighted.
 */
export function measureTarget(
  selector: string | null,
  doc: Document = document,
): TargetRect | null {
  if (!selector) return null;
  const el = doc.querySelector(selector);
  if (!el) return null;
  // Intentional side effect: opened accordions stay open after the tour
  // moves on, which beats snapping them shut under the user mid-tour.
  let details = el.closest("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest("details") ?? null;
  }
  // Targets inside scrollable rails (the sidebar nav) can sit below the
  // fold; bring them on screen before measuring. Guarded because jsdom
  // does not implement scrollIntoView.
  if (typeof el.scrollIntoView === "function") {
    el.scrollIntoView({ block: "nearest" });
  }
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Place the card below the halo, flipping above when near the bottom edge. */
export function cardPosition(
  rect: TargetRect,
  viewportW: number,
  viewportH: number,
): { top: number; left: number } {
  const below = rect.top + rect.height + HALO_PX + CARD_GAP;
  const top =
    below + CARD_EST_H <= viewportH
      ? below
      : Math.max(CARD_GAP, rect.top - HALO_PX - CARD_GAP - CARD_EST_H);
  const left = Math.min(
    Math.max(CARD_GAP, rect.left),
    Math.max(CARD_GAP, viewportW - CARD_W - CARD_GAP),
  );
  return { top, left };
}

export function TourOverlay({
  steps,
  stepIndex,
  onNext,
  onBack,
  onSkip,
  onFinish,
  onNavigate,
}: TourOverlayProps) {
  const step = steps[stepIndex] ?? null;
  const [rect, setRect] = useState<TargetRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog card on open and on every step change so
  // screen readers announce the step; the launcher restores focus on close.
  useEffect(() => {
    cardRef.current?.focus();
  }, [stepIndex]);

  const remeasure = useCallback(() => {
    setRect(measureTarget(step?.target ?? null));
  }, [step]);

  // Measure on step change. Steps with a route navigate first, then wait
  // one frame for the destination page to paint before measuring.
  useEffect(() => {
    if (!step) return;
    if (step.route && onNavigate) {
      onNavigate(step.route);
      const id = requestAnimationFrame(remeasure);
      return () => cancelAnimationFrame(id);
    }
    remeasure();
  }, [step, onNavigate, remeasure]);

  // Recompute the spotlight when the window resizes or anything scrolls.
  // Scroll uses the capture phase because the sidebar nav scrolls inside
  // its own overflow container, and scroll events do not bubble.
  useEffect(() => {
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [remeasure]);

  // Esc skips the tour. Clicking the shade does nothing on purpose.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  if (!step) return null;

  const isLast = stepIndex === steps.length - 1;
  const halo = rect
    ? {
        top: rect.top - HALO_PX,
        left: rect.left - HALO_PX,
        width: rect.width + HALO_PX * 2,
        height: rect.height + HALO_PX * 2,
      }
    : null;

  const cardStyle: CSSProperties =
    rect && halo
      ? cardPosition(rect, window.innerWidth, window.innerHeight)
      : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[100]" data-tour-overlay="" role="presentation">
      {halo ? (
        <>
          <div
            aria-hidden
            className="fixed"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, halo.top), background: SHADE }}
          />
          <div
            aria-hidden
            className="fixed"
            style={{ top: halo.top, left: 0, width: Math.max(0, halo.left), height: halo.height, background: SHADE }}
          />
          <div
            aria-hidden
            className="fixed"
            style={{ top: halo.top, left: halo.left + halo.width, right: 0, height: halo.height, background: SHADE }}
          />
          <div
            aria-hidden
            className="fixed"
            style={{ top: halo.top + halo.height, left: 0, right: 0, bottom: 0, background: SHADE }}
          />
          <div
            aria-hidden
            className="pointer-events-none fixed rounded-md text-midground"
            style={{
              top: halo.top,
              left: halo.left,
              width: halo.width,
              height: halo.height,
              boxShadow: "0 0 0 2px currentColor",
            }}
          />
        </>
      ) : (
        <div aria-hidden className="fixed inset-0" style={{ background: SHADE }} />
      )}

      <div
        aria-label={step.title}
        aria-modal="true"
        className="fixed z-[101] w-80 rounded-lg border border-current/20 p-4 text-text-primary shadow-xl outline-none"
        ref={cardRef}
        role="dialog"
        style={{ ...cardStyle, background: "var(--component-sidebar-background, #16122a)" }}
        tabIndex={-1}
      >
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-midground">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{step.body}</p>

        {step.learnMore && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-text-tertiary transition-colors hover:text-text-primary">
              Learn More
            </summary>
            <p className="mt-1 text-text-secondary">{step.learnMore}</p>
          </details>
        )}

        <p className="sr-only">{`Step ${stepIndex + 1} of ${steps.length}`}</p>
        <div aria-hidden="true" className="mt-4 flex items-center justify-center gap-1.5">
          {steps.map((s, i) => (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                i === stepIndex ? "bg-midground" : "bg-text-tertiary/40",
              )}
              data-tour-dot={i === stepIndex ? "active" : "idle"}
              key={s.id}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            className="text-xs text-text-tertiary transition-colors hover:text-text-primary"
            onClick={onSkip}
            type="button"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              className="rounded border border-current/20 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
              disabled={stepIndex === 0}
              onClick={onBack}
              type="button"
            >
              Back
            </button>
            {isLast ? (
              <button
                className="rounded bg-midground px-3 py-1.5 text-xs font-medium text-[#100c20]"
                onClick={onFinish}
                type="button"
              >
                Finish
              </button>
            ) : (
              <button
                className="rounded bg-midground px-3 py-1.5 text-xs font-medium text-[#100c20]"
                onClick={onNext}
                type="button"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
