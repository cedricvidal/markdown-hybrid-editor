/** The M3 gate: live preview and the frontmatter strip. */
import { launchCode, openFile, runCommand, webviewFrame } from "./lib/launch.mjs";
import { editorText } from "./lib/editor.mjs";

let failures = 0;
const violations = [];
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Text of the line containing `needle`, as rendered. */
async function lineWith(frame, needle) {
  return frame.evaluate((n) => {
    const line = [...document.querySelectorAll(".cm-line")].find((l) => (l.textContent ?? "").includes(n));
    return line ? line.textContent : null;
  }, needle);
}

/** Put the caret on the line containing `needle` by clicking it. */
async function clickLine(frame, page, needle) {
  const handle = await frame.evaluateHandle((n) => {
    return [...document.querySelectorAll(".cm-line")].find((l) => (l.textContent ?? "").includes(n)) ?? null;
  }, needle);
  const el = handle.asElement();
  if (!el) throw new Error(`no line containing ${needle}`);
  await el.click();
  await page.waitForTimeout(350);
}

const session = await launchCode();
const { page } = session;
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to|Trusted Type/i.test(t)) violations.push(t);
});

try {
  await openFile(page, "kitchen-sink.md");
  const frame = await webviewFrame(page);
  await frame.waitForSelector(".cm-content");
  await page.waitForTimeout(800);

  console.log("\n— marks hide off the caret line —");
  check("heading marks hidden", (await lineWith(frame, "Heading two")) === "Heading two", JSON.stringify(await lineWith(frame, "Heading two")));

  const prose = await lineWith(frame, "Prose with");
  check("bold/italic/strike/code marks hidden", prose === "Prose with bold, emphasis, strikethrough and inline code on one line.", JSON.stringify(prose));

  console.log("\n— marks return on the caret line —");
  await clickLine(frame, page, "Heading two");
  check("heading marks return under the caret", (await lineWith(frame, "Heading two")) === "## Heading two", JSON.stringify(await lineWith(frame, "Heading two")));
  check("other lines stay clean", (await lineWith(frame, "Heading three")) === "Heading three");

  await clickLine(frame, page, "Prose with");
  const proseFocused = await lineWith(frame, "Prose with");
  check("emphasis marks return under the caret", proseFocused?.includes("**bold**") && proseFocused.includes("`inline code`"), JSON.stringify(proseFocused));

  console.log("\n— links —");
  const link = await lineWith(frame, "labelled link");
  check("link collapses to its text", link?.includes("labelled link") && !link.includes("https://example.com"), JSON.stringify(link));
  check("bare [label] with no URL is left alone", link?.includes("app[bot]"), JSON.stringify(link?.slice(0, 80)));
  check("wikilinks stay literal (out of scope)", (await editorText(frame)).includes("[[wikilink]]"));

  console.log("\n— block styling —");
  const quote = await frame.$(".cm-quote-line");
  check("blockquote lines are tagged", !!quote);
  const codeBlock = await frame.$(".cm-codeblock-line");
  check("fenced code lines are tagged", !!codeBlock);

  console.log("\n— frontmatter strip —");
  const strip = await frame.$("[data-demo=frontmatter-strip]");
  check("frontmatter is folded behind a strip", !!strip);
  const stripText = strip ? await strip.textContent() : "";
  // title, tags, draft, nested — the indented keys under `nested` do not count.
  check("strip counts top-level keys only", stripText?.includes("4 properties"), JSON.stringify(stripText));
  check("YAML is not rendered while folded", !(await editorText(frame)).includes("title: Kitchen Sink"));

  // The caret guard: Backspace at the very start of the body must not eat the block.
  await clickLine(frame, page, "Heading one");
  await page.keyboard.press("Home");
  await page.waitForTimeout(200);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(600);
  check("Backspace at the body start does not eat the block", !!(await frame.$("[data-demo=frontmatter-strip]")));

  // Arrow up from the first body line must not land inside the hidden block.
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  check("caret cannot enter the hidden block", !!(await frame.$("[data-demo=frontmatter-strip]")));

  console.log("\n— revealing —");
  await strip?.click();
  await page.waitForTimeout(1200);
  check("clicking the strip reveals the properties", (await editorText(frame)).includes("title: Kitchen Sink"));
  check("strip is gone once revealed", !(await frame.$("[data-demo=frontmatter-strip]")));
  check("properties are styled as a block", !!(await frame.$(".cm-fm-line")));

  // Frontmatter follows the same rule as the body: rendered away from the caret,
  // raw source on the line being edited.
  // Scoped to the frontmatter: the body has a horizontal rule that is also ---.
  const fenceText = await frame.$$eval(".cm-fm-line", (els) => els.map((e) => e.textContent ?? ""));
  check("the --- fences step aside", !fenceText.some((t) => t.trim() === "---"), JSON.stringify(fenceText.slice(0, 3)));
  check("keys and values are set apart", !!(await frame.$(".cm-fm-key")) && !!(await frame.$(".cm-fm-value")));

  // Nesting reads as nesting: one guide per level, drawn where the leading
  // spaces used to be.
  const depths = await frame.$$eval(".cm-fm-line", (els) =>
    els.map((e) => ({
      text: (e.textContent ?? "").trim(),
      depth: Number(e.style.getPropertyValue("--fm-depth") || 0),
      pad: parseFloat(getComputedStyle(e).paddingLeft),
    })),
  );
  const byText = (t) => depths.find((d) => d.text.startsWith(t));
  check("top-level properties sit at depth 0", byText("title:")?.depth === 0, JSON.stringify(byText("title:")));
  check("a nested key is one level in", byText("key:")?.depth === 1, JSON.stringify(byText("key:")));
  check("a nested list item is two levels in", byText("- one")?.depth === 2, JSON.stringify(byText("- one")));
  check("depth becomes real indentation", (byText("- one")?.pad ?? 0) > (byText("key:")?.pad ?? 0), `${byText("key:")?.pad}px vs ${byText("- one")?.pad}px`);
  check("leading spaces are not also rendered", byText("key:")?.text === "key: value", JSON.stringify(byText("key:")?.text));
  check("no line shows raw source yet", (await frame.$$(".cm-fm-raw")).length === 0);

  await clickLine(frame, page, "tags:");
  const rawCount = (await frame.$$(".cm-fm-raw")).length;
  check("clicking a property shows its YAML source", rawCount === 1, `${rawCount} raw line(s)`);
  const rawFont = await frame.evaluate(() => getComputedStyle(document.querySelector(".cm-fm-raw")).fontFamily);
  check("the source line reads as source", /mono|menlo|courier/i.test(rawFont), rawFont.slice(0, 30));

  await clickLine(frame, page, "Heading one");
  check("leaving the line renders it again", (await frame.$$(".cm-fm-raw")).length === 0);

  // The way to fold sits with the block it folds, not in the editor title bar.
  const fold = await frame.$("[data-demo=frontmatter-fold]");
  check("a fold control sits below the properties", !!fold);
  const titleActions = await page.$$eval(".editor-actions .action-label", (els) =>
    els.map((e) => e.getAttribute("aria-label") ?? ""),
  );
  check("nothing about frontmatter in the title bar", !titleActions.some((a) => /frontmatter/i.test(a)), JSON.stringify(titleActions[0]));
  await fold?.click();
  await page.waitForTimeout(1200);
  check("the fold control folds it", !!(await frame.$("[data-demo=frontmatter-strip]")));
  await frame.click("[data-demo=frontmatter-strip]");
  await page.waitForTimeout(1200);

  await runCommand(page, "Markdown Hybrid: Toggle Frontmatter");
  await page.waitForTimeout(1200);
  check("the toggle command folds it again", !!(await frame.$("[data-demo=frontmatter-strip]")));

  console.log("\n— live preview can be turned off —");
  await runCommand(page, "Markdown Hybrid: Toggle Live Preview");
  await page.waitForTimeout(1200);
  check("raw marks come back", (await lineWith(frame, "Heading two")) === "## Heading two", JSON.stringify(await lineWith(frame, "Heading two")));
  await runCommand(page, "Markdown Hybrid: Toggle Live Preview");
  await page.waitForTimeout(1000);

  await page.screenshot({ path: "demo/out/m3-live-preview.png" });

  console.log("\n— security —");
  check("no CSP / Trusted Types violations", violations.length === 0, violations.slice(0, 2).join(" | "));
} catch (err) {
  console.error("\nrun threw:", err);
  failures += 1;
} finally {
  await session.close();
}

console.log(failures === 0 ? "\nM3 GATE: PASS" : `\nM3 GATE: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
