/** The M4 gate: tables render, and edit in place. */
import { launchCode, openFile, runCommand, webviewFrame } from "./lib/launch.mjs";
import { editorText } from "./lib/editor.mjs";

let failures = 0;
const violations = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const session = await launchCode();
const { page } = session;
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to|Trusted Type/i.test(t)) violations.push(t);
});

try {
  await openFile(page, "kitchen-sink.md");
  const frame = await webviewFrame(page);
  await frame.waitForSelector(".cm-content");
  await page.waitForTimeout(1000);

  console.log("\n— rendered as a real table —");
  const table = await frame.$(".cm-table-widget table");
  check("table is rendered", !!table);

  const shape = await frame.evaluate(() => {
    const t = document.querySelector(".cm-table-widget table");
    if (!t) return null;
    return {
      headers: [...t.querySelectorAll("th")].map((h) => h.textContent),
      rows: [...t.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((d) => d.textContent)),
      aligns: [...t.querySelectorAll("th")].map((h) => h.style.textAlign),
    };
  });
  check("header cells parsed", JSON.stringify(shape?.headers) === JSON.stringify(["Left", "Centre", "Right", "Prose"]), JSON.stringify(shape?.headers));
  check("alignment row honoured", JSON.stringify(shape?.aligns) === JSON.stringify(["left", "center", "right", "left"]), JSON.stringify(shape?.aligns));

  console.log("   rows:", JSON.stringify(shape?.rows));
  // Row 1 carries the awkward cells: inline code containing a pipe, and an
  // escaped pipe. Both must stay inside one cell rather than splitting it.
  const tricky = shape?.rows?.[1];
  check("row with pipes still has four cells", tricky?.length === 4, JSON.stringify(tricky));
  check("escaped pipe is displayed unescaped", tricky?.[2] === "x | y", JSON.stringify(tricky?.[2]));
  check("markdown source is not shown in cells", !(await editorText(frame)).includes("| :--- |"));

  console.log("\n— editing a cell in place —");
  await frame.click('.cm-table-widget td[data-row="0"][data-col="1"]');
  await page.waitForTimeout(400);
  const editing = await frame.$(".cm-table-widget td.editing");
  check("focused cell shows its raw source", !!editing);

  await page.keyboard.press("End");
  await page.keyboard.type(" EDITED", { delay: 35 });
  await page.waitForTimeout(1200);

  const cellNow = await frame.evaluate(
    () => document.querySelector('.cm-table-widget td[data-row="0"][data-col="1"]')?.textContent,
  );
  check("typing lands in the cell", cellNow?.includes("EDITED"), JSON.stringify(cellNow));

  console.log("\n— Tab moves between cells —");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(400);
  const focused = await frame.evaluate(() => {
    const el = document.activeElement;
    return el ? { row: el.getAttribute("data-row"), col: el.getAttribute("data-col") } : null;
  });
  check("Tab moves to the next cell", focused?.row === "0" && focused?.col === "2", JSON.stringify(focused));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  check("Escape leaves the cell rendered again", !(await frame.$(".cm-table-widget td.editing")));

  console.log("\n— the edit reached the document —");
  await runCommand(page, "File: Save All");
  await page.waitForTimeout(1200);
  const { readFile } = await import("node:fs/promises");
  const onDisk = await readFile(`${session.workspace}/kitchen-sink.md`, "utf8");
  const row = onDisk.split("\n").find((l) => l.includes("EDITED"));
  check("row was rewritten in the document", !!row, JSON.stringify(row));
  check("row kept its pipe structure", (row?.match(/(?<!\\)\|/g) ?? []).length === 5, `${(row?.match(/(?<!\\)\|/g) ?? []).length} unescaped pipes`);
  check("escaped pipe stayed escaped on disk", onDisk.includes("x \\| y"));

  console.log("\n— tables can be turned off —");
  await session.setSettings({ "markdownHybridEditor.tables.render": false });
  await page.waitForTimeout(1200);
  check("table renders as markdown again", !(await frame.$(".cm-table-widget")));
  check("markdown source is visible", (await editorText(frame)).includes("| :--- |"));
  await session.setSettings({ "markdownHybridEditor.tables.render": true });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "demo/out/m4-tables.png" });

  console.log("\n— security —");
  check("no CSP / Trusted Types violations", violations.length === 0, violations.slice(0, 2).join(" | "));
} catch (err) {
  console.error("\nrun threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nM4 GATE: PASS" : `\nM4 GATE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
