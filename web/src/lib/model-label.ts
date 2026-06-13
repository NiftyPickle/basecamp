/** Derive a human-friendly display label from an OpenRouter model slug.
 * The backend (hermes_cli/council/ws.py friendly_label) is the source of
 * truth for council labels; this is the frontend-side derivation used by
 * the model picker and as a fallback for deliberation blobs. */
export function friendlyModelLabel(model: string): string {
  return model.split("/").pop()?.replace(":free", "") ?? model;
}
