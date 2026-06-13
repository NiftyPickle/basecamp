import { friendlyModelLabel } from "@/lib/model-label";

export const DOWNLOAD_SENTINEL = "__download__";
export const ADD_KEY_SENTINEL = "__add_key__";

export type LocalPickerEntry = {
  id: string;
  label: string;
};

export type ModelPickerProps = {
  /** OpenRouter free slugs from /api/openrouter/info. */
  cloudModels: string[];
  keyPresent: boolean;
  /** Installed local models from /api/local/models. */
  localModels: LocalPickerEntry[];
  /** False when the platform has no llama-server build - hides the group. */
  localAvailable: boolean;
  selected: string | null;
  /** Disabled while council mode is on - council members are backend-owned. */
  disabled: boolean;
  onChange: (value: string) => void;
};

export function ModelPicker(props: ModelPickerProps) {
  const hasAnyOption = props.cloudModels.length > 0 || props.localAvailable;
  if (!hasAnyOption) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-[#9b95bd]">
      Model
      <select
        data-testid="model-picker"
        value={props.selected ?? ""}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className="max-w-[16rem] rounded-lg bg-black/25 px-2 py-1 text-xs text-[#e7e3f4] outline-none disabled:opacity-50"
      >
        {props.selected === null && (
          <option value="" disabled>
            Choose a model
          </option>
        )}
        {props.cloudModels.length > 0 && (
          <optgroup label="Free via OpenRouter">
            {props.cloudModels.map((m) => (
              <option key={m} value={m} disabled={!props.keyPresent}>
                {friendlyModelLabel(m)}
              </option>
            ))}
            {!props.keyPresent && (
              <option value={ADD_KEY_SENTINEL}>Add OpenRouter key...</option>
            )}
          </optgroup>
        )}
        {props.localAvailable && (
          <optgroup label="Local">
            {props.localModels.map((m) => (
              <option key={m.id} value={`local/${m.id}`}>
                {m.label}
              </option>
            ))}
            <option value={DOWNLOAD_SENTINEL}>Download a model...</option>
          </optgroup>
        )}
      </select>
    </label>
  );
}
