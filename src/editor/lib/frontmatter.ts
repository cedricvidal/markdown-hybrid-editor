/**
 * Locate the YAML frontmatter block in a document. The file must open with a
 * `---` line and a closing `---` line must follow.
 */
export interface FrontmatterRange {
  /** Start of the YAML text, just after the opening fence line. */
  yamlFrom: number;
  /** End of the YAML text, at the start of the closing fence line. */
  yamlTo: number;
  /** End of the whole block, including the closing fence and its newline. */
  blockTo: number;
  yaml: string;
}

const FENCE = /^---[ \t]*\r?\n/;

export function findFrontmatter(doc: string): FrontmatterRange | null {
  const open = FENCE.exec(doc);
  if (!open || open.index !== 0) return null;
  const yamlFrom = open[0].length;
  const closing = /^---[ \t]*(\r?\n|$)/m;
  let idx = yamlFrom;
  while (idx <= doc.length) {
    const rest = doc.slice(idx);
    const m = closing.exec(rest);
    if (!m) return null;
    const at = idx + m.index;
    // Only accept a fence that begins a line.
    if (at === 0 || doc[at - 1] === "\n") {
      return { yamlFrom, yamlTo: at, blockTo: at + m[0].length, yaml: doc.slice(yamlFrom, at) };
    }
    idx = at + 1;
  }
  return null;
}

/** Top-level keys only: no indentation, not a list item, not a comment. */
const KEY_LINE = /^[^\s#-][^:]*:(\s|$)/;

export function countKeys(yaml: string): number {
  let n = 0;
  for (const line of yaml.split("\n")) if (KEY_LINE.test(line)) n++;
  return n;
}
