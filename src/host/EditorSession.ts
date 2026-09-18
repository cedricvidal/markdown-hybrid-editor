import type * as vscode from "vscode";
import type { HostMessage } from "../shared/protocol";

/** One open editor pane. Several may share a single document. */
export class EditorSession {
  readonly disposables: vscode.Disposable[] = [];

  constructor(
    readonly panel: vscode.WebviewPanel,
    readonly nonce: string,
  ) {}

  post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
  }
}
