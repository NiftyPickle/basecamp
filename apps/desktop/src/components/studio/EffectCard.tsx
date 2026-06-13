import { useRef } from "react";
import type { EffectEntry } from "@/lib/studio-effects";
import type { Preview } from "@/lib/studio-previews";
import { cn } from "@/lib/utils";

type Props = {
  effect: EffectEntry;
  preview: Preview | null;
  selected: boolean;
  onSelect: () => void;
};

export function EffectCard({ effect, preview, selected, onSelect }: Props) {
  // Video previews stay paused until hover/focus; no autoplay so a full grid
  // never runs a dozen simultaneous loops. Ref is null for img/chip branches.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const play = () => void videoRef.current?.play().catch(() => {});
  const pause = () => videoRef.current?.pause();

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={play}
      onMouseLeave={pause}
      onFocus={play}
      onBlur={pause}
      aria-pressed={selected}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border text-left transition-colors",
        selected ? "border-primary bg-secondary" : "border-border bg-muted hover:bg-secondary",
      )}
    >
      <div className="flex aspect-square items-center justify-center bg-secondary">
        {preview ? (
          preview.mediaType === "video" ? (
            <video
              ref={videoRef}
              src={preview.url}
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            <img src={preview.url} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="px-2 text-center text-xs text-text-tertiary">{effect.name}</span>
        )}
      </div>
      <span className="truncate px-2 py-1.5 text-xs text-text-secondary">{effect.name}</span>
    </button>
  );
}
