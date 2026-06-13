import type { ReactNode } from "react";
import type { StudioJob } from "@/lib/studio-api";
import { OutputGrid } from "./OutputGrid";
import { errText } from "./useStudioJob";

type Props = {
  /** The panel's submit button, fully wired by the caller. */
  button: ReactNode;
  /** Optional helper text shown next to the button (caller decides visibility). */
  hint?: ReactNode;
  requestId: string | null;
  job: StudioJob | null;
  error: string | null;
  media: "image" | "video";
};

/** Shared studio panel footer: button row + job chip, error box, failed-job
 * box, and outputs. Purely presentational - all state lives in the caller.
 * Returns a fragment so each block stays a direct child of the panel's
 * flex column, exactly like the inline markup it replaced. */
export function JobFooter({ button, hint, requestId, job, error, media }: Props) {
  return (
    <>
      <div className="flex items-center gap-3">
        {button}
        {hint}
        {requestId && (
          <span className="text-xs text-text-tertiary">
            job {requestId.slice(0, 8)} · {job?.status ?? "submitting"}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {job?.status === "failed" && !error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Generation failed: {errText(job.error)}
        </div>
      )}
      {job?.outputs && job.outputs.length > 0 && <OutputGrid outputs={job.outputs} media={media} />}
    </>
  );
}
