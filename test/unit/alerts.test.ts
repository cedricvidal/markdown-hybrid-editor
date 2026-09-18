import { describe, expect, it } from "vitest";
import { ALERT_KINDS, alertKind, markerSpan } from "../../src/editor/alerts";

describe("alertKind", () => {
  it("recognises every kind GitHub defines", () => {
    for (const kind of ALERT_KINDS) {
      expect(alertKind(`> [!${kind.toUpperCase()}]`)).toBe(kind);
    }
  });

  it("accepts lower case, as GitHub does", () => {
    expect(alertKind("> [!note]")).toBe("note");
    expect(alertKind("> [!Warning]")).toBe("warning");
  });

  it("tolerates surrounding whitespace", () => {
    expect(alertKind("  >   [!TIP]   ")).toBe("tip");
  });

  it("works inside a nested quote", () => {
    expect(alertKind("> > [!CAUTION]")).toBe("caution");
  });

  it("rejects an unknown kind", () => {
    expect(alertKind("> [!HINT]")).toBeNull();
  });

  it("rejects a marker that is not alone on its line", () => {
    expect(alertKind("> [!NOTE] with trailing prose")).toBeNull();
    expect(alertKind("> prose then [!NOTE]")).toBeNull();
  });

  it("rejects a marker outside a blockquote", () => {
    expect(alertKind("[!NOTE]")).toBeNull();
  });

  it("rejects a plain blockquote", () => {
    expect(alertKind("> Just a quote.")).toBeNull();
  });
});

describe("markerSpan", () => {
  it("locates the marker within the line", () => {
    const line = "> [!NOTE]";
    const span = markerSpan(line)!;
    expect(line.slice(span.from, span.to)).toBe("[!NOTE]");
  });

  it("locates it past a nested quote marker", () => {
    const line = ">  >  [!WARNING]";
    const span = markerSpan(line)!;
    expect(line.slice(span.from, span.to)).toBe("[!WARNING]");
  });

  it("returns null when there is no marker", () => {
    expect(markerSpan("> plain")).toBeNull();
  });
});
