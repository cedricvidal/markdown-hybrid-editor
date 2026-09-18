# Changelog

All notable changes to **Markdown Hybrid Editor** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Hybrid markdown editing: marks hide on every line the caret is not on.
- Soft line breaks reflow within a paragraph, as markdown renders them. Editing
  a paragraph marks its breaks with a `↵` instead of relayouting the text;
  `markdownHybridEditor.softBreaks` can restore the old source-line behaviour.
- GitHub alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`)
  rendered as marked passages in the theme's own colours.
- GFM tables rendered as tables, editable cell by cell.
- YAML frontmatter folded behind a one-row summary, with a toggle.
- Reading typography with a capped measure, or the editor's own font.
- Colours follow the active VS Code theme, with no reload on switch.
- Runs in VS Code for the Web as well as on the desktop.
- Replacements for what a custom editor loses: find panel, Go to Heading,
  Go to Line, and a status bar with position and word count.
