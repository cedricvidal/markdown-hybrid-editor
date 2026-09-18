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

export async function launchCode({ workspace, scale = 2, width = 1440, height = 900, settings: extraSettings, background = false } = {}) {
  const ws = workspace ?? (await tempWorkspace());
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mhe-profile-"));
  const extensionsDir = await fs.mkdtemp(path.join(os.tmpdir(), "mhe-exts-"));

  // Seed the profile so the demo starts from a known look rather than whatever
  // the default happens to be this release.
  const settingsPath = path.join(userDataDir, "User", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const settings = {
    "workbench.colorTheme": "Default Dark Modern",
    "workbench.startupEditor": "none",
    "window.commandCenter": false,
    "workbench.activityBar.location": "default",
    "chat.commandCenter.enabled": false,
    "editor.fontSize": 14,
    // Keep the frame about the editor: no chat panel, no minimap, no toasts
    // from a sandbox that cannot resolve a shell.
    "workbench.secondarySideBar.defaultVisibility": "hidden",
    "chat.experimental.offerSetup": false,
    "workbench.editor.empty.hint": "hidden",
    "editor.minimap.enabled": false,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "extensions.ignoreRecommendations": true,
    "workbench.tips.enabled": false,
    "terminal.integrated.shellIntegration.enabled": false,
    ...(extraSettings ?? {}),
  };
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));

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

  /**
   * Park the window off-screen so a long recording does not sit in front of
   * whatever else is going on. The CDP screencast captures the renderer, not
   * the screen, so it keeps producing frames — and Playwright's input is
   * dispatched over CDP, so an unfocused window still receives every keystroke.
   */
  if (background) {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      win.setPosition(-5000, 0);
      win.showInactive();
    });
  }
  await page.waitForSelector(".monaco-workbench", { timeout: 60_000 });
  // The workbench paints before its keybindings are live; driving it any earlier
  // sends keystrokes into a window that silently drops them.
  await page.waitForSelector(".statusbar", { timeout: 60_000 });
  await page.waitForSelector(".explorer-folders-view .monaco-list-row", { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.setBounds(bounds);
  }, { x: background ? -5000 : 0, y: 0, width, height });

  return {
    app,
    page,
    workspace: ws,
    userDataDir,
    settingsPath,
    /** Re-find the webview frame after a tab has been closed and reopened. */
    async refreshFrame() {
      return webviewFrame(page, ".cm-content");
    },

    /**
     * VS Code watches settings.json, so writing it applies live — far more
     * reliable than driving the settings UI or a quick pick, and it exercises
     * exactly the onDidChangeConfiguration path the extension listens on.
     */
    async setSettings(patch) {
      Object.assign(settings, patch);
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      await page.waitForTimeout(1200);
    },
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


/**
 * Make the window presentable for a recording: close the chat panel and clear
 * any startup toast. Neither is worth a frame of a walkthrough.
 */
export async function tidyForDemo(page) {
  await runCommand(page, "Notifications: Clear All Notifications");
  await page.waitForTimeout(400);

  // VS Code keeps the part in the DOM and collapses it, so measure rather than
  // look for a class.
  const auxWidth = () =>
    page.evaluate(() => document.querySelector(".part.auxiliarybar")?.getBoundingClientRect().width ?? 0);
  if ((await auxWidth()) > 0) {
    await runCommand(page, "View: Toggle Secondary Side Bar Visibility");
    await page.waitForTimeout(800);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}
