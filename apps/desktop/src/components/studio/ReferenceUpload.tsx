import { useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { uploadReference } from "@/lib/studio-api";

type Props = {
  /** Hosted URL of the current reference, or null. */
  value: string | null;
  onChange: (url: string | null) => void;
  /** Surfaced to the parent for error display. */
  onError?: (message: string) => void;
  accept?: string;
  label?: string;
  /** What the uploaded reference is; controls thumbnail rendering. */
  mediaKind?: "image" | "video" | "audio";
};

export function ReferenceUpload({
  value,
  onChange,
  onError,
  accept = "image/*",
  label = "Reference image",
  mediaKind = "image",
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    // Drag-and-drop bypasses the picker's accept filter; reject mismatched kinds.
    if (!file.type.startsWith(`${mediaKind}/`)) {
      onError?.(`Only ${mediaKind} files are accepted here.`);
      return;
    }
    setBusy(true);
    try {
      const { url } = await uploadReference(file);
      onChange(url);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-tertiary">{label}</span>
      <div
        className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
      >
        {value ? (
          mediaKind === "video" ? (
            <video src={value} preload="metadata" muted className="h-16 w-16 rounded-md object-cover" />
          ) : mediaKind === "audio" ? (
            <audio src={value} controls preload="metadata" className="h-10 w-48" />
          ) : (
            <img src={value} alt="reference" className="h-16 w-16 rounded-md object-cover" />
          )
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md bg-secondary text-text-tertiary">
            {busy ? <Spinner /> : "-"}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Button
            outlined
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading..." : value ? "Replace" : "Upload or drop"}
          </Button>
          {value && (
            <button
              type="button"
              className="text-left text-xs text-text-tertiary hover:text-text-secondary"
              onClick={() => onChange(null)}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
