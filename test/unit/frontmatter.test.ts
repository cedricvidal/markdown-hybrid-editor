import { describe, expect, it } from "vitest";
import { countKeys, findFrontmatter } from "../../src/editor/lib/frontmatter";

describe("findFrontmatter", () => {
  it("finds a normal block", () => {
    const doc = "---\ntitle: A\n---\n\nBody\n";
    const found = findFrontmatter(doc);
    expect(doc.slice(found!.yamlFrom, found!.yamlTo)).toBe("title: A\n");
    expect(doc.slice(found!.blockTo)).toBe("\nBody\n");
  });

  it("returns null when the file does not open with a fence", () => {
    expect(findFrontmatter("# Heading\n\n---\n")).toBeNull();
  });

  it("returns null when the block is never closed", () => {
    expect(findFrontmatter("---\ntitle: A\n")).toBeNull();
  });

  it("accepts a closing fence at EOF with no trailing newline", () => {
    const found = findFrontmatter("---\ntitle: A\n---");
    expect(found?.blockTo).toBe(16);
  });

  it("does not mistake a --- inside the body for the fence", () => {
    const doc = "---\ntitle: A\n---\n\nThen a rule:\n\n---\n";
    expect(findFrontmatter(doc)!.yaml).toBe("title: A\n");
  });

  it("handles CRLF", () => {
    const found = findFrontmatter("---\r\ntitle: A\r\n---\r\n\r\nBody");
    expect(found?.yaml).toBe("title: A\r\n");
  });

  it("returns null for an empty document", () => {
    expect(findFrontmatter("")).toBeNull();
  });
});

describe("countKeys", () => {
  it("counts top-level keys only", () => {
    expect(countKeys("title: A\ntags: [x]\nnested:\n  key: v\n  other: w\n")).toBe(3);
  });

  it("ignores list items and comments", () => {
    expect(countKeys("# a comment\n- item\ntitle: A\n")).toBe(1);
  });

  it("counts a key with no value", () => {
    expect(countKeys("title:\n")).toBe(1);
  });

  it("is zero for empty yaml", () => {
    expect(countKeys("")).toBe(0);
  });
});
