import { describe, expect, it } from "vitest";
import { parseTable, renderInline, rowLine, splitRow } from "../../src/editor/tableWidget";

describe("splitRow", () => {
  it("splits a plain row and trims", () => {
    expect(splitRow("| a | b | c |")).toEqual(["a", "b", "c"]);
  });

  it("keeps an escaped pipe inside a cell", () => {
    expect(splitRow("| x \\| y | z |")).toEqual(["x \\| y", "z"]);
  });

  it("ignores pipes inside inline code", () => {
    expect(splitRow("| `a|b` | c |")).toEqual(["`a|b`", "c"]);
  });

  it("handles rows without leading or trailing pipes", () => {
    expect(splitRow("a | b")).toEqual(["a", "b"]);
  });

  it("keeps empty cells", () => {
    expect(splitRow("|  | b |")).toEqual(["", "b"]);
  });
});

describe("parseTable", () => {
  const source = ["| Left | Centre | Right |", "| :--- | :----: | ----: |", "| a | b | c |"].join("\n");

  it("reads the header and alignment row", () => {
    const model = parseTable(source);
    expect(model.header).toEqual(["Left", "Centre", "Right"]);
    expect(model.aligns).toEqual(["left", "center", "right"]);
    expect(model.rows).toEqual([["a", "b", "c"]]);
  });

  it("pads a short row to the header width", () => {
    const model = parseTable(`${source}\n| only |`);
    expect(model.rows[1]).toEqual(["only", "", ""]);
  });

  it("truncates a row wider than the header", () => {
    const model = parseTable(`${source}\n| a | b | c | d |`);
    expect(model.rows[1]).toEqual(["a", "b", "c"]);
  });

  it("survives a table with no body rows", () => {
    const model = parseTable("| a |\n| --- |");
    expect(model.rows).toEqual([]);
  });
});

describe("rowLine", () => {
  it("round-trips a parsed row", () => {
    expect(rowLine(["a", "b"])).toBe("| a | b |");
  });

  it("re-escapes a bare pipe but leaves an escaped one alone", () => {
    expect(rowLine(["x | y"])).toBe("| x \\| y |");
    expect(rowLine(["x \\| y"])).toBe("| x \\| y |");
  });

  it("flattens newlines, since a row is one line", () => {
    expect(rowLine(["a\nb"])).toBe("| a b |");
  });
});

describe("renderInline", () => {
  const render = (text: string) => {
    const el = document.createElement("td");
    renderInline(text, el);
    return el;
  };

  it("builds DOM nodes rather than markup", () => {
    const el = render("**bold** and `code`");
    expect(el.querySelector("strong")?.textContent).toBe("bold");
    expect(el.querySelector("code")?.textContent).toBe("code");
  });

  it("nests emphasis", () => {
    const el = render("**bold with `code`**");
    expect(el.querySelector("strong code")?.textContent).toBe("code");
  });

  it("renders a link as its text only", () => {
    const el = render("[label](https://example.com)");
    const link = el.querySelector(".cm-mdlink");
    expect(link?.textContent).toBe("label");
    expect(el.textContent).not.toContain("https://example.com");
  });

  it("leaves a wikilink literal, since wikilinks are out of scope", () => {
    expect(render("[[note]]").textContent).toBe("[[note]]");
  });

  it("unescapes a pipe for display", () => {
    expect(render("x \\| y").textContent).toBe("x | y");
  });

  it("unescapes a pipe inside a code span too", () => {
    expect(render("`a\\|b`").querySelector("code")?.textContent).toBe("a|b");
  });

  // The property that keeps a hostile cell inert.
  it("never interprets markup as HTML", () => {
    const el = render("<script>alert(1)</script> <img onerror=x>");
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders a hostile link target as text, not an anchor", () => {
    const el = render("[click](javascript:alert(1))");
    expect(el.querySelector("a")).toBeNull();
  });
});
