import { outputUrl } from "@/lib/studio-api";

type Props = {
  outputs: unknown[];
  /** "video" renders <video>, anything else renders <img>. */
  media: "image" | "video";
};

export function OutputGrid({ outputs, media }: Props) {
  const urls = outputs.map(outputUrl).filter((u): u is string => Boolean(u));
  if (urls.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {urls.map((url, i) =>
        media === "video" ? (
          <div
            key={`${i}-${url}`}
            className="overflow-hidden rounded-lg border border-border bg-muted"
          >
            <video src={url} controls className="w-full aspect-video object-cover" />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-primary hover:underline"
            >
              Open
            </a>
          </div>
        ) : (
          <a
            key={`${i}-${url}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="overflow-hidden rounded-lg border border-border bg-muted"
          >
            <img src={url} alt={`output ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        ),
      )}
    </div>
  );
}
