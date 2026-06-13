// Loads the optional preview map produced by the Phase 4 preview builder. The
// file is a static public asset (web/public/studio-previews.json). Absence is
// expected before Phase 4 runs, so a failed fetch degrades to an empty map.
// The fetch uses plain fetch (not fetchJSON) because the file is a public
// asset, not an API route, but it still needs the base-path prefix when the
// dashboard is served under a reverse-proxy URL prefix.

import { HERMES_BASE_PATH } from "./api";

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
    const res = await fetch(`${HERMES_BASE_PATH}/studio-previews.json`);
    if (!res.ok) {
      return {};
    }
    return sanitizeMap(await res.json());
  } catch {
    return {};
  }
}

export function previewFor(map: PreviewMap, key: string): Preview | null {
  return map[key] ?? null;
}
