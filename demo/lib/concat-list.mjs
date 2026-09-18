// Write an ffmpeg concat list from frames.json: each frame is held until the next one.
import fs from "node:fs";
const dir = process.argv[2];
const frames = JSON.parse(fs.readFileSync(`${dir}/frames.json`, "utf8"));
const lines = [];
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? Math.max(0.02, frames[i + 1].t - frames[i].t) : 1.5;
  lines.push(`file '${frames[i].file}'`, `duration ${d.toFixed(3)}`);
}
lines.push(`file '${frames[frames.length - 1].file}'`);
fs.writeFileSync(`${dir}/list.txt`, lines.join("\n") + "\n");
console.log(`${frames.length} frames, ${(frames[frames.length - 1].t - frames[0].t + 1.5).toFixed(1)} s`);
