import * as vscode from "vscode";
import type { HostMessage, WebviewMessage } from "../shared/protocol";
import { getHtml, makeNonce } from "./html";
import { readConfig, SECTION } from "./config";

export const VIEW_TYPE = "markdownHybridEditor.editor";

/**
 * One webview per editor pane. The `TextDocument` stays the source of truth;
 * the webview is only a view onto it.
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
    // Stamped into the document rather than applied after load, so the tab never
    // flashes the wrong typography.
    panel.webview.html = getHtml(panel.webview, this.context.extensionUri, nonce, readConfig(nonce));

    const post = (message: HostMessage) => void panel.webview.postMessage(message);
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(SECTION)) post({ type: "config", config: readConfig(nonce) });
      }),
      panel.webview.onDidReceiveMessage((message: unknown) => {
        // Messages cross a trust boundary: the extension host has full filesystem
        // access, so nothing is destructured before its shape is checked.
        if (typeof message !== "object" || message === null) return;
        const msg = message as WebviewMessage;
        switch (msg.type) {
          case "ready":
            // postMessage before the webview script runs is dropped silently, so
            // the document is pushed only once the webview asks for it. The same
            // path serves first load, tab re-show and window reload.
            post({ type: "init", text: document.getText(), config: readConfig(nonce) });
            return;
          case "error":
            console.error(`[markdown-hybrid-editor] webview: ${String(msg.message).slice(0, 500)}`);
            return;
          default:
            return; // unknown type: ignore
        }
      }),
    );

    panel.onDidDispose(() => {
      // One leaked listener per closed tab is the classic custom-editor leak.
      for (const d of disposables) d.dispose();
      disposables.length = 0;
    });
  }
}
