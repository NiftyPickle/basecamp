import { useCallback, useEffect, useRef, useState } from "react";
import { getStudioJob, type StudioJob } from "@/lib/studio-api";

const POLL_MS = 2500;
const POLL_MAX = 120; // ~5 min ceiling

type ErrShape = { error_code?: string; message?: string };

export function errText(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as ErrShape & { body?: ErrShape };
    const msg = o.message ?? o.body?.message;
    if (typeof msg === "string" && msg) return msg;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong";
}

type SubmitFn = () => Promise<{ request_id: string }>;
type FetchJobFn = (id: string) => Promise<StudioJob>;

export function useStudioJob(
  onComplete?: (job: StudioJob, requestId: string) => void,
  fetchJob: FetchJobFn = getStudioJob,
) {
  const [job, setJob] = useState<StudioJob | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);
  // Generation token: bumped on every run() and on unmount. In-flight
  // getStudioJob resolutions from an older generation are ignored, so a
  // superseded chain can never set stale state or re-arm its timer.
  const genRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const fetchJobRef = useRef(fetchJob);
  fetchJobRef.current = fetchJob;

  useEffect(() => () => {
    genRef.current += 1;
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  const poll = useCallback((id: string, gen: number) => {
    fetchJobRef.current(id)
      .then((j) => {
        if (gen !== genRef.current) return;
        setJob(j);
        const settled = j.status === "completed" || j.status === "failed";
        pollCount.current += 1;
        if (settled || pollCount.current >= POLL_MAX) {
          setBusy(false);
          if (j.status === "completed") onCompleteRef.current?.(j, id);
          else if (!settled) setError("Timed out waiting for job. It may still complete - check back later.");
          return;
        }
        pollRef.current = setTimeout(() => poll(id, gen), POLL_MS);
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        setError(errText(e));
        setBusy(false);
      });
  }, []);

  const run = useCallback(async (submit: SubmitFn) => {
    setError(null);
    setJob(null);
    setRequestId(null);
    setBusy(true);
    pollCount.current = 0;
    genRef.current += 1;
    const myGen = genRef.current;
    if (pollRef.current) clearTimeout(pollRef.current);
    try {
      const { request_id } = await submit();
      if (myGen !== genRef.current) return;
      setRequestId(request_id);
      poll(request_id, myGen);
    } catch (e) {
      if (myGen !== genRef.current) return;
      setError(errText(e));
      setBusy(false);
    }
  }, [poll]);

  return { job, requestId, busy, error, run, setError };
}
