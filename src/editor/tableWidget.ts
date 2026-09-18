/**
 * Renders a GFM table from its markdown source and lets cells be edited in
 * place: the table stays rendered, the focused cell shows its raw source, and
 * every keystroke writes the whole row back into the document.
 *
 * The widget only touches the DOM. Document changes leave as `cm-table-edit`
 * events which the live-preview extension turns into transactions, which keeps
 * this file free of any dependency on the editor's own plumbing.
 */
import { WidgetType } from "@codemirror/view";

export type Align = "left" | "center" | "right";

export interface TableModel {
  header: string[];
  aligns: Align[];
  rows: string[][];
}

/** Split a row on unescaped pipes that are not inside inline code. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inCode = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      current += "\\|";
      i++;
      continue;
    }
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);

  const trimmed = line.trim();
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|") && cells.length) cells.pop();
  return cells.map((c) => c.trim());
}

function parseAlign(cell: string): Align {
  const c = cell.trim();
  if (c.startsWith(":") && c.endsWith(":")) return "center";
  if (c.endsWith(":")) return "right";
  return "left";
}

export function parseTable(source: string): TableModel {
  const lines = source.split("\n").filter((l) => l.trim().length);
  const header = splitRow(lines[0] ?? "");
  const aligns = splitRow(lines[1] ?? "").map(parseAlign);
  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line);
    while (cells.length < header.length) cells.push("");
    return cells.slice(0, header.length);
  });
  return { header, aligns, rows };
}

/** `| a | b |` from cell sources, re-escaping any bare pipe inside a cell. */
export function rowLine(cells: string[]): string {
  const escaped = cells.map((c) => c.replace(/(?<!\\)\|/g, "\\|").replace(/\n/g, " ").trim());
  return `| ${escaped.join(" | ")} |`;
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))/g;

/**
 * Minimal inline markdown into DOM nodes, never through innerHTML. Cell content
 * comes from an untrusted document, and building nodes is what keeps a crafted
 * cell inert.
 */
export function renderInline(text: string, into: HTMLElement): void {
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) into.append(text.slice(last, at));
    const token = match[0];

    if (match[1]) {
      const code = document.createElement("code");
      code.className = "cm-code";
      // `\|` is how a pipe is written inside a table cell, including inside a
      // code span; it is an escape, not literal text. The cell's raw source is
      // untouched, so the row still round-trips with the escape intact.
      code.textContent = token.slice(1, -1).replace(/\\\|/g, "|");
      into.append(code);
    } else if (match[2] || match[3]) {
      const strong = document.createElement("strong");
      renderInline(token.slice(2, -2), strong);
      into.append(strong);
    } else if (match[4] || match[5]) {
      const em = document.createElement("em");
      renderInline(token.slice(1, -1), em);
      into.append(em);
    } else if (match[6]) {
      const s = document.createElement("s");
      renderInline(token.slice(2, -2), s);
      into.append(s);
    } else if (match[7]) {
      const close = token.indexOf("](");
      const link = document.createElement("span");
      link.className = "cm-mdlink";
      link.title = token.slice(close + 2, -1);
      renderInline(token.slice(1, close), link);
      into.append(link);
    }
    last = at + token.length;
  }

  if (last < text.length) into.append(text.slice(last).replace(/\\\|/g, "|"));
}

type Cell = HTMLTableCellElement & { _source?: string; _editing?: boolean };

function cellSource(model: TableModel, row: number, col: number): string {
  return (row < 0 ? model.header[col] : model.rows[row]?.[col]) ?? "";
}

function renderCell(cell: Cell, source: string): void {
  cell._source = source;
  cell.replaceChildren();
  renderInline(source, cell);
}

function emit(cell: HTMLElement, name: string, detail: unknown): void {
  cell.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
}

function setupCell(cell: Cell, row: number, col: number, align: Align, source: string): void {
  cell.dataset["row"] = String(row);
  cell.dataset["col"] = String(col);
  cell.style.textAlign = align;
  // Short cells stay on one line and the block scrolls sideways; long prose wraps.
  cell.style.whiteSpace = row >= 0 && source.length > 48 ? "normal" : "nowrap";
  if (source.length > 48) cell.style.minWidth = "24ch";
  cell.contentEditable = "true";
  cell.spellcheck = false;
  renderCell(cell, source);

  cell.addEventListener("focus", () => {
    if (cell._editing) return;
    cell._editing = true;
    cell.classList.add("editing");
    // Show the raw source while editing, so markup is editable in place.
    cell.textContent = cell._source ?? "";
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  cell.addEventListener("blur", () => {
    if (!cell._editing) return;
    cell._editing = false;
    cell.classList.remove("editing");
    renderCell(cell, cell._source ?? "");
  });

  cell.addEventListener("input", () => {
    const text = (cell.textContent ?? "").replace(/\n/g, " ");
    cell._source = text;
    emit(cell, "cm-table-edit", { row, col, text });
  });

  cell.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      cell.blur();
    } else if (event.key === "Tab") {
      event.preventDefault();
      const cells = [...(cell.closest("table")?.querySelectorAll<HTMLTableCellElement>("th, td") ?? [])];
      const index = cells.indexOf(cell);
      cells[index + (event.shiftKey ? -1 : 1)]?.focus();
    }
  });

  cell.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain").replace(/\n/g, " ") ?? "";
    // Plain text only: a cell is one line of markdown, never pasted markup.
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    cell.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export class TableWidget extends WidgetType {
  readonly model: TableModel;

  constructor(readonly source: string) {
    super();
    this.model = parseTable(source);
  }

  override eq(other: TableWidget) {
    return other.source === this.source;
  }

  override toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-table-widget";

    const table = document.createElement("table");
    const headRow = table.createTHead().insertRow();
    this.model.header.forEach((cell, i) => {
      const th = document.createElement("th") as Cell;
      setupCell(th, -1, i, this.model.aligns[i] ?? "left", cell);
      headRow.append(th);
    });

    const body = table.createTBody();
    this.model.rows.forEach((cells, r) => {
      const tr = body.insertRow();
      cells.forEach((cell, c) => {
        const td = tr.insertCell() as Cell;
        setupCell(td, r, c, this.model.aligns[c] ?? "left", cell);
      });
    });

    wrap.append(table);
    return wrap;
  }

  /** Same shape: patch cells in place so a focused cell keeps its caret. */
  override updateDOM(dom: HTMLElement) {
    const cells = [...dom.querySelectorAll<Cell>("th, td")];
    const expected = this.model.header.length * (this.model.rows.length + 1);
    if (cells.length !== expected) return false;

    for (const cell of cells) {
      const row = Number(cell.dataset["row"]);
      const col = Number(cell.dataset["col"]);
      const source = cellSource(this.model, row, col);
      if (cell._editing) {
        cell._source = source;
        continue;
      }
      if (cell._source !== source) renderCell(cell, source);
    }
    return true;
  }

  override ignoreEvent() {
    return true;
  }
}
