/**
 * The M2 gate: document synchronisation. The plan treats this as a hard gate —
 * everything downstream assumes VS Code can own the undo stack.
 */
import { launchCode, openFile, runCommand, MOD, webviewFrame } from "./lib/launch.mjs";
import { clickIntoEditor, editorText, isTabDirty, readWorkspaceFile, save, undo } from "./lib/editor.mjs";

let failures = 0;
const violations = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const session = await launchCode();
const { page } = session;
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to|Trusted Type/i.test(t)) violations.push(t);
});

try {
  console.log("\n— edits reach the document —");
  await openFile(page, "welcome.md");
  const frame = await webviewFrame(page);
  await frame.waitForSelector(".cm-content");
  await clickIntoEditor(frame, page);
  const original = await editorText(frame);

  // Put the caret at the very end, then type.
  await page.keyboard.press(`${MOD}+End`);
  await page.waitForTimeout(200);
  await page.keyboard.type("\nHello from the hybrid editor.", { delay: 30 });
  await page.waitForTimeout(900);

  check("tab goes dirty", await isTabDirty(page, "welcome.md"));

  const inView = await editorText(frame);
  check("text is in the view", inView?.includes("Hello from the hybrid editor."), "");

  await save(page);
  const onDisk = await readWorkspaceFile(session, "welcome.md");
  check("text reached disk on save", onDisk.includes("Hello from the hybrid editor."));
  check("tab is clean after save", !(await isTabDirty(page, "welcome.md")));

  console.log("\n— undo is owned by VS Code (the hard gate) —");
  // Typing is batched on a trailing debounce, so a burst is a handful of undo
  // steps, not one per keystroke. That granularity is the property worth
  // asserting — 29 characters must not cost 29 undos.
  let steps = 0;
  let afterUndo = await editorText(frame);
  while (afterUndo !== original && steps < 40) {
    await undo(page);
    afterUndo = await editorText(frame);
    steps++;
  }
  check("undo removes the typing", !afterUndo?.includes("Hello from the"), `${steps} step(s)`);
  check("undo granularity is per burst, not per keystroke", steps >= 1 && steps <= 8, `${steps} steps for 29 chars`);
  check("undo did not empty the document", (afterUndo ?? "").includes("A note that reads like prose"));
  check(
    "undo landed back on the original text",
    (afterUndo ?? "").trimEnd().endsWith("This is a *view*, not a format."),
    JSON.stringify((afterUndo ?? "").slice(-50)),
  );

  // Redo has the same granularity as undo, so it takes the same number of steps.
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(`${MOD}+Shift+KeyZ`);
    await page.waitForTimeout(350);
  }
  check("redo restores the typing", (await editorText(frame))?.includes("Hello from the hybrid editor."), "");
  for (let i = 0; i < steps; i++) await undo(page);

  console.log("\n— two views of one document —");
  await page.keyboard.press(`${MOD}+Backslash`);
  // The split opens a second webview. Keystrokes sent while it is still
  // initialising go nowhere, so wait for it to actually be live.
  await page.waitForFunction(
    () => document.querySelectorAll("iframe.webview").length >= 2,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(2500);
  // Turn the right-hand pane into a plain text editor.
  await runCommand(page, "Markdown Hybrid: Reopen in Text Editor");
  await page.waitForTimeout(2500);

  const monaco = await page.$(".monaco-editor .view-lines");
  check("right pane is a plain text editor", !!monaco);

  if (monaco) {
    await page.click(".monaco-editor .view-lines");
    await page.keyboard.press(`${MOD}+End`);
    await page.keyboard.type("\nTyped in the text editor.", { delay: 30 });
    await page.waitForTimeout(1200);

    const hybrid = await webviewFrame(page);
    const mirrored = await editorText(hybrid);
    check("text-editor typing mirrors into the hybrid view", mirrored?.includes("Typed in the text editor."), "");
  }

  console.log("\n— CRLF survives a round trip —");
  // The split is still open and its group is active, so a new file would land in
  // the plain text editor and the webview lookup would find the stale pane.
  // Save first: closing a dirty editor raises a modal that blocks everything.
  await runCommand(page, "File: Save All");
  await page.waitForTimeout(1200);
  await runCommand(page, "View: Close All Editors");
  await page.waitForTimeout(1800);
  await openFile(page, "crlf.md");
  const crlfFrame = await webviewFrame(page, ".cm-content");
  await crlfFrame.waitForSelector(".cm-content");
  await crlfFrame.click(".cm-content");
  await page.keyboard.press(`${MOD}+End`);
  await page.waitForTimeout(200);
  await page.keyboard.type("\nA line added on a CRLF document.", { delay: 30 });
  await page.waitForTimeout(900);
  await save(page);

  const crlfBytes = await readWorkspaceFile(session, "crlf.md");
  const loneLf = /(?<!\r)\n/.test(crlfBytes);
  check("added line is present", crlfBytes.includes("A line added on a CRLF document."));
  check("no lone LF introduced", !loneLf, loneLf ? JSON.stringify(crlfBytes.slice(-80)) : "all breaks are CRLF");
  check("no doubled CR", !/\r\r/.test(crlfBytes));

  console.log("\n— security —");
  check("no CSP / Trusted Types violations", violations.length === 0, violations.slice(0, 2).join(" | "));
} catch (err) {
  console.error("\nrun threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nM2 GATE: PASS" : `\nM2 GATE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
