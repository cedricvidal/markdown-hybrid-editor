/**
 * Soft line breaks reflow, the way markdown says they should.
 *
 * A single newline inside a paragraph is a space, not a break — so a file
 * hand-wrapped at 80 columns should read as flowing prose, not as a column of
 * ragged fragments. Each such newline is replaced by a space, which joins the
 * lines and lets them wrap to the reading measure instead.
 *
 * Put the caret in a paragraph and it snaps back to its real source lines, so
 * you can see and control where the breaks are. Same rule as everything else
 * here: rendered away from the caret, source under it.
 *
 * This has to be a StateField. CodeMirror refuses a decoration that replaces a
 * line break when it comes from a ViewPlugin — "Decorations that replace line
 * breaks may not be specified via plugins" — for the same reason block widgets
 * are refused: the line layout cannot depend on the viewport.
 */
import { syntaxTree } from "@codemirror/language";
import { Facet, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { alertKind } from "./alerts";

/** Past this, joining costs more than the ragged edge does. */
const MAX_REFLOW_DOC = 300_000;

/** A hard break: two trailing spaces, or a trailing backslash. */
const HARD_BREAK = / {2,}$|\\$/;

/** Blocks whose line breaks are meaningful and must be left alone. */
const KEEP_BREAKS = new Set(["FencedCode", "CodeBlock", "Table", "Frontmatter", "HTMLBlock"]);

/**
 * Stands in for the newline. Reading, it is just the space markdown says it is;
 * editing the paragraph, it shows the break so you can see where your lines
 * actually end — without the text relayouting under the caret, which is what
 * restoring the source lines would cost.
 */
class SoftBreak extends WidgetType {
  constructor(readonly marked: boolean) {
    super();
  }

  override eq(other: SoftBreak) {
    return other.marked === this.marked;
  }

  override toDOM() {
    const span = document.createElement("span");
    span.className = this.marked ? "cm-softbreak cm-softbreak-marked" : "cm-softbreak";
    span.textContent = this.marked ? "\u21a9" : " ";
    return span;
  }

  /** It stands for a newline, so let the caret past it rather than into it. */
  override ignoreEvent() {
    return false;
  }
}

const softBreakPlain = Decoration.replace({ widget: new SoftBreak(false) });
const softBreakMarked = Decoration.replace({ widget: new SoftBreak(true) });

/**
 * What a soft break does when the caret is inside its paragraph.
 *
 * - `mark`   keep it flowing and show a break glyph, so nothing moves.
 * - `unwrap` put the paragraph back on its source lines.
 */
export type SoftBreakMode = "mark" | "unwrap";

export const softBreakMode = Facet.define<SoftBreakMode, SoftBreakMode>({
  combine: (values) => values[0] ?? "mark",
});

export function buildReflow(state: EditorState): DecorationSet {
  if (state.doc.length > MAX_REFLOW_DOC) return Decoration.none;
  const mode = state.facet(softBreakMode);

  // Every line the selection touches, plus the paragraph containing it, is left
  // as written — so the whole paragraph un-reflows together rather than a single
  // line springing out of the middle of it.
  const caretLines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let i = first; i <= last; i++) caretLines.add(i);
  }

  const ranges: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter: (node) => {
      if (KEEP_BREAKS.has(node.name)) return false;
      if (node.name !== "Paragraph") return;

      const first = state.doc.lineAt(node.from).number;
      const last = state.doc.lineAt(node.to).number;
      if (first === last) return false;

      let editing = false;
      for (let i = first; i <= last; i++) if (caretLines.has(i)) editing = true;
      // In `unwrap` the paragraph goes back to its source lines; in `mark` it
      // keeps flowing and the breaks become visible instead.
      if (editing && mode === "unwrap") return false;
      const deco = editing ? softBreakMarked : softBreakPlain;

      for (let i = first; i < last; i++) {
        const line = state.doc.line(i);
        // A hard break is a break the author asked for; leave it.
        if (HARD_BREAK.test(line.text)) continue;
        // A GitHub alert's `[!NOTE]` marker is a title, not the first words of
        // the sentence below it. CommonMark sees one paragraph; the alert does
        // not, and joining them would run the name into the prose.
        if (alertKind(line.text)) continue;

        // Swallow the continuation line's indent along with the newline. A
        // wrapped list item is indented to line up under its bullet, and that
        // indent is layout for the source, not a run of spaces in the sentence.
        const next = state.doc.line(i + 1);
        const indent = /^[ \t]*/.exec(next.text)?.[0].length ?? 0;
        ranges.push(deco.range(line.to, next.from + indent));
      }
      return false;
    },
  });

  return Decoration.set(ranges, true);
}

export const reflow = StateField.define<DecorationSet>({
  create: buildReflow,
  update: (value, tr) =>
    tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? buildReflow(tr.state)
      : value,
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * True when this document line belongs to a paragraph that reflow has joined,
 * and therefore reads as part of one block rather than a line of its own.
 */
export const revealByParagraph = Facet.define<boolean, boolean>({
  combine: (values) => values[0] ?? false,
});

/**
 * The line range of the joined paragraph containing `lineNumber`, or null when
 * that line stands on its own. Used to decide how much markup to reveal: the
 * unit has to be what the reader sees, and once lines are joined that is the
 * paragraph, not the line.
 */
export function joinedParagraphAt(state: EditorState, lineNumber: number): { first: number; last: number } | null {
  if (state.doc.length > MAX_REFLOW_DOC) return null;
  const line = state.doc.line(lineNumber);

  let node = syntaxTree(state).resolveInner(line.from, 1);
  while (node.parent && node.name !== "Paragraph") node = node.parent;
  if (node.name !== "Paragraph") return null;

  const first = state.doc.lineAt(node.from).number;
  const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
  if (first === last) return null;

  // A paragraph broken only by hard breaks is never joined, so its lines stay
  // lines and revealing one of them is right.
  for (let i = first; i < last; i++) {
    if (!HARD_BREAK.test(state.doc.line(i).text) && !alertKind(state.doc.line(i).text)) {
      return { first, last };
    }
  }
  return null;
}
