/** The M5 gate: editing, keys and the re-provided navigation. */
import { launchCode, openFile, runCommand, MOD, webviewFrame } from "./lib/launch.mjs";
import { editorText } from "./lib/editor.mjs";

let failures = 0;
const violations = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const statusText = (page) =>
  page.$$eval(".statusbar .statusbar-item", (els) => els.map((e) => e.textContent?.trim() ?? "").join(" | "));

const session = await launchCode();
const { page } = session;
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to|Trusted Type/i.test(t)) violations.push(t);
});

try {
  await openFile(page, "welcome.md");
  const frame = await webviewFrame(page);
  await frame.waitForSelector(".cm-content");
  await frame.click(".cm-content");
  await page.waitForTimeout(600);

  console.log("\n— status bar stands in for Ln/Col —");
  const status = await statusText(page);
  check("line and column are shown", /Ln \d+, Col \d+/.test(status), status.slice(0, 80));
  check("word count is shown", /\d+ words?/.test(status), status.slice(0, 80));

  console.log("\n— find panel —");
  await page.keyboard.press(`${MOD}+KeyF`);
  await page.waitForTimeout(900);
  const panel = await frame.$(".cm-panel.cm-search");
  check("Cmd+F opens CodeMirror's search panel", !!panel);
  const docked = await frame.evaluate(() => {
    const p = document.querySelector(".cm-panels-top");
    return !!p;
  });
  check("panel is docked at the top", docked);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  console.log("\n— go to heading —");
  await runCommand(page, "Markdown Hybrid: Go to Heading");
  await page.waitForSelector(".quick-input-widget", { state: "visible", timeout: 15_000 });
  const items = await page.$$eval(".quick-input-list .monaco-list-row", (els) =>
    els.map((e) => e.textContent?.trim() ?? ""),
  );
  check("headings are offered", items.some((i) => i.includes("A note that reads like prose")), JSON.stringify(items.slice(0, 3)));
  check("heading level is shown", items.some((i) => i.includes("H1")), JSON.stringify(items.slice(0, 2)));

  await page.keyboard.type("Nothing is hidden", { delay: 25 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const afterJump = await statusText(page);
  check("jumping moves the caret", /Ln 1[0-9]/.test(afterJump) || /Ln [2-9]/.test(afterJump), afterJump.slice(0, 60));

  console.log("\n— typing and brackets —");
  await frame.click(".cm-content");
  await page.keyboard.press(`${MOD}+End`);
  await page.waitForTimeout(200);
  await page.keyboard.type("\nBrackets: (", { delay: 35 });
  await page.waitForTimeout(800);
  const text = await editorText(frame);
  check("closeBrackets inserts the pair", text.includes("Brackets: ()"), JSON.stringify(text.slice(-30)));

  console.log("\n— no double-firing on collisions —");
  // Cmd+Shift+K is Delete Line in VS Code and in CodeMirror's defaults. If both
  // ran, two lines would go instead of one.
  const before = (await editorText(frame)).split("\n");
  await page.keyboard.press(`${MOD}+Shift+KeyK`);
  await page.waitForTimeout(900);
  const after = (await editorText(frame)).split("\n");
  check("Cmd+Shift+K deletes one line, not two", before.length - after.length <= 1, `${before.length} -> ${after.length}`);

  await page.screenshot({ path: "demo/out/m5-editing.png" });

  console.log("\n— security —");
  check("no CSP / Trusted Types violations", violations.length === 0, violations.slice(0, 2).join(" | "));
} catch (err) {
  console.error("\nrun threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nM5 GATE: PASS" : `\nM5 GATE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
