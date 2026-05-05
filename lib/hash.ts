// ─── Lightweight input fingerprint ───────────────────────────────────────────
// Pure JS djb2-style hash — works in Node and browser with no imports.
// Not cryptographic; only used to detect identical submissions.

export function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}
