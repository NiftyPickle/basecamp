import type { OrganizeState } from "@/lib/organize-reducer";

type Props = {
  state: OrganizeState;
  intent: string;
  onSnapshot: (folder: string) => void;
  onPlan: () => void;
  onApply: () => void;
  onUndo: () => void;
  onAddGrant: (path: string) => void;
  onPickFolder: () => void;
  onIntentChange: (value: string) => void;
};

function opLine(op: { op: string; src?: string | null; dst?: string | null }): string {
  if (op.op === "move") return `move  ${op.src}  ->  ${op.dst}`;
  if (op.op === "mkdir") return `mkdir ${op.dst}`;
  return `trash ${op.src}`;
}

/**
 * Presentational organizer surface. All side effects are lifted to the page
 * via callbacks so this stays pure and testable. Desktop-only feature.
 */
export function OrganizeView(props: Props) {
  const { state, intent } = props;
  const busy =
    state.phase === "snapshotting" || state.phase === "planning" || state.phase === "applying";
  const hasPlan = state.plan != null && state.plan.ops.length > 0;

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Organize</h1>

      <p className="text-sm text-text-tertiary">
        Pick any folder for Basecamp to tidy, or start from your Desktop.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded bg-midground px-3 py-1 text-sm text-white"
          disabled={busy}
          onClick={props.onPickFolder}
          type="button"
        >
          Choose folder...
        </button>
        <button
          className="rounded border px-3 py-1 text-sm"
          disabled={busy}
          onClick={() => props.onSnapshot("__DESKTOP__")}
          type="button"
        >
          Desktop
        </button>
        <input
          aria-label="Folder path to add"
          className="rounded border px-2 py-1 text-sm"
          placeholder="or paste an absolute path"
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onAddGrant((e.target as HTMLInputElement).value);
          }}
        />
      </div>

      <textarea
        aria-label="What to organize"
        className="min-h-20 rounded border p-2 text-sm"
        placeholder="e.g. group screenshots into a Screenshots folder"
        value={intent}
        onChange={(e) => props.onIntentChange(e.target.value)}
      />

      <div className="flex gap-2">
        <button
          className="rounded bg-midground px-3 py-1 text-sm text-white"
          disabled={busy || !intent.trim() || !state.folder}
          onClick={props.onPlan}
          type="button"
        >
          Preview plan
        </button>
        <button
          className="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-40"
          disabled={busy || !hasPlan}
          onClick={props.onApply}
          type="button"
        >
          Approve &amp; run
        </button>
        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          disabled={busy || !state.hasManifest}
          onClick={props.onUndo}
          type="button"
        >
          Undo last organize
        </button>
      </div>

      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

      {hasPlan ? (
        <div className="rounded border p-3">
          <p className="mb-2 text-sm text-text-tertiary">{state.plan!.summary}</p>
          <ul className="font-mono-ui text-xs">
            {state.plan!.ops.map((op, i) => (
              <li key={i}>{opLine(op)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.phase === "done" && state.result ? (
        <p className="text-sm text-emerald-700">
          Done: {state.result.applied} applied
          {state.result.failed.length ? `, ${state.result.failed.length} failed` : ""}.
        </p>
      ) : null}
    </div>
  );
}
