import { useMemo, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { submitStudioJob, type StudioJob } from "@/lib/studio-api";
import { modelsForMode } from "@/lib/studio-catalog";
import {
  CINEMA_CAMERAS,
  CINEMA_LENSES,
  CINEMA_FOCALS,
  CINEMA_APERTURES,
  CINEMA_RESOLUTIONS,
  CINEMA_ASPECTS,
  CINEMA_DEFAULTS,
  buildCinemaPromptSuffix,
  cinemaAssetUrl,
  type CinemaSettings,
} from "@/lib/cinema-prompt";
import { JobFooter } from "./JobFooter";
import { useStudioJob } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (model: string, prompt: string, job: StudioJob, requestId: string) => void;
};

function TilePicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-text-tertiary">{label} ({value})</span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((opt) => {
          const tile = cinemaAssetUrl(opt);
          const selected = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={
                "flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg border p-1 " +
                (selected ? "border-primary bg-primary/10" : "border-border bg-muted")
              }
            >
              {tile && (
                <img src={tile} alt={opt} className="h-14 w-full rounded-md object-cover" />
              )}
              <span className={"text-center text-[10px] leading-tight " + (selected ? "text-primary" : "text-text-secondary")}>
                {opt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChipPicker<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-text-tertiary">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange(opt)}
            className={
              "rounded-md border px-2 py-1 text-xs " +
              (opt === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-secondary text-text-secondary hover:text-text-primary")
            }
          >
            {format ? format(opt) : String(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CinemaStudio({ disabled, onComplete }: Props) {
  const models = useMemo(() => modelsForMode("t2i"), []);
  const [model, setModel] = useState(models[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<CinemaSettings>(CINEMA_DEFAULTS);

  function set<K extends keyof CinemaSettings>(key: K, value: CinemaSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  const submitMeta = useRef<{ model: string; prompt: string } | null>(null);

  const { job, requestId, busy, error, run } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.model, meta.prompt, j, id);
  });

  function onGenerate() {
    if (!model || !prompt.trim() || busy) return;
    const fullPrompt = `${prompt.trim()}. ${buildCinemaPromptSuffix(settings)}`;
    submitMeta.current = { model, prompt: fullPrompt };
    void run(() =>
      submitStudioJob("image", model, fullPrompt, { aspect_ratio: settings.aspect }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Model (text to image)</span>
        <Select value={model} onValueChange={setModel}>
          {models.map((m) => (
            <SelectOption key={m.id} value={m.id}>{m.name}</SelectOption>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Prompt</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Describe the shot..."
          className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
        />
      </label>

      <TilePicker label="Camera" options={CINEMA_CAMERAS} value={settings.camera} onChange={(v) => set("camera", v)} />
      <TilePicker label="Lens" options={CINEMA_LENSES} value={settings.lens} onChange={(v) => set("lens", v)} />
      <TilePicker label="Aperture" options={CINEMA_APERTURES} value={settings.aperture} onChange={(v) => set("aperture", v)} />
      <ChipPicker label="Focal length" options={CINEMA_FOCALS} value={settings.focal} onChange={(v) => set("focal", v)} format={(v) => `${v}mm`} />
      <ChipPicker label="Resolution" options={CINEMA_RESOLUTIONS} value={settings.resolution} onChange={(v) => set("resolution", v)} />
      <ChipPicker label="Aspect" options={CINEMA_ASPECTS} value={settings.aspect} onChange={(v) => set("aspect", v)} />

      <div className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-text-tertiary">
        Suffix: {buildCinemaPromptSuffix(settings)}
      </div>

      <JobFooter
        button={
          <Button onClick={onGenerate} disabled={disabled || busy || !model || !prompt.trim()}>
            {busy ? "Generating..." : "Generate cinematic image"}
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
