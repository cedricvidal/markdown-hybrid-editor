/**
 * Captures the stills the README is built from: clean, chrome-free, and
 * reproducible.
 *
 * This is not the walkthrough recorder. `record.mjs` burns in captions and
 * highlight rings, which is right for a video and wrong for a hero image —
 * so this file deliberately never imports lib/attention-cues.mjs, and asserts
 * that the toolkit is absent before it takes a frame.
 *
 * Like the gates, it proves what it photographs: a shot of "the marks come
 * back under the caret" is only taken after reading the rendered line and
 * confirming they did.
 *
 *   pnpm demo:hero          capture (drives a real VS Code, ~90s)
 *   pnpm demo:hero:check    verify the committed files, no VS Code
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { clickIntoEditor } from "./lib/editor.mjs";
import { launchCode, MOD, quickOpen, ROOT, runCommand, tidyForDemo } from "./lib/launch.mjs";

const mastersDir = path.join(ROOT, "demo/out/hero");
const outDir = path.join(ROOT, "docs/media");

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * What the README displays each file at. The master is captured at 2x and
 * resized to this, so the image is crisp on a HiDPI screen without shipping a
 * 2880px original.
 */
const DELIVERABLES = {
  "hero-dark.png": 840,
  "hero-light.png": 840,
  "caret-away.png": 400,
  "caret-on.png": 400,
  "tables.png": 840,
  "alerts.png": 840,
  "frontmatter.png": 840,
};
const BUDGET_BYTES = 260_000;
const TOTAL_BUDGET_BYTES = 1_400_000;

// ---------------------------------------------------------------- check mode

if (process.argv.includes("--check")) {
  let total = 0;
  for (const [name, width] of Object.entries(DELIVERABLES)) {
    const file = path.join(outDir, name);
    let stat = null;
    try {
      stat = await fs.stat(file);
    } catch {
      /* reported below */
    }
    if (!stat) {
      check(`${name} exists`, false, "run pnpm demo:hero");
      continue;
    }
    total += stat.size;
    const actual = Number(
      execFileSync("magick", ["identify", "-format", "%w", file], { encoding: "utf8" }),
    );
    check(`${name}`, actual === width && stat.size <= BUDGET_BYTES,
      `${actual}px, ${(stat.size / 1024).toFixed(0)}KB (want ${width}px, <=${BUDGET_BYTES / 1024}KB)`);
  }
  check("docs/media total size", total <= TOTAL_BUDGET_BYTES, `${(total / 1024).toFixed(0)}KB`);
  console.log(failures ? `\n${failures} check(s) failed` : "\nREADME assets ok");
  process.exit(failures ? 1 : 0);
}

// ------------------------------------------------------------- capture setup

/**
 * Seeded before launch. Anything that removes a part `launchCode` waits on —
 * the status bar, the tab strip — has to wait until after it returns, or the
 * wait times out and the launch throws.
 */
const PRE_LAUNCH = {
  "workbench.colorTheme": "Default Dark Modern",
  "workbench.activityBar.location": "hidden",
  "workbench.layoutControl.enabled": false,
  "window.customTitleBarVisibility": "never",
  "window.menuBarVisibility": "hidden",
  "breadcrumbs.enabled": false,
  "workbench.editor.decorations.badges": false,
  "workbench.editor.decorations.colors": false,
  // Pin our own settings, so a change of default never silently re-shoots
  // the README with a different look.
  "markdownHybridEditor.typography": "reading",
  "markdownHybridEditor.livePreview.enabled": true,
  "markdownHybridEditor.tables.render": true,
  "markdownHybridEditor.frontmatter.collapsedByDefault": true,
};

/** Applied once every file is open and the Explorer has done its job. */
const POST_LAUNCH = {
  "workbench.statusBar.visible": false,
  "workbench.editor.showTabs": "single",
  "workbench.editor.editorActionsLocation": "hidden",
};

/**
 * CodeMirror blinks the caret forever. Playwright's `animations: "disabled"`
 * rewinds an infinite animation to its first frame, which for cm-blink is
 * "visible" — but only inside the frame it was told about, and the webview is
 * recreated whenever a tab is reopened. Pinning it in CSS is cheaper than
 * reasoning about which document is current.
 */
const FREEZE_CSS = `
  .cm-cursorLayer, .cm-cursor { animation: none !important; }
  .cm-cursor { visibility: visible !important; }
  .cm-scroller::-webkit-scrollbar { display: none !important; }
`;

await fs.rm(mastersDir, { recursive: true, force: true });
await fs.mkdir(mastersDir, { recursive: true });
await fs.mkdir(outDir, { recursive: true });

// The hero note lives in demo/fixtures, not test/fixtures: it is marketing
// copy, and the gates' fixtures are shaped by what they need to assert.
const session = await launchCode({
  settings: PRE_LAUNCH,
  scale: 2,
  width: 1280,
  height: 640,
  background: !process.env.MHE_FOREGROUND,
});
const { page } = session;
await fs.cp(path.join(ROOT, "demo/fixtures/hero"), session.workspace, { recursive: true });

await tidyForDemo(page);

// Warm every file while the Explorer is still there, then strip the chrome.
for (const name of ["reading.md", "alerts.md", "kitchen-sink.md"]) {
  await page.click(`.explorer-folders-view .monaco-list-row:has-text("${name}")`);
  await page.waitForSelector(`.tabs-container .tab[aria-label^="${name}"]`, { timeout: 20_000 });
  await page.waitForTimeout(400);
}
await session.setSettings(POST_LAUNCH);
await runCommand(page, "View: Close Primary Side Bar");
await page.waitForTimeout(600);

// ------------------------------------------------------------------ helpers

async function frameFor(readySelector) {
  const frame = await session.refreshFrame();
  await frame.waitForSelector(readySelector, { timeout: 20_000 });
  await frame.addStyleTag({ content: FREEZE_CSS });
  await page.waitForTimeout(250);
  return frame;
}

/** Text of the rendered line containing `needle`. */
async function lineWith(frame, needle) {
  return frame.evaluate((n) => {
    const l = [...document.querySelectorAll(".cm-line")].find((x) => (x.textContent ?? "").includes(n));
    return l ? l.textContent : null;
  }, needle);
}

async function clickLine(frame, needle) {
  const handle = await frame.evaluateHandle((n) =>
    [...document.querySelectorAll(".cm-line")].find((x) => (x.textContent ?? "").includes(n)) ?? null, needle);
  const el = handle.asElement();
  if (!el) throw new Error(`no line containing ${needle}`);
  await el.click();
  await page.waitForTimeout(350);
}

async function boxOf(target, selector) {
  const box = await target.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  // Snap to whole device pixels: a clip on a half-pixel at scale 2 resamples
  // the serif body text and it goes soft.
  return {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.round(box.width / 2) * 2,
    height: Math.round(box.height / 2) * 2,
  };
}

/** The workbench must be free of chrome, and of the recorder's own overlays. */
async function assertClean(clip) {
  const collapsed = await page.evaluate((sels) =>
    sels.map((s) => {
      const el = document.querySelector(s);
      if (!el) return [s, true];
      const r = el.getBoundingClientRect();
      return [s, r.width === 0 || r.height === 0];
    }), [".part.sidebar", ".part.activitybar", ".part.auxiliarybar", ".part.statusbar"]);
  for (const [sel, ok] of collapsed) check(`${sel} collapsed`, ok);
  check("no breadcrumbs", (await page.$(".monaco-breadcrumbs")) === null);
  check("no toasts", (await page.$(".notifications-toasts .notification-toast")) === null);
  check("no attention cues", (await page.evaluate(() => typeof window.__demo)) === "undefined");

  const title = await page.evaluate(() => {
    const el = document.querySelector(".part.titlebar");
    return el ? el.getBoundingClientRect().bottom : 0;
  });
  check("title bar above the crop", title <= clip.y, `titlebar bottom ${title}, clip y ${clip.y}`);
}

async function shoot(name, clip) {
  // Park the pointer outside every crop so no hover state is painted.
  await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  const master = path.join(mastersDir, name.replace(".png", "-2x.png"));
  await page.screenshot({ path: master, clip, scale: "device", animations: "disabled" });

  const sd = Number(execFileSync("magick", ["identify", "-format", "%[standard-deviation]", master], { encoding: "utf8" }));
  check(`${name} is not blank`, sd > 300, `stddev ${sd.toFixed(0)}`);

  const width = DELIVERABLES[name];
  execFileSync("magick", [
    master,
    "-filter", "Lanczos", "-resize", `${width}x`,
    "-strip",
    "-alpha", "set",
    "(", "+clone", "-alpha", "extract", "-threshold", "-1", "-negate", "-fill", "white",
    "-draw", `roundrectangle 0,0 %[fx:w-1],%[fx:h-1] 10,10`, ")",
    "-compose", "CopyOpacity", "-composite",
    // One hairline, in a neutral grey that reads on GitHub's light and dark
    // page backgrounds alike. No matte and no drop shadow: the corners are
    // cut to transparency so the page colour shows through them.
    "(", "+clone", "-alpha", "transparent", "-fill", "none",
    "-stroke", "rgba(140,148,158,0.35)", "-strokewidth", "2",
    "-draw", `roundrectangle 1,1 %[fx:w-2],%[fx:h-2] 10,10`, ")",
    "-compose", "Over", "-composite",
    "-define", "png:compression-level=9",
    "-define", "png:exclude-chunk=time",
    path.join(outDir, name),
  ]);
  const { size } = await fs.stat(path.join(outDir, name));
  check(`${name} within budget`, size <= BUDGET_BYTES, `${(size / 1024).toFixed(0)}KB`);
}

async function resize(width, height) {
  await session.app.evaluate(({ BrowserWindow }, b) => {
    BrowserWindow.getAllWindows()[0]?.setBounds(b);
  }, { x: process.env.MHE_FOREGROUND ? 0 : -5000, y: 0, width, height });
  await page.waitForTimeout(700);
}

// -------------------------------------------------------------------- shots

const SENTENCE = "asterisks";
const AWAY = "Why hide anything at all";

// 1-2. The hero, and the before/after pair — all from the same note.
{
  await quickOpen(page, "reading.md");
  let frame = await frameFor(".cm-content");
  await clickIntoEditor(frame, page);
  await clickLine(frame, SENTENCE);

  const editorClip = await boxOf(page, ".part.editor");
  await assertClean(editorClip);
  check("editor is focused", (await frame.$(".cm-editor.cm-focused")) !== null);
  check("the caret line shows its marks", (await lineWith(frame, SENTENCE))?.includes("**asterisks**") === true);
  await shoot("hero-dark.png", editorClip);

  // The pair is tighter than the hero: the reading column plus a little gutter.
  const col = await boxOf(frame, ".cm-content");
  const webview = await boxOf(page, ".part.editor");
  const pairClip = {
    x: Math.max(webview.x, col.x - 48),
    y: Math.max(webview.y, col.y),
    width: Math.round(Math.min(col.width + 96, webview.width) / 2) * 2,
    height: Math.round(Math.min(360, webview.y + webview.height - col.y) / 2) * 2,
  };

  await clickLine(frame, AWAY);
  const awayText = await lineWith(frame, SENTENCE);
  check("marks hidden away from the caret", !awayText.includes("**"), awayText?.slice(0, 48));
  await shoot("caret-away.png", pairClip);

  await clickLine(frame, SENTENCE);
  const onText = await lineWith(frame, SENTENCE);
  check("marks return under the caret", onText.includes("**asterisks**"));
  check("and only on that line", !(await lineWith(frame, AWAY)).includes("#"));
  await shoot("caret-on.png", pairClip);
}

// 3. Alerts, at the taller window.
await resize(1280, 820);
{
  await quickOpen(page, "alerts.md");
  const frame = await frameFor(".cm-alert-title");
  await clickIntoEditor(frame, page);
  await frame.evaluate(() => document.querySelector(".cm-alert-title")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
  const clip = await boxOf(page, ".part.editor");
  await assertClean(clip);
  check("five alert kinds render", (await frame.$$(".cm-alert-title")).length >= 5);
  await shoot("alerts.png", clip);
}

// 4. Tables, and frontmatter, from the kitchen sink.
{
  await quickOpen(page, "kitchen-sink.md");
  let frame = await frameFor(".cm-table-widget");
  await clickIntoEditor(frame, page);
  await frame.evaluate(() => document.querySelector(".cm-table-widget")?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  const clip = await boxOf(page, ".part.editor");
  await assertClean(clip);
  check("a table is rendered", (await frame.$(".cm-table-widget")) !== null);
  await shoot("tables.png", clip);

  await page.keyboard.press(`${MOD}+Home`);
  await page.waitForTimeout(400);
  const strip = await frame.$("[data-demo=frontmatter-strip]");
  check("the frontmatter strip is there", strip !== null);
  if (strip) {
    await strip.click();
    await frame.waitForSelector(".cm-fm-key", { timeout: 10_000 });
    await page.waitForTimeout(400);
  }
  await clickLine(frame, "tags");
  check("the caret line shows its YAML", (await frame.$(".cm-fm-raw")) !== null);
  const fmClip = await boxOf(page, ".part.editor");
  await shoot("frontmatter.png", fmClip);
}

// 5. The light half of the pair — the same frame, the same caret, one setting.
await resize(1280, 640);
{
  await session.setSettings({ "workbench.colorTheme": "Default Light Modern" });
  await quickOpen(page, "reading.md");
  const frame = await frameFor(".cm-content");
  await frame.waitForFunction(() => document.body.classList.contains("vscode-light"), null, { timeout: 15_000 });
  await page.waitForTimeout(400);
  await clickIntoEditor(frame, page);
  await clickLine(frame, SENTENCE);
  const clip = await boxOf(page, ".part.editor");
  await assertClean(clip);
  check("the webview followed the theme", await frame.evaluate(() => document.body.classList.contains("vscode-light")));
  await shoot("hero-light.png", clip);
}

await session.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nREADME stills captured into docs/media");
process.exit(failures ? 1 : 0);
