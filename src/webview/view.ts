import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";
import type { WebviewConfig } from "../shared/protocol";
import { readingExtensions } from "../editor/presets";
import type { EditBridge } from "./bridge";

/**
 * Everything config-dependent sits in a compartment, so a settings change
 * reconfigures the view instead of rebuilding it — rebuilding would drop the
 * caret and the scroll position.
 */
const configurable = new Compartment();

function configExtensions(config: WebviewConfig): Extension {
  return [
    // CodeMirror mounts its stylesheets at runtime; without the nonce they are
    // blocked by our own style-src. This is why the CSP needs no 'unsafe-inline'.
    EditorView.cspNonce.of(config.nonce),
    ...readingExtensions(),
  ];
}

export function createView(
  parent: HTMLElement,
  text: string,
  config: WebviewConfig,
  bridge: EditBridge,
  readOnly: boolean,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        EditorState.readOnly.of(readOnly),
        drawSelection(),
        // No history(): VS Code owns the undo stack for a TextDocument, and a
        // second stack over the same text is the classic divergence bug. Cmd-Z is
        // forwarded to the workbench by the webview host and comes back as a
        // change event carrying reason Undo.
        bridge.listener,
        configurable.of(configExtensions(config)),
      ],
    }),
  });
}

export function reconfigure(view: EditorView, config: WebviewConfig): void {
  view.dispatch({ effects: configurable.reconfigure(configExtensions(config)) });
}

/**
 * Typography that is pure CSS lives on <html>, not in the CodeMirror theme, so
 * it applies without touching editor state at all.
 */
export function applyTypography(config: WebviewConfig): void {
  const root = document.documentElement;
  root.dataset["typography"] = config.typography;
  const set = (name: string, value: string | null) =>
    value ? root.style.setProperty(name, value) : root.style.removeProperty(name);

  // Only explicit overrides are written. Anything left unset falls through to
  // the stylesheet, which is what lets `vscode` mode drop the reading measure.
  set("--font-serif", config.fontFamily);
  set("--editor-size", config.fontSize === null ? null : `${config.fontSize}px`);
  set("--editor-line", config.lineHeight === null ? null : String(config.lineHeight));
  set("--editor-measure", config.readingMeasure);
}
