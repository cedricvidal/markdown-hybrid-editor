# Contributing

Thanks for looking. This is a small project with a strong opinion about how it
is built, and that opinion lives in one file: **[AGENTS.md](AGENTS.md)** — the
layer boundaries, why the document is the only source of truth, and a table of
gotchas that each cost someone real time. Read it before your first change. It
is short.

## The loop

```bash
pnpm install
pnpm verify     # lint + typecheck (×3) + unit tests + build — ~seconds
```

`pnpm verify` must be green before you commit. `pnpm dev:install` puts the
extension in your own VS Code if you want to live with a change for a day; the
README's [Development](README.md#development) section has the edit-reload loop.

## Every feature lands with the gate that proves it

This is the one rule worth repeating outside AGENTS.md. `demo/*.mjs` drive a
real VS Code through Playwright, and each beat of the walkthrough is also an
acceptance criterion — so a green run is evidence the feature works, not just
that it compiles. `pnpm demo:gates` runs all of them and takes about ten
minutes; run it locally before opening a PR that touches behaviour. CI runs only
the headless half.

Pure logic belongs in `src/editor/` and gets a unit test against a bare
`EditorState` instead — see `test/unit/`.

## Commits and PRs

Conventional Commits, scoped to the layer: `feat(editor):`, `fix(sync):`,
`test(demo):`. Commit after each logical step rather than once per milestone.

Keep PRs to one idea. If you are changing how the editor looks, say what you
checked it against — the restraint in there is deliberate.

## Before you build something large

Open an issue first. Some things that look like gaps are decisions: there is no
`history()` because VS Code owns undo, and nothing on the wire is an absolute
offset because CRLF documents would silently drift. AGENTS.md explains both.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
