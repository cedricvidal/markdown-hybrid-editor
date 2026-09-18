import * as vscode from "vscode";
import type { WireChange } from "../shared/protocol";
import { hash32 } from "../shared/hash";
import type { EditorSession } from "./EditorSession";
import { eolOf, fromVsRange, normaliseIn, normaliseOut, toRange } from "./positions";

/** How long after the last change to check that every view still agrees. */
const RECONCILE_MS = 250;

/**
 * Keeps one `TextDocument` and every view of it in agreement.
 *
 * The document is the source of truth; a webview is only a view. Edits travel
 * out as granular WorkspaceEdits (one per flushed batch, so one undo step per
 * typing burst) and changes travel in as CodeMirror transactions.
 *
 * Echo suppression is a counted fast path backed by a reconciliation proof: the
 * counter is O(1) per keystroke but can desynchronise under exotic interleaving,
 * and every such desync is detected and healed within RECONCILE_MS of the user
 * stopping typing. The slow path is what makes the design sound — it is not an
 * optimisation to be dropped later.
 */
export class DocumentSync {
  private static readonly registry = new Map<string, DocumentSync>();

  private readonly sessions = new Set<EditorSession>();
  private readonly pendingEchoes: Array<{ origin: EditorSession }> = [];
  private readonly listeners: vscode.Disposable[] = [];
  private readonly flushWaiters = new Map<number, () => void>();

  private queue: Promise<unknown> = Promise.resolve();
  private reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  private flushToken = 0;

  private constructor(private readonly document: vscode.TextDocument) {
    this.listeners.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== this.document.uri.toString()) return;
        // Language-mode and EOL-only events carry no content change.
        if (event.contentChanges.length === 0) return;
        this.onDocumentChanged(event);
      }),
      vscode.workspace.onWillSaveTextDocument((event) => {
        if (event.document.uri.toString() !== this.document.uri.toString()) return;
        // Without this the last few hundred milliseconds of typing are lost to a
        // fast Cmd-S. Bounded, because blocking a save is worse than losing it.
        event.waitUntil(this.flushAll(500));
      }),
    );
  }

  static acquire(document: vscode.TextDocument, session: EditorSession): DocumentSync {
    const key = document.uri.toString();
    let sync = DocumentSync.registry.get(key);
    if (!sync) {
      sync = new DocumentSync(document);
      DocumentSync.registry.set(key, sync);
    }
    sync.sessions.add(session);
    return sync;
  }

  release(session: EditorSession): void {
    this.sessions.delete(session);
    // Drop echoes this session was waiting on, or the counter drifts permanently.
    for (let i = this.pendingEchoes.length - 1; i >= 0; i--) {
      if (this.pendingEchoes[i]?.origin === session) this.pendingEchoes.splice(i, 1);
    }
    if (this.sessions.size > 0) return;

    for (const d of this.listeners) d.dispose();
    this.listeners.length = 0;
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    DocumentSync.registry.delete(this.document.uri.toString());
  }

  text(): string {
    return normaliseOut(this.document.getText());
  }

  /** Edits from a webview, already validated against the document's bounds. */
  async applyFromWebview(session: EditorSession, changes: WireChange[], token: number | null): Promise<void> {
    if (token !== null) this.resolveFlush(token);
    if (changes.length === 0) return;

    const edit = new vscode.WorkspaceEdit();
    const eol = eolOf(this.document);
    for (const change of changes) edit.replace(this.document.uri, toRange(change), normaliseIn(change.text, eol));

    this.pendingEchoes.push({ origin: session });
    // Serialised: two concurrent applyEdits on one document race, because the
    // second was built against coordinates from before the first landed.
    const ok = await this.enqueue(() => {
      if (this.document.isClosed) return Promise.resolve(false);
      return Promise.resolve(vscode.workspace.applyEdit(edit));
    });

    if (!ok) {
      this.pendingEchoes.pop();
      this.resyncAll("the edit could not be applied");
    }
  }

  private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
    const changes: WireChange[] = event.contentChanges.map((change) => ({
      ...fromVsRange(change.range),
      text: normaliseOut(change.text),
    }));

    const isUndoRedo =
      event.reason === vscode.TextDocumentChangeReason.Undo || event.reason === vscode.TextDocumentChangeReason.Redo;

    // An undo/redo is never our own echo: our WorkspaceEdits carry no reason.
    // This free, exact discriminator is what lets VS Code own the undo stack.
    const origin = isUndoRedo ? undefined : this.pendingEchoes.shift()?.origin;

    for (const session of this.sessions) {
      // The originating view already has this text; the other split does not.
      if (session === origin) continue;
      session.post({ type: "apply", changes, isUndoRedo });
    }

    this.scheduleReconcile();
  }

  /**
   * Idle consistency check. Rather than keeping a shadow copy of every open
   * document in the extension host, ask each view for a cheap length+hash and
   * let it speak up only when it disagrees.
   */
  private scheduleReconcile(): void {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => {
      this.reconcileTimer = undefined;
      if (this.pendingEchoes.length > 0 || this.document.isClosed) return;
      const text = this.text();
      const probe = { type: "verify" as const, length: text.length, hash: hash32(text) };
      for (const session of this.sessions) session.post(probe);
    }, RECONCILE_MS);
  }

  resyncAll(reason: string): void {
    if (this.document.isClosed) return;
    console.warn(`[markdown-hybrid-editor] resync: ${reason}`);
    const text = this.text();
    for (const session of this.sessions) session.post({ type: "resync", text });
  }

  resync(session: EditorSession): void {
    if (this.document.isClosed) return;
    session.post({ type: "resync", text: this.text() });
  }

  /** Ask every view to send what it is holding, and wait — briefly — for it. */
  private flushAll(timeoutMs: number): Promise<void> {
    if (this.sessions.size === 0) return Promise.resolve();
    const waits = [...this.sessions].map((session) => {
      const token = ++this.flushToken;
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.flushWaiters.delete(token);
          resolve();
        }, timeoutMs);
        this.flushWaiters.set(token, () => {
          clearTimeout(timer);
          resolve();
        });
        session.post({ type: "flush", token });
      });
    });
    return Promise.all(waits).then(() => this.queue.then(() => undefined));
  }

  private resolveFlush(token: number): void {
    const resolve = this.flushWaiters.get(token);
    if (!resolve) return;
    this.flushWaiters.delete(token);
    resolve();
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}
