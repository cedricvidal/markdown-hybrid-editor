/**
 * FNV-1a, 32-bit. Both sides must agree exactly, so this lives in `shared` and
 * is imported by the host and the webview rather than written twice.
 *
 * Used only to notice divergence between the document and the view; it is not a
 * security primitive.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
