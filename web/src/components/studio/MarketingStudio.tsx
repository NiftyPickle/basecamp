import { useMemo, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { submitMarketing, getMarketingJob, type StudioJob } from "@/lib/studio-api";
import { MOTION_GROUPS, DEFAULT_MOTION, DOP_QUALITY_OPTIONS } from "@/lib/studio-motions";
import { ReferenceUpload } from "./ReferenceUpload";
import { JobFooter } from "./JobFooter";
import { useStudioJob } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (motion: string, prompt: string, job: StudioJob, requestId: string) => void;
};

export function MarketingStudio({ disabled, onComplete }: Props) {
  const [source, setSource] = useState<string | null>(null);
  const [motion, setMotion] = useState<string>(DEFAULT_MOTION);
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<string>(DOP_QUALITY_OPTIONS[0].value);
  const [strength, setStrength] = useState(1);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return MOTION_GROUPS;
    return MOTION_GROUPS.map((g) => ({
      ...g,
      motions: g.motions.filter((m) => m.toLowerCase().includes(q)),
    })).filter((g) => g.motions.length > 0);
  }, [search]);

  // Snapshot submit-time state so onComplete reports the motion and prompt the
  // job was actually submitted with, not whatever the inputs hold at completion.
  const submitMeta = useRef<{ motion: string; prompt: string } | null>(null);

  const { job, requestId, busy, error, run, setError } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.motion, meta.prompt, j, id);
  }, getMarketingJob);

  function onRun() {
    if (!source || !prompt.trim() || busy) return;
    submitMeta.current = { motion, prompt: prompt.trim() };
    void run(() =>
      submitMarketing({
        image_url: source,
        motion,
        prompt: prompt.trim(),
        strength,
        options: quality,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReferenceUpload
        value={source}
        onChange={setSource}
        onError={setError}
        accept="image/*"
        label="Source image"
        mediaKind="image"
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Motion ({motion})</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search 121 motions..."
          className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
        />
      </label>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-muted p-2">
        {groups.map((g) => (
          <div key={g.label} className="mb-2">
            <div className="px-1 py-1 text-xs font-medium text-text-tertiary">{g.label}</div>
            <div className="flex flex-wrap gap-1">
              {g.motions.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotion(m)}
                  className={
                    "rounded-md border px-2 py-1 text-xs " +
                    (m === motion
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-text-secondary hover:text-text-primary")
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="px-1 py-2 text-xs text-text-tertiary">No motions match.</div>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Prompt</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Describe the subject and scene..."
          className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
        />
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-text-tertiary">Quality</span>
          <Select value={quality} onValueChange={setQuality}>
            {DOP_QUALITY_OPTIONS.map((o) => (
              <SelectOption key={o.value} value={o.value}>{o.label}</SelectOption>
            ))}
          </Select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-text-tertiary">Strength ({strength.toFixed(2)})</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
          />
        </label>
      </div>

      <JobFooter
        button={
          <Button onClick={onRun} disabled={disabled || busy || !source || !prompt.trim()}>
            {busy ? "Generating..." : "Generate motion video"}
          </Button>
        }
        hint={
          !source ? (
            <span className="text-xs text-text-tertiary">Upload a source image first.</span>
          ) : undefined
        }
        requestId={requestId}
        job={job}
        error={error}
        media="video"
      />
    </div>
  );
}
