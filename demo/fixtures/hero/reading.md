---
title: A note that reads like prose
tags: [reading, markdown]
---

# A note that reads like prose

Markup hides on every line the caret is not on. Move the cursor onto this
line and the **asterisks** come back; move away and they step aside again.

There is no preview pane here, and no mode to switch. The document you are
looking at *is* the document on disk — the same bytes, the same markdown,
the same file your other tools read. Nothing is transformed on the way in
or on the way out.

## Why hide anything at all

Raw markdown asks you to read two things at once: the prose, and the
scaffolding holding it up. A heading is a sentence with `##` bolted to the
front. Emphasis is a word wearing brackets. None of it is hard, exactly,
but it is a tax, and you pay it on every line of every note you read.

A preview pane charges you differently. It gives you clean prose, then
takes away the ability to edit it, so you spend the day glancing between
two copies of the same paragraph and losing your place in both.

> The unit of "what the caret is on" is what the reader sees, not what the
> document holds.

So: hide the marks on every line but one. The line you are working on keeps
its full source, because that is the line you might need to change. Every
other line is just prose, which is what you came to read.

## What you keep

The reading column is set in a serif face at a capped measure, with a real
heading scale — the things that make long-form text comfortable. Colours
come from whatever [VS Code theme](https://code.visualstudio.com/) you
already use, so this never looks like a visitor from another application.

Undo is VS Code's own. Save is `⌘S`. The file is ordinary markdown
throughout. This is a *view*, not a format.
