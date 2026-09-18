import { describe, expect, it } from "vitest";
import { headings, wordCount } from "../../src/editor/outline";

describe("headings", () => {
  it("finds ATX headings and their level", () => {
    expect(headings("# One\n\n### Three\n")).toEqual([
      { level: 1, text: "One", line: 0 },
      { level: 3, text: "Three", line: 2 },
    ]);
  });

  it("strips closing hashes", () => {
    expect(headings("## Two ##")[0]?.text).toBe("Two");
  });

  it("finds setext headings", () => {
    expect(headings("Title\n=====\n\nSub\n---\n")).toEqual([
      { level: 1, text: "Title", line: 0 },
      { level: 2, text: "Sub", line: 3 },
    ]);
  });

  it("ignores a heading inside a fenced block", () => {
    expect(headings("```\n# not a heading\n```\n\n# real\n")).toEqual([{ level: 1, text: "real", line: 4 }]);
  });

  it("does not mistake the frontmatter fence for a setext heading", () => {
    // The closing --- would otherwise make `tags: [x]` look like an H2.
    expect(headings("---\ntitle: A\ntags: [x]\n---\n\n# Real\n")).toEqual([
      { level: 1, text: "Real", line: 5 },
    ]);
  });

  it("needs a space after the hashes", () => {
    expect(headings("#hashtag\n")).toEqual([]);
  });

  it("ignores more than six hashes", () => {
    expect(headings("####### seven\n")).toEqual([]);
  });
});

describe("wordCount", () => {
  it("counts words, not markup characters", () => {
    // A, heading, Two, words — the # and the full stop are not words.
    expect(wordCount("# A heading\n\nTwo words.")).toBe(4);
  });

  it("treats a hyphenated word as one", () => {
    expect(wordCount("well-known")).toBe(1);
  });

  it("is zero for an empty document", () => {
    expect(wordCount("")).toBe(0);
  });

  it("counts non-latin scripts", () => {
    expect(wordCount("日本 語")).toBe(2);
  });
});
