import { describe, expect, it } from "vitest";
import { normaliseIn, normaliseOut } from "../../src/shared/eol";

// The CRLF boundary. The rest of positions.ts needs a real TextDocument and is
// covered end to end by demo/m2.mjs.

describe("normaliseOut (document -> webview)", () => {
  it("collapses CRLF to LF", () => {
    expect(normaliseOut("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("collapses a lone CR, as CodeMirror does", () => {
    expect(normaliseOut("a\rb")).toBe("a\nb");
  });

  it("leaves LF alone", () => {
    expect(normaliseOut("a\nb")).toBe("a\nb");
  });
});

describe("normaliseIn (webview -> document)", () => {
  it("expands LF to CRLF for a CRLF document", () => {
    expect(normaliseIn("a\nb", "\r\n")).toBe("a\r\nb");
  });

  it("does not double an existing CR", () => {
    expect(normaliseIn("a\r\nb", "\r\n")).toBe("a\r\nb");
  });

  it("collapses CRLF for an LF document", () => {
    expect(normaliseIn("a\r\nb", "\n")).toBe("a\nb");
  });

  it("round-trips through both directions", () => {
    for (const eol of ["\n", "\r\n"] as const) {
      const original = `one${eol}two${eol}three`;
      expect(normaliseIn(normaliseOut(original), eol)).toBe(original);
    }
  });
});
