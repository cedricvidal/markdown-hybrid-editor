# Inline code in prose

This is a **pnpm workspace monorepo**. The main app lives in **`apps/portal`**
(package `@scope/portal`); a second app lives in **`apps/assess`** (package
`@scope/assess`) — a **Vite + React** tool that deliberately does *not* follow
the full stack; a third, **`apps/assess-skill`** (package `@scope/assess-skill`).

Bold wrapping code: **`one`** and code wrapping bold: `**two**` and plain `three`.

A chip at the very start: `leading` and one at the end: `trailing`

Adjacent chips `a``b` and chips with punctuation around (`paren`), [`bracket`], "`quote`".

Soft breaks join, but a hard break stays a break:

First line ends with two spaces  
so this stays on its own line.

Backslash also forces a break\
like this.

> A quoted paragraph
> spanning two source lines.

- A list item that is
  wrapped across two lines.

```
code fences keep
their own line breaks
```
