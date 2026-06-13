import type { ApplyResult, OrganizeEntry, OrganizePlan } from "@/lib/organize-api";

export type OrganizePhase =
  | "idle"
  | "snapshotting"
  | "planning"
  | "preview"
  | "applying"
  | "done"
  | "error";

export type OrganizeState = {
  phase: OrganizePhase;
  folder: string;
  entries: OrganizeEntry[];
  plan: OrganizePlan | null;
  result: ApplyResult | null;
  hasManifest: boolean;
  error: string | null;
};

export const initialOrganizeState: OrganizeState = {
  phase: "idle",
  folder: "",
  entries: [],
  plan: null,
  result: null,
  hasManifest: false,
  error: null,
};

export type OrganizeAction =
  | { type: "snapshotStart"; folder: string }
  | { type: "snapshotOk"; entries: OrganizeEntry[] }
  | { type: "planStart" }
  | { type: "planOk"; plan: OrganizePlan }
  | { type: "applyStart" }
  | { type: "applyOk"; result: ApplyResult }
  | { type: "undoOk" }
  | { type: "error"; message: string }
  | { type: "reset" };

export function organizeReducer(state: OrganizeState, action: OrganizeAction): OrganizeState {
  switch (action.type) {
    case "snapshotStart":
      return { ...state, phase: "snapshotting", folder: action.folder, error: null };
    case "snapshotOk":
      return { ...state, phase: "idle", entries: action.entries };
    case "planStart":
      return { ...state, phase: "planning", error: null };
    case "planOk":
      return { ...state, phase: "preview", plan: action.plan };
    case "applyStart":
      return { ...state, phase: "applying", error: null };
    case "applyOk":
      return { ...state, phase: "done", result: action.result, hasManifest: true };
    case "undoOk":
      return { ...state, hasManifest: false };
    case "error":
      return { ...state, phase: "error", error: action.message };
    case "reset":
      return { ...initialOrganizeState, hasManifest: state.hasManifest };
    default:
      return state;
  }
}
