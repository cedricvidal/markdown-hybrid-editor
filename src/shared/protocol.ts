/**
 * The webview <-> host wire. Types only: this module is imported by both bundles
 * and must never contribute runtime code.
 *
 * Positions are line/character, never absolute offsets. CodeMirror's `Text`
 * normalises every line break to a single character, so on a CRLF document an
 * absolute offset differs between the two sides by one per preceding line —
 * a discrepancy that shows up as silent corruption deep in the file.
 */

/** Zero-based, on both sides. Maps 1:1 onto `vscode.Position`. */
export interface WirePos {
  line: number;
  character: number;
}

/** A replacement of `[start, end)` with `text`, in pre-change coordinates. */
export interface WireChange {
  start: WirePos;
  end: WirePos;
  text: string;
}

export interface WireSelection {
  anchor: WirePos;
  head: WirePos;
}

/** State the webview parks in `setState`. Never contains document text. */
export interface PersistedState {
  scrollTop: number;
  selection: WireSelection | null;
}

export type Typography = "reading" | "vscode";

export interface WebviewConfig {
  /** CSP nonce for the stylesheets CodeMirror mounts at runtime. */
  nonce: string;
  typography: Typography;
  /**
   * User overrides only. `null` means "not set", and the stylesheet supplies the
   * default for the current typography mode — an inline custom property would
   * otherwise outrank the mode's own rule and pin it for both modes.
   */
  fontFamily: string | null;
  fontSize: number | null;
  lineHeight: number | null;
  /** A CSS length, or "none" for full width. */
  readingMeasure: string | null;
}

/** host -> webview */
export type HostMessage =
  | { type: "init"; text: string; config: WebviewConfig }
  | { type: "config"; config: WebviewConfig }
  | { type: "focus" };

/** webview -> host */
export type WebviewMessage =
  | { type: "ready"; persisted: PersistedState | null }
  | { type: "error"; message: string };

export const WEBVIEW_MESSAGE_TYPES = ["ready", "error"] as const;
