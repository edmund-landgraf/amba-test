export function wgUrlsClipboardText(pcs) {
  return (pcs || [])
    .map((pc) => String(pc?.url || "").trim())
    .filter(Boolean)
    .join("\r\n");
}
