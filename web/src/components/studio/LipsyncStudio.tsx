import { useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { submitLipsync, getLipsyncJob, type StudioJob } from "@/lib/studio-api";
import {
  LIPSYNC_MODELS,
  LIPSYNC_RESOLUTIONS,
  LIPSYNC_DEFAULT_RESOLUTION,
  DEFAULT_LIPSYNC_MODEL,
} from "@/lib/studio-lipsync";
import { ReferenceUpload } from "./ReferenceUpload";
import { JobFooter } from "./JobFooter";
import { useStudioJob } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (model: string, prompt: string, job: StudioJob, requestId: string) => void;
};

export function LipsyncStudio({ disabled, onComplete }: Props) {
  const [slug, setSlug] = useState(DEFAULT_LIPSYNC_MODEL.slug);
  const [audio, setAudio] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<string>(LIPSYNC_DEFAULT_RESOLUTION);

  const model = LIPSYNC_MODELS.find((m) => m.slug === slug) ?? DEFAULT_LIPSYNC_MODEL;
  const isVideoModel = model.kind === "video";

  const submitMeta = useRef<{ model: string; prompt: string } | null>(null);

  const { job, requestId, busy, error, run, setError } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.model, meta.prompt, j, id);
  }, getLipsyncJob);

  const canRun = !!audio && (isVideoModel ? !!video : true) && !busy;

  function onRun() {
    if (!canRun || !audio) return;
    submitMeta.current = { model: model.label, prompt: prompt.trim() };
    void run(() =>
      submitLipsync(
        isVideoModel
          ? { model: slug, audio_url: audio, video_url: video! }
          : {
              model: slug,
              audio_url: audio,
              ...(image ? { image_url: image } : {}),
              ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
              resolution,
            },
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-tertiary">Model</span>
        <Select value={slug} onValueChange={setSlug}>
          {LIPSYNC_MODELS.map((m) => (
            <SelectOption key={m.slug} value={m.slug}>{m.label}</SelectOption>
          ))}
        </Select>
      </label>

      <ReferenceUpload
        value={audio}
        onChange={setAudio}
        onError={setError}
        accept="audio/*"
        label="Audio (voice track)"
        mediaKind="audio"
      />

      {isVideoModel ? (
        <ReferenceUpload
          value={video}
          onChange={setVideo}
          onError={setError}
          accept="video/*"
          label="Video to redub"
          mediaKind="video"
        />
      ) : (
        <>
          <ReferenceUpload
            value={image}
            onChange={setImage}
            onError={setError}
            accept="image/*"
            label="Face image (optional)"
            mediaKind="image"
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-tertiary">Prompt (optional)</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Describe the speaker and scene..."
              className="resize-none rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-tertiary">Resolution</span>
            <Select value={resolution} onValueChange={setResolution}>
              {LIPSYNC_RESOLUTIONS.map((r) => (
                <SelectOption key={r} value={r}>{r}</SelectOption>
              ))}
            </Select>
          </label>
        </>
      )}

      <JobFooter
        button={
          <Button onClick={onRun} disabled={disabled || !canRun}>
            {busy ? "Syncing..." : "Generate lip sync"}
          </Button>
        }
        hint={
          !audio ? (
            <span className="text-xs text-text-tertiary">Upload an audio track first.</span>
          ) : isVideoModel && !video ? (
            <span className="text-xs text-text-tertiary">This model also needs a video.</span>
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
