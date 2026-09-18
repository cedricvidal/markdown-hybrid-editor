import { Annotation, ChangeSet, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { WireChange, WirePos } from "../shared/protocol";
import { hash32 } from "../shared/hash";
import { vscodeApi } from "./persist";

/** Marks a transaction as replaying a change the host already knows about. */
export const fromHost = Annotation.define<boolean>();

/** Trailing debounce. Also the undo granularity knob: one batch, one undo step. */
const FLUSH_MS = 120;
/** A long typing burst must still reach the document, or the dirty dot lags. */
const MAX_BATCH_MS = 400;

function posAt(doc: Text, offset: number): WirePos {
  const line = doc.lineAt(Math.max(0, Math.min(offset, doc.length)));
  return { line: line.number - 1, character: offset - line.from };
}

export class EditBridge {
  private pending: ChangeSet | null = null;
  /** The document the pending batch is anchored to, for offset -> line/char. */
  private anchor: Text | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstChangeAt = 0;
  private flushToken: number | null = null;

  constructor(private readonly getView: () => EditorView | null) {}

  /** Attach to a view; call from an update listener. */
  readonly listener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    // Replays of host changes must not be sent straight back.
    if (update.transactions.length > 0 && update.transactions.every((tr) => tr.annotation(fromHost))) return;

    if (this.pending === null) {
      this.pending = update.changes;
      this.anchor = update.startState.doc;
      this.firstChangeAt = Date.now();
    } else {
      // compose() keeps the batch anchored to `this.anchor`, which is exactly the
      // coordinate space a WorkspaceEdit's TextEdits are interpreted in. No
      // manual offset shifting anywhere.
      this.pending = this.pending.compose(update.changes);
    }
    this.schedule();
  });

  private schedule(): void {
    const view = this.getView();
    // Splitting an IME composition across two WorkspaceEdits kills the candidate
    // window, so hold until the composition ends.
    if (view?.composing) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.schedule(), FLUSH_MS);
      return;
    }
    if (Date.now() - this.firstChangeAt >= MAX_BATCH_MS) {
      this.flush();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  /** Send whatever is buffered. Safe to call when nothing is. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;

    const token = this.flushToken;
    this.flushToken = null;

    const pending = this.pending;
    const anchor = this.anchor;
    this.pending = null;
    this.anchor = null;

    if (!pending || !anchor) {
      // Still answer a flush request, so a save is not left waiting.
      if (token !== null) vscodeApi.postMessage({ type: "edits", changes: [], token });
      return;
    }

    const changes: WireChange[] = [];
    pending.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({ start: posAt(anchor, fromA), end: posAt(anchor, toA), text: inserted.toString() });
    });
    vscodeApi.postMessage({ type: "edits", changes, token });
  }

  /** The host is waiting on us before a save. */
  flushFor(token: number): void {
    this.flushToken = token;
    this.flush();
  }

  /** True when local edits are in flight and an incoming change cannot be trusted. */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Answer the host's idle consistency probe. */
  verify(length: number, hash: number): boolean {
    const view = this.getView();
    if (!view) return true;
    if (this.hasPending) return true; // mid-flight; the next probe will settle it
    const text = view.state.doc.toString();
    return text.length === length && hash32(text) === hash;
  }

  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
    this.anchor = null;
    this.flushToken = null;
  }
}

/** line/character -> CodeMirror offset, clamped to the document. */
export function offsetAt(doc: Text, pos: WirePos): number {
  const lineNumber = Math.max(1, Math.min(pos.line + 1, doc.lines));
  const line = doc.line(lineNumber);
  return Math.min(line.from + Math.max(0, pos.character), line.to);
}
