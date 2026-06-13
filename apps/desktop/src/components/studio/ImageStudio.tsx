import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { submitStudioJob, submitImageEdit, type StudioJob } from "@/lib/studio-api";
import { catalogModel, modelsForMode, minimalParams } from "@/lib/studio-catalog";
import { defaultParamValues, type ParamValues } from "@/lib/studio-params";
import { ParamControls } from "./ParamControls";
import { ReferenceUpload } from "./ReferenceUpload";
import { JobFooter } from "./JobFooter";
import { useStudioJob } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (model: string, prompt: string, mode: "t2i" | "i2i", job: StudioJob, requestId: string) => void;
};

export function ImageStudio({ disabled, onComplete }: Props) {
  const [reference, setReference] = useState<string | null>(null);
  const mode = reference ? "i2i" : "t2i";
  const models = useMemo(() => modelsForMode(mode), [mode]);
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [values, setValues] = useState<ParamValues>({});

  const catalog = useMemo(() => catalogModel(mode, model), [mode, model]);
  const specs = catalog?.params ?? minimalParams(mode);

  // Keep model valid and params synced when the mode (reference toggle) changes.
  useEffect(() => {
    const ids = models.map((m) => m.id);
    setModel((prev) => (ids.includes(prev) ? prev : ids[0] ?? ""));
  }, [models]);

  useEffect(() => {
    setValues(defaultParamValues(specs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mode]);

  // Snapshot submit-time state so onComplete reports the values the job was
  // actually submitted with, not whatever the inputs hold at completion time.
  const submitMeta = useRef<{ model: string; prompt: string; mode: "t2i" | "i2i" } | null>(null);

  const { job, requestId, busy, error, run, setError } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.model, meta.prompt, meta.mode, j, id);
  });

  function onGenerate() {
    if (!model || !prompt.trim() || busy) return;
    submitMeta.current = { model, prompt: prompt.trim(), mode };
    void run(() =>
      reference
        ? submitImageEdit(model, prompt.trim(), reference, values)
        : submitStudioJob("image", model, prompt.trim(), values),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ReferenceUpload value={reference} onChange={setReference} onError={setError} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Model {reference ? "(image edit)" : "(text to image)"}</span>
        <Select value={model} onValueChange={setModel}>
          {models.map((m) => (
            <SelectOption key={m.id} value={m.id}>{m.name}</SelectOption>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-tertiary">Prompt</span>
          {catalog?.example_prompt && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setPrompt(catalog.example_prompt!)}
            >
              Use example
            </button>
          )}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Describe the image to generate..."
          className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
        />
      </label>

      <ParamControls specs={specs} values={values} onChange={setValues} />

      <JobFooter
        button={
          <Button onClick={onGenerate} disabled={disabled || busy || !model || !prompt.trim()}>
            {busy ? "Generating..." : "Generate"}
          </Button>
        }
        requestId={requestId}
        job={job}
        error={error}
        media="image"
      />
    </div>
  );
}
