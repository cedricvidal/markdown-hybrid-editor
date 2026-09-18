import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** Report build failures the way VS Code's problem matcher expects. */
const problemMatcher = {
  name: "problem-matcher",
  setup(build) {
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) console.error(`    ${location.file}:${location.line}:${location.column}:`);
      }
      console.log(`[${new Date().toLocaleTimeString()}] build finished${result.errors.length ? " with errors" : ""}`);
    });
  },
};

const common = {
  bundle: true,
  sourcemap: production ? false : "inline",
  minify: production,
  logLevel: "silent",
  plugins: [problemMatcher],
};

/** Extension host: Node, CommonJS, `vscode` provided by the runtime. */
const host = {
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
};

/**
 * The same host sources for vscode.dev / github.dev, where the extension host is
 * a Web Worker. platform:"browser" makes esbuild *fail* on any Node builtin, so
 * this bundle doubles as a guard against one creeping in.
 */
const hostWeb = {
  ...common,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.web.js",
  platform: "browser",
  format: "cjs",
  target: "es2022",
  external: ["vscode"],
  define: { global: "globalThis" },
};

/**
 * Webview: browser, IIFE so nothing leaks to globals. `main.ts` imports the CSS,
 * which esbuild emits alongside as dist/webview.css.
 */
const webview = {
  ...common,
  entryPoints: ["src/webview/main.ts"],
  outfile: "dist/webview.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
};

const targets = [host, hostWeb, webview];

if (watch) {
  const contexts = await Promise.all(targets.map((c) => esbuild.context(c)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(targets.map((c) => esbuild.build(c)));
}
