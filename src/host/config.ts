import * as vscode from "vscode";
import type { Typography, WebviewConfig } from "../shared/protocol";

export const SECTION = "markdownHybridEditor";

/**
 * Whether the user actually set a value, as opposed to inheriting the package
 * default. The webview must be able to tell the two apart: a default forwarded
 * as an inline custom property would outrank the typography mode's own rule.
 */
function explicit<T>(cfg: vscode.WorkspaceConfiguration, key: string): T | null {
  const found = cfg.inspect<T>(key);
  const value = found?.workspaceFolderValue ?? found?.workspaceValue ?? found?.globalValue;
  return value === undefined ? null : value;
}

/** Everything the webview needs to style itself, read fresh from settings. */
export function readConfig(nonce: string): WebviewConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const typography = cfg.get<Typography>("typography", "reading");

  const fontSize = explicit<number>(cfg, "fontSize");
  const lineHeight = explicit<number>(cfg, "lineHeight");
  const fontFamily = explicit<string>(cfg, "fontFamily")?.trim();
  const readingMeasure = explicit<string>(cfg, "readingMeasure")?.trim();

  return {
    nonce,
    typography: typography === "vscode" ? "vscode" : "reading",
    fontFamily: fontFamily ? fontFamily : null,
    fontSize: typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0 ? fontSize : null,
    lineHeight: typeof lineHeight === "number" && Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : null,
    readingMeasure: readingMeasure ? readingMeasure : null,
    livePreview: cfg.get<boolean>("livePreview.enabled", true),
    renderTables: cfg.get<boolean>("tables.render", true),
    // One global preference, matching the desktop original: toggling it applies
    // to every open hybrid editor at once.
    showFrontmatter: !cfg.get<boolean>("frontmatter.collapsedByDefault", true),
  };
}

/** Documents past this are opened with a notice instead of the editor. */
export function maxFileSize(): number {
  return vscode.workspace.getConfiguration(SECTION).get<number>("maxFileSize", 1_500_000);
}

/** Flip the global frontmatter preference. */
export async function setShowFrontmatter(show: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration(SECTION)
    .update("frontmatter.collapsedByDefault", !show, vscode.ConfigurationTarget.Global);
}

export function frontmatterVisible(): boolean {
  return !vscode.workspace.getConfiguration(SECTION).get<boolean>("frontmatter.collapsedByDefault", true);
}

/**
 * Mirrors the preference into a context key so the editor title bar can show
 * the state rather than a static button — the same affordance the desktop
 * original put in its note toolbar.
 */
export function publishFrontmatterContext(): void {
  void vscode.commands.executeCommand("setContext", `${SECTION}.frontmatterVisible`, frontmatterVisible());
}
