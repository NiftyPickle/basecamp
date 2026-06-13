import type { LocalModelEntry, LocalModelsInfo } from "@/lib/api";

const GIB = 2 ** 30;
const DISK_HEADROOM = 1.1;

function gb(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GB`;
}

export type DownloadPanelProps = {
  info: LocalModelsInfo;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

function Row(props: {
  model: LocalModelEntry;
  freeDiskGb: number;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const m = props.model;
  const requiredGb = (m.size_bytes * DISK_HEADROOM) / GIB;
  const diskShort = requiredGb > props.freeDiskGb;
  const busy = m.state === "downloading" || m.state === "verifying";
  const canDownload = (m.state === "absent" || m.state === "error") && !diskShort;
  return (
    <div
      data-testid="download-row"
      className="flex flex-col gap-1 rounded-xl bg-black/20 p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#e7e3f4]">{m.label}</span>
        {m.recommended && (
          <span
            data-testid="recommended-badge"
            className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300"
          >
            Recommended for your machine
          </span>
        )}
        <span className="ml-auto text-xs text-[#9b95bd]">
          {gb(m.size_bytes)} - needs {m.min_ram_gb} GB RAM
        </span>
      </div>
      <p className="text-xs text-[#9b95bd]">{m.description}</p>
      {busy && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/30">
          <div
            data-testid="download-progress"
            data-progress={String(m.progress)}
            className="h-full rounded-full bg-emerald-400/70"
            style={{ width: `${Math.round(m.progress * 100)}%` }}
          />
        </div>
      )}
      {m.state === "verifying" && (
        <p className="text-xs text-[#9b95bd]">Verifying checksum...</p>
      )}
      {m.state === "error" && m.error && (
        <p className="text-xs text-rose-300">{m.error}</p>
      )}
      {diskShort && !busy && m.state !== "installed" && (
        <p className="text-xs text-rose-300">
          Not enough free disk ({gb(m.size_bytes)} needed plus headroom,{" "}
          {props.freeDiskGb.toFixed(1)} GB free)
        </p>
      )}
      <div className="flex items-center gap-2">
        {m.state === "installed" ? (
          <button
            type="button"
            data-testid="delete-button"
            onClick={() => props.onDelete(m.id)}
            className="rounded-lg bg-rose-500/15 px-3 py-1 text-xs text-rose-300"
          >
            Delete
          </button>
        ) : (
          <button
            type="button"
            data-testid="download-button"
            disabled={!canDownload}
            onClick={() => props.onDownload(m.id)}
            className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300 disabled:opacity-40"
          >
            {m.state === "error" ? "Retry download" : busy ? "Downloading..." : "Download"}
          </button>
        )}
      </div>
    </div>
  );
}

export function DownloadPanel(props: DownloadPanelProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-black/20 p-4">
      <div className="flex items-center">
        <h3 className="text-sm font-medium text-[#e7e3f4]">
          Download a local model
        </h3>
        <span className="ml-2 text-xs text-[#9b95bd]">
          {props.info.detected_ram_gb.toFixed(0)} GB RAM detected,{" "}
          {props.info.free_disk_gb.toFixed(1)} GB disk free
        </span>
        <button
          type="button"
          data-testid="download-panel-close"
          onClick={props.onClose}
          className="ml-auto rounded-lg bg-black/25 px-2 py-1 text-xs text-[#9b95bd]"
        >
          Close
        </button>
      </div>
      {props.info.models.map((m) => (
        <Row
          key={m.id}
          model={m}
          freeDiskGb={props.info.free_disk_gb}
          onDownload={props.onDownload}
          onDelete={props.onDelete}
        />
      ))}
    </div>
  );
}
