import type * as vscode from "vscode";
import { HybridEditorProvider } from "./host/HybridEditorProvider";
import { registerCommands } from "./host/commands";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(HybridEditorProvider.register(context));
  registerCommands(context);
}

export function deactivate(): void {
  // Everything is owned by context.subscriptions.
}
