// CDP screencast sink: saves every frame the browser pushes, with its timestamp,
// so build-video.sh can rebuild real dwell times. Works with obscura and Chromium.
import fs from "node:fs/promises";
import path from "node:path";

export async function startScreencast(context, page, dir, { maxWidth = 2880, maxHeight = 1800 } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames = [];
  let n = 0;
  let chain = Promise.resolve();
  cdp.on("Page.screencastFrame", (ev) => {
    n += 1;
    const file = `frame-${String(n).padStart(5, "0")}.jpg`;
    const t = ev.metadata?.timestamp ?? Date.now() / 1000;
    frames.push({ file, t });
    chain = chain.then(() => fs.writeFile(path.join(dir, file), Buffer.from(ev.data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth, maxHeight, everyNthFrame: 1 });
  return {
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await chain;
      await fs.writeFile(path.join(dir, "frames.json"), JSON.stringify(frames));
      return frames;
    },
  };
}
