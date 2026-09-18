import * as vscode from "vscode";
import { HybridEditorProvider, VIEW_TYPE } from "./HybridEditorProvider";
import { headings } from "../editor/outline";
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

  /** Ask the focused webview to run one of CodeMirror's own actions. */
  const forward = (name: "find" | "replace" | "findNext" | "findPrevious") => () =>
    HybridEditorProvider.send(name);

  /**
   * A custom editor is not a text editor, so Go to Symbol does not see this
   * document. This is the replacement, and it is worth having: an outline is
   * most of what navigating a long note is.
   */
  const goToHeading = async () => {
    const active = HybridEditorProvider.active();
    if (!active) return;
    const items = headings(active.document.getText()).map((h) => ({
      label: `${"  ".repeat(Math.max(0, h.level - 1))}${h.text}`,
      description: `H${h.level}`,
      line: h.line,
    }));
    if (items.length === 0) {
      void vscode.window.showInformationMessage("This note has no headings.");
      return;
    }
    const picked = await vscode.window.showQuickPick(items, { placeHolder: "Go to heading" });
    if (picked) HybridEditorProvider.reveal(picked.line + 1);
  };

  const goToLine = async () => {
    const active = HybridEditorProvider.active();
    if (!active) return;
    const total = active.document.lineCount;
    const answer = await vscode.window.showInputBox({
      prompt: `Go to line (1–${total})`,
      validateInput: (value) => {
        if (!value.trim()) return null;
        const n = Number(value);
        return Number.isInteger(n) && n >= 1 && n <= total ? null : `Enter a line between 1 and ${total}.`;
      },
    });
    const line = Number(answer);
    if (Number.isInteger(line) && line >= 1) HybridEditorProvider.reveal(line);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("markdownHybridEditor.find", forward("find")),
    vscode.commands.registerCommand("markdownHybridEditor.replace", forward("replace")),
    vscode.commands.registerCommand("markdownHybridEditor.findNext", forward("findNext")),
    vscode.commands.registerCommand("markdownHybridEditor.findPrevious", forward("findPrevious")),
    vscode.commands.registerCommand("markdownHybridEditor.goToHeading", goToHeading),
    vscode.commands.registerCommand("markdownHybridEditor.goToLine", goToLine),
    // The target for neutralising a workbench binding that would otherwise
    // fire alongside CodeMirror's: a webview forwards keystrokes rather than
    // swallowing them, so an unhandled collision acts twice.
    vscode.commands.registerCommand("markdownHybridEditor.noop", () => undefined),
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
