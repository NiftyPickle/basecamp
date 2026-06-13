// Loads the optional preview map produced by the Phase 4 preview builder. The
// file is a static asset (studio-previews.json) served at the backend root by
// the dashboard process. In the Electron renderer there is no same-origin
// server, so the fetch goes through the IPC bridge (window.hermesDesktop.api),
// which routes to the backend baseUrl. Absence is expected before the preview
// builder runs, so any failure degrades to an empty map.

export type Preview = { url: string; mediaType: "video" | "image" };
export type PreviewMap = Record<string, Preview>;

function isPreview(value: unknown): value is Preview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { url?: unknown; mediaType?: unknown };
  return (
    typeof candidate.url === "string" &&
    (candidate.mediaType === "video" || candidate.mediaType === "image")
  );
}

// Boundary validation: the JSON is a build artifact we don't control at
// runtime, so keep only well-shaped entries in a fresh object (also
// neutralizes prototype-key edge cases and rejects arrays).
function sanitizeMap(data: unknown): PreviewMap {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  const map: PreviewMap = {};
  for (const [key, value] of Object.entries(data)) {
    if (isPreview(value)) {
      map[key] = value;
    }
  }
  return map;
}

export async function loadPreviews(): Promise<PreviewMap> {
  try {
    const bridge = window.hermesDesktop;
    if (!bridge?.api) {
      return {};
    }
    const data = await bridge.api<unknown>({ path: "/studio-previews.json", method: "GET" });
    return sanitizeMap(data);
  } catch {
    return {};
  }
}

export function previewFor(map: PreviewMap, key: string): Preview | null {
  return map[key] ?? null;
}
