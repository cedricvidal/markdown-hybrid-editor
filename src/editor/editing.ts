/**
 * The editing layer: selection drawing, bracket closing, the in-editor search
 * panel and a keymap.
 *
 * Deliberately no `history()`. VS Code owns the undo stack for a TextDocument,
 * and a second stack over the same text is the classic divergence bug. Cmd-Z is
 * forwarded by the webview to the workbench and returns as a document change
 * carrying reason Undo.
 */
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { search, searchKeymap } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { dropCursor, keymap, rectangularSelection } from "@codemirror/view";

/**
 * Bindings dropped from CodeMirror's defaults because the workbench also acts
 * on them — a webview does not swallow keystrokes, it forwards them, so a
 * collision fires twice.
 *
 * Mod-[ / Mod-] are VS Code's outdent/indent. Mod-Shift-K is Delete Line, which
 * CodeMirror would also run. Undo and redo are absent from defaultKeymap
 * already; they live in historyKeymap, which is not included.
 */
const WORKBENCH_OWNED = new Set(["Mod-[", "Mod-]", "Mod-Shift-k", "Mod-Enter"]);

const editingKeymap = defaultKeymap.filter((binding) => !binding.key || !WORKBENCH_OWNED.has(binding.key));

export function editingExtensions(): Extension[] {
  return [
    dropCursor(),
    rectangularSelection(),
    closeBrackets(),
    // Docked at the top so it reads like a panel rather than floating over text.
    search({ top: true }),
    keymap.of([...closeBracketsKeymap, ...editingKeymap, ...searchKeymap, indentWithTab]),
  ];
}
