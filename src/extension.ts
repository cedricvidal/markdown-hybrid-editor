import * as vscode from "vscode";
import { HybridEditorProvider } from "./host/HybridEditorProvider";
import { registerCommands } from "./host/commands";
import { publishFrontmatterContext, SECTION } from "./host/config";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(HybridEditorProvider.register(context));
  registerCommands(context);

  publishFrontmatterContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) publishFrontmatterContext();
    }),
  );
}

export function deactivate(): void {
  // Everything is owned by context.subscriptions.
}
