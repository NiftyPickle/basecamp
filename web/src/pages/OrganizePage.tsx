import { useCallback, useReducer, useState } from "react";
import {
  addGrant,
  applyPlan,
  chooseFolder,
  getGrants,
  getSnapshot,
  requestPlan,
  undoLast,
} from "@/lib/organize-api";
import { initialOrganizeState, organizeReducer } from "@/lib/organize-reducer";
import { OrganizeView } from "@/components/organize/OrganizeView";

const DESKTOP_SENTINEL = "__DESKTOP__";

/**
 * Stateful host for the organizer. Owns the reducer and turns user intent
 * into API calls. Desktop-only; the nav entry is hidden off-desktop.
 */
export function OrganizePage() {
  const [state, dispatch] = useReducer(organizeReducer, initialOrganizeState);
  const [intent, setIntent] = useState("");

  const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

  const snapshot = useCallback(
    async (folder: string) => {
      try {
        // The Desktop button passes a sentinel; resolve the real path from
        // the grants endpoint so we never hardcode a home dir in the renderer.
        let dir = folder;
        if (folder === DESKTOP_SENTINEL) {
          const info = await getGrants();
          dir = info.desktop;
        }
        dispatch({ type: "snapshotStart", folder: dir });
        const snap = await getSnapshot(dir);
        dispatch({ type: "snapshotOk", entries: snap.entries });
      } catch (e) {
        dispatch({ type: "error", message: message(e) });
      }
    },
    [],
  );

  const plan = useCallback(async () => {
    try {
      dispatch({ type: "planStart" });
      const p = await requestPlan(state.folder, intent);
      dispatch({ type: "planOk", plan: p });
    } catch (e) {
      dispatch({ type: "error", message: message(e) });
    }
  }, [state.folder, intent]);

  const apply = useCallback(async () => {
    if (!state.plan) return;
    try {
      dispatch({ type: "applyStart" });
      const result = await applyPlan(state.plan);
      dispatch({ type: "applyOk", result });
    } catch (e) {
      dispatch({ type: "error", message: message(e) });
    }
  }, [state.plan]);

  const undo = useCallback(async () => {
    try {
      await undoLast();
      dispatch({ type: "undoOk" });
    } catch (e) {
      dispatch({ type: "error", message: message(e) });
    }
  }, []);

  const grant = useCallback(
    async (path: string) => {
      const trimmed = path.trim();
      if (!trimmed) return;
      try {
        const res = await addGrant(trimmed);
        await snapshot(res.path);
      } catch (e) {
        dispatch({ type: "error", message: message(e) });
      }
    },
    [snapshot],
  );

  const pickFolder = useCallback(async () => {
    try {
      const res = await chooseFolder();
      // User dismissed the native dialog - nothing to do, no error.
      if (res.cancelled || !res.path) return;
      await grant(res.path);
    } catch (e) {
      dispatch({ type: "error", message: message(e) });
    }
  }, [grant]);

  return (
    <OrganizeView
      state={state}
      intent={intent}
      onSnapshot={snapshot}
      onPlan={plan}
      onApply={apply}
      onUndo={undo}
      onAddGrant={grant}
      onPickFolder={pickFolder}
      onIntentChange={setIntent}
    />
  );
}
