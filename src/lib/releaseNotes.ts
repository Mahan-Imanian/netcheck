export type NoteBlock = { kind: "heading" | "item" | "text"; text: string };

export function parseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);
    const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    if (heading?.[1]) blocks.push({ kind: "heading", text: clean(heading[1]) });
    else if (item?.[1]) blocks.push({ kind: "item", text: clean(item[1]) });
    else {
      const last = blocks[blocks.length - 1];
      if (last && last.kind !== "heading" && raw.startsWith("  ")) last.text += ` ${clean(line)}`;
      else blocks.push({ kind: "text", text: clean(line) });
    }
  }
  return blocks;
}

export function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}
