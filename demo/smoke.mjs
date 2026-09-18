/**
 * Milestone gates, automated. Grows one block per milestone so every claim the
 * plan makes stays checkable from a cold start.
 *
 * Run: pnpm demo:smoke
 */
import { launchCode, openFile, webviewFrame } from "./lib/launch.mjs";

const violations = [];
const consoleErrors = [];
let failures = 0;

function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const session = await launchCode();
const { page } = session;

page.on("console", (msg) => {
  const text = msg.text();
  if (/Content Security Policy|Refused to|Trusted Type/i.test(text)) violations.push(text);
  else if (msg.type() === "error") consoleErrors.push(text);
});

try {
  console.log("\n— M0: custom editor and webview —");
  await openFile(page, "kitchen-sink.md");
  const frame = await webviewFrame(page);
  check("webview frame mounted", true);

  console.log("\n— M1: CodeMirror —");
  await frame.waitForSelector(".cm-editor .cm-content", { timeout: 20_000 });
  check("CodeMirror mounted", true);

  const text = await frame.$eval(".cm-content", (el) => el.textContent ?? "");
  // The frontmatter folds by default from M3 on, so its YAML is not rendered.
  check("document text present", text.includes("Heading one") && text.includes("Prose with"));

  // CodeMirror must own the scroller: if the body scrolls instead, viewport
  // virtualisation breaks and there is no scroll position to restore.
  const scroller = await frame.evaluate(() => {
    const s = document.querySelector(".cm-scroller");
    const body = document.body;
    return {
      scrollerOverflow: s ? getComputedStyle(s).overflowY : null,
      scrollerScrolls: s ? s.scrollHeight > s.clientHeight + 4 : false,
      bodyScrolls: body.scrollHeight > body.clientHeight + 4,
    };
  });
  check("CodeMirror owns the scroller", scroller.scrollerScrolls && !scroller.bodyScrolls, JSON.stringify(scroller));

  // The highlight style must actually resolve to a rendered size, which proves
  // both the stylesheet and the nonce'd runtime style module took effect.
  const h1 = await frame.evaluate(() => {
    const el = document.querySelector(".cm-h1");
    return el ? { size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight } : null;
  });
  check("heading scale applied", h1?.size === "30px" && h1.weight === "600", JSON.stringify(h1));

  const serif = await frame.evaluate(() => getComputedStyle(document.querySelector(".cm-content")).fontFamily);
  check("reading typography is serif", /serif/i.test(serif), serif.slice(0, 60));

  const measure = await frame.evaluate(() => getComputedStyle(document.querySelector(".cm-content")).maxWidth);
  check("reading measure capped", measure !== "none" && parseFloat(measure) > 100, measure);

  const nonced = await frame.evaluate(() => document.querySelectorAll("style[nonce]").length);
  check("CodeMirror stylesheets carry the CSP nonce", nonced > 0, `${nonced} nonced <style>`);

  console.log("\n— M1: theming —");
  const before = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await session.setSettings({ "workbench.colorTheme": "Default Light Modern" });
  const after = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("theme switch recolours with no reload", before !== after, `${before} -> ${after}`);

  const stillMounted = await frame.$(".cm-editor .cm-content");
  check("editor survived the theme switch", !!stillMounted);

  await session.setSettings({ "workbench.colorTheme": "Default High Contrast" });
  const hc = await frame.evaluate(() => ({
    cls: document.body.className,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  check("high contrast applies", /high-contrast/.test(hc.cls), JSON.stringify(hc));
  await session.setSettings({ "workbench.colorTheme": "Default Dark Modern" });

  console.log("\n— M1: typography setting —");
  await session.setSettings({ "markdownHybridEditor.typography": "vscode" });
  const vs = await frame.evaluate(() => {
    const el = document.querySelector(".cm-content");
    return {
      mode: document.documentElement.dataset.typography,
      family: getComputedStyle(el).fontFamily,
      maxWidth: getComputedStyle(el).maxWidth,
    };
  });
  check("vscode typography drops the serif", !/(^|,\s*)ui-serif/.test(vs.family), vs.family.slice(0, 50));
  check("vscode typography drops the measure", vs.maxWidth === "none", vs.maxWidth);
  check("mode reached the document element", vs.mode === "vscode", String(vs.mode));

  await session.setSettings({ "markdownHybridEditor.typography": "reading" });
  const back = await frame.evaluate(() => getComputedStyle(document.querySelector(".cm-content")).maxWidth);
  check("switching back restores the measure", back !== "none", back);

  await session.setSettings({ "markdownHybridEditor.readingMeasure": "50ch", "markdownHybridEditor.fontSize": 19 });
  const custom = await frame.evaluate(() => {
    const el = document.querySelector(".cm-content");
    return { maxWidth: getComputedStyle(el).maxWidth, size: getComputedStyle(el).fontSize };
  });
  check("custom measure and size apply live", parseFloat(custom.maxWidth) < 700 && custom.size === "19px", JSON.stringify(custom));
  await session.setSettings({ "markdownHybridEditor.readingMeasure": "68ch", "markdownHybridEditor.fontSize": null });

  await page.screenshot({ path: "demo/out/m1-reading.png" });

  console.log("\n— security —");
  await page.waitForTimeout(800);
  check("no CSP / Trusted Types violations", violations.length === 0, violations.slice(0, 3).join(" | "));
  check("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (err) {
  console.error("\nrun threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nGATES: PASS" : `\nGATES: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
