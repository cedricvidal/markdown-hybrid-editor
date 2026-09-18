import { syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { editorTheme, hybridHighlight } from "./theme";
import { livePreview, tables } from "./livePreview";
import { frontmatterVisibility } from "./frontmatterVisibility";

export interface ReadingOptions {
  livePreview: boolean;
  renderTables: boolean;
  showFrontmatter: boolean;
  /** Shown on the collapsed frontmatter strip, e.g. the real keybinding. */
  frontmatterHint: string;
}

/**
 * Everything that makes a document *read* like a note: markdown over a YAML
 * frontmatter block, the live preview, the highlight style and the theme.
 *
 * Host-agnostic by construction — nothing under src/editor imports `vscode` or
 * reaches into the webview, which is what keeps this layer testable against a
 * bare EditorState.
 */
export function readingExtensions(options: ReadingOptions): Extension[] {
  return [
    EditorView.lineWrapping,
    yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
    syntaxHighlighting(hybridHighlight),
    ...(options.livePreview ? [livePreview] : []),
    ...(options.renderTables ? tables : []),
    frontmatterVisibility(options.showFrontmatter, options.frontmatterHint),
    editorTheme,
  ];
}
