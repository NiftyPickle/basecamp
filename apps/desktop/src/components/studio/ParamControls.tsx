import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Input } from "@/components/ui/input";
import type { ParamSpec } from "@/lib/studio-catalog";
import type { ParamValues } from "@/lib/studio-params";

type Props = {
  specs: ParamSpec[];
  values: ParamValues;
  onChange: (next: ParamValues) => void;
};

/** Renders one native control per ParamSpec. Emits an immutable merged copy
 * of values on every change. */
export function ParamControls({ specs, values, onChange }: Props) {
  if (specs.length === 0) return null;

  function set(key: string, value: string | number) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {specs.map((spec, i) => {
        if (spec.kind === "aspect_ratio" || spec.kind === "resolution") {
          const key = spec.kind;
          return (
            <label key={i} className="flex flex-col gap-1 text-sm">
              <span className="text-text-tertiary capitalize">{key.replace("_", " ")}</span>
              <Select value={String(values[key] ?? spec.default)} onValueChange={(v) => set(key, v)}>
                {spec.options.map((o) => (
                  <SelectOption key={o} value={o}>{o}</SelectOption>
                ))}
              </Select>
            </label>
          );
        }
        if (spec.kind === "duration") {
          return (
            <label key={i} className="flex flex-col gap-1 text-sm">
              <span className="text-text-tertiary">Duration (s)</span>
              <Select
                value={String(values.duration ?? spec.default)}
                onValueChange={(v) => set("duration", Number(v))}
              >
                {spec.options.map((o) => (
                  <SelectOption key={o} value={String(o)}>{o}</SelectOption>
                ))}
              </Select>
            </label>
          );
        }
        if (spec.kind === "count") {
          return (
            <label key={i} className="flex flex-col gap-1 text-sm">
              <span className="text-text-tertiary">Images</span>
              <Input
                type="number"
                min={spec.min}
                max={spec.max}
                value={String(values.num_images ?? spec.default)}
                onChange={(e) => set("num_images", Math.max(spec.min, Math.min(spec.max, Number(e.target.value) || spec.min)))}
              />
            </label>
          );
        }
        // dimension
        return (
          <label key={i} className="flex flex-col gap-1 text-sm">
            <span className="text-text-tertiary capitalize">{spec.field}</span>
            <Input
              type="number"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={String(values[spec.field] ?? spec.default)}
              onChange={(e) => set(spec.field, Number(e.target.value) || spec.default)}
            />
          </label>
        );
      })}
    </div>
  );
}
