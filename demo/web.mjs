/**
 * The web gate: the same extension running in vscode.dev's environment, where
 * the extension host is a Web Worker with no Node and the workspace is served
 * over a virtual file system.
 *
 * @vscode/test-web serves VS Code for the Web locally; Playwright drives it.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright-core";
import { ROOT } from "./lib/launch.mjs";

const PORT = 3111;
let failures = 0;
const violations = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const server = spawn(
  "pnpm",
  [
    "exec", "vscode-test-web",
    `--extensionDevelopmentPath=${ROOT}`,
    "--browserType=none",
    `--port=${PORT}`,
    // Mounted as a virtual workspace, which is the point: the extension reads
    // nothing from disk itself, so a memfs-backed folder works unchanged.
    path.join(ROOT, "test/fixtures"),
  ],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);

const ready = new Promise((resolve, reject) => {
  const onData = (buf) => {
    const text = buf.toString();
    if (text.includes("Listening on") || text.includes(`:${PORT}`)) resolve();
  };
  server.stdout.on("data", onData);
  server.stderr.on("data", onData);
  server.once("exit", (code) => reject(new Error(`vscode-test-web exited with ${code}`)));
  setTimeout(() => reject(new Error("vscode-test-web did not start in time")), 90_000);
});

let browser;
try {
  await ready;
  // @playwright/browser-chromium puts the browser where playwright-core looks.
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to|Trusted Type/i.test(t)) violations.push(t);
    if (process.env.MHE_VERBOSE && /markdown-hybrid|resync|applyEdit|error/i.test(t)) {
      console.log("   page>", t.slice(0, 220));
    }
  });
  page.on("pageerror", (e) => console.log("   pageerror>", String(e).slice(0, 220)));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector(".monaco-workbench", { timeout: 90_000 });
  await page.waitForSelector(".statusbar", { timeout: 60_000 });
  await page.waitForTimeout(4000);
  check("VS Code for the Web booted with the extension", true);

  await page.waitForSelector(".explorer-folders-view .monaco-list-row", { timeout: 60_000 });
  await page.click('.explorer-folders-view .monaco-list-row:has-text("welcome.md")');
  await page.waitForTimeout(3000);

  const frame = await (async () => {
    const end = Date.now() + 40_000;
    while (Date.now() < end) {
      for (const f of page.frames()) {
        try {
          if (await f.$("#root")) return f;
        } catch {
          // frame detached mid-iteration; try the next one
        }
      }
      await page.waitForTimeout(250);
    }
    return null;
  })();

  check("custom editor opened in the browser", !!frame);
  if (frame) {
    await frame.waitForSelector(".cm-content", { timeout: 30_000 });
    check("CodeMirror mounted in the web extension host", true);
    const nonced = await frame.evaluate(() => document.querySelectorAll("style[nonce]").length);
    check("CSP nonce works in web", nonced > 0, `${nonced} nonced <style>`);

    await frame.click(".cm-content");
    await page.keyboard.type("# Written in the browser", { delay: 30 });
    await page.waitForTimeout(1500);
    const text = await frame.evaluate(() =>
      [...document.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"),
    );
    check("typing works in web", text.includes("Written in the browser"), JSON.stringify(text.slice(0, 60)));

    // The strongest end-to-end proof, and one that does not depend on how a
    // given build renders the dirty indicator: reopen the same document in
    // VS Code's own text editor and look for the text typed in the webview.
    // The title-bar action renders as an icon: match the codicon our command
    // contributes ($(code) -> codicon-code) rather than a label.
    // The title-bar action renders as an icon, so match the codicon our command
    // contributes ($(code) -> codicon-code) rather than a label.
    await page.click(".editor-actions .action-label.codicon-code");
    await page.waitForSelector(".editor-instance .monaco-editor .view-lines", { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "demo/out/web-textditor.png" });
    // Monaco renders spaces as U+00A0, so a plain includes() never matches.
    const monacoText = await page.$$eval(".editor-instance .monaco-editor .view-line", (els) =>
      els.map((e) => (e.textContent ?? "").replace(/\u00a0/g, " ")).join("\n"),
    );
    check(
      "the edit is in the document, not just the view",
      monacoText.includes("Written in the browser"),
      JSON.stringify(monacoText.slice(0, 70)),
    );

    await page.screenshot({ path: "demo/out/web.png" });
  }

  check("no CSP violations in web", violations.length === 0, violations.slice(0, 2).join(" | "));
} catch (err) {
  console.error("\nweb run threw:", err);
  failures += 1;
} finally {
  await browser?.close().catch(() => {});
  server.kill("SIGTERM");
}

console.log(failures === 0 ? "\nWEB GATE: PASS" : `\nWEB GATE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
