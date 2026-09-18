import * as vscode from "vscode";

/**
 * 16 random bytes, base64. `globalThis.crypto` rather than `node:crypto` so the
 * host bundle keeps no Node-only import — see the eslint rule on `node:*`.
 */
export function makeNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * A markdown file is untrusted input, so the webview is given the least authority
 * that still lets CodeMirror run.
 *
 * - `img-src`/`font-src`/`connect-src` are `'none'`: we render no images and bundle
 *   no fonts, so note content cannot make a single outbound request.
 * - `style-src` is nonce'd rather than `'unsafe-inline'`: CodeMirror mounts its
 *   stylesheets through `EditorView.cspNonce` -> `StyleModule.mount(.., {nonce})`.
 * - `form-action` and `base-uri` do NOT inherit from `default-src`, so they are
 *   listed explicitly; omitting them leaves a crafted <form>/<base> usable.
 */
function csp(nonce: string, cspSource: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}' ${cspSource}`,
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

export function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri, nonce: string): string {
  const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...parts));
  const script = uri("dist", "webview.js");
  const style = uri("dist", "webview.css");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp(nonce, webview.cspSource)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${style}" rel="stylesheet" nonce="${nonce}">
<title>Markdown Hybrid Editor</title>
</head>
<body>
<div id="root"><div class="mhe-skeleton" aria-hidden="true"></div></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
