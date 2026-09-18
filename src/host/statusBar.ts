import * as vscode from "vscode";

/**
 * A custom editor is not a text editor, so VS Code's own Ln/Col indicator has
 * nothing to show. This stands in for it, fed by the webview's selection
 * reports, and hides itself whenever a hybrid editor is not in front.
 */
export class StatusBar {
  private readonly position: vscode.StatusBarItem;
  private readonly words: vscode.StatusBarItem;

  constructor() {
    this.position = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.position.command = "markdownHybridEditor.goToLine";
    this.position.tooltip = "Go to Line";
    this.words = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.words.tooltip = "Words in this note";
  }

  update(line: number, column: number, words: number): void {
    this.position.text = `Ln ${line}, Col ${column}`;
    this.words.text = `${words} ${words === 1 ? "word" : "words"}`;
    this.position.show();
    this.words.show();
  }

  hide(): void {
    this.position.hide();
    this.words.hide();
  }

  dispose(): void {
    this.position.dispose();
    this.words.dispose();
  }
}
