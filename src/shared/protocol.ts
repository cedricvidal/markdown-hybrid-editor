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
  livePreview: boolean;
  reflow: boolean;
  softBreaks: "mark" | "unwrap";
  renderTables: boolean;
  showFrontmatter: boolean;
}

/** host -> webview */
export type HostMessage =
  /** First load, tab re-show and window reload all arrive here. */
  | { type: "init"; text: string; config: WebviewConfig; readOnly: boolean; active: boolean }
  | { type: "config"; config: WebviewConfig }
  /** Changes made elsewhere: another split, an external tool, undo/redo. */
  | { type: "apply"; changes: WireChange[]; isUndoRedo: boolean }
  /** Authoritative text, when the fast path cannot be trusted. */
  | { type: "resync"; text: string }
  /** Cheap idle consistency probe; the webview answers only on mismatch. */
  | { type: "verify"; length: number; hash: number }
  /** Flush pending edits now — a save is waiting on them. */
  | { type: "flush"; token: number }
  /** Run an editor action the workbench cannot reach inside the webview. */
  | { type: "command"; name: EditorCommand }
  /** Put the caret on a line and scroll it into view. */
  | { type: "reveal"; line: number }
  | { type: "focus" };

export type EditorCommand = "find" | "replace" | "findNext" | "findPrevious";

/** webview -> host */
export type WebviewMessage =
  | { type: "ready"; persisted: PersistedState | null }
  /** A batch of local edits, in pre-batch document coordinates. */
  | { type: "edits"; changes: WireChange[]; token: number | null }
  /** The view can no longer be trusted to match the document. */
  | { type: "resyncRequest"; reason: string }
  | { type: "selection"; selection: WireSelection; line: number; column: number; words: number }
  /** The reveal affordance on the collapsed frontmatter strip was used. */
  | { type: "setShowFrontmatter"; show: boolean }
  | { type: "openWithTextEditor" }
  | { type: "error"; message: string };
