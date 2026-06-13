import { useMemo, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { submitEnhance, type StudioJob } from "@/lib/studio-api";
import { ENHANCE_OPS, FACE_SWAP_OP, enhanceOp } from "@/lib/studio-effects";
import { ReferenceUpload } from "./ReferenceUpload";
import { JobFooter } from "./JobFooter";
import { useStudioJob } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (label: string, job: StudioJob, requestId: string) => void;
};

const ALL_OPS = [...ENHANCE_OPS, FACE_SWAP_OP];

export function EnhanceStudio({ disabled, onComplete }: Props) {
  const [opId, setOpId] = useState(ENHANCE_OPS[0].id);
  const op = useMemo(() => enhanceOp(opId) ?? ENHANCE_OPS[0], [opId]);

  // single-image op state
  const [image, setImage] = useState<string | null>(null);
  // face-swap state
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);

  const isFaceSwap = op.id === "face-swap";

  // Snapshot submit-time state so onComplete reports the op the job was
  // actually submitted with, not whatever the dropdown holds at completion.
  const submitMeta = useRef<{ label: string } | null>(null);

  const { job, requestId, busy, error, run, setError } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.label, j, id);
  });

  const ready = isFaceSwap ? Boolean(sourceUrl && targetUrl) : Boolean(image);

  function onRun() {
    if (!ready || busy) return;
    submitMeta.current = { label: op.label };
    void run(() =>
      isFaceSwap
        ? submitEnhance({ operation: "face-swap", source_url: sourceUrl, target_url: targetUrl })
        : submitEnhance({ operation: op.id, image_url: image }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Operation</span>
        <Select value={opId} onValueChange={setOpId}>
          {ALL_OPS.map((o) => (
            <SelectOption key={o.id} value={o.id}>{o.label}</SelectOption>
          ))}
        </Select>
      </label>

      {isFaceSwap ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ReferenceUpload value={sourceUrl} onChange={setSourceUrl} onError={setError} label="Source face" />
          <ReferenceUpload value={targetUrl} onChange={setTargetUrl} onError={setError} label="Target image" />
        </div>
      ) : (
        <ReferenceUpload value={image} onChange={setImage} onError={setError} accept={op.accept} label="Image" />
      )}

      <JobFooter
        button={
          <Button onClick={onRun} disabled={disabled || busy || !ready}>
            {busy ? "Processing..." : `Run ${op.label.toLowerCase()}`}
          </Button>
        }
        hint={
          !ready ? (
            <span className="text-xs text-text-tertiary">
              {isFaceSwap ? "Upload a source face and a target image." : "Upload an image to enhance."}
            </span>
          ) : undefined
        }
        requestId={requestId}
        job={job}
        error={error}
        media="image"
      />
    </div>
  );
}
