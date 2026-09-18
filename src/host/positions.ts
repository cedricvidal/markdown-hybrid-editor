import * as vscode from "vscode";
import type { WireChange, WirePos } from "../shared/protocol";
import type { Eol } from "../shared/eol";

export { normaliseIn, normaliseOut } from "../shared/eol";

/**
 * The line/character boundary between VS Code and CodeMirror.
 *
 * CodeMirror's `Text` normalises every line break to one character. On a CRLF
 * document an absolute offset therefore differs between the two sides by one
 * per preceding line — which surfaces as silent corruption deep in the file.
 * Line/character coordinates are immune, so nothing on the wire is an offset.
 */

export function toPosition(pos: WirePos): vscode.Position {
  return new vscode.Position(pos.line, pos.character);
}

export function toRange(change: WireChange): vscode.Range {
  return new vscode.Range(toPosition(change.start), toPosition(change.end));
}

export function fromVsRange(range: vscode.Range): { start: WirePos; end: WirePos } {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

export function eolOf(document: vscode.TextDocument): Eol {
  return document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

/**
 * Bounds on a single batch. A batch is one debounce of typing or one paste, so
 * these are far above anything real; they exist so a malformed or hostile
 * message cannot make the extension host allocate without limit.
 */
const MAX_CHANGES = 10_000;
const MAX_INSERTED = 8_000_000;

/**
 * Guards the trust boundary: messages from the webview reach an extension host
 * with full filesystem access, so a change is only built into a `Range` once its
 * shape and bounds have been checked. Returns null if anything is off.
 */
export function validateChanges(raw: unknown, document: vscode.TextDocument): WireChange[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > MAX_CHANGES) return null;

  const lastLine = document.lineCount - 1;
  const out: WireChange[] = [];
  let previousEnd: WirePos | null = null;
  let inserted = 0;

  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { start, end, text } = item as Partial<WireChange>;
    if (typeof text !== "string") return null;
    inserted += text.length;
    if (inserted > MAX_INSERTED) return null;
    if (!isPos(start) || !isPos(end)) return null;
    if (start.line > lastLine || end.line > lastLine) return null;
    if (start.character > document.lineAt(start.line).text.length) return null;
    if (end.character > document.lineAt(end.line).text.length) return null;
    if (start.line > end.line || (start.line === end.line && start.character > end.character)) return null;
    // All changes in one batch share the pre-batch coordinate space, so they must
    // be disjoint and ascending or VS Code would apply them against each other.
    if (previousEnd && (start.line < previousEnd.line || (start.line === previousEnd.line && start.character < previousEnd.character))) {
      return null;
    }
    previousEnd = end;
    out.push({ start, end, text });
  }
  return out;
}

function isPos(value: unknown): value is WirePos {
  if (typeof value !== "object" || value === null) return false;
  const { line, character } = value as Partial<WirePos>;
  return (
    typeof line === "number" &&
    typeof character === "number" &&
    Number.isInteger(line) &&
    Number.isInteger(character) &&
    line >= 0 &&
    character >= 0
  );
}
