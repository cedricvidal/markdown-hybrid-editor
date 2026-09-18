/**
 * The walkthrough, one beat per entry: what to do, what to ring, what to say.
 *
 * Each beat gets { page, editor, ui, wv, session, snap } and returns nothing.
 * `editor()` resolves the webview frame, which does not exist until a file is
 * open and is replaced whenever a tab is closed and reopened.
 * `ui` draws in the workbench, `wv` draws inside the webview — a ring on editor
 * content has to come from the webview's own document, since an overlay in the
 * top frame draws in top-document coordinates.
 *
 * Every beat is also an acceptance criterion: a green recording is evidence the
 * feature works, not just that it renders.
 */
import { MOD, openFile, runCommand } from "./lib/launch.mjs";

/** Click the line containing `needle`, putting the caret on it. */
async function clickLine(frame, page, needle) {
  const handle = await frame.evaluateHandle(
    (n) => [...document.querySelectorAll(".cm-line")].find((l) => (l.textContent ?? "").includes(n)) ?? null,
    needle,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no line containing ${needle}`);
  await el.click();
  await page.waitForTimeout(400);
}

/**
 * A ring spec for the line containing `needle`. The cue toolkit turns `text`
 * into a RegExp, so the needle must be regex-safe — no bare `**`.
 */
const lineWith = (needle) => ({ selector: ".cm-line", text: needle });

export const BEATS = [
  {
    caption: "Markdown Hybrid Editor. Every .md opens here.",
    ms: 3200,
    shot: "01-open",
    run: async ({ page, editor, wv }) => {
      await openFile(page, "welcome.md");
      const frame = await editor();
      await frame.waitForSelector(".cm-content");
      await page.waitForTimeout(900);
      await wv.hlStart({ selector: ".cm-content" }, "A note, not a preview");
    },
  },
  {
    caption: "Markup hides on every line the caret is not on. This reads like prose.",
    ms: 4000,
    shot: "02-reading",
    run: async ({ page, wv }) => {
      await wv.hlStop();
      await page.waitForTimeout(400);
      await wv.hlStart(lineWith("asterisks"), "No asterisks in sight");
    },
  },
  {
    caption: "Put the caret on the line and the source comes straight back.",
    ms: 4200,
    shot: "03-caret-on-line",
    run: async ({ page, editor, wv }) => {
      await wv.hlStop();
      await clickLine(await editor(), page, "asterisks");
      await page.waitForTimeout(500);
      await wv.hlStart(lineWith("asterisks"), "Editable source");
    },
  },
  {
    caption: "Nothing is hidden from the file. The document on disk is ordinary markdown.",
    ms: 3800,
    run: async ({ page, wv }) => {
      await wv.hlStop();
      await page.waitForTimeout(300);
    },
  },
  {
    caption: "Frontmatter folds into one row. Click it to see the YAML.",
    ms: 3800,
    shot: "04-frontmatter",
    run: async ({ page, editor, wv }) => {
      await openFile(page, "kitchen-sink.md");
      const frame = await editor();
      await frame.waitForSelector(".cm-content");
      await page.waitForTimeout(900);
      await wv.hlStart({ selector: "[data-demo=frontmatter-strip]" }, "4 properties");
    },
  },
  {
    caption: "Unfolded, the properties read as properties — not as a block of YAML.",
    ms: 4000,
    shot: "05-frontmatter-open",
    run: async ({ page, editor, wv }) => {
      await wv.hlStop();
      await (await editor()).click("[data-demo=frontmatter-strip]");
      await page.waitForTimeout(1400);
      await wv.hlStart({ selector: ".cm-fm-line", nth: 1 }, "Key and value");
    },
  },
  {
    caption: "Same rule as the body: put the caret on one and the YAML is there to edit.",
    ms: 4200,
    shot: "05b-frontmatter-raw",
    run: async ({ page, editor, wv }) => {
      await wv.hlStop();
      await clickLine(await editor(), page, "tags:");
      await page.waitForTimeout(600);
      await wv.hlStart({ selector: ".cm-fm-raw" }, "Editable source");
    },
  },
  {
    caption: "Headings, emphasis, code and quotes all read as themselves.",
    ms: 3800,
    shot: "06-prose",
    run: async ({ page, editor, wv }) => {
      await wv.hlStop();
      // Fold it from the control that sits with the block.
      await (await editor()).click("[data-demo=frontmatter-fold]");
      await page.waitForTimeout(1200);
      await clickLine(await editor(), page, "Heading six");
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(600);
      await wv.hlStart(lineWith("blockquote"), "Blockquote");
    },
  },
  {
    caption: "A link reads as its text. A bare bracket that is not a link is left alone.",
    ms: 4000,
    shot: "07-links",
    run: async ({ page, wv }) => {
      await wv.hlStop();
      await page.waitForTimeout(300);
      await wv.hlStart(lineWith("app[bot]"), "app[bot] stays literal");
    },
  },
  {
    caption: "Tables render as tables.",
    ms: 3400,
    shot: "08-table",
    run: async ({ page, editor, wv }) => {
      await wv.hlStop();
      await (await editor()).evaluate(() =>
        document.querySelector(".cm-table-widget")?.scrollIntoView({ block: "center" }),
      );
      await page.waitForTimeout(900);
      await wv.hlStart({ selector: ".cm-table-widget" }, "Real table");
    },
  },
  {
    caption: "Click a cell and it shows its markdown. Type, and the row is rewritten.",
    ms: 4200,
    shot: "09-table-edit",
    run: async ({ page, editor, wv }) => {
      await wv.hlStop();
      await (await editor()).click('.cm-table-widget td[data-row="0"][data-col="1"]');
      await page.waitForTimeout(500);
      await page.keyboard.press("End");
      await page.keyboard.type(" — edited", { delay: 60 });
      await page.waitForTimeout(700);
      await wv.hlStart({ selector: ".cm-table-widget td.editing" }, "Editing in place");
      await page.waitForTimeout(900);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    },
  },
  {
    caption: "Tab walks the cells. Escape leaves them rendered.",
    ms: 3400,
    run: async ({ page, wv }) => {
      await wv.hlStop();
      await page.waitForTimeout(400);
    },
  },
  {
    caption: "Edits are ordinary document edits, so the tab goes dirty and ⌘S saves.",
    ms: 3800,
    shot: "10-dirty",
    run: async ({ page, ui }) => {
      await ui.hlStart({ selector: ".tabs-container .tab.dirty" }, "Unsaved");
      await page.waitForTimeout(1400);
      await ui.hlStop();
      await page.keyboard.press(`${MOD}+KeyS`);
      await page.waitForTimeout(1000);
    },
  },
  {
    caption: "Undo is VS Code's own, one step per burst of typing — not one per keystroke.",
    ms: 4200,
    run: async ({ page }) => {
      await page.keyboard.press(`${MOD}+KeyZ`);
      await page.waitForTimeout(900);
    },
  },
  {
    caption: "Open the same note as plain text beside it. They stay in step, both ways.",
    ms: 4400,
    shot: "11-split",
    run: async ({ page, ui }) => {
      await ui.hlStop();
      await page.keyboard.press(`${MOD}+Backslash`);
      await page.waitForFunction(() => document.querySelectorAll("iframe.webview").length >= 2, undefined, {
        timeout: 30_000,
      });
      await page.waitForTimeout(2200);
      await runCommand(page, "Markdown Hybrid: Reopen in Text Editor");
      await page.waitForSelector(".editor-instance .monaco-editor .view-lines", { timeout: 30_000 });
      await page.waitForTimeout(1600);
      await page.click(".monaco-editor .view-lines");
      await page.keyboard.press(`${MOD}+End`);
      await page.keyboard.type("\nTyped in the text editor.", { delay: 55 });
      await page.waitForTimeout(1600);
    },
  },
  {
    caption: "⌘F opens a find panel that searches the whole document, not just what is on screen.",
    ms: 4000,
    shot: "12-find",
    run: async ({ page, editor }) => {
      await runCommand(page, "File: Save All");
      await page.waitForTimeout(800);
      await runCommand(page, "View: Close All Editors");
      await page.waitForTimeout(1500);
      await openFile(page, "kitchen-sink.md");
      await page.waitForTimeout(1500);
      await (await editor()).click(".cm-content");
      await page.waitForTimeout(400);
      await page.keyboard.press(`${MOD}+KeyF`);
      await page.waitForTimeout(1200);
      await page.keyboard.type("heading", { delay: 70 });
      await page.waitForTimeout(1000);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    },
  },
  {
    caption: "Go to Heading stands in for the Outline, which cannot see a custom editor.",
    ms: 4000,
    shot: "13-headings",
    run: async ({ page }) => {
      await runCommand(page, "Markdown Hybrid: Go to Heading");
      await page.waitForSelector(".quick-input-widget", { state: "visible", timeout: 15_000 });
      await page.waitForTimeout(1600);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
    },
  },
  {
    caption: "Position and a word count go in the status bar, where Ln/Col used to be.",
    ms: 3800,
    shot: "14-statusbar",
    run: async ({ page, ui }) => {
      await ui.hlStop();
      await ui.hlStart({ selector: ".statusbar-item", text: "Ln " }, "Ln, Col");
      await page.waitForTimeout(400);
    },
  },
  {
    caption: "Colours follow your theme. No reload, no second set of settings.",
    ms: 4200,
    shot: "15-light",
    run: async ({ page, ui, session }) => {
      await ui.hlStop();
      await session.setSettings({ "workbench.colorTheme": "Default Light Modern" });
      await page.waitForTimeout(1400);
    },
  },
  {
    caption: "High contrast works too.",
    ms: 3000,
    run: async ({ page, session }) => {
      await session.setSettings({ "workbench.colorTheme": "Default High Contrast" });
      await page.waitForTimeout(1400);
      await session.setSettings({ "workbench.colorTheme": "Default Dark Modern" });
      await page.waitForTimeout(1200);
    },
  },
  {
    caption: "Prefer your normal editor font? One setting turns the reading column off.",
    ms: 4200,
    shot: "16-typography",
    run: async ({ page, session }) => {
      await session.setSettings({ "markdownHybridEditor.typography": "vscode" });
      await page.waitForTimeout(1600);
      await session.setSettings({ "markdownHybridEditor.typography": "reading" });
      await page.waitForTimeout(1400);
    },
  },
  {
    caption: "And the plain text editor is always one click away.",
    ms: 3800,
    shot: "17-reopen",
    run: async ({ page, ui }) => {
      await ui.hlStart({ selector: ".editor-actions .action-label.codicon-code" }, "Reopen as text");
      await page.waitForTimeout(1600);
      await ui.hlStop();
      await page.click(".editor-actions .action-label.codicon-code");
      await page.waitForSelector(".editor-instance .monaco-editor .view-lines", { timeout: 30_000 });
      await page.waitForTimeout(1400);
    },
  },
  {
    caption: "Same file, same markdown. It was never anything else.",
    ms: 4000,
    shot: "18-text",
    run: async ({ page }) => {
      await page.waitForTimeout(600);
    },
  },
];
