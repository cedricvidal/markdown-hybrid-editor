import "./styles/tokens.css";
import "./styles/editor.css";
import type { EditorView } from "@codemirror/view";
import type { HostMessage } from "../shared/protocol";
import { readPersisted, vscodeApi } from "./persist";
import { applyTypography, createView, reconfigure } from "./view";

const root = document.getElementById("root");
let view: EditorView | null = null;

function mount(text: string, config: Parameters<typeof applyTypography>[0]): void {
  if (!root) return;
  applyTypography(config);
  view?.destroy();
  root.replaceChildren();
  view = createView(root, text, config);
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (typeof message !== "object" || message === null) return;
  switch (message.type) {
    case "init":
      mount(message.text, message.config);
      return;
    case "config":
      applyTypography(message.config);
      if (view) reconfigure(view, message.config);
      return;
    case "focus":
      view?.focus();
      return;
    default:
      return;
  }
});

window.addEventListener("error", (event) => {
  vscodeApi.postMessage({ type: "error", message: String(event.message) });
});

vscodeApi.postMessage({ type: "ready", persisted: readPersisted() });
