/**
 * Folds the YAML frontmatter block behind a one-row strip ("7 properties")
 * while leaving the document itself untouched.
 *
 * Three layers keep the caret out of the hidden text: atomic ranges skip it
 * during cursor motion, a transaction filter clamps any selection that still
 * lands inside and drops user edits that reach into it, and the view seeds its
 * initial selection past the block. The hidden range comes from
 * `findFrontmatter`, never from the syntax tree, so it agrees exactly with what
 * anything else editing the block would compute.
 */
import { EditorSelection, EditorState, Facet, RangeSet, StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { countKeys, findFrontmatter, type FrontmatterRange } from "./lib/frontmatter";
import { frontmatterHint, requestShowFrontmatter } from "./hostBridge";

/** Toggle at runtime; the view dispatches this when the setting changes. */
export const setShowFrontmatter = StateEffect.define<boolean>();

/** Seed for a fresh state, since a field's `create` only sees the state. */
const initialShowFrontmatter = Facet.define<boolean, boolean>({ combine: (v) => v[0] ?? true });

const located = new WeakMap<Text, FrontmatterRange | null>();

/**
 * Where the block sits, computed once per document instance.
 *
 * Only the head of the document is stringified. The desktop original called
 * doc.toString() here, which runs once per keystroke on any file starting with
 * `---` — fine for a note, painful for a large one.
 */
export function locateFrontmatter(doc: Text): FrontmatterRange | null {
  const cached = located.get(doc);
  if (cached !== undefined) return cached;

  let found: FrontmatterRange | null = null;
  if (doc.length >= 4 && doc.sliceString(0, 3) === "---") {
    const head = doc.sliceString(0, Math.min(doc.length, 8192));
    found = findFrontmatter(head);
    // No closing fence within the window: only then pay for the whole document.
    if (!found && doc.length > 8192) found = findFrontmatter(doc.toString());
  }
  located.set(doc, found);
  return found;
}

function chevron(direction: "right" | "up" = "right"): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", direction === "up" ? "m18 15-6-6-6 6" : "m9 18 6-6-6-6");
  svg.append(path);
  return svg;
}

/**
 * The fold control, sitting on the closing `---` line — the affordance belongs
 * with the block it folds, not in the editor title bar. The fence carries no
 * information once the block reads as properties, so it becomes the button.
 */
export class FrontmatterFold extends WidgetType {
  override eq() {
    return true;
  }

  override ignoreEvent() {
    return true;
  }

  override toDOM(view: EditorView) {
    const button = document.createElement("span");
    button.className = "cm-fm-fold";
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.title = view.state.facet(frontmatterHint).replace("Show", "Hide");
    button.dataset["demo"] = "frontmatter-fold";
    button.append(chevron("up"), Object.assign(document.createElement("span"), { textContent: "Fold" }));

    const fold = (event: Event) => {
      event.preventDefault();
      view.state.facet(requestShowFrontmatter)(false);
    };
    button.addEventListener("mousedown", fold);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") fold(event);
    });
    return button;
  }
}

class FrontmatterStrip extends WidgetType {
  constructor(
    readonly count: number,
    readonly hint: string,
  ) {
    super();
  }

  override eq(other: FrontmatterStrip) {
    return other.count === this.count && other.hint === this.hint;
  }

  override get estimatedHeight() {
    return 50;
  }

  override ignoreEvent() {
    return true;
  }

  override toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-frontmatter-widget";

    const strip = document.createElement("div");
    strip.className = "cm-frontmatter-strip";
    strip.setAttribute("role", "button");
    strip.tabIndex = 0;
    strip.title = this.hint;
    strip.dataset["demo"] = "frontmatter-strip";

    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    label.textContent =
      this.count === 0 ? "No properties" : this.count === 1 ? "1 property" : `${this.count} properties`;
    const grow = document.createElement("span");
    grow.className = "grow";
    strip.append(dot, label, grow, chevron());

    const reveal = (event: Event) => {
      event.preventDefault();
      view.state.facet(requestShowFrontmatter)(true);
    };
    strip.addEventListener("mousedown", reveal);
    strip.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") reveal(event);
    });

    wrap.append(strip);
    return wrap;
  }
}

interface FrontmatterState {
  show: boolean;
  /** End of the block including the closing fence's newline; -1 when nothing is hidden. */
  blockTo: number;
  deco: DecorationSet;
  atoms: RangeSet<Decoration>;
}

const atom = Decoration.mark({ class: "cm-frontmatter-atom" });

function build(state: EditorState, show: boolean): FrontmatterState {
  const found = show ? null : locateFrontmatter(state.doc);
  if (!found) return { show, blockTo: -1, deco: Decoration.none, atoms: RangeSet.empty };

  const decoTo = state.doc.lineAt(found.yamlTo).to;
  const widget = new FrontmatterStrip(countKeys(found.yaml), state.facet(frontmatterHint));
  return {
    show,
    blockTo: found.blockTo,
    deco: Decoration.set([Decoration.replace({ widget, block: true }).range(0, decoTo)]),
    atoms: RangeSet.of([atom.range(0, found.blockTo)]),
  };
}

export const frontmatterField = StateField.define<FrontmatterState>({
  create: (state) => build(state, state.facet(initialShowFrontmatter)),
  update(value, tr) {
    let show = value.show;
    for (const effect of tr.effects) if (effect.is(setShowFrontmatter)) show = effect.value;
    return tr.docChanged || show !== value.show ? build(tr.state, show) : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.deco),
    EditorView.atomicRanges.of((view) => view.state.field(field).atoms),
  ],
});

const USER_EDITS = ["input", "delete", "move"];

/**
 * While the block is hidden: drop user edits that reach into it — a Backspace at
 * the start of the body is widened by CodeMirror's atomic-range handling to
 * start at 0, which would delete the whole block — and keep every selection
 * endpoint at or after it. Programmatic transactions pass through untouched.
 */
const frontmatterGuard = EditorState.transactionFilter.of((tr) => {
  const before = tr.startState.field(frontmatterField, false);
  if (!before) return tr;

  let show = before.show;
  for (const effect of tr.effects) if (effect.is(setShowFrontmatter)) show = effect.value;
  if (show) return tr;

  if (tr.docChanged && before.blockTo >= 0 && USER_EDITS.some((kind) => tr.isUserEvent(kind))) {
    let reachesIn = false;
    tr.changes.iterChangedRanges((fromA) => {
      if (fromA < before.blockTo) reachesIn = true;
    });
    if (reachesIn) return [];
  }

  const found = locateFrontmatter(tr.newDoc);
  if (!found) return tr;
  const selection = tr.newSelection;
  if (!selection.ranges.some((range) => range.from < found.blockTo)) return tr;

  const clamp = (pos: number) => Math.max(pos, found.blockTo);
  const ranges = selection.ranges.map((range) => EditorSelection.range(clamp(range.anchor), clamp(range.head)));
  return [tr, { selection: EditorSelection.create(ranges, selection.mainIndex), sequential: true }];
});

/**
 * A closing fence at the very end of the file with no newline after it would
 * leave the caret stranded on the fence line. Give the body somewhere to start.
 */
export function normalizeFrontmatterEnd(view: EditorView): void {
  const state = view.state.field(frontmatterField, false);
  if (!state || state.show || state.blockTo < 0) return;
  const doc = view.state.doc;
  if (state.blockTo !== doc.length || doc.sliceString(doc.length - 1) === "\n") return;
  view.dispatch({
    changes: { from: doc.length, insert: "\n" },
    selection: { anchor: doc.length + 1 },
    userEvent: "frontmatter.normalize",
  });
}

/** Where the caret should start so it is never inside a hidden block. */
export function initialSelection(text: string, show: boolean): number {
  if (show) return 0;
  const found = findFrontmatter(text);
  return found ? Math.min(found.blockTo, text.length) : 0;
}

export function frontmatterVisibility(show: boolean, hint: string): Extension {
  return [initialShowFrontmatter.of(show), frontmatterHint.of(hint), frontmatterField, frontmatterGuard];
}
