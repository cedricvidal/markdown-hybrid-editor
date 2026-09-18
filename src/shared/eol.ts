/**
 * The line-ending boundary. CodeMirror normalises every break to a single LF,
 * so text crossing between the document and the view has to be converted — and
 * a CRLF file that gains a lone LF is corruption that only shows up later.
 *
 * Pure string functions with no VS Code dependency, so they live in `shared`
 * and are unit-testable.
 */
export type Eol = "\n" | "\r\n";

/** Webview text -> document text. */
export function normaliseIn(text: string, eol: Eol): string {
  return eol === "\r\n" ? text.replace(/\r?\n/g, "\r\n") : text.replace(/\r\n?/g, "\n");
}

/** Document text -> webview text, matching CodeMirror's own normalisation. */
export function normaliseOut(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
