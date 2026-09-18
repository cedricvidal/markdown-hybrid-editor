import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * Editor chrome. Every colour is a `var(--token)` reference and the tokens are
 * aliases of VS Code's own theme variables, so switching theme recolours the
 * editor with no reload and no event handling.
 *
 * Two deliberate departures from the desktop original, which lived inside a
 * wrapper that did its own scrolling: here CodeMirror must own the scroller, or
 * the webview body scrolls, viewport virtualisation stops working and there is
 * no scroll position to restore.
 */
export const editorTheme = EditorView.theme({
  "&": {
    fontFamily: "var(--font-serif)",
    fontSize: "var(--editor-size)",
    color: "var(--text)",
    backgroundColor: "transparent",
    height: "100%",
  },
  ".cm-scroller": {
    lineHeight: "var(--editor-line)",
    fontFamily: "inherit",
    overflow: "auto",
  },
  ".cm-content": {
    maxWidth: "var(--editor-measure)",
    width: "100%",
    margin: "0 auto",
    // A generous tail so the last line can sit mid-screen, but not the 40vh of a
    // full window: in a panel that large a gap reads as a bug.
    padding: "4px 40px 30vh",
    caretColor: "var(--vscode-editorCursor-foreground, var(--accent))",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--vscode-editorCursor-foreground, var(--accent))",
    borderLeftWidth: "2px",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--vscode-editor-selectionBackground)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
  },
  ".cm-panels": {
    backgroundColor: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-editorWidget-foreground, var(--text))",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--ui-size)",
    position: "sticky",
    top: "0",
    zIndex: "5",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--vscode-editorWidget-border, var(--line))" },
  ".cm-panel.cm-search": { padding: "8px 12px" },
  ".cm-textfield": {
    background: "var(--vscode-input-background)",
    border: "1px solid var(--vscode-input-border, var(--line))",
    borderRadius: "var(--radius)",
    color: "var(--vscode-input-foreground, var(--text))",
    padding: "3px 8px",
  },
  ".cm-button": {
    background: "var(--vscode-button-secondaryBackground)",
    border: "1px solid var(--vscode-input-border, var(--line))",
    borderRadius: "var(--radius)",
    color: "var(--vscode-button-secondaryForeground, var(--text))",
    backgroundImage: "none",
    padding: "3px 10px",
  },
  ".cm-button:hover": { background: "var(--vscode-button-secondaryHoverBackground)" },
  ".cm-searchMatch": { backgroundColor: "var(--vscode-editor-findMatchHighlightBackground)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--vscode-editor-findMatchBackground)" },
  ".cm-tooltip": {
    background: "var(--vscode-editorWidget-background)",
    border: "1px solid var(--vscode-editorWidget-border, var(--line))",
    borderRadius: "var(--radius-pop)",
    boxShadow: "var(--shadow-pop)",
    fontFamily: "var(--font-ui)",
    fontSize: "var(--ui-size)",
    color: "var(--vscode-editorWidget-foreground, var(--text))",
    overflow: "hidden",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-ui)", maxHeight: "260px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "5px 12px", lineHeight: "1.4" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    background: "var(--vscode-list-activeSelectionBackground)",
    color: "var(--vscode-list-activeSelectionForeground)",
  },
  ".cm-completionDetail": { color: "var(--muted)", fontStyle: "normal", marginLeft: "10px" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)" },
});

/** Semantic styling: true weights, serif headings, mono code, muted marks. */
export const hybridHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: "cm-h1" },
  { tag: tags.heading2, class: "cm-h2" },
  { tag: tags.heading3, class: "cm-h3" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], class: "cm-h4" },
  { tag: tags.strong, fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", opacity: "0.7" },
  { tag: tags.monospace, class: "cm-code" },
  { tag: tags.quote, class: "cm-quote" },
  { tag: tags.url, color: "var(--muted)" },
  { tag: tags.processingInstruction, color: "var(--muted)" },
  { tag: tags.labelName, color: "var(--muted)" },
  { tag: tags.contentSeparator, color: "var(--line)" },
  { tag: tags.escape, color: "var(--muted)" },
  // YAML inside the frontmatter block
  { tag: tags.propertyName, color: "var(--muted)" },
  { tag: tags.string, color: "var(--text)" },
  { tag: tags.number, color: "var(--text)" },
  { tag: tags.bool, color: "var(--text)" },
  { tag: tags.keyword, color: "var(--text)" },
  { tag: tags.punctuation, color: "var(--muted)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
]);
