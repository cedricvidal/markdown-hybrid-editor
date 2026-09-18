/**
 * Headings, for the Go to Heading pick. A custom editor is not a text editor,
 * so VS Code's own outline and Go to Symbol do not see this document; this is
 * the cheap replacement.
 */
import { findFrontmatter } from "./lib/frontmatter";

export interface Heading {
  level: number;
  text: string;
  /** Zero-based. */
  line: number;
}

const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const SETEXT = /^(=+|-+)\s*$/;

export function headings(text: string): Heading[] {
  const lines = text.split(/\r?\n/);
  const found: Heading[] = [];
  let inFence = false;

  // Skip the frontmatter block. Its closing `---` makes the last YAML line look
  // exactly like a setext H2, so scanning it would list `tags: [x]` as a heading.
  const block = findFrontmatter(text);
  const firstLine = block ? text.slice(0, block.blockTo).split(/\r?\n/).length - 1 : 0;

  for (let i = firstLine; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // A "# " inside a fenced block is code, not a heading.
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const atx = ATX.exec(line);
    if (atx) {
      found.push({ level: atx[1]!.length, text: atx[2] ?? "", line: i });
      continue;
    }

    const next = lines[i + 1];
    if (next && SETEXT.test(next) && line.trim() && !/^\s*$/.test(line)) {
      found.push({ level: next.startsWith("=") ? 1 : 2, text: line.trim(), line: i });
    }
  }
  return found;
}

/** Words, for the status bar. Counts prose, not markup. */
export function wordCount(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}
