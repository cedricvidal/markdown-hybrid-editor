# Security

## The threat model

A markdown file is untrusted input. Notes get cloned from strangers' repos and
written by agents, and this extension renders one in a webview — so the
interesting question is never "is my own markdown safe", it is **can a hostile
note reach out of the note**.

The README's [Security](README.md#security) section states what the webview is
allowed to do. In short: `default-src 'none'` with `img-src`, `font-src` and
`connect-src` all `'none'`, a nonce-only `script-src` with
`require-trusted-types-for 'script'`, no command URIs, no forms,
`localResourceRoots` limited to the extension's own `dist`, and document text
written only as DOM text nodes — `innerHTML` and friends are a lint error in
every source directory.

Anything that breaks one of those is a vulnerability. Worth reporting:

- A note that executes script, loads a remote resource, or navigates anywhere.
- A note that reads or reaches the workspace through the webview.
- Document text that ends up parsed as markup rather than shown as text.
- An edit path that corrupts the `TextDocument` — it is the only source of
  truth, and a desync that loses the user's text is a real bug even though it is
  not an escape.

## Reporting

**Please do not open a public issue for a security bug.**

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/cedricvidal/markdown-hybrid-editor/security/advisories/new).

A good report is a markdown file plus what it did. `test/fixtures/malicious.md`
is the permanent regression fixture for hostile input — if your case belongs
beside those payloads, say so, and it will land there with the fix.

## Supported versions

| Version | Supported |
|---|---|
| `0.0.x` (preview) | Yes — the only line there is |

## What to expect

This is a hobby project maintained by one person, so: best effort, no SLA. You
should get an acknowledgement within about a week. Fixes ship in the next
release, credited unless you would rather not be.
