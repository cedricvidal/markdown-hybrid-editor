/**
 * Records the walkthrough: launches VS Code with the extension, runs every beat
 * with captions and highlight rings burned in, and writes the frames plus a
 * screenshot per beat.
 *
 * Frames come from the CDP screencast rather than Playwright's recordVideo,
 * which is not supported for Electron. The screencast is activity-driven — a
 * frame only when something repaints — so build-video.sh reconstructs dwell
 * time from the frame timestamps.
 *
 *   pnpm demo:record && pnpm demo:video
 */
import fs from "node:fs/promises";
import path from "node:path";
import { BEATS } from "./beats.mjs";
import { cues, cuesIn, installInFrame, installInPage } from "./lib/attention-cues.mjs";
import { launchCode, ROOT, tidyForDemo, webviewFrame } from "./lib/launch.mjs";
import { startScreencast } from "./lib/screencast.mjs";

const framesDir = path.join(ROOT, "demo/frames");
const outDir = path.join(ROOT, "demo/out");

const THEME = {
  accent: "rgba(90,160,255,0.95)",
  accentSolid: "rgba(90,160,255,0.97)",
  accentText: "#05101f",
  scrim: 0.2,
};

await fs.rm(framesDir, { recursive: true, force: true });
await fs.mkdir(framesDir, { recursive: true });
await fs.mkdir(outDir, { recursive: true });
for (const file of await fs.readdir(outDir)) {
  if (/^\d\d-.*\.png$/.test(file)) await fs.rm(path.join(outDir, file));
}

// Recorded off-screen: a three-minute run should not sit in front of whatever
// else is happening. Set MHE_FOREGROUND=1 to watch it live while debugging beats.
const session = await launchCode({
  scale: 2,
  width: 1440,
  height: 900,
  background: !process.env.MHE_FOREGROUND,
});
const { page } = session;

// The toolkit has to live in both documents: the workbench draws captions and
// rings on VS Code's own chrome, while a ring on editor content must come from
// the webview's own document, since a fixed overlay in the top frame draws in
// top-frame coordinates and cannot reach inside an iframe.
await tidyForDemo(page);
await installInPage(page, THEME);

const ui = cues(page);

/**
 * The webview does not exist until a file is open, and a new one is created
 * whenever a tab is closed and reopened — so resolve it on demand and reinstall
 * the toolkit each time, rather than holding a handle that goes stale.
 */
let frame = null;
let wv = null;

async function editor() {
  if (frame && !frame.isDetached()) {
    try {
      if (await frame.$(".cm-content")) return frame;
    } catch {
      // detached between the check and the query
    }
  }
  frame = await webviewFrame(page, ".cm-content");
  await installInFrame(frame, THEME);
  wv = cuesIn(frame, page);
  return frame;
}

/** Cue calls resolve the frame first, so a beat never has to think about it. */
const lazyWv = {
  hlStart: async (...args) => {
    await editor();
    return wv.hlStart(...args);
  },
  hlStop: async () => {
    if (!wv) return;
    try {
      await wv.hlStop();
    } catch {
      // the frame went away; nothing to clear
    }
  },
  scrollTo: async (...args) => {
    await editor();
    return wv.scrollTo(...args);
  },
};

const snap = (name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

await page.waitForTimeout(900);
const cast = await startScreencast(session.app.context(), page, framesDir);

try {
  for (let i = 0; i < BEATS.length; i++) {
    const beat = BEATS[i];
    console.log(`▶ beat ${i + 1}/${BEATS.length} — ${beat.caption}`);
    await beat.run({ page, editor, ui, wv: lazyWv, session, snap });
    // Caption after the action, so the ring is already up when it is read.
    await ui.caption(beat.caption, beat.ms);
    if (beat.shot) {
      await ui.hideCaption();
      await snap(beat.shot);
    }
  }
  await lazyWv.hlStop();
  await ui.hlStop();
  await ui.hideCaption();
  await page.waitForTimeout(1400);
} catch (err) {
  console.error("recording threw:", err);
  process.exitCode = 1;
} finally {
  const frames = await cast.stop();
  console.log(`\n${frames.length} frames -> ${framesDir}`);
  await session.close();
}

console.log("now run: pnpm demo:video");
