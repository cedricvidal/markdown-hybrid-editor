import { Facet } from "@codemirror/state";

/**
 * The seams where the editor asks its host for something. Facets rather than
 * imports, so `src/editor` stays host-agnostic and unit-testable against a bare
 * EditorState.
 */

/** Ask the host to show or hide the frontmatter block. */
export const requestShowFrontmatter = Facet.define<(show: boolean) => void, (show: boolean) => void>({
  combine: (fns) => (show) => {
    for (const fn of fns) fn(show);
  },
});

/** Human-readable hint for the reveal affordance, e.g. the real keybinding. */
export const frontmatterHint = Facet.define<string, string>({
  combine: (values) => values[0] ?? "Show the frontmatter block",
});
