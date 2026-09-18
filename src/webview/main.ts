import "./styles/tokens.css";
import "./styles/editor.css";
import type { HostMessage } from "../shared/protocol";
import { readPersisted, vscodeApi } from "./persist";

const root = document.getElementById("root");

function render(text: string): void {
  if (!root) return;
  const pre = document.createElement("pre");
  pre.className = "mhe-raw";
  // textContent, never innerHTML: document text is untrusted input.
  pre.textContent = text;
  root.replaceChildren(pre);
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (typeof message !== "object" || message === null) return;
  switch (message.type) {
    case "init":
      render(message.text);
      return;
    case "focus":
      return;
    default:
      return;
  }
});

window.addEventListener("error", (event) => {
  vscodeApi.postMessage({ type: "error", message: String(event.message) });
});

vscodeApi.postMessage({ type: "ready", persisted: readPersisted() });
