import "./styles/tokens.css";
import "./styles/editor.css";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { HostMessage, WebviewConfig, WireChange } from "../shared/protocol";
import { readPersisted, vscodeApi, writePersisted } from "./persist";
import { EditBridge, fromHost, offsetAt } from "./bridge";
import { applyTypography, createView, reconfigure } from "./view";

const root = document.getElementById("root");
let view: EditorView | null = null;
const bridge = new EditBridge(() => view);

function mount(text: string, config: WebviewConfig, readOnly: boolean, active: boolean): void {
  if (!root) return;
  applyTypography(config);
  bridge.reset();
  view?.destroy();
  root.replaceChildren();
  view = createView(root, text, config, bridge, readOnly);

  const persisted = readPersisted();
  if (persisted?.selection) {
    const doc = view.state.doc;
    const anchor = offsetAt(doc, persisted.selection.anchor);
    const head = offsetAt(doc, persisted.selection.head);
    view.dispatch({ selection: EditorSelection.single(anchor, head), annotations: fromHost.of(true) });
  }
  if (persisted?.scrollTop) {
    const scroller = view.scrollDOM;
    scroller.scrollTop = persisted.scrollTop;
  }
  if (active) view.focus();
}

function applyChanges(changes: WireChange[], isUndoRedo: boolean): void {
  if (!view) return;
  const doc = view.state.doc;
  // All ranges in one event share the pre-change coordinate space, so they go in
  // a single transaction; CodeMirror interprets every spec against the start doc.
  const specs = changes.map((change) => ({
    from: offsetAt(doc, change.start),
    to: offsetAt(doc, change.end),
    insert: change.text,
  }));

  // On undo/redo put the caret where the change landed, the way a text editor
  // does; otherwise let CodeMirror map the existing selection through.
  const last = specs[specs.length - 1];
  const selection =
    isUndoRedo && last ? { anchor: last.from + last.insert.length } : undefined;

  view.dispatch({ changes: specs, ...(selection ? { selection } : {}), annotations: fromHost.of(true) });
}

function replaceAll(text: string): void {
  if (!view) return;
  const selection = view.state.selection.main;
  bridge.reset();
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    annotations: fromHost.of(true),
  });
  const max = view.state.doc.length;
  view.dispatch({
    selection: EditorSelection.single(Math.min(selection.anchor, max), Math.min(selection.head, max)),
    annotations: fromHost.of(true),
  });
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (typeof message !== "object" || message === null) return;
  switch (message.type) {
    case "init":
      mount(message.text, message.config, message.readOnly, message.active);
      return;
    case "config":
      applyTypography(message.config);
      if (view) reconfigure(view, message.config);
      return;
    case "apply":
      // Local edits in flight means the incoming change was computed against a
      // document that does not include them. Rather than transform, ask for the
      // authoritative text: this is rare, and correctness beats cleverness.
      if (bridge.hasPending) {
        vscodeApi.postMessage({ type: "resyncRequest", reason: "change arrived with local edits in flight" });
        return;
      }
      applyChanges(message.changes, message.isUndoRedo);
      return;
    case "resync":
      replaceAll(message.text);
      return;
    case "verify":
      if (!bridge.verify(message.length, message.hash)) {
        vscodeApi.postMessage({ type: "resyncRequest", reason: "view diverged from the document" });
      }
      return;
    case "flush":
      bridge.flushFor(message.token);
      return;
    case "focus":
      view?.focus();
      return;
    default:
      return;
  }
});

// A hidden tab is torn down, so send what is buffered before it goes.
window.addEventListener("blur", () => bridge.flush());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") bridge.flush();
  persist();
});

function persist(): void {
  if (!view) return;
  const doc = view.state.doc;
  const { anchor, head } = view.state.selection.main;
  const toPos = (offset: number) => {
    const line = doc.lineAt(offset);
    return { line: line.number - 1, character: offset - line.from };
  };
  writePersisted({ scrollTop: view.scrollDOM.scrollTop, selection: { anchor: toPos(anchor), head: toPos(head) } });
}

window.addEventListener("error", (event) => {
  vscodeApi.postMessage({ type: "error", message: String(event.message) });
});

vscodeApi.postMessage({ type: "ready", persisted: readPersisted() });
