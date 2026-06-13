// Workflow template browsing helpers. The upstream api-inputs schema is not
// formally documented, so normalizeWorkflowInputs is deliberately defensive:
// it accepts the shapes we expect and degrades every unknown field type to a
// plain text input rather than failing.

export type WorkflowTemplate = {
  id: string;
  name: string;
  thumbnail: string | null;
  category: string;
};

export type WorkflowGroup = { category: string; templates: WorkflowTemplate[] };

export function groupTemplates(templates: WorkflowTemplate[]): WorkflowGroup[] {
  const groups: WorkflowGroup[] = [];
  const byCategory = new Map<string, WorkflowGroup>();
  for (const t of templates) {
    let group = byCategory.get(t.category);
    if (!group) {
      group = { category: t.category, templates: [] };
      byCategory.set(t.category, group);
      groups.push(group);
    }
    group.templates.push(t);
  }
  return groups;
}

export type WorkflowFieldType = "text" | "url" | "number" | "select";

export type WorkflowField = {
  key: string;
  label: string;
  type: WorkflowFieldType;
  required: boolean;
  options: string[];
  defaultValue: string;
};

const URL_TYPES = new Set(["image", "video", "audio", "url", "file", "image_url", "video_url"]);

function fieldType(rawType: string, key: string): WorkflowFieldType {
  const t = rawType.toLowerCase();
  if (URL_TYPES.has(t)) return "url";
  if (t === "number" || t === "integer" || t === "int" || t === "float") return "number";
  if (t === "select" || t === "enum") return "select";
  if (t === "string" || t === "text" || t === "prompt") {
    return /(_|^)(url|image|video|audio|file)(_url)?$/i.test(key) ? "url" : "text";
  }
  // No/unknown type: infer url-ish from the key, else plain text.
  return /(_|^)(url|image|video|audio|file)(_url)?$/i.test(key) || /_url$/i.test(key)
    ? "url"
    : "text";
}

function toField(key: string, spec: Record<string, unknown>): WorkflowField {
  const rawType = typeof spec.type === "string" ? spec.type : "";
  const options = Array.isArray(spec.options)
    ? spec.options.filter((o): o is string => typeof o === "string")
    : [];
  const rawDefault = spec.default ?? spec.defaultValue ?? "";
  return {
    key,
    label: typeof spec.label === "string" && spec.label ? spec.label : key,
    type: options.length > 0 ? "select" : fieldType(rawType, key),
    required: spec.required === true,
    options,
    defaultValue:
      typeof rawDefault === "string" || typeof rawDefault === "number"
        ? String(rawDefault)
        : "",
  };
}

export function normalizeWorkflowInputs(data: unknown): WorkflowField[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  // Shape A: {inputs: [{name, type, ...}, ...]} (also accept fields/params keys)
  for (const listKey of ["inputs", "fields", "params"]) {
    const list = obj[listKey];
    if (Array.isArray(list)) {
      return list
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => {
          const key = typeof e.name === "string" ? e.name : typeof e.key === "string" ? e.key : "";
          return key ? toField(key, e) : null;
        })
        .filter((f): f is WorkflowField => f !== null);
    }
    if (listKey in obj && !Array.isArray(list)) {
      if (list !== undefined && (typeof list !== "object" || list === null)) return [];
    }
  }
  // Shape B: dict of key -> spec object
  const entries = Object.entries(obj).filter(
    ([, v]) => !!v && typeof v === "object" && !Array.isArray(v),
  );
  if (entries.length === 0) return [];
  return entries.map(([key, spec]) => toField(key, spec as Record<string, unknown>));
}
