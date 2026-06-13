import { fetchJSON } from "@/lib/api";

export type OrganizeOp = {
  op: "move" | "mkdir" | "trash";
  src?: string | null;
  dst?: string | null;
};

export type OrganizePlan = {
  folder: string;
  summary: string;
  ops: OrganizeOp[];
};

export type OrganizeEntry = {
  name: string;
  path: string;
  kind: "file" | "dir";
  size: number;
  modified: number;
};

export type GrantsInfo = { desktop: string; grants: string[] };
export type SnapshotResult = { folder: string; entries: OrganizeEntry[] };
export type ApplyResult = {
  applied: number;
  failed: { op: string; error: string }[];
  manifest_id: string;
};
export type UndoResult = {
  reversed: number;
  manifest_id?: string;
  trash_restore_manual?: string[];
};

const JSON_POST: RequestInit = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
};

function postJSON<T>(url: string, body: unknown): Promise<T> {
  return fetchJSON<T>(url, { ...JSON_POST, body: JSON.stringify(body) });
}

export function getGrants(): Promise<GrantsInfo> {
  return fetchJSON<GrantsInfo>("/api/organize/grants");
}

export function addGrant(path: string): Promise<{ path: string }> {
  return postJSON("/api/organize/grant", { path });
}

export type ChooseFolderResult = { path?: string; cancelled?: boolean };

/** Pop the host OS native folder picker (desktop shell only). */
export function chooseFolder(): Promise<ChooseFolderResult> {
  return postJSON("/api/choose-folder", {});
}

export function revokeGrant(path: string): Promise<{ ok: boolean }> {
  return postJSON("/api/organize/revoke", { path });
}

export function getSnapshot(dir: string): Promise<SnapshotResult> {
  return fetchJSON<SnapshotResult>(`/api/organize/snapshot?dir=${encodeURIComponent(dir)}`);
}

export function requestPlan(folder: string, intent: string): Promise<OrganizePlan> {
  return postJSON("/api/organize/plan", { folder, intent });
}

export function applyPlan(plan: OrganizePlan): Promise<ApplyResult> {
  return postJSON("/api/organize/apply", { plan });
}

export function undoLast(): Promise<UndoResult> {
  return postJSON("/api/organize/undo", {});
}
