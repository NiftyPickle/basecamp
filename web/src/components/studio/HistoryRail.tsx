import type { HistoryEntry } from "@/lib/studio-history";

type Props = {
  entries: HistoryEntry[];
  onClear: () => void;
};

export function HistoryRail({ entries, onClear }: Props) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-l border-border pl-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-secondary">History</h2>
        {entries.length > 0 && (
          <button
            type="button"
            className="text-xs text-text-tertiary hover:text-text-secondary"
            onClick={onClear}
          >
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-text-tertiary">No generations yet.</p>
      ) : (
        // Hard height cap: the route outlet gives ancestors no height, so an
        // unconstrained list would grow the page past the clipped viewport.
        // Offset matches the sibling pages' self-managed scroll (ConfigPage).
        <ul className="flex max-h-[calc(100vh-260px)] flex-col gap-2 overflow-y-auto">
          {entries.map((e) => {
            const thumb = e.outputs[0];
            return (
              <li key={e.id} className="flex gap-2 rounded-lg bg-muted p-2">
                {thumb &&
                  (e.media === "video" ? (
                    <video
                      src={thumb}
                      className="h-12 w-12 rounded object-cover"
                      muted
                      preload="metadata"
                      playsInline
                    />
                  ) : (
                    <img src={thumb} alt="" className="h-12 w-12 rounded object-cover" />
                  ))}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-text-secondary">{e.prompt || e.model}</p>
                  <p className="text-[10px] text-text-tertiary">{e.model}</p>
                  {thumb && (
                    <a
                      href={thumb}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary hover:underline"
                      aria-label={`Open ${e.prompt || e.model}`}
                    >
                      Open
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
