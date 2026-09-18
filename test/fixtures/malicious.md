---
title: <script>alert('frontmatter')</script>
onload: "javascript:alert(1)"
---

# Hostile input

A note is untrusted: cloned from a stranger's repo, written by an agent. None of
the following may execute, load, or navigate anywhere.

<script>window.__pwned = 'inline script';</script>

<img src="x" onerror="window.__pwned = 'img onerror'">

<iframe src="https://example.com/tracker"></iframe>

<base href="https://example.com/">

<a href="javascript:alert('anchor')">javascript anchor</a>

<div onclick="window.__pwned = 'onclick'">click handler</div>

<style>body { background: url('https://example.com/beacon.png'); }</style>

[link with a javascript target](javascript:alert('link'))

![remote image](https://example.com/beacon.png)

<svg onload="window.__pwned = 'svg'"><circle r="10"/></svg>

| Cell | Hostile |
| :--- | :------ |
| `<script>alert('cell')</script>` | <img src=x onerror="window.__pwned='table'"> |
| <iframe src="x"></iframe> | <div onclick="window.__pwned='td'">x</div> |

> <script>alert('quote')</script>

Deeply nested emphasis: ***__~~`stress`~~__***

