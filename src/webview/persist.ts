import type { PersistedState } from "../shared/protocol";

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscodeApi: VsCodeApi = acquireVsCodeApi();

/**
 * Survives tab hide/show and window reload, which is why the webview does not
 * need `retainContextWhenHidden`. Never holds document text: `setState` is
 * written to workbench storage in plaintext and outlives the session.
 */
export function readPersisted(): PersistedState | null {
  const raw = vscodeApi.getState();
  if (typeof raw !== "object" || raw === null) return null;
  const state = raw as Partial<PersistedState>;
  if (typeof state.scrollTop !== "number" || !Number.isFinite(state.scrollTop)) return null;
  return { scrollTop: state.scrollTop, selection: state.selection ?? null };
}

export function writePersisted(state: PersistedState): void {
  vscodeApi.setState(state);
}
