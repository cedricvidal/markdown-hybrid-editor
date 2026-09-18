import * as vscode from "vscode";
import { VIEW_TYPE } from "./HybridEditorProvider";

/** The uri of whatever is in the active tab, custom editor or text editor. */
function activeUri(): vscode.Uri | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom || input instanceof vscode.TabInputText) return input.uri;
  return vscode.window.activeTextEditor?.document.uri;
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
  );
}
