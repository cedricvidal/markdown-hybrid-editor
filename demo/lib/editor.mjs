/** Helpers for driving the hybrid editor inside its webview frame. */
import { MOD } from "./launch.mjs";
import fs from "node:fs/promises";

export async function clickIntoEditor(frame, page) {
  await frame.click(".cm-content");
  await page.waitForTimeout(250);
}

/**
 * The rendered text, read from the .cm-line divs. CodeMirror only renders the
 * viewport, which is fine for the fixtures but would need a scroll for a long
 * document — worth remembering before reusing this on big.md.
 */
export async function editorText(frame) {
  return frame.evaluate(() =>
    [...document.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"),
  );
}

export async function isTabDirty(page, name) {
  return page.$$eval(
    `.tabs-container .tab[aria-label^="${name}"]`,
    (els) => els.some((e) => e.className.includes("dirty")),
  );
}

export async function readWorkspaceFile(session, name) {
  return fs.readFile(`${session.workspace}/${name}`, "utf8");
}

export async function save(page) {
  await page.keyboard.press(`${MOD}+KeyS`);
  await page.waitForTimeout(900);
}

export async function undo(page) {
  await page.keyboard.press(`${MOD}+KeyZ`);
  await page.waitForTimeout(700);
}
