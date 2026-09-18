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

  console.log("\n— GitHub alerts —");
  await runCommand(page, "View: Close All Editors");
  await page.waitForTimeout(1200);
  await openFile(page, "alerts.md");
  const alerts = await webviewFrame(page, ".cm-content");
  await alerts.waitForSelector(".cm-content");
  await page.waitForTimeout(900);

  const rendered = await alerts.evaluate(() => ({
    titles: [...document.querySelectorAll(".cm-alert-title")].map((t) => t.textContent),
    icons: document.querySelectorAll(".cm-alert-title svg path").length,
    kinds: ["note", "tip", "important", "warning", "caution"].filter(
      (k) => document.querySelectorAll(`.cm-alert-${k}`).length > 0,
    ),
  }));
  check("all five kinds render", rendered.kinds.length === 5, rendered.kinds.join(", "));
  check("each carries an icon", rendered.icons >= 5 && rendered.icons === rendered.titles.length, `${rendered.icons} icons`);
  check("names are GitHub's, in sentence case", rendered.titles.includes("Note") && rendered.titles.includes("Caution"), JSON.stringify(rendered.titles.slice(0, 5)));

  const colours = await alerts.evaluate(() =>
    ["note", "tip", "important", "warning", "caution"].map((k) => {
      const el = document.querySelector(`.cm-alert-${k} .cm-alert-title`);
      return el ? getComputedStyle(el).color : "none";
    }),
  );
  check("each kind has its own colour", new Set(colours).size === 5, colours.join(" "));

  // Prose stays prose: the passage is marked, not boxed.
  const alertProse = await alerts.evaluate(() => {
    const line = [...document.querySelectorAll(".cm-alert")].find((l) => (l.textContent ?? "").includes("Useful information"));
    return line ? getComputedStyle(line).fontFamily : "";
  });
  check("alert prose keeps the reading face", /serif/i.test(alertProse), alertProse.slice(0, 28));

  // Not every blockquote is an alert. These sit at the end of the fixture, and
  // CodeMirror only renders the viewport — so scroll them into it first.
  await alerts.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  });
  await page.waitForTimeout(700);
  const plain = await alerts.$$eval(".cm-quote-line:not(.cm-alert)", (els) => els.map((e) => e.textContent ?? ""));
  check("a plain blockquote stays plain", plain.some((t) => t.includes("A plain blockquote")));
  check("an unknown kind is not an alert", plain.some((t) => t.includes("[!UNKNOWN]")));
  check("a marker mid-line is not an alert", plain.some((t) => t.includes("Text before the marker")));

  // The marker follows the same rule as every other piece of markup.
  await alerts.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller");
    if (scroller) scroller.scrollTop = 0;
  });
  await page.waitForTimeout(700);
  // Scoped to the marker line: the fixture also contains a literal [!NOTE]
  // written in prose, which must stay exactly as written.
  const markerLine = () =>
    alerts.evaluate(() => document.querySelector(".cm-alert-open")?.textContent ?? "");
  check("the marker reads as a name away from the caret", (await markerLine()).startsWith("Note"), JSON.stringify(await markerLine()));

  await clickLine(alerts, page, "Useful information");
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(500);
  check("the caret on the marker line shows its source", (await markerLine()).includes("[!NOTE]"), JSON.stringify(await markerLine()));
  check("the passage keeps its colour while editing", !!(await alerts.$(".cm-alert-note")));

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
