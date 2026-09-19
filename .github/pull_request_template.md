<!-- What changes, and why. One idea per PR. -->

## The gate that proves it

<!--
Every feature lands with the gate that proves it. Name it:
a `demo/*.mjs` beat, or a unit test in `test/unit/` for anything pure.
Fixing a bug? The gate should fail before your change.
-->

## Checklist

- [ ] `pnpm verify` is green
- [ ] `pnpm demo:gates` is green, or this does not touch behaviour
- [ ] Commits are Conventional and scoped to the layer (`feat(editor):`, `fix(sync):`)
- [ ] Anything surprising I learned is written down in `AGENTS.md`
