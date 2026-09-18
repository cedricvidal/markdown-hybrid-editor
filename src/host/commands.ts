import * as vscode from "vscode";
import { VIEW_TYPE } from "./HybridEditorProvider";
import { SECTION } from "./config";

/** The uri of whatever is in the active tab, custom editor or text editor. */
function activeUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) return input.uri;
  return vscode.window.activeTextEditor?.document.uri;
}

/** Flip a global boolean setting. */
async function toggle(key: string, defaultValue: boolean): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  await cfg.update(key, !cfg.get<boolean>(key, defaultValue), vscode.ConfigurationTarget.Global);
}

export function registerCommands(context: vscode.ExtensionContext): void {
  const open = (viewType: string) => async (arg?: vscode.Uri) => {
    const uri = arg instanceof vscode.Uri ? arg : activeUri();
    if (!uri) {
      void vscode.window.showInformationMessage("No markdown file is open.");
      return;
    }
    await vscode.commands.executeCommand("vscode.openWith", uri, viewType);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("markdownHybridEditor.openWithTextEditor", open("default")),
    vscode.commands.registerCommand("markdownHybridEditor.openWithHybrid", open(VIEW_TYPE)),
    // Both are single global preferences, the way the desktop original worked:
    // one toggle, every open editor follows.
    vscode.commands.registerCommand("markdownHybridEditor.toggleFrontmatter", () =>
      toggle("frontmatter.collapsedByDefault", true),
    ),
    vscode.commands.registerCommand("markdownHybridEditor.toggleLivePreview", () =>
      toggle("livePreview.enabled", true),
    ),
  );
}
