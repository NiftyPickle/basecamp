import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Segmented } from "@nous-research/ui/ui/components/segmented";
import { submitEffect, type StudioJob, type EffectMode } from "@/lib/studio-api";
import { effectsForMode } from "@/lib/studio-effects";
import { loadPreviews, previewFor, type PreviewMap } from "@/lib/studio-previews";
import { EffectCard } from "./EffectCard";
import { ReferenceUpload } from "./ReferenceUpload";
import { JobFooter } from "./JobFooter";
import { useStudioJob } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (label: string, media: "image" | "video", job: StudioJob, requestId: string) => void;
};

const MODE_OPTIONS: { label: string; value: EffectMode }[] = [
  { label: "Video", value: "ai" },
  { label: "Image", value: "image" },
];

export function TemplatesStudio({ disabled, onComplete }: Props) {
  const [mode, setMode] = useState<EffectMode>("ai");
  const effects = useMemo(() => effectsForMode(mode), [mode]);
  const [selected, setSelected] = useState<string>(effects[0]?.key ?? "");
  const [source, setSource] = useState<string | null>(null);
  const [previews, setPreviews] = useState<PreviewMap>({});

  useEffect(() => {
    void loadPreviews().then(setPreviews);
  }, []);

  useEffect(() => {
    const keys = effects.map((e) => e.key);
    setSelected((prev) => (keys.includes(prev) ? prev : keys[0] ?? ""));
  }, [effects]);

  // Snapshot submit-time state so onComplete reports the effect the job was
  // actually submitted with, not whatever mode/selection holds at completion.
  const submitMeta = useRef<{ label: string; media: "image" | "video" } | null>(null);

  const { job, requestId, busy, error, run, setError } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.label, meta.media, j, id);
  });

  const outputMedia = mode === "image" ? "image" : "video";

  function onRun() {
    const entry = effects.find((e) => e.key === selected);
    if (!entry || !source || busy) return;
    submitMeta.current = {
      label: entry.name,
      media: mode === "image" ? "image" : "video",
    };
    void run(() =>
      submitEffect({
        mode,
        effect: entry.wire,
        image_url: source,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} size="sm" />

      <ReferenceUpload
        value={source}
        onChange={setSource}
        onError={setError}
        accept="image/*"
        label="Source image"
        mediaKind="image"
      />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {effects.map((e) => (
          <EffectCard
            key={e.key}
            effect={e}
            preview={previewFor(previews, e.key)}
            selected={e.key === selected}
            onSelect={() => setSelected(e.key)}
          />
        ))}
      </div>

      <JobFooter
        button={
          <Button onClick={onRun} disabled={disabled || busy || !selected || !source}>
            {busy ? "Running..." : "Apply effect"}
          </Button>
        }
        hint={
          !source ? (
            <span className="text-xs text-text-tertiary">Upload an image to apply an effect.</span>
          ) : undefined
        }
        requestId={requestId}
        job={job}
        error={error}
        media={outputMedia}
      />
    </div>
  );
}
