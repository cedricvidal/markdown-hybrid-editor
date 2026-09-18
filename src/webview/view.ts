import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";
import type { WebviewConfig } from "../shared/protocol";
import { readingExtensions } from "../editor/presets";
import { initialSelection, setShowFrontmatter } from "../editor/frontmatterVisibility";
import { requestShowFrontmatter } from "../editor/hostBridge";
import type { EditBridge } from "./bridge";
import { vscodeApi } from "./persist";

/**
 * Everything config-dependent sits in a compartment, so a settings change
 * reconfigures the view instead of rebuilding it — rebuilding would drop the
 * caret and the scroll position.
 */
const configurable = new Compartment();

/**
 * The toggle's keybinding, written the way this platform writes it. Detected in
 * the webview rather than the host: the host may be a Web Worker with no
 * platform to ask, and the webview is on the user's actual machine either way.
 */
function frontmatterHintText(): string {
  const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  return `Show the frontmatter block (${mac ? "\u2318\u2325P" : "Ctrl+Alt+P"})`;
}

function configExtensions(config: WebviewConfig): Extension {
  return [
    // Nonce the stylesheets CodeMirror mounts at runtime. style-src currently
    // has to allow inline anyway (CodeMirror sets style attributes, which no
    // nonce can cover), so this is belt-and-braces rather than load-bearing.
    EditorView.cspNonce.of(config.nonce),
    // The strip asks the host rather than flipping local state, so the setting
    // stays the single source of truth and every open editor follows.
    requestShowFrontmatter.of((show) => vscodeApi.postMessage({ type: "setShowFrontmatter", show })),
    ...readingExtensions({
      livePreview: config.livePreview,
      renderTables: config.renderTables,
      showFrontmatter: config.showFrontmatter,
      frontmatterHint: frontmatterHintText(),
    }),
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
      // Start the caret on the body when the block is folded: transaction
      // filters do not run on state creation.
      selection: { anchor: initialSelection(text, config.showFrontmatter) },
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
  // The facet only feeds StateField.create, so a live change has to arrive as an
  // effect as well as through the reconfigure.
  view.dispatch({
    effects: [
      configurable.reconfigure(configExtensions(config)),
      setShowFrontmatter.of(config.showFrontmatter),
    ],
  });
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
