# Working on Markdown Hybrid Editor

A VS Code custom editor that renders markdown inline: marks hide on every line
the caret is not on. CodeMirror 6 in a webview; the `TextDocument` is the only
source of truth.

## Commands

```bash
pnpm verify        # lint + typecheck (×3) + unit tests + build — run before committing
pnpm watch         # rebuild on save
pnpm test          # vitest, headless, ~1s
pnpm demo:gates    # every Playwright gate, ~10 min, drives real VS Code
pnpm demo:record   # re-record the walkthrough, then demo:video && demo:gif
```

## Installing it into VS Code, and reloading after a change

```bash
pnpm dev:install   # build, package, install via the CLI. Restart VS Code once.
pnpm dev:sync      # after each change: rebuild + copy into the installed extension
```

then **Developer: Reload Window**. Host changes need the reload; webview-only
changes need only the tab reopened; `package.json` contribution changes need a
full restart.

> [!IMPORTANT]
> A symlink in `~/.vscode/extensions` does **not** install anything. VS Code
> loads only what is listed in that folder's `extensions.json`, which the
> installer writes. A hand-made folder or link there is ignored silently, with
> no error anywhere — it looks exactly like the extension being broken.

## Architecture, and the rules that keep it

```
src/editor/    CodeMirror only — no vscode, no webview, no node imports.
               Testable against a bare EditorState. This is the portable core.
src/host/      Extension host. No node builtins: it also runs as a Web Worker
               in vscode.dev.
src/webview/   Browser half: mounts the editor, batches edits out.
src/shared/    Types and pure helpers both bundles use.
```

All three rules are enforced by eslint, and the host's portability by a second
tsconfig (`tsconfig.web.json`) that type-checks it against WebWorker libs with
no Node types. `innerHTML`/`outerHTML`/`insertAdjacentHTML` are lint errors
everywhere — document text is untrusted, and building DOM nodes is the whole
reason a hostile note stays inert.

### Synchronisation

Read `src/host/DocumentSync.ts` before touching anything about edits. Two
things are load-bearing and non-obvious:

- **Nothing on the wire is an absolute offset.** CodeMirror collapses every line
  break to one character, so on a CRLF document offsets differ by one per
  preceding line. Line/character is immune.
- **Echo suppression is a counted fast path backed by a reconciliation proof.**
  The counter can drift; an idle length+hash probe heals it within 250 ms. The
  slow path is not an optimisation to delete.

VS Code owns undo. There is deliberately no `history()` — a second stack over
the same text diverges. `TextDocumentChangeReason` distinguishes an undo from
our own echo.

## Gotchas that cost real time

| | |
|---|---|
| CSP | `style-src` cannot use a nonce. CodeMirror sets style *attributes*, which no nonce covers, and a nonce makes the browser ignore `'unsafe-inline'` entirely. `script-src` stays nonce-only. |
| Gates | CodeMirror renders only the viewport. An assertion about content below the fold must scroll first, or it silently fails. |
| Gates | Monaco renders spaces as `U+00A0`. Normalise before comparing text read from a text editor. |
| Gates | The workbench paints well before its keybindings are live. Driving it needs an explicit settle; `launchCode` does this. |
| Gates | Assert readiness on a tab appearing, never on a widget disappearing. |
| Gates | A throwaway `--user-data-dir` is **not** representative for testing an *installed* extension — it reported a working install as broken. Use `--extensionDevelopmentPath` for feature gates, and your real VS Code to check installation. |
| Git | `.gitattributes` keeps `test/fixtures/crlf.md` byte-exact. Without it git normalises it and the EOL regression test quietly becomes a duplicate of the LF case. |
| Git | `.gitignore` uses `/out/`, not `out/` — the latter also swallows `demo/out/`. |
| Packaging | README images stay **relative**: `vsce` rewrites them to `raw.githubusercontent.com` from the `repository` field. Its regex is `[/.\w\s#-]`, so a filename containing `@` is silently left relative and packaging then dies on "Invalid image source" — hence `icon-256.png`, not `icon@2x.png`. It never rewrites `<a href>`, so links inside an HTML block must be absolute. |
| Markdown | A frontmatter block's closing `---` makes the last YAML line look exactly like a setext H2. Anything scanning for headings must skip the block. |
| CodeMirror | A decoration that replaces a **line break** must come from a `StateField`, never a ViewPlugin — line layout cannot depend on the viewport. Same constraint as block widgets. |
| Design | The unit of "what the caret is on" is what the *reader* sees, not what the document holds. Once reflow joins a paragraph's lines, markup must reveal for the whole paragraph; revealing one source line leaves a patch of raw markdown mid-prose. |

## Conventions

- Conventional Commits, scoped to the layer: `feat(editor):`, `fix(sync):`,
  `test(demo):`. Commit after each logical step, not per milestone.
- Every feature lands with the gate that proves it. `demo/*.mjs` drive a real
  VS Code; each beat of the walkthrough is also an acceptance criterion.
- Fixtures live in `test/fixtures/`. `malicious.md` is a permanent regression
  test for hostile input — keep it out of the `.vsix`.
- The editor's look is deliberate: prose reads as prose, chrome is hairlines and
  restraint, colour comes from the active VS Code theme. Before adding a card, a
  tint or a tracked-out label, check it against what is already there.
