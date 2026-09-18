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
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { alertKind } from "./alerts";

/** Past this, joining costs more than the ragged edge does. */
const MAX_REFLOW_DOC = 300_000;

/** A hard break: two trailing spaces, or a trailing backslash. */
const HARD_BREAK = / {2,}$|\\$/;

/** Blocks whose line breaks are meaningful and must be left alone. */
const KEEP_BREAKS = new Set(["FencedCode", "CodeBlock", "Table", "Frontmatter", "HTMLBlock"]);

class SoftBreak extends WidgetType {
  override eq() {
    return true;
  }

  override toDOM() {
    const span = document.createElement("span");
    span.className = "cm-softbreak";
    span.textContent = " ";
    return span;
  }

  /** It stands for a newline, so let the caret past it rather than into it. */
  override ignoreEvent() {
    return false;
  }
}

const softBreak = Decoration.replace({ widget: new SoftBreak() });

export function buildReflow(state: EditorState): DecorationSet {
  if (state.doc.length > MAX_REFLOW_DOC) return Decoration.none;

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

      for (let i = first; i <= last; i++) {
        if (caretLines.has(i)) return false; // the caret is in this paragraph
      }

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
        ranges.push(softBreak.range(line.to, next.from + indent));
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
