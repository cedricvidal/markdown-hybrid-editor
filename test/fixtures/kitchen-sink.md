---
title: Kitchen Sink
tags: [demo, fixture]
draft: false
nested:
  key: value
  list:
    - one
    - two
---

# Heading one

Prose with **bold**, *emphasis*, ~~strikethrough~~ and `inline code` on one line.

## Heading two

### Heading three

#### Heading four

##### Heading five

###### Heading six

A [labelled link](https://example.com "with a title") and a bare `app[bot]`
mention that must stay literal because it has no URL. A [[wikilink]] must also
stay literal: wikilinks are deliberately out of scope.

> A blockquote, muted and bordered.
>
> > Nested one level deeper.

```ts
// A fenced block with a language.
const answer: number = 42;
```

| Left | Centre | Right | Prose |
| :--- | :----: | ----: | :---- |
| a | b | c | A deliberately long cell that runs past forty-eight characters so it wraps. |
| `a\|b` | pipe in code | x \| y | short |

- A bullet
- Another bullet
  - Indented

1. Ordered
2. Second

---

Trailing paragraph so the document does not end on a rule.
