import { syntaxHighlighting } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { editorTheme, hybridHighlight } from "./theme";

/**
 * Everything that makes a document *read* like a note: markdown with a YAML
 * frontmatter block, the syntax highlighting and the theme.
 *
 * Host-agnostic by construction — nothing under src/editor may import `vscode`
 * or reach into the webview, which is what keeps this layer unit-testable
 * against a bare EditorState.
 */
export function readingExtensions(): Extension[] {
  return [
    EditorView.lineWrapping,
    yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
    syntaxHighlighting(hybridHighlight),
    editorTheme,
  ];
}
