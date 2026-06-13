import { useEffect, useRef, useState } from "react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import {
  listWorkflowTemplates,
  getWorkflowInputs,
  executeWorkflow,
  getWorkflowRun,
  uploadReference,
  type StudioJob,
  type WorkflowTemplate,
} from "@/lib/studio-api";
import {
  groupTemplates,
  normalizeWorkflowInputs,
  type WorkflowField,
} from "@/lib/studio-workflows";
import { JobFooter } from "./JobFooter";
import { useStudioJob, errText } from "./useStudioJob";

type Props = {
  disabled: boolean;
  onComplete: (workflow: string, job: StudioJob, requestId: string) => void;
};

function UrlField({
  value,
  onChange,
  onError,
}: {
  field: WorkflowField;
  value: string;
  onChange: (v: string) => void;
  onError: (m: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { url } = await uploadReference(file);
      onChange(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://... or upload"
        className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
      />
      <Button outlined size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "Uploading..." : "Upload"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function WorkflowsStudio({ disabled, onComplete }: Props) {
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<WorkflowTemplate | null>(null);
  const [fields, setFields] = useState<WorkflowField[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    listWorkflowTemplates()
      .then(setTemplates)
      .catch((e) => setLoadError(errText(e)));
  }, []);

  const submitMeta = useRef<{ workflow: string } | null>(null);

  const { job, requestId, busy, error, run, setError } = useStudioJob((j, id) => {
    const meta = submitMeta.current;
    if (meta) onComplete(meta.workflow, j, id);
  }, getWorkflowRun);

  async function openTemplate(t: WorkflowTemplate) {
    setSelected(t);
    setFields(null);
    setError(null);
    try {
      const raw = await getWorkflowInputs(t.id);
      const normalized = normalizeWorkflowInputs(raw);
      setFields(normalized);
      setValues(Object.fromEntries(normalized.map((f) => [f.key, f.defaultValue])));
    } catch (e) {
      setFields([]);
      setError(errText(e));
    }
  }

  function onRun() {
    if (!selected || !fields || busy) return;
    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(`Missing required: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    const inputs: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key]?.trim();
      if (!v) continue;
      inputs[f.key] = f.type === "number" && !Number.isNaN(Number(v)) ? Number(v) : v;
    }
    submitMeta.current = { workflow: selected.name };
    void run(() => executeWorkflow(selected.id, inputs));
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Failed to load workflow templates: {loadError}
      </div>
    );
  }

  if (templates === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-tertiary">
        <Spinner /> Loading workflow templates...
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        {groupTemplates(templates).map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-secondary">{group.category}</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {group.templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void openTemplate(t)}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-left hover:border-primary"
                >
                  {t.thumbnail ? (
                    <img src={t.thumbnail} alt={t.name} loading="lazy" className="aspect-video w-full rounded-md object-cover" />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-md bg-secondary text-text-tertiary">-</div>
                  )}
                  <span className="text-xs text-text-primary">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <span className="text-sm text-text-tertiary">No workflow templates available.</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button outlined size="sm" onClick={() => setSelected(null)}>
          Back to templates
        </Button>
        <span className="text-sm text-text-primary">{selected.name}</span>
        <span className="text-xs text-text-tertiary">{selected.category}</span>
      </div>

      {fields === null ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Spinner /> Loading inputs...
        </div>
      ) : fields.length === 0 ? (
        <span className="text-sm text-text-tertiary">
          This workflow declares no inputs. Run it as-is.
        </span>
      ) : (
        fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="text-text-tertiary">
              {f.label}
              {f.required && <span className="text-destructive"> *</span>}
            </span>
            {f.type === "select" ? (
              <Select
                value={values[f.key] ?? ""}
                onValueChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
              >
                {f.options.map((o) => (
                  <SelectOption key={o} value={o}>{o}</SelectOption>
                ))}
              </Select>
            ) : f.type === "url" ? (
              <UrlField
                field={f}
                value={values[f.key] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                onError={setError}
              />
            ) : (
              <input
                type={f.type === "number" ? "number" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
              />
            )}
          </label>
        ))
      )}

      <JobFooter
        button={
          <Button onClick={onRun} disabled={disabled || busy || fields === null}>
            {busy ? "Running..." : "Run workflow"}
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
