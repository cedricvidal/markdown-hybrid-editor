import * as vscode from "vscode";
import type { WebviewConfig } from "../shared/protocol";

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
 * - `style-src` has to allow inline. CodeMirror sets `style` *attributes* on the
 *   elements it renders, and a nonce cannot cover a style attribute — and a
 *   source list containing a nonce makes the browser ignore `'unsafe-inline'`
 *   altogether, so it is one or the other. The cost is bounded: with `img-src`,
 *   `font-src` and `connect-src` all `'none'`, CSS has nowhere to send anything.
 *   `script-src` stays nonce-only, which is where the real risk lives.
 * - `form-action` and `base-uri` do NOT inherit from `default-src`, so they are
 *   listed explicitly; omitting them leaves a crafted <form>/<base> usable.
 * - `require-trusted-types-for 'script'` makes the browser *enforce* the
 *   no-innerHTML rule rather than leaving it to review. Verified to survive both
 *   VS Code's injected preload and CodeMirror, which contain no HTML sinks.
 */
function csp(nonce: string, cspSource: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'unsafe-inline' ${cspSource}`,
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
  ].join("; ");
}

export function getHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
  config: WebviewConfig,
): string {
  const uri = (...parts: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...parts));
  const script = uri("dist", "webview.js");
  const style = uri("dist", "webview.css");

  return `<!DOCTYPE html>
<html lang="en" data-typography="${config.typography}">
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

/**
 * Shown instead of the editor for a document large enough that the live preview
 * would make typing crawl. An honest bail-out beats a hung tab.
 */
export function getTooLargeHtml(webview: vscode.Webview, nonce: string, bytes: number, limit: number): string {
  const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp(nonce, webview.cspSource)}">
<style nonce="${nonce}">
  body { margin: 0; height: 100vh; display: grid; place-items: center;
         background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
         font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  .card { max-width: 44ch; text-align: center; line-height: 1.5; padding: 24px; }
  h1 { font-size: 1.15em; margin: 0 0 8px; }
  p { color: var(--vscode-descriptionForeground); margin: 0 0 16px; }
  button { font: inherit; padding: 6px 14px; border: 0; border-radius: 2px; cursor: pointer;
           background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
<div class="card">
  <h1>This note is too large for the hybrid editor</h1>
  <p>It is ${mb(bytes)}, past the ${mb(limit)} limit. Rendering tables and hiding
     markup means re-reading the whole document as you type, which would make
     editing crawl. The plain text editor handles it comfortably.</p>
  <button id="open">Open in Text Editor</button>
</div>
<script nonce="${nonce}">
  const api = acquireVsCodeApi();
  document.getElementById("open").addEventListener("click", () => api.postMessage({ type: "openWithTextEditor" }));
</script>
</body>
</html>`;
}
