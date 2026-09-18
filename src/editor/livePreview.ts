/**
 * The hybrid effect: markdown marks are hidden on every line the selection is
 * not on, so a note reads like prose but edits like source. Blockquote,
 * frontmatter and fenced-code lines are tagged so CSS can style them as blocks.
 */
import { syntaxTree } from "@codemirror/language";
import { RangeSet, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { rowLine, TableWidget } from "./tableWidget";

const HIDE = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "QuoteMark"]);

const hidden = Decoration.replace({});

/**
 * Frontmatter, rendered: the properties read as properties.
 *
 * Nesting is shown with a guide per level rather than with leading spaces. The
 * rendered block is set in a proportional face, where a run of spaces has no
 * predictable width — so the indent is hidden and redrawn as padding, which is
 * what lets the guides line up down the block.
 */
const fmLineByDepth = new Map<number, Decoration>();
function fmLineAt(depth: number): Decoration {
  let deco = fmLineByDepth.get(depth);
  if (!deco) {
    deco = Decoration.line({
      class: "cm-fm-line",
      attributes: { style: `--fm-depth: ${depth}` },
    });
    fmLineByDepth.set(depth, deco);
  }
  return deco;
}
/** Frontmatter, on the caret line: the YAML source, editable in place. */
const fmLineRaw = Decoration.line({ class: "cm-fm-line cm-fm-raw" });
/** The `---` fences, which carry no information once the block reads as one. */
const fmFence = Decoration.line({ class: "cm-fm-line cm-fm-fence" });
const fmEnd = Decoration.line({ class: "cm-fm-end" });

const fmKey = Decoration.mark({ class: "cm-fm-key" });
const fmValue = Decoration.mark({ class: "cm-fm-value" });
const fmBullet = Decoration.mark({ class: "cm-fm-bullet" });
const quoteLine = Decoration.line({ class: "cm-quote-line" });
const codeBlockLine = Decoration.line({ class: "cm-codeblock-line" });
const mdLink = Decoration.mark({ class: "cm-mdlink" });

/**
 * Pure: takes a state and the ranges to cover, returns the decorations. Kept
 * free of `EditorView` so the whole decoration layer can be asserted from a
 * headless EditorState — decoration bugs are invisible in review and obvious
 * on screen, so they need tests that do not need a browser.
 */
export function buildDecorations(state: EditorState, ranges: readonly { from: number; to: number }[]): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  const cursorLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let i = first; i <= last; i++) cursorLines.add(i);
  }

  const tree = syntaxTree(state);
  const seenLines = new Set<number>();

  const lineDeco = (from: number, to: number, deco: Decoration, last?: Decoration) => {
    const first = state.doc.lineAt(from).number;
    const final = state.doc.lineAt(Math.max(from, to - 1)).number;
    for (let i = first; i <= final; i++) {
      if (seenLines.has(i)) continue;
      seenLines.add(i);
      decorations.push((i === final && last ? last : deco).range(state.doc.line(i).from));
    }
  };

  for (const { from, to } of ranges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        switch (node.name) {
          case "Link": {
            // [text](url): colour the text, and away from the cursor hide the
            // brackets, the URL and the title. A bare [label] with no URL — like
            // "app[bot]" — is left alone as plain text.
            const marks: { from: number; to: number }[] = [];
            let url: { from: number; to: number } | null = null;
            let title: { from: number; to: number } | null = null;
            for (let child = node.node.firstChild; child; child = child.nextSibling) {
              if (child.name === "LinkMark") marks.push({ from: child.from, to: child.to });
              else if (child.name === "URL") url = { from: child.from, to: child.to };
              else if (child.name === "LinkTitle") title = { from: child.from, to: child.to };
            }
            const first = marks[0];
            const second = marks[1];
            if (!url || !first || !second) return;
            if (second.from > first.to) decorations.push(mdLink.range(first.to, second.from));
            if (cursorLines.has(state.doc.lineAt(node.from).number)) return;
            for (const mark of marks) decorations.push(hidden.range(mark.from, mark.to));
            decorations.push(hidden.range(url.from, url.to));
            if (title) decorations.push(hidden.range(title.from, title.to));
            return;
          }
          case "Frontmatter":
            decorateFrontmatter(state, node.from, node.to, cursorLines, decorations, seenLines);
            return false;
          case "Blockquote":
            lineDeco(node.from, node.to, quoteLine);
            return;
          case "FencedCode":
            lineDeco(node.from, node.to, codeBlockLine);
            return;
        }

        if (!HIDE.has(node.name)) return;
        if (cursorLines.has(state.doc.lineAt(node.from).number)) return;
        let end = node.to;
        // Swallow the space after a heading or quote mark too, so the text does
        // not shift sideways when the marks step aside.
        if ((node.name === "HeaderMark" || node.name === "QuoteMark") && state.doc.sliceString(end, end + 1) === " ") {
          end += 1;
        }
        if (end > node.from) decorations.push(hidden.range(node.from, end));
      },
    });
  }

  return Decoration.set(decorations, true);
}

/** `key:` at the start of a line, and the value after it. */
const FM_PAIR = /^(\s*)([^\s:#][^:]*?)(:)(\s*)(.*)$/;
/** `- item` in a block list. */
const FM_ITEM = /^(\s*)(-\s+)(.*)$/;
const FM_FENCE = /^---\s*$/;

/**
 * The frontmatter follows the same rule as the body: rendered away from the
 * caret, raw source on the line being edited. Off the caret a property reads as
 * a property — the key set apart from its value, the `---` fences out of the
 * way; on it, the YAML is there to edit directly.
 */
function decorateFrontmatter(
  state: EditorState,
  from: number,
  to: number,
  cursorLines: Set<number>,
  out: Range<Decoration>[],
  seenLines: Set<number>,
): void {
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(Math.max(from, to - 1)).number;

  for (let i = first; i <= last; i++) {
    if (seenLines.has(i)) continue;
    seenLines.add(i);

    const line = state.doc.line(i);
    const onCaret = cursorLines.has(i);
    const isFence = FM_FENCE.test(line.text);
    const indent = /^[ \t]*/.exec(line.text)?.[0] ?? "";
    // YAML nests in twos; a tab counts as one level.
    const depth = indent.includes("\t") ? indent.length : Math.floor(indent.length / 2);

    out.push((onCaret ? fmLineRaw : isFence ? fmFence : fmLineAt(depth)).range(line.from));
    // The hairline sits under the closing fence, where the block ends.
    if (i === last) out.push(fmEnd.range(line.from));

    // On the caret line the source stands as written.
    if (onCaret) continue;

    if (isFence) {
      if (line.length > 0) out.push(hidden.range(line.from, line.to));
      continue;
    }

    // The indent is redrawn as padding so the guides can line up.
    if (indent.length > 0) out.push(hidden.range(line.from, line.from + indent.length));

    const pair = FM_PAIR.exec(line.text);
    if (pair) {
      const keyFrom = line.from + pair[1]!.length;
      const keyTo = keyFrom + pair[2]!.length;
      out.push(fmKey.range(keyFrom, keyTo + 1)); // include the colon
      const valueFrom = keyTo + 1 + pair[4]!.length;
      if (pair[5]!.length > 0) out.push(fmValue.range(valueFrom, valueFrom + pair[5]!.length));
      continue;
    }

    const item = FM_ITEM.exec(line.text);
    if (item) {
      const dashFrom = line.from + item[1]!.length;
      out.push(fmBullet.range(dashFrom, dashFrom + item[2]!.length));
      if (item[3]!.length > 0) {
        const textFrom = dashFrom + item[2]!.length;
        out.push(fmValue.range(textFrom, textFrom + item[3]!.length));
      }
    }
  }
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state, view.visibleRanges);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Tables are replaced by a rendered widget, and edited in place inside it.
 *
 * Block widgets have to come from a state field, which has no viewport — so
 * unlike the marks plugin this rebuilds over the whole tree. That is O(doc) per
 * keystroke, hence the size guard: past it the table stays plain markdown
 * rather than making every keystroke crawl.
 */
const MAX_TABLE_DOC = 300_000;

function buildTables(state: EditorState): DecorationSet {
  if (state.doc.length > MAX_TABLE_DOC) return Decoration.none;

  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;
      const first = state.doc.lineAt(node.from);
      const last = state.doc.lineAt(node.to);
      const widget = new TableWidget(state.doc.sliceString(first.from, last.to));
      ranges.push(Decoration.replace({ widget, block: true }).range(first.from, last.to));
      return false;
    },
  });
  return Decoration.set(ranges, true);
}

const tableField = StateField.define<DecorationSet>({
  create: buildTables,
  update: (deco, tr) =>
    tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? buildTables(tr.state) : deco,
  provide: (field) => [
    EditorView.decorations.from(field),
    // Without this, arrow-key motion can park the caret inside a replaced table
    // range with nothing visible to show for it.
    EditorView.atomicRanges.of((view) => view.state.field(field) as unknown as RangeSet<Decoration>),
  ],
});

/** Turns in-place cell edits into document changes. */
const tableEdits = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      view.dom.addEventListener("cm-table-edit", this.onEdit as EventListener);
    }

    onEdit = (event: CustomEvent<{ row: number; col: number; text: string }>) => {
      const cell = event.target as HTMLElement;
      const widget = cell.closest(".cm-table-widget");
      if (!widget) return;

      const { row, col, text } = event.detail;
      const start = this.view.state.doc.lineAt(this.view.posAtDOM(widget));
      // Header is the first line, the alignment row the second, so body row r
      // is at offset r + 2.
      const line = this.view.state.doc.line(start.number + (row < 0 ? 0 : row + 2));

      const selector = row < 0 ? "th" : `td[data-row="${row}"]`;
      const cells = [...widget.querySelectorAll<HTMLElement>(selector)].map(
        (c) => (c as HTMLElement & { _source?: string })._source ?? "",
      );
      cells[col] = text;

      const insert = rowLine(cells);
      if (insert === line.text) return;
      this.view.dispatch({ changes: { from: line.from, to: line.to, insert } });
    };

    destroy() {
      this.view.dom.removeEventListener("cm-table-edit", this.onEdit as EventListener);
    }
  },
);

export const tables = [tableField, tableEdits];
