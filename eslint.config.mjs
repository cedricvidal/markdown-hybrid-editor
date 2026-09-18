import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Sinks that turn document text into markup. The whole no-XSS story rests on
 *  never reaching for one of these, so it is a lint error rather than a habit. */
const HTML_SINKS = [
  { property: "innerHTML", message: "Build DOM nodes instead: document text is untrusted." },
  { property: "outerHTML", message: "Build DOM nodes instead: document text is untrusted." },
  { property: "insertAdjacentHTML", message: "Build DOM nodes instead: document text is untrusted." },
];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", ".vscode-test-web/**", "demo/out/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // The port stays host-agnostic, which is what keeps it reusable and
    // testable against a bare EditorState.
    files: ["src/editor/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["vscode"], message: "src/editor must not depend on VS Code." },
            { group: ["../webview/*", "../host/*", "**/webview/**", "**/host/**"], message: "src/editor must not depend on the host or the webview." },
            { group: ["node:*"], message: "src/editor runs in a browser." },
          ],
        },
      ],
      "no-restricted-properties": ["error", ...HTML_SINKS],
    },
  },

  {
    // The host bundle also runs as a Web Worker in vscode.dev, where there is
    // no Node. tsconfig.web.json checks this too; the lint rule states why.
    files: ["src/host/**/*.ts", "src/extension.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["node:*"], message: "The host must run in a Web Worker too — no Node builtins." }] },
      ],
    },
  },

  {
    files: ["src/webview/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["vscode", "node:*"], message: "The webview is a browser document." }] },
      ],
      "no-restricted-properties": ["error", ...HTML_SINKS],
    },
  },

  {
    files: ["demo/**/*.mjs", "*.mjs", "*.mts"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
    rules: { "no-undef": "off" },
  },
);
