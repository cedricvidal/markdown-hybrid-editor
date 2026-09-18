/**
 * Launch VS Code as an Electron app with the extension under development,
 * against a throwaway profile and a temp copy of a fixture folder.
 *
 * The throwaway --user-data-dir matters beyond hygiene: it also resets
 * workbench.editorAssociations, so a stale per-file editor choice from a
 * previous run cannot silently open the wrong editor.
 */
import { _electron } from "playwright-core";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The Electron binary inside the app bundle. Named `Code` on macOS, not `Electron`. */
export function codeExecutable() {
  if (process.env.VSCODE_EXECUTABLE) return process.env.VSCODE_EXECUTABLE;
  if (process.platform === "darwin") return "/Applications/Visual Studio Code.app/Contents/MacOS/Code";
  if (process.platform === "win32") return "C:/Program Files/Microsoft VS Code/Code.exe";
  return "/usr/share/code/code";
}

export async function tempWorkspace(from = path.join(ROOT, "test/fixtures")) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mhe-ws-"));
  await fs.cp(from, dir, { recursive: true });
  return dir;
}

export async function launchCode({ workspace, scale = 2, width = 1440, height = 900 } = {}) {
  const ws = workspace ?? (await tempWorkspace());
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mhe-profile-"));
  const extensionsDir = await fs.mkdtemp(path.join(os.tmpdir(), "mhe-exts-"));

  const app = await _electron.launch({
    executablePath: codeExecutable(),
    args: [
      `--extensionDevelopmentPath=${ROOT}`,
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      "--disable-workspace-trust",
      "--skip-release-notes",
      "--skip-welcome",
      "--disable-updates",
      "--disable-telemetry",
      "--no-cached-data",
      `--force-device-scale-factor=${scale}`,
      ws,
    ],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VSCODE_DEV: undefined },
  });

  const page = await app.firstWindow();
  await page.waitForSelector(".monaco-workbench", { timeout: 60_000 });
  // The workbench paints before its keybindings are live; driving it any earlier
  // sends keystrokes into a window that silently drops them.
  await page.waitForSelector(".statusbar", { timeout: 60_000 });
  await page.waitForSelector(".explorer-folders-view .monaco-list-row", { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setBounds(bounds);
  }, { x: 0, y: 0, width, height });

  return {
    app,
    page,
    workspace: ws,
    async close() {
      await app.close().catch(() => {});
      for (const d of [userDataDir, extensionsDir, ws]) {
        await fs.rm(d, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

/**
 * Our editor lives two frames down: iframe.webview -> #active-frame. Rather than
 * assume that shape, find the frame that actually contains our root element.
 */
export async function webviewFrame(page, selector = "#root", timeout = 30_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const frame of page.frames()) {
      try {
        if (await frame.$(selector)) return frame;
      } catch {
        // frame detached mid-iteration; try the next one
      }
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`timed out waiting for a frame containing ${selector}`);
}

export const MOD = process.platform === "darwin" ? "Meta" : "Control";

/**
 * Open a workspace file from the Explorer, which is both more reliable than
 * Quick Open and more legible on camera. Readiness is the tab appearing, never
 * the disappearance of some widget.
 */
export async function openFile(page, name) {
  await page.click(`.explorer-folders-view .monaco-list-row:has-text("${name}")`);
  await page.waitForSelector(`.tabs-container .tab[aria-label^="${name}"]`, { timeout: 20_000 });
  await page.waitForTimeout(400);
}

/** Run a command by name through the palette, the way a user would. */
export async function runCommand(page, name) {
  await page.keyboard.press(`${MOD}+Shift+KeyP`);
  await page.waitForSelector(".quick-input-widget", { state: "visible", timeout: 15_000 });
  await page.keyboard.type(name, { delay: 25 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
}
