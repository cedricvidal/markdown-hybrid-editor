/**
 * The M0 gate, automated: does a .md actually open in our custom editor, does the
 * webview load both bundles, and does it do so with no CSP violation?
 *
 * Run: pnpm demo:smoke
 */
import { launchCode, openFile, webviewFrame } from "./lib/launch.mjs";

const violations = [];
const consoleErrors = [];

function check(name, ok, detail = "") {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const session = await launchCode();
const { page } = session;
let failures = 0;

page.on("console", (msg) => {
  const text = msg.text();
  if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  else if (msg.type() === "error") consoleErrors.push(text);
});

try {
  await openFile(page, "welcome.md");

  // The custom editor renders into a webview; the plain text editor would not.
  const frame = await webviewFrame(page);
  failures += check("webview frame mounted", true) ? 0 : 1;

  await frame.waitForSelector(".mhe-raw", { timeout: 20_000 });
  const rendered = await frame.$eval(".mhe-raw", (el) => el.textContent ?? "");

  failures += check("document text reached the webview", rendered.includes("A note that reads like prose")) ? 0 : 1;
  failures += check("frontmatter delivered verbatim", rendered.startsWith("---\ntitle: Markdown Hybrid Editor")) ? 0 : 1;

  // Both bundles resolved through asWebviewUri: the stylesheet applied and the script ran.
  const styled = await frame.evaluate(() => {
    const el = document.querySelector(".mhe-raw");
    return el ? getComputedStyle(el).whiteSpace : null;
  });
  failures += check("webview.css applied", styled === "pre-wrap", `white-space=${styled}`) ? 0 : 1;

  const bg = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  failures += check("theme tokens resolve", bg !== "" && bg !== "rgba(0, 0, 0, 0)", `body bg=${bg}`) ? 0 : 1;

  // No innerHTML anywhere: the untrusted document must arrive as text nodes.
  const nodeShape = await frame.evaluate(() => {
    const el = document.querySelector(".mhe-raw");
    return { children: el.children.length, nodeType: el.firstChild?.nodeType };
  });
  failures += check("document rendered as a text node, not markup", nodeShape.children === 0 && nodeShape.nodeType === 3, JSON.stringify(nodeShape)) ? 0 : 1;

  await page.waitForTimeout(1000);
  failures += check("no CSP violations", violations.length === 0, violations.slice(0, 3).join(" | ")) ? 0 : 1;
  failures += check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ")) ? 0 : 1;
} catch (err) {
  console.error("smoke run threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nM0 gate: PASS" : `\nM0 gate: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
