import * as vscode from "vscode";
import type { WebviewMessage } from "../shared/protocol";
import { getHtml, makeNonce } from "./html";
import { readConfig, SECTION } from "./config";
import { DocumentSync } from "./DocumentSync";
import { EditorSession } from "./EditorSession";
import { validateChanges } from "./positions";

export const VIEW_TYPE = "markdownHybridEditor.editor";

/**
 * One webview per editor pane. The `TextDocument` stays the source of truth;
 * the webview is only a view onto it, and `DocumentSync` keeps the two in step.
 */
export class HybridEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(VIEW_TYPE, new HybridEditorProvider(context), {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: false },
    });
  }

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const nonce = makeNonce();
    const session = new EditorSession(panel, nonce);
    const sync = DocumentSync.acquire(document, session);

    panel.webview.options = {
      enableScripts: true,
      // No <form> anywhere, and command: URIs would let page content invoke
      // VS Code commands — both stay off.
      enableForms: false,
      enableCommandUris: false,
      // Our two bundles and nothing else. The workspace is never a resource root,
      // so no note can cause a local file read through the webview.
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };
    // Typography is stamped into the document rather than applied after load, so
    // the tab never flashes the wrong mode.
    panel.webview.html = getHtml(panel.webview, this.context.extensionUri, nonce, readConfig(nonce));

    session.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SECTION)) session.post({ type: "config", config: readConfig(nonce) });
      }),

      panel.webview.onDidReceiveMessage((raw: unknown) => {
        // Messages cross a trust boundary: the extension host has full filesystem
        // access, so nothing is destructured before its shape is checked.
        if (typeof raw !== "object" || raw === null) return;
        const message = raw as WebviewMessage;

        switch (message.type) {
          case "ready":
            // postMessage before the webview script runs is dropped silently, so
            // the document is pushed only once the webview asks for it. The same
            // path serves first load, tab re-show and window reload.
            // `active` rides along with init rather than arriving as a separate
            // focus message: onDidChangeViewState fires while the webview script
            // is still loading, so that message would be dropped — leaving a
            // freshly split pane that looks focused but swallows every keystroke.
            session.post({
              type: "init",
              text: sync.text(),
              config: readConfig(nonce),
              readOnly: false,
              active: panel.active,
            });
            return;

          case "edits": {
            const changes = validateChanges(message.changes, document);
            if (changes === null) {
              // Malformed or out-of-bounds: never apply a partial batch.
              sync.resync(session);
              return;
            }
            const token = typeof message.token === "number" ? message.token : null;
            void sync.applyFromWebview(session, changes, token);
            return;
          }

          case "resyncRequest":
            sync.resync(session);
            return;

          case "selection":
            return;

          case "error":
            console.error(`[markdown-hybrid-editor] webview: ${String(message.message).slice(0, 500)}`);
            return;

          default:
            return; // unknown type: ignore
        }
      }),

      panel.onDidChangeViewState(() => {
        // With retainContextWhenHidden off the webview is torn down when hidden,
        // so anything buffered has to leave first. Gaining focus needs an explicit
        // nudge or the tab looks focused while keystrokes go nowhere.
        if (panel.active) session.post({ type: "focus" });
      }),
    );

    panel.onDidDispose(() => {
      // One leaked listener per closed tab is the classic custom-editor leak.
      session.dispose();
      sync.release(session);
    });
  }
}
